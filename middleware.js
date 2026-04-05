import { NextResponse } from 'next/server';

export function middleware(request) {
  const host = request.headers.get('host') || '';
  const { pathname } = request.nextUrl;

  // Check if this is a music subdomain request
  const isMusic = host.startsWith('music.') || host.startsWith('music-');

  if (isMusic) {
    // Rewrite music subdomain requests to /music/* routes
    // But don't rewrite if already under /music or if it's an API/static route
    if (
      !pathname.startsWith('/music') &&
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/api/music') &&
      !pathname.startsWith('/fonts') &&
      !pathname.startsWith('/icons')
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
