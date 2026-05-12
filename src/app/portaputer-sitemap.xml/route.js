export const dynamic = 'force-static';

const BASE = 'https://portaputer.aaronrohrbacher.com';

const routes = [
  { path: '/', priority: '1.0', changefreq: 'monthly' },
  { path: '/installation', priority: '0.9', changefreq: 'monthly' },
  { path: '/features', priority: '0.8', changefreq: 'monthly' },
  { path: '/requirements', priority: '0.8', changefreq: 'monthly' },
  { path: '/troubleshooting', priority: '0.7', changefreq: 'monthly' },
];

export async function GET() {
  const urls = routes
    .map(
      (r) =>
        `  <url>\n    <loc>${BASE}${r.path}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
    )
    .join('\n');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
