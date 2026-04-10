import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROD_MUSIC_ORIGIN = 'https://music.aaronrohrbacher.com';

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

/** True when the host header belongs to the music subdomain. */
function isMusicHost(host) {
  return host.startsWith('music.') || host.startsWith('music-');
}

/** True for paths that should never be rewritten / redirected. */
function isStaticOrInternal(pathname) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/fonts') ||
    pathname.startsWith('/icons') ||
    pathname === '/music-sitemap.xml' ||
    pathname === '/music-robots.txt'
  );
}

/** True when the host is localhost / 127.0.0.1 (dev mode). */
function isLocalhost(host) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request) {
  logRequest(request);
  const host = request.headers.get('host') || '';
  const { pathname, search } = request.nextUrl;

  const isMusic = isMusicHost(host);
  const isLocal = isLocalhost(host);

  // ----- MUSIC SUBDOMAIN -----
  if (isMusic) {
    // If someone navigates to music.aaronrohrbacher.com/music or
    // music.aaronrohrbacher.com/music/login, strip the /music prefix and
    // redirect so the URL stays clean (no /music in the visible URL).
    if (pathname === '/music' || pathname.startsWith('/music/')) {
      const clean = pathname.replace(/^\/music/, '') || '/';
      const url = request.nextUrl.clone();
      url.pathname = clean;
      return NextResponse.redirect(url, 308);
    }

    // /sitemap.xml → music-specific sitemap
    if (pathname === '/sitemap.xml') {
      const url = request.nextUrl.clone();
      url.pathname = '/music-sitemap.xml';
      return NextResponse.rewrite(url);
    }

    // /robots.txt → music-scoped robots file
    if (pathname === '/robots.txt') {
      const url = request.nextUrl.clone();
      url.pathname = '/music-robots.txt';
      return NextResponse.rewrite(url);
    }

    // Rewrite /api/* → /api/music/* (except /api/music/* which is already correct)
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/music')) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/music${pathname.slice(4)}`;
      return NextResponse.rewrite(url);
    }

    // Rewrite every other non-static, non-API path → /music/* internally
    if (!isStaticOrInternal(pathname) && !pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone();
      url.pathname = `/music${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // ----- MAIN / WWW DOMAIN (production only — skip on localhost) -----
  if (!isLocal && !isMusic) {
    // aaronrohrbacher.com/music → redirect to music.aaronrohrbacher.com
    // aaronrohrbacher.com/music/login → redirect to music.aaronrohrbacher.com/login
    if (pathname === '/music' || pathname.startsWith('/music/')) {
      const subpath = pathname.replace(/^\/music/, '') || '/';
      return NextResponse.redirect(`${PROD_MUSIC_ORIGIN}${subpath}${search}`, 308);
    }

    // Block music API routes on the main domain
    if (pathname.startsWith('/api/music')) {
      const subpath = pathname.replace(/^\/api\/music/, '');
      return NextResponse.redirect(`${PROD_MUSIC_ORIGIN}/api${subpath}${search}`, 308);
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
