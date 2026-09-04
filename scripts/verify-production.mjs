#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const sites = {
  main: process.env.MAIN_ORIGIN || 'https://aaronrohrbacher.com',
  music: process.env.MUSIC_ORIGIN || 'https://music.aaronrohrbacher.com',
  portaputer: process.env.PORTAPUTER_ORIGIN || 'https://portaputer.aaronrohrbacher.com',
};

const evidence = [];
const failures = [];
const botHeaders = { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +https://google.com/bot.html)' };

function check(condition, message) {
  if (!condition) failures.push(message);
}

function awsJson(args) {
  const result = spawnSync('aws', [...args, '--output', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `aws ${args.join(' ')} failed`);
  return JSON.parse(result.stdout || '{}');
}

async function get(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...options });
  const body = await response.text();
  return { response, body };
}

function cacheHeaders(response) {
  return {
    xCache: response.headers.get('x-cache'),
    age: response.headers.get('age'),
    via: response.headers.get('via'),
    cacheControl: response.headers.get('cache-control'),
  };
}

for (const [site, origin] of Object.entries(sites)) {
  const samples = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    samples.push(await get(`${origin}/`, { headers: botHeaders }));
  }
  const last = samples.at(-1);
  check(last.response.status === 200, `${site} root returned ${last.response.status}`);
  check(last.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length >= 150, `${site} bot-visible HTML is insubstantial`);
  check(samples.some(({ response }) => /Hit from cloudfront/i.test(response.headers.get('x-cache') || '')), `${site} did not produce a CloudFront cache hit after three requests`);
  evidence.push({ site, url: `${origin}/`, status: last.response.status, hash: createHash('sha256').update(last.body).digest('hex').slice(0, 16), ...cacheHeaders(last.response) });

  const internal = site === 'main' ? '/music' : site === 'music' ? '/music' : '/portaputer';
  const blocked = await get(`${origin}${internal}`);
  check(blocked.response.status === 404, `${site} exposed private namespace ${internal} (${blocked.response.status})`);

  const robots = await get(`${origin}/robots.txt`);
  const sitemap = await get(`${origin}/sitemap.xml`);
  check(robots.response.status === 200 && robots.body.includes(`${origin}/sitemap.xml`), `${site} robots.txt is not host-native`);
  check(sitemap.response.status === 200 && sitemap.body.includes(`<loc>${origin}`), `${site} sitemap.xml is not host-native`);
}

check(new Set(evidence.map((item) => item.hash)).size === 3, 'hostnames returned identical cached HTML');

// Prove a public media object supports byte ranges through its production URL.
try {
  const catalog = await get(`${sites.music}/api/tracks`);
  const payload = JSON.parse(catalog.body);
  const track = [...(payload.tracks || []), ...(payload.dumps || []).flatMap((dump) => dump.tracks || [])]
    .find((item) => Object.keys(item.streamUrls || {}).length > 0);
  check(!!track, 'music catalog has no public media variant to range-test');
  if (track) {
    const format = Object.keys(track.streamUrls)[0];
    const authorized = await get(`${sites.music}${track.streamUrls[format]}&urlOnly=1`);
    const stream = JSON.parse(authorized.body);
    const mediaUrl = new URL(stream.url, sites.music);
    const ranged = await fetch(mediaUrl, { headers: { Range: 'bytes=0-1023' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    check(ranged.status === 206, `media byte range returned ${ranged.status}, expected 206`);
    check(/^bytes 0-\d+\//i.test(ranged.headers.get('content-range') || ''), 'media response lacks a valid Content-Range');
    evidence.push({ site: 'media', url: mediaUrl.origin, status: ranged.status, contentRange: ranged.headers.get('content-range'), ...cacheHeaders(ranged) });

    // Direct S3 metadata proves the CDN media URL resolves to an uploaded
    // variant rather than a generated/transcoded artifact.
    if (mediaUrl.hostname.endsWith('cloudfront.net')) {
      const key = decodeURIComponent(mediaUrl.pathname.replace(/^\//, ''));
      const head = spawnSync('aws', ['s3api', 'head-object', '--bucket', 'aarons-recordings', '--key', key, '--output', 'json'], { encoding: 'utf8' });
      check(head.status === 0, `S3 head-object failed for uploaded media key ${key}`);
      if (head.status === 0) evidence.push({ site: 'media-s3', bucket: 'aarons-recordings', key, head: JSON.parse(head.stdout) });
    }
  }
} catch (error) {
  failures.push(`media verification failed: ${error.message}`);
}

// Prove OpenNext kept its standard S3 ISR cache and FIFO SQS revalidation
// architecture. Resource names retain SST's app/stage/component prefix.
try {
  const buckets = awsJson(['s3api', 'list-buckets']).Buckets || [];
  const cacheBucket = buckets.find(({ Name }) =>
    Name.toLowerCase().startsWith('aaron-portfolio-production-portfolioassets')
  )?.Name;
  check(!!cacheBucket, 'could not find the SST Portfolio assets/cache bucket');
  if (cacheBucket) {
    const cached = awsJson(['s3api', 'list-objects-v2', '--bucket', cacheBucket, '--prefix', '_cache/', '--max-keys', '10']);
    check(Number(cached.KeyCount || 0) > 0, `${cacheBucket} contains no OpenNext ISR cache objects under _cache/`);
    evidence.push({ site: 'isr-s3', bucket: cacheBucket, prefix: '_cache/', sampleKeys: (cached.Contents || []).map((item) => item.Key) });
  }

  const queueList = awsJson(['sqs', 'list-queues', '--queue-name-prefix', 'aaron-portfolio-production-PortfolioRevalidationEvents']);
  const queueUrl = queueList.QueueUrls?.[0];
  check(!!queueUrl, 'could not find the OpenNext ISR revalidation queue');
  if (queueUrl) {
    const queueName = queueUrl.split('/').at(-1);
    const attrs = awsJson(['sqs', 'get-queue-attributes', '--queue-url', queueUrl, '--attribute-names', 'All']).Attributes || {};
    check(attrs.FifoQueue === 'true', `${queueName} is not the expected FIFO revalidation queue`);
    const end = new Date();
    const start = new Date(end.getTime() - 86400000);
    const metrics = awsJson([
      'cloudwatch', 'get-metric-statistics',
      '--namespace', 'AWS/SQS',
      '--metric-name', 'NumberOfMessagesSent',
      '--dimensions', `Name=QueueName,Value=${queueName}`,
      '--start-time', start.toISOString(),
      '--end-time', end.toISOString(),
      '--period', '3600',
      '--statistics', 'Sum',
    ]);
    evidence.push({ site: 'isr-sqs', queueUrl, attributes: attrs, messagesSentLast24h: (metrics.Datapoints || []).reduce((sum, point) => sum + Number(point.Sum || 0), 0) });
  }
} catch (error) {
  failures.push(`OpenNext infrastructure verification failed: ${error.message}`);
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), evidence, failures }, null, 2));
if (failures.length) process.exitCode = 1;
