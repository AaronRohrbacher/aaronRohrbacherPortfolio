import { test, expect } from '@playwright/test';

// Comprehensive authorization matrix. Every endpoint that gates music
// content has a row here — for every combination of (viewer tier, track
// visibility, dump visibility) it verifies both denials AND grants. The
// previous test suite was green while the stream + track metadata + auth
// listing paths were all leaking, because it only exercised a handful of
// denial cases against the anon listing.
//
// Endpoints under test:
//   /api/music/tracks         — public listing
//   /api/music/track?id=…     — single-track metadata
//   /api/stream?id=…    — audio streaming / download redirect
//   /api/music/dump?id=…      — dump detail (used by /music/dump/[id])
//   /music                    — SSR front page (HTML + JSON-LD)
//
// Viewer tiers tested per track config:
//   anon                — no auth header
//   auth-no-perms       — fresh signup, no per-track grants
//   auth-with-perms     — fresh signup, admin-granted perms on the track
//   admin               — built-in admin account
//   anon-with-share     — share token bound to the dump or track
//
// Each describe uses beforeAll / afterAll for state setup so tests inside
// run independently and a failure in one row does not skip others.

const BASE = 'http://music.localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signIn(request, email = 'admin@local.dev', password = 'admin') {
  const res = await request.post(`${BASE}/api/auth/signin`, {
    data: { email, password },
  });
  return (await res.json()).idToken;
}

