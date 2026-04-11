import { loadDumps } from '@/lib/trackStore';

/**
 * Music sitemap — served at /music-sitemap.xml.
 * Uses the music.aaronrohrbacher.com canonical subdomain for every URL.
 * Lists the music index + every published *public* dump so Google can index
 * each release individually.
 *
 * Non-public dumps (visibility = 'authenticated' | 'restricted') are
 * intentionally excluded — the sitemap is a search-engine hint file and
 * must never leak URLs a crawler can't legitimately reach.
 *
 * Rendered dynamically so DB changes reflect without a redeploy.
 */
const MUSIC_BASE = 'https://music.aaronrohrbacher.com';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const now = new Date().toISOString().split('T')[0];

  let dumps = [];
  try {
    const all = await loadDumps();
    dumps = all.filter(
      (d) => d.published && (d.visibility || 'public') === 'public'
    );
  } catch {
    // If the store is unreachable at build/edge time, serve a bare sitemap
    // rather than 500 — we'd rather Google see the index than nothing.
    dumps = [];
  }

  const urls = [
    { loc: `${MUSIC_BASE}/`, lastmod: now, changefreq: 'weekly', priority: '1.0' },
    ...dumps.map((d) => ({
      loc: `${MUSIC_BASE}/dump/${encodeURIComponent(d.slug || d.id)}`,
      lastmod: ((d.updatedAt || d.createdAt) || now).split('T')[0],
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
