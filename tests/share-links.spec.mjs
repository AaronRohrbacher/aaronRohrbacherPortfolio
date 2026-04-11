import { test, expect } from '@playwright/test';

// Run all tests serially — DynamoDB Local is in-memory, state carries between tests
test.describe.configure({ mode: 'serial' });

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';

async function signIn(request, email = 'admin@local.dev', password = 'admin') {
  const res = await request.post(`${BASE}/api/music/auth/signin`, {
    data: { email, password },
  });
  const data = await res.json();
  return data.idToken;
}

async function signUp(request, email, password) {
  const res = await request.post(`${BASE}/api/music/auth/signup`, {
    data: { email, password },
  });
  return res.json();
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getRawTracks(request, token) {
  const res = await request.get(`${BASE}/api/music/tracks?raw=1`, {
    headers: authHeaders(token),
  });
  return res.json();
}

async function putTracks(request, token, tracks) {
  const res = await request.put(`${BASE}/api/music/tracks`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { tracks },
  });
  return res.json();
}

/**
 * Set up tracks so we have at least two restricted + published tracks to hand
 * out share links for. Returns { trackA, trackB } — two distinct track objects
 * from the raw list. All other tracks are unpublished so they don't clutter
 * anonymous endpoints.
 */
async function publishTwoRestrictedTracks(request, token) {
  const raw = await getRawTracks(request, token);
  const tracks = raw.tracks;
  expect(tracks.length).toBeGreaterThanOrEqual(2);
  tracks[0] = { ...tracks[0], published: true, visibility: 'restricted', dumpId: null, dumpIds: [] };
  tracks[1] = { ...tracks[1], published: true, visibility: 'restricted', dumpId: null, dumpIds: [] };
  for (let i = 2; i < tracks.length; i++) {
    tracks[i] = { ...tracks[i], published: false };
  }
  await putTracks(request, token, tracks);
  return { trackA: tracks[0], trackB: tracks[1] };
}

// ── Track Share Links — admin API ──────────────────────────────────────────────