async function signUpFresh(request) {
  const email = `matrix-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@local.dev`;
  const res = await request.post(`${BASE}/api/auth/signup`, {
    data: { email, password: 'password123' },
  });
  const data = await res.json();
  return { email, token: data.idToken };
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getRawTracks(request, adminToken) {
  const res = await request.get(`${BASE}/api/tracks?raw=1`, {
    headers: authHeaders(adminToken),
  });
  return res.json();
}

async function putSingleTrack(request, adminToken, track) {
  const res = await request.put(`${BASE}/api/tracks`, {
    headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
    data: { track },
  });
  return res.json();
}

async function createDump(request, adminToken, body) {
  const res = await request.post(`${BASE}/api/admin/dumps`, {
    headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
    data: { published: true, visibility: 'public', ...body },
  });
  return (await res.json()).dump;
}

async function deleteDump(request, adminToken, id) {
  await request.delete(`${BASE}/api/admin/dumps?id=${id}`, {
    headers: authHeaders(adminToken),
  });
}

async function grantTrackPerm(request, adminToken, trackId, userEmail) {
  const res = await request.put(`${BASE}/api/admin/permissions`, {
    headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
    data: { trackId, targetType: 'user', targetId: userEmail, action: 'grant' },
  });
  return res.json();
}

async function createDumpShare(request, adminToken, dumpId) {
  const res = await request.post(`${BASE}/api/admin/dump-share-links`, {
    headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
    data: { dumpId },
  });
  const data = await res.json();
  return data.link || data;
}

async function createTrackShare(request, adminToken, trackId) {
  const res = await request.post(`${BASE}/api/admin/track-share-links`, {
    headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
    data: { trackId },
  });
  const data = await res.json();
  return data.link || data;
}

/**
 * Probe every per-track endpoint with a given viewer. Returns raw status
 * codes + presence flags so tests can assert against the full surface in
 * one shot.
 */
async function probe(request, { trackId, dumpId, token, shareParam }) {
  const share = shareParam ? `&share=${encodeURIComponent(shareParam)}` : '';
  const headers = authHeaders(token);
  const [tracksRes, trackRes, streamRes, dumpRes] = await Promise.all([
    request.get(`${BASE}/api/tracks`, { headers }),
    request.get(`${BASE}/api/track?id=${encodeURIComponent(trackId)}${share}`, { headers }),
    request.get(
      `${BASE}/api/stream?id=${encodeURIComponent(trackId)}&format=mp3${share}`,
      { headers, maxRedirects: 0 }
    ),
    dumpId
      ? request.get(`${BASE}/api/dump?id=${encodeURIComponent(dumpId)}${share}`, { headers })
      : Promise.resolve(null),
  ]);

  const tracksData = await tracksRes.json().catch(() => ({}));
  const looseIds = (tracksData.tracks || []).map((t) => t.id);
  const dumpTrackIds = (tracksData.dumps || []).flatMap((d) => (d.tracks || []).map((t) => t.id));
  const inListing = looseIds.includes(trackId) || dumpTrackIds.includes(trackId);
  const dumpInListing = (tracksData.dumps || []).some((d) => d.id === dumpId);

  const dumpJson = dumpRes ? await dumpRes.json().catch(() => ({})) : null;
  const dumpHasTrack = !!(dumpJson && (dumpJson.tracks || []).some((t) => t.id === trackId));

  return {
    tracks: { status: tracksRes.status(), inListing, dumpInListing },
    track: { status: trackRes.status() },
    stream: { status: streamRes.status() },
    dump: dumpRes ? { status: dumpRes.status(), hasTrack: dumpHasTrack } : null,
  };
}

function expectGranted(p, { expectStreamStatus = [200, 206, 302] } = {}) {
  expect(p.track.status, `track metadata denied unexpectedly`).toBe(200);
  expect(expectStreamStatus, `stream denied unexpectedly (got ${p.stream.status})`).toContain(p.stream.status);
  expect(p.tracks.inListing, `tracks listing missing the track`).toBe(true);
  if (p.dump) {
    expect(p.dump.status, `dump detail denied unexpectedly`).toBe(200);
    expect(p.dump.hasTrack, `dump detail missing the track`).toBe(true);
  }
}

function expectDenied(p) {
  expect([401, 403, 404], `track metadata unexpectedly granted (${p.track.status})`).toContain(p.track.status);
  expect(p.stream.status, `stream unexpectedly granted (${p.stream.status})`).toBeGreaterThanOrEqual(400);
  expect(p.tracks.inListing, `tracks listing leaked the track`).toBe(false);
  if (p.dump) {
    expect([401, 403, 404], `dump detail unexpectedly granted (${p.dump.status})`).toContain(p.dump.status);
  }
}

// ── Matrix 1: Direct publish — track.published=true, dumpIds=[] ───────────────

for (const tier of ['public', 'authenticated', 'restricted']) {
  test.describe(`Direct publish · visibility=${tier}`, () => {
    let adminToken;
    let trackId;

    test.beforeAll(async ({ request }) => {
      adminToken = await signIn(request);
      const raw = await getRawTracks(request, adminToken);
      trackId = raw.tracks[0].id;
      const next = { ...raw.tracks[0], published: true, visibility: tier, dumpIds: [] };
      delete next.dumpId;
      await putSingleTrack(request, adminToken, next);
    });

    test.afterAll(async ({ request }) => {
      const raw = await getRawTracks(request, adminToken);
      const t = raw.tracks.find((x) => x.id === trackId);
      if (t) {
        const cleaned = { ...t, published: false, dumpIds: [] };
        delete cleaned.dumpId;
        await putSingleTrack(request, adminToken, cleaned);
      }
    });

    test('anon', async ({ request }) => {
      const p = await probe(request, { trackId });
      if (tier === 'public') expectGranted(p);
      else expectDenied(p);
    });

    test('auth-no-perms', async ({ request }) => {
      const { token } = await signUpFresh(request);
      const p = await probe(request, { trackId, token });
      if (tier === 'public' || tier === 'authenticated') expectGranted(p);
      else expectDenied(p);
    });

    test('auth-with-perms', async ({ request }) => {
      const { email, token } = await signUpFresh(request);
      await grantTrackPerm(request, adminToken, trackId, email);
      const p = await probe(request, { trackId, token });
      expectGranted(p);
    });

    test('admin', async ({ request }) => {
      const p = await probe(request, { trackId, token: adminToken });
      expectGranted(p);
    });
  });
}

// ── Matrix 2: Dump-only — track.published=false, dumpIds=[dump] ───────────────

for (const dumpTier of ['public', 'authenticated', 'restricted']) {
  test.describe(`Dump-only · dump visibility=${dumpTier}`, () => {
    let adminToken;
    let trackId;
    let dumpId;

    test.beforeAll(async ({ request }) => {
      adminToken = await signIn(request);
      const dump = await createDump(request, adminToken, {
        name: `dumponly-${dumpTier}-${Date.now()}`,
        visibility: dumpTier,
      });
      dumpId = dump.id;
      const raw = await getRawTracks(request, adminToken);
      trackId = raw.tracks[0].id;
      const next = {
        ...raw.tracks[0],
        published: false,
        visibility: 'public',
        dumpIds: [dumpId],
      };
      delete next.dumpId;
      await putSingleTrack(request, adminToken, next);
    });

    test.afterAll(async ({ request }) => {
      const raw = await getRawTracks(request, adminToken);
      const t = raw.tracks.find((x) => x.id === trackId);
      if (t) {
        const cleaned = { ...t, published: false, dumpIds: [] };
        delete cleaned.dumpId;
        await putSingleTrack(request, adminToken, cleaned);
      }
      await deleteDump(request, adminToken, dumpId);
    });

    test('anon', async ({ request }) => {
      const p = await probe(request, { trackId, dumpId });
      if (dumpTier === 'public') expectGranted(p);
      else expectDenied(p);
    });

    test('auth-no-perms', async ({ request }) => {
      const { token } = await signUpFresh(request);
      const p = await probe(request, { trackId, dumpId, token });
      if (dumpTier === 'public' || dumpTier === 'authenticated') expectGranted(p);
      else expectDenied(p);
    });

    test('auth-with-perms', async ({ request }) => {
      const { email, token } = await signUpFresh(request);
      await grantTrackPerm(request, adminToken, trackId, email);
      const p = await probe(request, { trackId, dumpId, token });
      expectGranted(p);
    });

    test('admin', async ({ request }) => {
      const p = await probe(request, { trackId, dumpId, token: adminToken });
      expectGranted(p);
    });
  });
}

// ── Matrix 3: Cross-path interactions ─────────────────────────────────────────

test.describe('Cross-path · restricted dump trumps direct-public track', () => {
  // DUMP TRUMPS: once a track is in any dump, the dump owns visibility
  // and the track's own published+visibility is irrelevant. A track
  // tagged published+public but dropped into a restricted dump is NOT
  // anon-reachable — the restricted dump doesn't admit anon.
  let adminToken;
  let trackId;
  let dumpId;

  test.beforeAll(async ({ request }) => {
    adminToken = await signIn(request);
    const dump = await createDump(request, adminToken, {
      name: `cross-direct-${Date.now()}`,
      visibility: 'restricted',
    });
    dumpId = dump.id;
    const raw = await getRawTracks(request, adminToken);
    trackId = raw.tracks[0].id;
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: true,
      visibility: 'public',
      dumpIds: [dumpId],
    });
  });

  test.afterAll(async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const t = raw.tracks.find((x) => x.id === trackId);
    if (t) await putSingleTrack(request, adminToken, { ...t, published: false, dumpIds: [] });
    await deleteDump(request, adminToken, dumpId);
  });

  test('anon DENIED — restricted dump owns visibility', async ({ request }) => {
    const p = await probe(request, { trackId, dumpId });
    expect(p.track.status).not.toBe(200);
    expect(p.stream.status).toBeGreaterThanOrEqual(400);
    if (p.dump) {
      expect([401, 403, 404]).toContain(p.dump.status);
    }
  });

  test('auth-no-perms DENIED — restricted dump still requires perms', async ({ request }) => {
    const { token } = await signUpFresh(request);
    const p = await probe(request, { trackId, dumpId, token });
    expect(p.track.status).not.toBe(200);
    expect(p.stream.status).toBeGreaterThanOrEqual(400);
  });

  test('auth-with-perms admitted', async ({ request }) => {
    const { email, token } = await signUpFresh(request);
    await grantTrackPerm(request, adminToken, trackId, email);
    const p = await probe(request, { trackId, dumpId, token });
    expect(p.track.status).toBe(200);
    expect([200, 206, 302]).toContain(p.stream.status);
  });
});

