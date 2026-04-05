import { NextResponse } from 'next/server';

// One structured log line per request. Captured by CloudWatch when deployed
// via SST — query with Logs Insights to spot scrapers, brute-force attempts,
// traffic patterns, etc. Skips static assets + Next.js internals to keep
// volume sane.
function logRequest(request) {
  const { pathname, search } = request.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/icons') ||
    pathname === '/favicon.ico' ||
    /\.(png|jpe?g|gif|svg|webp|woff2?|ico|map)$/i.test(pathname)
  ) return;

  const h = request.headers;
  const fwd = h.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || h.get('x-real-ip') || null;
  try {
    console.log(JSON.stringify({
      event: 'http_request',
      method: request.method,
      host: h.get('host') || null,
      path: pathname,
      query: search || null,
      ip,
      userAgent: h.get('user-agent') || null,
      referer: h.get('referer') || null,
      timestamp: new Date().toISOString(),
    }));
  } catch {}
}

export function middleware(request) {
  logRequest(request);
  const host = request.headers.get('host') || '';
  const { pathname } = request.nextUrl;

  // Check if this is a music subdomain request
  const isMusic = host.startsWith('music.') || host.startsWith('music-');

  if (isMusic) {
    // /sitemap.xml on the music subdomain serves the music-specific sitemap.
    if (pathname === '/sitemap.xml') {
      const url = request.nextUrl.clone();
      url.pathname = '/music-sitemap.xml';
      return NextResponse.rewrite(url);
    }

    // /robots.txt on the music subdomain serves a music-scoped robots file
    // (declares the music sitemap, disallows admin/auth paths).
    if (pathname === '/robots.txt') {
      const url = request.nextUrl.clone();
      url.pathname = '/music-robots.txt';
      return NextResponse.rewrite(url);
    }

    // Rewrite music subdomain requests to /music/* routes
    // But don't rewrite if already under /music or if it's an API/static route
    if (
      !pathname.startsWith('/music') &&
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/api/music') &&
      !pathname.startsWith('/fonts') &&
      !pathname.startsWith('/icons') &&
      pathname !== '/music-sitemap.xml' &&
      pathname !== '/music-robots.txt'
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/music${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }

    // Rewrite /api/* on music subdomain to /api/music/*
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/music')) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/music${pathname.slice(4)}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
