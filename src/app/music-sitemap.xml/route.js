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
  // lastmod must reflect content change, not request time. Per-dump
  // lastmod uses that dump's own updatedAt (falling back to createdAt).
  // The index lastmod is max(every dump's lastmod, BUILD_TIME) so that:
  //   • adding/editing a dump bumps the index online (no deploy needed —
  //     the route is force-dynamic), AND
  //   • a deploy with no content changes still bumps the index, matching
  //     the main site's "updates on deploy" behavior.
  // BUILD_TIME is injected via next.config.mjs (captured at `next build`).
  // Empty store + missing BUILD_TIME → epoch-style fallback so we never
  // lie with today's date.
  const FALLBACK_DATE = '1970-01-01';
  const buildDate = (process.env.BUILD_TIME || '').split('T')[0] || FALLBACK_DATE;

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

  const dumpDate = (d) => (d.updatedAt || d.createdAt || '').split('T')[0] || FALLBACK_DATE;
  const newestDumpDate = dumps.length ? dumps.map(dumpDate).sort().pop() : FALLBACK_DATE;
  const indexLastmod = [newestDumpDate, buildDate].sort().pop();

  const urls = [
    { loc: `${MUSIC_BASE}/`, lastmod: indexLastmod, changefreq: 'weekly', priority: '1.0' },
    ...dumps.map((d) => ({
      loc: `${MUSIC_BASE}/dump/${encodeURIComponent(d.slug || d.id)}`,
      lastmod: dumpDate(d),
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