test.describe('Cross-path · public dump overrides direct-restricted track visibility', () => {
  // New rule: track visibility is overridden inside a dump. A
  // directly-restricted track that lives inside a public dump is
  // reachable via the dump cascade — both via the listing (rendered
  // inside the public dump card) and via the per-track endpoints. The
  // loose listing still hides it (track-side gate denies anon), but
  // canViewTrack on /api/music/track and /api/stream admits.
  let adminToken;
  let trackId;
  let dumpId;

  test.beforeAll(async ({ request }) => {
    adminToken = await signIn(request);
    const dump = await createDump(request, adminToken, {
      name: `cross-restricted-${Date.now()}`,
      visibility: 'public',
    });
    dumpId = dump.id;
    const raw = await getRawTracks(request, adminToken);
    trackId = raw.tracks[0].id;
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: true,
      visibility: 'restricted',
      dumpIds: [dumpId],
    });
  });

  test.afterAll(async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const t = raw.tracks.find((x) => x.id === trackId);
    if (t) await putSingleTrack(request, adminToken, { ...t, published: false, dumpIds: [] });
    await deleteDump(request, adminToken, dumpId);
  });

  test('anon admitted via the public-dump cascade', async ({ request }) => {
    const p = await probe(request, { trackId, dumpId });
    expect(p.track.status).toBe(200);
    expect([200, 206, 302]).toContain(p.stream.status);
    // Track shows up inside the public dump card on the listing.
    expect(p.tracks.inListing).toBe(true);
  });

  test('auth-no-perms also admitted (public dump)', async ({ request }) => {
    const { token } = await signUpFresh(request);
    const p = await probe(request, { trackId, dumpId, token });
    expect(p.track.status).toBe(200);
    expect([200, 206, 302]).toContain(p.stream.status);
    expect(p.tracks.inListing).toBe(true);
  });

  test('auth-with-perms still passes', async ({ request }) => {
    const { email, token } = await signUpFresh(request);
    await grantTrackPerm(request, adminToken, trackId, email);
    const p = await probe(request, { trackId, dumpId, token });
    expect(p.track.status).toBe(200);
    expect([200, 206, 302]).toContain(p.stream.status);
  });
});

