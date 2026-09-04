/** Keep passwordless-login redirects on clean, public Music URLs. */
export function safeMagicDestination(destination) {
  if (!destination) return '/';
  if (typeof destination !== 'string' || !destination.startsWith('/') || destination.startsWith('//')) return '/';
  try {
    const url = new URL(destination, 'https://music.invalid');
    if (!/^\/(?:$|track\/[^/]+|dump\/[^/]+)$/.test(url.pathname)) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}
