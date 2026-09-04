import { normalizedRequestHost, siteFromHost } from '@/lib/siteHost';

export const dynamic = 'force-dynamic';

const ORIGINS = {
  main: 'https://aaronrohrbacher.com',
  music: 'https://music.aaronrohrbacher.com',
  portaputer: 'https://portaputer.aaronrohrbacher.com',
};

export function GET(request) {
  const site = siteFromHost(normalizedRequestHost(request));
  const disallow = site === 'music'
    ? ['/admin', '/login', '/signup', '/forgot-password', '/api/']
    : site === 'portaputer'
      ? ['/admin', '/api/']
      : ['/admin', '/api/'];
  const body = [
    'User-agent: *',
    'Allow: /',
    ...disallow.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${ORIGINS[site]}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      Vary: 'Host',
    },
  });
}