test.describe('Track Share Links — admin API', () => {
  let adminToken;
  let trackA;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
    expect(adminToken).toBeTruthy();
    const { trackA: t } = await publishTwoRestrictedTracks(request, adminToken);
    trackA = t;
  });

  test('POST creates a track-share link', async ({ request }) => {
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.link.token).toBeTruthy();
    expect(data.link.trackId).toBe(trackA.id);
    expect(data.link.expiresAt).toBeNull();
  });

  test('POST without trackId returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('POST for nonexistent track returns 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: `ghost-${Date.now()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('POST without admin auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      data: { trackId: trackA.id },
    });
    expect(res.status()).toBe(401);
  });

  test('POST with expiresInDays: 14 sets expiresAt ~14 days out', async ({ request }) => {
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, expiresInDays: 14 },
    });
    expect(res.status()).toBe(200);
    const { link } = await res.json();
    expect(link.expiresAt).toBeTruthy();
    const diffDays = (new Date(link.expiresAt) - new Date()) / 86400000;
    expect(diffDays).toBeGreaterThan(13.5);
    expect(diffDays).toBeLessThan(14.5);
  });

  test('POST with label round-trips via unified list endpoint', async ({ request }) => {
    const label = `labeled-${Date.now()}`;
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label },
    });
    const { link } = await res.json();

    const listRes = await request.get(`${BASE}/api/music/admin/share-links`, {
      headers: authHeaders(adminToken),
    });
    const listData = await listRes.json();
    const found = listData.links.find((l) => l.token === link.token);
    expect(found).toBeTruthy();
    expect(found.label).toBe(label);
    expect(found.kind).toBe('track');
    expect(found.trackId).toBe(trackA.id);
  });

  test('GET ?trackId= returns links for a track', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/music/admin/track-share-links?trackId=${encodeURIComponent(trackA.id)}`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.links)).toBe(true);
    expect(data.links.length).toBeGreaterThanOrEqual(1);
    expect(data.links[0].trackId).toBe(trackA.id);
  });

  test('GET without trackId returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/music/admin/track-share-links`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(400);
  });

  test('DELETE ?token= revokes the link', async ({ request }) => {
    // Create a fresh link so we can revoke it without disturbing other tests
    const create = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `to-delete-${Date.now()}` },
    });
    const { link } = await create.json();

    const del = await request.delete(
      `${BASE}/api/music/admin/track-share-links?token=${link.token}`,
      { headers: authHeaders(adminToken) }
    );
    expect(del.status()).toBe(200);
    expect((await del.json()).ok).toBe(true);

    const listRes = await request.get(
      `${BASE}/api/music/admin/track-share-links?trackId=${encodeURIComponent(trackA.id)}`,
      { headers: authHeaders(adminToken) }
    );
    const listData = await listRes.json();
    const stillThere = listData.links.find((l) => l.token === link.token);
    expect(stillThere).toBeFalsy();
  });

  test('DELETE without admin auth returns 401', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/api/music/admin/track-share-links?token=any`
    );
    expect(res.status()).toBe(401);
  });
});

// ── Track Share Redemption — stream + track endpoints ──────────────────────────

test.describe('Track Share Redemption — stream + track endpoints', () => {
  let adminToken;
  let trackA;
  let trackB;
  let shareTokenA;

  test('setup: restricted tracks + track-share for track A', async ({ request }) => {
    adminToken = await signIn(request);
    const { trackA: a, trackB: b } = await publishTwoRestrictedTracks(request, adminToken);
    trackA = a;
    trackB = b;

    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `redeem-${Date.now()}` },
    });
    const { link } = await res.json();
    shareTokenA = link.token;
    expect(shareTokenA).toBeTruthy();
  });

  test('anonymous GET /api/music/track?id=&share= returns 200 with streamUrls', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/music/track?id=${encodeURIComponent(trackA.id)}&share=${shareTokenA}`
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.track).toBeTruthy();
    expect(data.track.id).toBe(trackA.id);
    // All stream URLs should propagate the share token
    const urls = Object.values(data.track.streamUrls);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toContain(`&share=${shareTokenA}`);
    }
  });

  test('anonymous GET /api/music/stream?share= redirects to signed URL', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${shareTokenA}`,
      { maxRedirects: 0 }
    );
    expect(res.status()).toBe(302);
    const loc = res.headers()['location'];
    expect(loc).toBeTruthy();
    expect(loc.startsWith('https://')).toBe(true);
  });

  test('anonymous GET /api/music/stream without share on restricted track returns 401 or 403', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3`,
      { maxRedirects: 0 }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('wrong share token returns 401/403', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&share=totally-bogus-token`,
      { maxRedirects: 0 }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('track A share does NOT grant access to track B', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackB.id)}&format=mp3&share=${shareTokenA}`,
      { maxRedirects: 0 }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('after admin DELETE, redemption fails', async ({ request }) => {
    // Make a dedicated share token so we can delete it without affecting others
    const create = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `delete-then-redeem-${Date.now()}` },
    });
    const { link } = await create.json();

    // Works before delete — use download=1 so we always hit the redirect branch
    // regardless of whether MUSIC_CDN_DOMAIN is set or the server is proxying.
    const before = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect(before.status()).toBe(302);

    // Delete it
    await request.delete(
      `${BASE}/api/music/admin/track-share-links?token=${link.token}`,
      { headers: authHeaders(adminToken) }
    );

    // Now fails
    const after = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect([401, 403]).toContain(after.status());
  });
});

// ── Unified Share Links Admin API ──────────────────────────────────────────────

