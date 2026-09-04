export function normalizedRequestHost(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-host');
  const raw = (forwarded || request?.headers?.get?.('host') || '').split(',')[0].trim();
  return raw.toLowerCase().replace(/:\d+$/, '');
}

export function siteFromHost(host) {
  if (host === 'music.localhost' || host.startsWith('music.')) return 'music';
  if (host === 'portaputer.localhost' || host.startsWith('portaputer.')) return 'portaputer';
  return 'main';
}
