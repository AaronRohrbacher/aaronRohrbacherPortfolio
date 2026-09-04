import { chromium, request as playwrightRequest } from 'playwright';

const MAIN = 'http://localhost:3000';
const MUSIC = 'http://music.localhost:3000';
const PORTA = 'http://portaputer.localhost:3000';
const evidence = {};
const api = await playwrightRequest.newContext();

try {
  const routes = [
    [MAIN, 200], [`${MAIN}/music`, 404],
    [MUSIC, 200], [`${MUSIC}/music`, 404], [`${MUSIC}/api/music/tracks`, 404],
    [PORTA, 200], [`${PORTA}/portaputer`, 404], [`${PORTA}/api/music/tracks`, 404],
  ];
  evidence.routing = [];
  for (const [url, expected] of routes) {
    const response = await api.get(url);
    evidence.routing.push({ url, status: response.status() });
    if (response.status() !== expected) throw new Error(`${url}: expected ${expected}, got ${response.status()}`);
  }

  const adminLogin = await api.post(`${MUSIC}/api/auth/signin`, { data: { email: 'admin@local.dev', password: 'admin' } });
  const { idToken: adminToken } = await adminLogin.json();
  if (!adminToken) throw new Error('Admin sign-in did not issue a token');
  const headers = { Authorization: `Bearer ${adminToken}` };

  const email = `acceptance-${Date.now()}@local.dev`;
  await api.post(`${MUSIC}/api/auth/signup`, { data: { email, password: 'acceptance-pass-1' } });
  const createdResponse = await api.post(`${MUSIC}/api/admin/magic-links`, {
    headers,
    data: { email, destination: 'https://attacker.invalid/escape' },
  });
  const { link } = await createdResponse.json();
  const listedResponse = await api.get(`${MUSIC}/api/admin/magic-links?email=${encodeURIComponent(email)}`, { headers });
  const listed = (await listedResponse.json()).links.find((item) => item.tokenId === link.tokenId);
  const redeemedResponse = await api.get(`${MUSIC}/api/auth/magic?token=${encodeURIComponent(link.token)}`);
  const redeemed = await redeemedResponse.json();
  const meResponse = await api.get(`${MUSIC}/api/auth/me`, { headers: { Authorization: `Bearer ${redeemed.idToken}` } });
  const me = await meResponse.json();
  const reused = await api.get(`${MUSIC}/api/auth/magic?token=${encodeURIComponent(link.token)}`);
  evidence.magicLink = {
    destination: link.destination,
    listedCopyAvailable: listed?.copyAvailable,
    listedTokenDiffersFromSecret: listed?.token !== link.token,
    redeemedEmail: me.user?.email,
    secondUseStatus: reused.status(),
  };
  if (link.destination !== '/' || listed?.copyAvailable !== false || listed?.token === link.token || me.user?.email !== email || reused.status() !== 401) {
    throw new Error('Magic-link acceptance failed');
  }

  const tracksResponse = await api.get(`${MUSIC}/api/tracks`);
  const payload = await tracksResponse.json();
  const tracks = [...(payload.tracks || []), ...(payload.dumps || []).flatMap((dump) => dump.tracks || [])];
  const track = tracks.find((item) => (Array.isArray(item.formats) ? item.formats : Object.keys(item.formats || {})).length > 0);
  if (!track) throw new Error('No public media track available for acceptance');
  const format = (Array.isArray(track.formats) ? track.formats : Object.keys(track.formats))[0];
  const rangeResponse = await api.get(`${MUSIC}/api/stream?id=${encodeURIComponent(track.id)}&format=${encodeURIComponent(format)}`, {
    headers: { Range: 'bytes=0-31' },
  });
  evidence.mediaRange = {
    track: track.id,
    format,
    status: rangeResponse.status(),
    contentRange: rangeResponse.headers()['content-range'] || null,
    acceptRanges: rangeResponse.headers()['accept-ranges'] || null,
    bytesReturned: (await rangeResponse.body()).length,
  };
  if (rangeResponse.status() !== 206 || !evidence.mediaRange.contentRange) throw new Error('Media byte-range acceptance failed');

  const downloadResponse = await api.get(`${MUSIC}/api/stream?id=${encodeURIComponent(track.id)}&format=${encodeURIComponent(format)}&download=1`, {
    headers: { Range: 'bytes=0-31' },
  });
  evidence.download = {
    status: downloadResponse.status(),
    disposition: downloadResponse.headers()['content-disposition'] || null,
    bytesReturned: (await downloadResponse.body()).length,
  };
  if (downloadResponse.status() !== 206 || !evidence.download.disposition?.startsWith('attachment;') || evidence.download.bytesReturned !== 32) {
    throw new Error('Download acceptance failed');
  }

  const variantFiles = ['acceptance.mp3', 'acceptance.wav', 'acceptance.aac', 'acceptance.m4a', 'acceptance.aiff', 'acceptance.mp4', 'acceptance.m4v', 'acceptance.webm', 'acceptance.mov'];
  const uploadResponse = await api.post(`${MUSIC}/api/admin/upload`, { headers, data: { files: variantFiles.map((filename) => ({ filename })) } });
  const uploadUrls = (await uploadResponse.json()).urls || [];
  evidence.uploadVariants = { status: uploadResponse.status(), accepted: uploadUrls.filter((item) => item.uploadUrl && !item.error).map((item) => item.filename) };
  if (uploadResponse.status() !== 200 || evidence.uploadVariants.accepted.length !== variantFiles.length) throw new Error('Upload variant acceptance failed');

  const sessionId = `acceptance-${Date.now()}`;
  const playbackResponse = await api.post(`${MUSIC}/api/playback`, { data: { action: 'start', trackId: track.id, sessionId, format, seconds: 0 } });
  const submitted = await api.post(`${MUSIC}/api/auth/signup-notification`, { data: { stage: 'submitted', email } });
  const confirmed = await api.post(`${MUSIC}/api/auth/signup-notification`, { data: { stage: 'confirmed', email } });
  const playbackEvents = await api.get(`${MUSIC}/api/admin/events?type=content.playback_start`, { headers });
  const submittedEvents = await api.get(`${MUSIC}/api/admin/events?type=auth.sign_up`, { headers });
  const confirmedEvents = await api.get(`${MUSIC}/api/admin/events?type=auth.sign_up_confirmed`, { headers });
  const portaEvents = await api.get(`${PORTA}/api/downloads`, { headers });
  const playbackList = (await playbackEvents.json()).events || [];
  const submittedList = (await submittedEvents.json()).events || [];
  const confirmedList = (await confirmedEvents.json()).events || [];
  const portaList = (await portaEvents.json()).events || [];
  evidence.events = {
    playbackStatus: playbackResponse.status(),
    signupNotificationStatuses: [submitted.status(), confirmed.status()],
    playbackRecorded: playbackList.some((item) => item.detail?.sessionId === sessionId && item.site === 'music'),
    submittedRecorded: submittedList.some((item) => item.actor === email && item.site === 'music'),
    confirmedRecorded: confirmedList.some((item) => item.actor === email && item.site === 'music'),
    portaputerContainsMusicEvents: portaList.some((item) => item.site !== 'portaputer'),
  };
  if (playbackResponse.status() !== 200 || submitted.status() !== 200 || confirmed.status() !== 200 || !evidence.events.playbackRecorded || !evidence.events.submittedRecorded || !evidence.events.confirmedRecorded || evidence.events.portaputerContainsMusicEvents) {
    throw new Error('Telemetry/signup/event isolation acceptance failed');
  }

  evidence.searchMetadata = {};
  for (const [name, base, origin] of [['main', MAIN, 'https://aaronrohrbacher.com'], ['music', MUSIC, 'https://music.aaronrohrbacher.com'], ['portaputer', PORTA, 'https://portaputer.aaronrohrbacher.com']]) {
    const robots = await (await api.get(`${base}/robots.txt`)).text();
    const sitemap = await (await api.get(`${base}/sitemap.xml`)).text();
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    evidence.searchMetadata[name] = { sitemapUrls: locations.length, ownOriginOnly: locations.every((url) => url.startsWith(origin)), exposesPrivateNamespaces: /\/(music|portaputer)\//.test(robots) || locations.some((url) => /\/(music|portaputer)\//.test(new URL(url).pathname)) };
    if (!evidence.searchMetadata[name].ownOriginOnly || evidence.searchMetadata[name].exposesPrivateNamespaces) throw new Error(`${name} search metadata acceptance failed`);
  }

  const botResponse = await api.get(`${MUSIC}/track/${encodeURIComponent(track.id)}`, {
    headers: { 'User-Agent': 'Googlebot/2.1' },
  });
  const botHtml = await botResponse.text();
  evidence.botHtml = {
    status: botResponse.status(),
    containsTrackTitle: botHtml.includes(track.name),
    containsJsonLd: botHtml.includes('application/ld+json'),
  };
  if (botResponse.status() !== 200 || !evidence.botHtml.containsTrackTitle || !evidence.botHtml.containsJsonLd) {
    throw new Error('Bot-visible track HTML acceptance failed');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  await page.goto(MUSIC, { waitUntil: 'networkidle' });
  const publicHrefs = await page.locator('a[href]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  evidence.cleanNavigation = { internalNamespaceLinks: publicHrefs.filter((href) => href?.startsWith('/music/') || href?.startsWith('/portaputer/')) };
  if (evidence.cleanNavigation.internalNamespaceLinks.length) throw new Error('Public navigation exposed a private namespace');
  const play = page.locator('button[aria-label^="Play"]').first();
  await play.click();
  const media = page.locator('video');
  await media.waitFor();
  await media.evaluate((node) => { node.dataset.acceptanceIdentity = 'persistent'; });
  await page.locator('button[aria-label="Expand player"]').click();
  const expandedIdentity = await media.getAttribute('data-acceptance-identity');
  const playerBox = await page.locator('[class*="PlayerBar"][class*="bar"]').first().boundingBox();
  const chatBox = await page.locator('button[aria-label="Open chat"]').boundingBox();
  const overlaps = Boolean(playerBox && chatBox && !(chatBox.y + chatBox.height <= playerBox.y || chatBox.y >= playerBox.y + playerBox.height));
  await page.locator('button[aria-label="Minimize player"]').click();
  const minimizedIdentity = await media.getAttribute('data-acceptance-identity');
  evidence.player = { mediaElements: await media.count(), expandedIdentity, minimizedIdentity, chatOverlapsPlayer: overlaps };
  if (evidence.player.mediaElements !== 1 || expandedIdentity !== 'persistent' || minimizedIdentity !== 'persistent' || overlaps) {
    throw new Error('Persistent player acceptance failed');
  }

  await page.evaluate((token) => localStorage.setItem('music_auth_token', token), adminToken);
  await page.goto(`${MUSIC}/admin`, { waitUntil: 'networkidle' });
  const sortValue = await page.getByLabel('Sort by').inputValue();
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  const controlHeights = await page.locator('[data-testid="music-admin-root"] button:visible, [data-testid="music-admin-root"] input:not([type="checkbox"]):visible, [data-testid="music-admin-root"] select:visible').evaluateAll(
    (nodes) => nodes.map((node) => node.getBoundingClientRect().height),
  );
  evidence.mobileAdmin = { sortValue, overflow: dimensions.scroll - dimensions.client, minimumControlHeight: Math.min(...controlHeights) };
  if (sortValue !== 'created' || dimensions.scroll > dimensions.client + 1 || evidence.mobileAdmin.minimumControlHeight < 42) {
    throw new Error('Mobile admin acceptance failed');
  }
  await page.goto(MUSIC, { waitUntil: 'networkidle' });
  const anonymousTracks = page.waitForResponse((response) => response.url().includes('/api/tracks') && !response.request().headers().authorization);
  await page.getByRole('button', { name: 'Sign Out' }).click();
  const anonymousResponse = await anonymousTracks;
  evidence.signOut = {
    anonymousRefreshStatus: anonymousResponse.status(),
    tokenCleared: await page.evaluate(() => localStorage.getItem('music_auth_token') === null),
    adminLinkRemoved: await page.getByRole('link', { name: 'Admin', exact: true }).count() === 0,
  };
  if (anonymousResponse.status() !== 200 || !evidence.signOut.tokenCleared || !evidence.signOut.adminLinkRemoved) throw new Error('Sign-out refresh acceptance failed');
  await browser.close();

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await api.dispose();
}
