import { test, expect } from '@playwright/test';

// Tests for the music API surface that wasn't covered by music.spec.mjs:
//   - /api/music/dump (public dump fetch with optional ?share=)
//   - /api/music/admin/settings (admin GET/PUT)
//   - /api/music/admin/events (admin event log read)
//   - /api/music/admin/permissions (admin per-track grant/revoke)
//
// Each describe sets its own admin token and creates its own test data so
// re-runs against a shared DynamoDB Local don't interfere with prior state.

test.describe.configure({ mode: 'serial' });

const BASE = 'http://music.localhost:3000';

async function signIn(request, email = 'admin@local.dev', password = 'admin') {
  const res = await request.post(`${BASE}/api/auth/signin`, {
    data: { email, password },
  });
  return (await res.json()).idToken;
}

async function signUp(request, email, password = 'testpass1') {
  const res = await request.post(`${BASE}/api/auth/signup`, {
    data: { email, password },
  });
  return res.json();
}

function authHeaders(token) { return { Authorization: `Bearer ${token}` }; }

async function getRawTracks(request, token) {
  const res = await request.get(`${BASE}/api/tracks?raw=1`, { headers: authHeaders(token) });
  return res.json();
}

async function putSingleTrack(request, token, track) {
  return request.put(`${BASE}/api/tracks`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { track },
  });
}

async function createDump(request, token, { name, published = false, visibility = 'public' }) {
  const res = await request.post(`${BASE}/api/admin/dumps`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { name, published, visibility },
  });
  return (await res.json()).dump;
}

async function deleteDump(request, token, id) {
  return request.delete(`${BASE}/api/admin/dumps?id=${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
  });
}

// ─── /api/music/dump ────────────────────────────────────────────────────────

test.describe('/api/music/dump (public)', () => {
  let adminToken;
  let dumpId;
  let trackId;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
    expect(adminToken).toBeTruthy();
  });

  test('setup: create published dump and assign track', async ({ request }) => {
    const dump = await createDump(request, adminToken, {
      name: `extras-pub-${Date.now()}`,
      published: true,
      visibility: 'public',
    });
    dumpId = dump.id;

    const raw = await getRawTracks(request, adminToken);
    const t = raw.tracks[0];
    trackId = t.id;
    const res = await putSingleTrack(request, adminToken, {
      ...t, published: true, visibility: 'public', dumpIds: [dumpId],
    });
    expect(res.ok()).toBe(true);
  });

  test('GET ?id= returns the dump and its tracks', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dump?id=${encodeURIComponent(dumpId)}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.dump.id).toBe(dumpId);
    expect(Array.isArray(data.tracks)).toBe(true);
    expect(data.tracks.find((t) => t.id === trackId)).toBeTruthy();
    // streamUrls plumbed through
    expect(data.tracks[0].streamUrls).toBeTruthy();
  });

  test('GET missing id returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dump`);
    expect(res.status()).toBe(400);
  });

  test('GET nonexistent dump returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dump?id=does-not-exist-${Date.now()}`);
    expect(res.status()).toBe(404);
  });

  test('GET unpublished dump (anonymous) returns 404', async ({ request }) => {
    const unpub = await createDump(request, adminToken, {
      name: `extras-unpub-${Date.now()}`,
      published: false,
    });
    const res = await request.get(`${BASE}/api/dump?id=${encodeURIComponent(unpub.id)}`);
    expect(res.status()).toBe(404);
    await deleteDump(request, adminToken, unpub.id);
  });

  test('GET with valid share token bypasses publish state', async ({ request }) => {
    const unpub = await createDump(request, adminToken, {
      name: `extras-share-${Date.now()}`,
      published: false,
    });
    // Mint a dump-share link for this private dump
    const shareRes = await request.post(`${BASE}/api/admin/dump-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { dumpId: unpub.id },
    });
    const { link } = await shareRes.json();

    const res = await request.get(
      `${BASE}/api/dump?id=${encodeURIComponent(unpub.id)}&share=${encodeURIComponent(link.token)}`
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.dump.id).toBe(unpub.id);

    await deleteDump(request, adminToken, unpub.id);
  });

  test('cleanup', async ({ request }) => {
    if (dumpId) await deleteDump(request, adminToken, dumpId);
  });
});

// ─── /api/music/admin/settings ──────────────────────────────────────────────

test.describe('/api/music/admin/settings', () => {
  let adminToken;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
  });

  test('GET returns the settings object (anonymous allowed)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/settings`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    // Settings is small — just confirm it's an object
    expect(typeof data).toBe('object');
    expect(data).not.toBeNull();
  });

  test('PUT requires admin', async ({ request }) => {
    const res = await request.put(`${BASE}/api/admin/settings`, {
      data: { tracksPerPage: 25 },
    });
    expect(res.status()).toBe(401);
  });

  test('admin PUT updates and GET round-trips', async ({ request }) => {
    const newValue = 17;
    const putRes = await request.put(`${BASE}/api/admin/settings`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { tracksPerPage: newValue },
    });
    expect(putRes.ok()).toBe(true);

    const getRes = await request.get(`${BASE}/api/admin/settings`);
    const data = await getRes.json();
    expect(data.tracksPerPage).toBe(newValue);
  });

  test('admin PUT can set back to default', async ({ request }) => {
    const res = await request.put(`${BASE}/api/admin/settings`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { tracksPerPage: 10 },
    });
    expect(res.ok()).toBe(true);
  });
});