test.describe('Unified Share Links Admin API', () => {
  let adminToken;
  let trackA;

  test('setup: sign in admin + seed one of each kind', async ({ request }) => {
    adminToken = await signIn(request);

    // Ensure at least one published track exists
    const { trackA: a } = await publishTwoRestrictedTracks(request, adminToken);
    trackA = a;

    // Seed a login magic link
    const email = `unified-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');
    await request.post(`${BASE}/api/music/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email, label: `login-seed-${Date.now()}` },
    });

    // Seed a dump share link
    const dumpRes = await request.post(`${BASE}/api/music/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: `Unified Dump ${Date.now()}`, published: true, visibility: 'public' },
    });
    const dumpId = (await dumpRes.json()).dump.id;
    await request.post(`${BASE}/api/music/admin/dump-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { dumpId, label: `dump-seed-${Date.now()}` },
    });

    // Seed a track share link
    await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `track-seed-${Date.now()}` },
    });
  });

  test('GET returns all three kinds with expected fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/music/admin/share-links`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.links)).toBe(true);

    const kinds = new Set(data.links.map((l) => l.kind));
    expect(kinds.has('login')).toBe(true);
    expect(kinds.has('dump')).toBe(true);
    expect(kinds.has('track')).toBe(true);

    // Each link has the kind-appropriate target id field
    for (const l of data.links) {
      expect(l.kind).toBeTruthy();
      expect(l.token).toBeTruthy();
      expect(l.createdAt).toBeTruthy();
      expect('active' in l).toBe(true);
      expect('expiresAt' in l).toBe(true);
      expect('label' in l).toBe(true);
      expect('createdBy' in l).toBe(true);
      if (l.kind === 'login') expect(l.email).toBeTruthy();
      if (l.kind === 'dump') expect(l.dumpId).toBeTruthy();
      if (l.kind === 'track') expect(l.trackId).toBeTruthy();
    }
  });

  test('GET without admin auth returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/music/admin/share-links`);
    expect(res.status()).toBe(401);
  });

  test('PATCH label updates the label', async ({ request }) => {
    // Create a fresh track share to mutate
    const create = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `before-${Date.now()}` },
    });
    const { link } = await create.json();

    const newLabel = `after-${Date.now()}`;
    const patch = await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'track', token: link.token, label: newLabel },
    });
    expect(patch.status()).toBe(200);
    const pj = await patch.json();
    expect(pj.ok).toBe(true);
    expect(pj.link.label).toBe(newLabel);

    // Verify via GET
    const list = await request.get(`${BASE}/api/music/admin/share-links`, {
      headers: authHeaders(adminToken),
    });
    const ld = await list.json();
    const found = ld.links.find((l) => l.token === link.token);
    expect(found.label).toBe(newLabel);
  });

  test('PATCH active=false deactivates, share redemption fails; reactivating works', async ({ request }) => {
    // Create a fresh track share
    const create = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `toggle-${Date.now()}` },
    });
    const { link } = await create.json();

    // Baseline: redemption works (use download=1 to force a redirect regardless of CDN config)
    const before = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect(before.status()).toBe(302);

    // Deactivate
    const off = await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'track', token: link.token, active: false },
    });
    expect(off.status()).toBe(200);

    const after = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect([401, 403]).toContain(after.status());

    // Reactivate
    const on = await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'track', token: link.token, active: true },
    });
    expect(on.status()).toBe(200);

    const back = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect(back.status()).toBe(302);
  });

  test('PATCH login kind active=false blocks magic-link redemption; reactivating works', async ({ request }) => {
    const email = `patch-login-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');
    const mk = await request.post(`${BASE}/api/music/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });
    const { link } = await mk.json();

    // Baseline: redemption returns 200
    const before = await request.get(`${BASE}/api/music/auth/magic?token=${link.token}`);
    expect(before.status()).toBe(200);

    // Deactivate via unified PATCH
    await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'login', token: link.token, active: false },
    });
    const after = await request.get(`${BASE}/api/music/auth/magic?token=${link.token}`);
    expect(after.status()).toBe(401);

    // Reactivate
    await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'login', token: link.token, active: true },
    });
    const back = await request.get(`${BASE}/api/music/auth/magic?token=${link.token}`);
    expect(back.status()).toBe(200);
  });

  test('PATCH expiresAt to past makes redemption fail; null clears expiry', async ({ request }) => {
    const create = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `expiry-${Date.now()}` },
    });
    const { link } = await create.json();

    const past = new Date(Date.now() - 86400000).toISOString();
    const expirePatch = await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'track', token: link.token, expiresAt: past },
    });
    expect(expirePatch.status()).toBe(200);
    expect((await expirePatch.json()).link.expiresAt).toBe(past);

    const expired = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect([401, 403]).toContain(expired.status());

    // Clear expiry via null
    const clear = await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'track', token: link.token, expiresAt: null },
    });
    expect(clear.status()).toBe(200);
    expect((await clear.json()).link.expiresAt).toBeNull();

    const live = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackA.id)}&format=mp3&download=1&share=${link.token}`,
      { maxRedirects: 0 }
    );
    expect(live.status()).toBe(302);
  });

  test('PATCH nonexistent (kind, token) returns 404', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/music/admin/share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { kind: 'track', token: `ghost-${Date.now()}`, label: 'x' },
    });
    expect(res.status()).toBe(404);
  });

  test('PATCH without admin auth returns 401', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/music/admin/share-links`, {
      data: { kind: 'track', token: 'any', label: 'x' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE ?kind=track deletes a track share', async ({ request }) => {
    const create = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `unified-del-track-${Date.now()}` },
    });
    const { link } = await create.json();

    const del = await request.delete(
      `${BASE}/api/music/admin/share-links?kind=track&token=${link.token}`,
      { headers: authHeaders(adminToken) }
    );
    expect(del.status()).toBe(200);

    const list = await request.get(`${BASE}/api/music/admin/share-links`, {
      headers: authHeaders(adminToken),
    });
    const ld = await list.json();
    expect(ld.links.find((l) => l.token === link.token)).toBeFalsy();
  });

  test('DELETE ?kind=dump deletes a dump share', async ({ request }) => {
    const dumpRes = await request.post(`${BASE}/api/music/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: `Unified Del Dump ${Date.now()}`, published: true, visibility: 'public' },
    });
    const dumpId = (await dumpRes.json()).dump.id;
    const create = await request.post(`${BASE}/api/music/admin/dump-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { dumpId, label: `unified-del-dump-${Date.now()}` },
    });
    const { link } = await create.json();

    const del = await request.delete(
      `${BASE}/api/music/admin/share-links?kind=dump&token=${link.token}`,
      { headers: authHeaders(adminToken) }
    );
    expect(del.status()).toBe(200);

    const list = await request.get(`${BASE}/api/music/admin/share-links`, {
      headers: authHeaders(adminToken),
    });
    const ld = await list.json();
    expect(ld.links.find((l) => l.token === link.token)).toBeFalsy();
  });

  test('DELETE ?kind=login deletes a login magic link', async ({ request }) => {
    const email = `unified-del-login-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');
    const create = await request.post(`${BASE}/api/music/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });
    const { link } = await create.json();

    const del = await request.delete(
      `${BASE}/api/music/admin/share-links?kind=login&token=${link.token}`,
      { headers: authHeaders(adminToken) }
    );
    expect(del.status()).toBe(200);

    // Confirm gone: magic redemption now fails
    const redeem = await request.get(`${BASE}/api/music/auth/magic?token=${link.token}`);
    expect(redeem.status()).toBe(401);
  });

  test('DELETE without kind returns 400', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/api/music/admin/share-links?token=abc`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(400);
  });

  test('DELETE with invalid kind returns 400', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/api/music/admin/share-links?kind=nonsense&token=abc`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(400);
  });

  test('DELETE without admin auth returns 401', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/api/music/admin/share-links?kind=track&token=abc`
    );
    expect(res.status()).toBe(401);
  });
});

// ── Public /music/track/[id] page ──────────────────────────────────────────────

test.describe('Public /music/track/[id] page', () => {
  let adminToken;
  let trackA;
  let shareTokenA;

  test('setup: restricted track + share token', async ({ request }) => {
    adminToken = await signIn(request);
    const { trackA: a } = await publishTwoRestrictedTracks(request, adminToken);
    trackA = a;
    const res = await request.post(`${BASE}/api/music/admin/track-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: trackA.id, label: `page-${Date.now()}` },
    });
    const { link } = await res.json();
    shareTokenA = link.token;
  });

  test('anon GET with valid share renders track + Play button + share-tagged downloads', async ({ page }) => {
    await page.goto(
      `/music/track/${encodeURIComponent(trackA.id)}?share=${shareTokenA}`
    );

    // Track name heading
    await expect(page.locator('h1')).toContainText(trackA.name, { timeout: 10000 });

    // "Play in Browser" button is present
    await expect(page.locator('button', { hasText: 'Play in Browser' })).toBeVisible();

    // Download link(s) carry the share token. The page.jsx uses Style.downloadBtn
    // which isn't a defined class in the SCSS module, so we match by href instead
    // of class to stay robust against styling changes.
    const downloadLinks = page.locator('a[href*="/api/music/stream"][href*="download=1"]');
    await expect(downloadLinks.first()).toBeVisible();
    const hrefs = await downloadLinks.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect(h).toContain('/api/music/stream');
      expect(h).toContain(`share=${shareTokenA}`);
      expect(h).toContain('download=1');
    }
  });

  test('anon GET without share on restricted track shows access-denied / sign-in UI', async ({ page }) => {
    await page.goto(`/music/track/${encodeURIComponent(trackA.id)}`);
    // Restricted + no share + no auth → /api/music/track returns 404 or 401
    // The page renders either the "sign-in" error (401), the "denied" error (403),
    // or the generic "Could not find this track" (404). All are valid rejection states.
    const errorArea = page.locator('[class*="error"]');
    await expect(errorArea).toBeVisible({ timeout: 10000 });
    const body = (await errorArea.innerText()).toLowerCase();
    const rejected =
      body.includes('sign in') ||
      body.includes("don't have access") ||
      body.includes('could not find');
    expect(rejected).toBe(true);
  });
});
