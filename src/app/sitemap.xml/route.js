import { loadDumps, getDumpTracks, loadAllTracks, canViewTrackDirect, mergeTracks } from '@/lib/trackStore';
import { listBucketTracks } from '@/lib/s3';
import { normalizedRequestHost, siteFromHost } from '@/lib/siteHost';

export const dynamic = 'force-dynamic';

const BUILD_DATE = (process.env.BUILD_TIME || '1970-01-01').split('T')[0];

function xmlResponse(urls) {
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(({ loc, lastmod, changefreq, priority }) =>
      `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
    ).join('\n') + '\n</urlset>\n';
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      Vary: 'Host',
    },
  });
}

async function musicUrls() {
  const base = 'https://music.aaronrohrbacher.com';
  try {
    const [dumps, savedTracks, bucketTracks] = await Promise.all([
      loadDumps(),
      loadAllTracks(),
      listBucketTracks(),
    ]);
    const tracks = mergeTracks(savedTracks, bucketTracks);
    const availableTrackIds = new Set(tracks.map((track) => track.id));
    const publicDumps = dumps.filter((d) => d.published && (d.visibility || 'public') === 'public');
    const publicTrackIds = new Set(
      tracks.filter((track) => canViewTrackDirect(track, { user: null })).map((track) => track.id),
    );
    for (const dump of publicDumps) {
      for (const track of await getDumpTracks(dump.id)) {
        if (availableTrackIds.has(track.id)) publicTrackIds.add(track.id);
      }
    }
    const newest = publicDumps
      .map((d) => (d.updatedAt || d.createdAt || BUILD_DATE).split('T')[0])
      .concat(tracks.map((t) => (t.addedAt || BUILD_DATE).split('T')[0]), BUILD_DATE)
      .sort().pop();
    return [
      { loc: `${base}/`, lastmod: newest, changefreq: 'weekly', priority: '1.0' },
      ...publicDumps.map((d) => ({
        loc: `${base}/dump/${encodeURIComponent(d.slug || d.id)}`,
        lastmod: (d.updatedAt || d.createdAt || BUILD_DATE).split('T')[0],
        changefreq: 'weekly', priority: '0.8',
      })),
      ...[...publicTrackIds].sort().map((id) => ({
        loc: `${base}/track/${encodeURIComponent(id)}`,
        changefreq: 'monthly', priority: '0.7',
      })),
    ];
  } catch (error) {
    console.error('[sitemap] music content unavailable', error);
    return [{ loc: `${base}/`, lastmod: BUILD_DATE, changefreq: 'weekly', priority: '1.0' }];
  }
}

export async function GET(request) {
  const site = siteFromHost(normalizedRequestHost(request));
  if (site === 'music') return xmlResponse(await musicUrls());
  if (site === 'portaputer') {
    const base = 'https://portaputer.aaronrohrbacher.com';
    return xmlResponse([
      ['/', '1.0'], ['/installation', '0.9'], ['/features', '0.8'],
      ['/requirements', '0.8'], ['/troubleshooting', '0.7'],
    ].map(([path, priority]) => ({ loc: `${base}${path}`, lastmod: BUILD_DATE, changefreq: 'monthly', priority })));
  }
  const base = 'https://aaronrohrbacher.com';
  return xmlResponse([
    ['/', '1.0', 'weekly'], ['/resume', '0.9', 'monthly'], ['/portfolio', '0.9', 'monthly'],
    ['/about', '0.7', 'yearly'], ['/contact', '0.6', 'yearly'],
  ].map(([path, priority, changefreq]) => ({ loc: `${base}${path}`, lastmod: BUILD_DATE, changefreq, priority })));
}