// ─── /api/music/admin/events ────────────────────────────────────────────────

test.describe('/api/music/admin/events', () => {
  let adminToken;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
  });

  test('GET requires admin', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/events`);
    expect(res.status()).toBe(401);
  });

  test('admin GET returns events array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/events`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);
  });

  test('admin GET ?type= filters by event type', async ({ request }) => {
    // Create a known share event so the filtered query has something to find
    const dump = await createDump(request, adminToken, {
      name: `events-${Date.now()}`,
      published: true,
    });
    await request.post(`${BASE}/api/admin/dump-share-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { dumpId: dump.id },
    });

    const res = await request.get(`${BASE}/api/admin/events?type=share.create`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);
    // All returned events should have type === share.create
    for (const ev of data.events) expect(ev.type).toBe('share.create');

    await deleteDump(request, adminToken, dump.id);
  });
});

// ─── /api/music/admin/permissions ───────────────────────────────────────────

test.describe('/api/music/admin/permissions', () => {
  let adminToken;
  let trackId;
  let userEmail;

  test('setup: sign in admin and pick a track', async ({ request }) => {
    adminToken = await signIn(request);
    const raw = await getRawTracks(request, adminToken);
    trackId = raw.tracks[0].id;
    userEmail = `perms-${Date.now()}@local.dev`;
    await signUp(request, userEmail);
  });

  test('GET requires admin', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/permissions?trackId=${trackId}`);
    expect(res.status()).toBe(401);
  });

  test('admin GET returns users + groups arrays', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/permissions?trackId=${trackId}`, {
      headers: authHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.users)).toBe(true);
    expect(Array.isArray(data.groups)).toBe(true);
  });

  test('PUT grant + revoke round-trip on a user', async ({ request }) => {
    // Grant
    const grantRes = await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId, targetType: 'user', targetId: userEmail, action: 'grant' },
    });
    expect(grantRes.ok()).toBe(true);

    let perms = await (await request.get(
      `${BASE}/api/admin/permissions?trackId=${trackId}`,
      { headers: authHeaders(adminToken) }
    )).json();
    expect(perms.users.some((u) => u.userId === userEmail)).toBe(true);

    // Revoke
    const revokeRes = await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId, targetType: 'user', targetId: userEmail, action: 'revoke' },
    });
    expect(revokeRes.ok()).toBe(true);

    perms = await (await request.get(
      `${BASE}/api/admin/permissions?trackId=${trackId}`,
      { headers: authHeaders(adminToken) }
    )).json();
    expect(perms.users.some((u) => u.userId === userEmail)).toBe(false);
  });
});
