import { NextResponse } from 'next/server';

const STATIC_PREFIXES = ['/_next/', '/fonts/', '/icons/'];
const STATIC_FILES = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);

function requestHost(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  const raw = (forwarded || request.headers.get('host') || '').split(',')[0].trim();
  return raw.toLowerCase().replace(/:\d+$/, '');
}

function siteForHost(host) {
  if (host === 'music.localhost' || host.startsWith('music.')) return 'music';
  if (host === 'portaputer.localhost' || host.startsWith('portaputer.')) return 'portaputer';
  return 'main';
}

function isStatic(pathname) {
  return STATIC_FILES.has(pathname) || STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function notFound() {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function rewrite(request, pathname) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

function logRequest(request, host) {
  const { pathname, search } = request.nextUrl;
  if (isStatic(pathname) || /\.(png|jpe?g|gif|svg|webp|woff2?|ico|map)$/i.test(pathname)) return;
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const geoHeader = (name) => {
    const value = request.headers.get(`x-open-next-${name}`) || request.headers.get(`cloudfront-viewer-${name}`);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  try {
    console.log(JSON.stringify({
      event: 'http_request',
      method: request.method,
      host,
      path: pathname,
      query: search || null,
      ip: forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
      referer: request.headers.get('referer') || null,
      city: geoHeader('city'),
      region: geoHeader('region') || geoHeader('country-region'),
      country: geoHeader('country'),
      timestamp: new Date().toISOString(),
    }));
  } catch {}
}

/**
 * Host-aware application router for the single Next/OpenNext deployment.
 * `/music`, `/portaputer`, `/api/music`, and `/api/portaputer` are private
 * implementation namespaces. Only rewrites created here may reach them.
 */
export function proxy(request) {
  const host = requestHost(request);
  const site = siteForHost(host);
  const { pathname } = request.nextUrl;
  logRequest(request, host);

  // Never expose implementation namespaces as public URLs on any host.
  if (
    pathname === '/music' || pathname.startsWith('/music/') ||
    pathname === '/portaputer' || pathname.startsWith('/portaputer/') ||
    pathname === '/api/music' || pathname.startsWith('/api/music/') ||
    pathname === '/api/portaputer' || pathname.startsWith('/api/portaputer/') ||
    pathname === '/music-sitemap.xml' || pathname === '/portaputer-sitemap.xml' ||
    pathname === '/music-robots.txt' || pathname === '/portaputer-robots.txt'
  ) {
    return notFound();
  }

  if (isStatic(pathname)) return NextResponse.next();

  if (site === 'music') {
    if (pathname === '/api') return notFound();
    if (pathname.startsWith('/api/')) {
      return rewrite(request, `/api/music${pathname.slice(4)}`);
    }
    return rewrite(request, `/music${pathname === '/' ? '' : pathname}`);
  }

  if (site === 'portaputer') {
    if (pathname === '/api') return notFound();
    if (pathname.startsWith('/api/auth/')) {
      return rewrite(request, `/api/music${pathname.slice(4)}`);
    }
    if (pathname.startsWith('/api/')) {
      return rewrite(request, `/api/portaputer${pathname.slice(4)}`);
    }
    return rewrite(request, `/portaputer${pathname === '/' ? '' : pathname}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