// ── Matrix 4: Share tokens ────────────────────────────────────────────────────

test.describe('Share token · dump-share on restricted dump', () => {
  let adminToken;
  let trackId;
  let dumpId;
  let shareToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await signIn(request);
    const dump = await createDump(request, adminToken, {
      name: `share-dump-${Date.now()}`,
      visibility: 'restricted',
    });
    dumpId = dump.id;
    const raw = await getRawTracks(request, adminToken);
    trackId = raw.tracks[0].id;
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: false,
      visibility: 'public',
      dumpIds: [dumpId],
    });
    const share = await createDumpShare(request, adminToken, dumpId);
    shareToken = share.token;
    expect(shareToken).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const t = raw.tracks.find((x) => x.id === trackId);
    if (t) await putSingleTrack(request, adminToken, { ...t, published: false, dumpIds: [] });
    await deleteDump(request, adminToken, dumpId);
  });

  test('anon WITHOUT token → denied everywhere', async ({ request }) => {
    const p = await probe(request, { trackId, dumpId });
    expectDenied(p);
  });

  test('anon WITH dump-share token → /api/music/track metadata succeeds', async ({ request }) => {
    // Regression: the /api/music/track endpoint previously checked legacy
    // track.dumpId (singular, nonexistent after multi-dump) when resolving
    // dump-share tokens, so this path silently never granted.
    const res = await request.get(
      `${BASE}/api/track?id=${encodeURIComponent(trackId)}&share=${encodeURIComponent(shareToken)}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.track.id).toBe(trackId);
    const streamUrl = Object.values(body.track.streamUrls || {})[0] || '';
    expect(streamUrl).toContain(`share=${encodeURIComponent(shareToken)}`);
  });

  test('anon WITH dump-share token → /api/stream succeeds', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${encodeURIComponent(trackId)}&format=mp3&share=${encodeURIComponent(shareToken)}`,
      { maxRedirects: 0 }
    );
    expect([200, 206, 302]).toContain(res.status());
  });

  test('anon WITH dump-share token → /api/music/dump succeeds', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/dump?id=${encodeURIComponent(dumpId)}&share=${encodeURIComponent(shareToken)}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect((body.tracks || []).map((t) => t.id)).toContain(trackId);
  });
});

