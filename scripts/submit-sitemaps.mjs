#!/usr/bin/env node
/**
 * Sitemap auto-submit — run after a successful production deploy.
 *
 *   npm run submit-sitemaps
 *
 * What works automatically here:
 *   - IndexNow (Bing, Yandex, Seznam, Naver) — one POST, instant reindex.
 *
 * What does NOT work automatically:
 *   - Google deprecated its sitemap ping endpoint in June 2023. You submit
 *     your sitemap ONCE via Search Console (https://search.google.com/search-console)
 *     and Google re-crawls it automatically on its own schedule. No API
 *     exists for pinging general content — the Google Indexing API is
 *     restricted to JobPosting / BroadcastEvent.
 *
 * Setup for IndexNow (first time only):
 *   1. Generate a random API key (32-char hex):
 *        node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
 *   2. Save it to public/<key>.txt (contents = the key itself) so search
 *      engines can verify ownership. Also save it as INDEXNOW_KEY in the
 *      environment the script runs in.
 */

const SITEMAPS = [
  'https://aaronrohrbacher.com/sitemap.xml',
  'https://music.aaronrohrbacher.com/sitemap.xml',
];

const key = process.env.INDEXNOW_KEY;
if (!key) {
  console.log('[submit-sitemaps] INDEXNOW_KEY not set — skipping IndexNow.');
  console.log('  Generate one with:');
  console.log('    node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"');
  console.log(`  Then save it to public/<key>.txt and set INDEXNOW_KEY in your env.\n`);
  console.log('Reminder: Google expects you to register sitemaps in Search Console (one-time).');
  process.exit(0);
}

async function pingIndexNow(sitemapUrl) {
  const host = new URL(sitemapUrl).host;
  const payload = {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: [sitemapUrl],
  };
  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  console.log(`[IndexNow] ${sitemapUrl} → ${res.status}`);
  if (!res.ok && res.status !== 202 && res.status !== 200) {
    const body = await res.text().catch(() => '');
    console.log(`  response body: ${body.slice(0, 200)}`);
  }
}

for (const sm of SITEMAPS) {
  try {
    await pingIndexNow(sm);
  } catch (err) {
    console.error(`[IndexNow] ${sm} failed:`, err.message);
  }
}