test.describe('Share token · track-share on restricted dump', () => {
  let adminToken;
  let trackId;
  let dumpId;
  let shareToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await signIn(request);
    const dump = await createDump(request, adminToken, {
      name: `share-track-${Date.now()}`,
      visibility: 'restricted',
    });
    dumpId = dump.id;
    const raw = await getRawTracks(request, adminToken);
    trackId = raw.tracks[0].id;
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: false,
      visibility: 'public',
      dumpIds: [dumpId],
    });
    const share = await createTrackShare(request, adminToken, trackId);
    shareToken = share.token;
    expect(shareToken).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const t = raw.tracks.find((x) => x.id === trackId);
    if (t) await putSingleTrack(request, adminToken, { ...t, published: false, dumpIds: [] });
    await deleteDump(request, adminToken, dumpId);
  });

  test('track-share opens /api/music/track metadata', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/track?id=${encodeURIComponent(trackId)}&share=${encodeURIComponent(shareToken)}`
    );
    expect(res.status()).toBe(200);
  });

  test('track-share opens /api/stream', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${encodeURIComponent(trackId)}&format=mp3&share=${encodeURIComponent(shareToken)}`,
      { maxRedirects: 0 }
    );
    expect([200, 206, 302]).toContain(res.status());
  });
});

// ── Matrix 5: SSR /music HTML must not leak private content ───────────────────

test.describe('SSR /music page reflects the access model', () => {
  let adminToken;
  let publicTrackId;
  let privateTrackId;
  let privateDumpId;

  test.beforeAll(async ({ request }) => {
    adminToken = await signIn(request);
    const dump = await createDump(request, adminToken, {
      name: `ssr-${Date.now()}`,
      visibility: 'restricted',
    });
    privateDumpId = dump.id;
    const raw = await getRawTracks(request, adminToken);
    publicTrackId = raw.tracks[0].id;
    privateTrackId = raw.tracks[1]?.id || null;
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: true,
      visibility: 'public',
      dumpIds: [],
    });
    if (privateTrackId) {
      await putSingleTrack(request, adminToken, {
        ...raw.tracks[1],
        published: false,
        visibility: 'public',
        dumpIds: [privateDumpId],
      });
    }
  });

  test.afterAll(async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    for (const t of raw.tracks) {
      await putSingleTrack(request, adminToken, { ...t, published: false, dumpIds: [] });
    }
    await deleteDump(request, adminToken, privateDumpId);
  });

  test('anon SSR HTML does NOT contain the restricted-dump track id', async ({ request }) => {
    test.skip(!privateTrackId, 'dev S3 bucket only has one track');
    const res = await request.get(`${BASE}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html.includes(privateTrackId)).toBe(false);
  });

  test('anon SSR JSON-LD numTracks matches the public visible set', async ({ request }) => {
    const res = await request.get(`${BASE}`);
    const html = await res.text();
    const m = html.match(/application\/ld\+json"[^>]*>([^<]+)<\/script>/);
    expect(m).toBeTruthy();
    const graph = JSON.parse(m[1])['@graph'];
    const playlist = graph.find((g) => g['@type'] === 'MusicPlaylist');
    expect(playlist).toBeTruthy();
    const names = (playlist.track || []).map((t) => t.name);
    expect(names).toContain(publicTrackId);
    if (privateTrackId) expect(names).not.toContain(privateTrackId);
  });
});

// ── Matrix 6: Fully unpublished track ─────────────────────────────────────────

test.describe('Unpublished everywhere · only admin can reach it', () => {
  let adminToken;
  let trackId;

  test.beforeAll(async ({ request }) => {
    adminToken = await signIn(request);
    const raw = await getRawTracks(request, adminToken);
    trackId = raw.tracks[0].id;
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: false,
      visibility: 'public',
      dumpIds: [],
    });
  });

  test('anon denied on every per-track endpoint', async ({ request }) => {
    const p = await probe(request, { trackId });
    expectDenied(p);
  });

  test('auth-no-perms denied', async ({ request }) => {
    const { token } = await signUpFresh(request);
    const p = await probe(request, { trackId, token });
    expectDenied(p);
  });

  test('auth-with-perms STILL denied (perms gate a tier, not publish state)', async ({ request }) => {
    const { email, token } = await signUpFresh(request);
    await grantTrackPerm(request, adminToken, trackId, email);
    const p = await probe(request, { trackId, token });
    expectDenied(p);
  });

  test('admin streams fine', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${encodeURIComponent(trackId)}&format=mp3`,
      { headers: authHeaders(adminToken), maxRedirects: 0 }
    );
    expect([200, 206, 302]).toContain(res.status());
  });
});
