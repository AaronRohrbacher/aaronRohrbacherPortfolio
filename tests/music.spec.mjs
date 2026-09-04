import { test, expect } from '@playwright/test';

// Run all tests serially — DynamoDB Local is in-memory, state carries between tests
test.describe.configure({ mode: 'serial' });

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE = 'http://music.localhost:3000';

async function signIn(request, email = 'admin@local.dev', password = 'admin') {
  const res = await request.post(`${BASE}/api/auth/signin`, {
    data: { email, password },
  });
  const data = await res.json();
  return data.idToken;
}

async function signUp(request, email, password) {
  const res = await request.post(`${BASE}/api/auth/signup`, {
    data: { email, password },
  });
  return res.json();
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getRawTracks(request, token) {
  const res = await request.get(`${BASE}/api/tracks?raw=1`, {
    headers: authHeaders(token),
  });
  return res.json();
}

async function putTracks(request, token, tracks) {
  const res = await request.put(`${BASE}/api/tracks`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { tracks },
  });
  return res.json();
}

// ── Auth Tests ─────────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  test('sign in as admin returns valid token', async ({ request }) => {
    const token = await signIn(request);
    expect(token).toBeTruthy();

    const me = await request.get(`${BASE}/api/auth/me`, {
      headers: authHeaders(token),
    });
    const data = await me.json();
    expect(data.user.email).toBe('admin@local.dev');
    expect(data.user.isAdmin).toBe(true);
  });

  test('sign in with wrong password fails', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/signin`, {
      data: { email: 'admin@local.dev', password: 'wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('sign up creates new user', async ({ request }) => {
    const email = `test-${Date.now()}@local.dev`;
    const data = await signUp(request, email, 'testpass1');
    expect(data.email).toBe(email);
    expect(data.idToken).toBeTruthy();
  });

  test('sign up duplicate email fails', async ({ request }) => {
    const email = `dup-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');
    const res = await request.post(`${BASE}/api/auth/signup`, {
      data: { email, password: 'testpass2' },
    });
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  test('/me with no token returns null user', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    const data = await res.json();
    expect(data.user).toBeNull();
  });

  test('/me with invalid token returns null user', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`, {
      headers: authHeaders('garbage-token'),
    });
    const data = await res.json();
    expect(data.user).toBeNull();
  });
});

// ── Tracks API Tests ───────────────────────────────────────────────────────────

test.describe('Tracks API', () => {
  let adminToken;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
    expect(adminToken).toBeTruthy();
  });

  test('raw tracks returns all tracks from S3', async ({ request }) => {
    const data = await getRawTracks(request, adminToken);
    expect(data.tracks.length).toBeGreaterThan(0);
    // Each track has expected shape
    const t = data.tracks[0];
    expect(t.id).toBeTruthy();
    expect(t.formats).toBeTruthy();
    expect(typeof t.published).toBe('boolean');
    expect(typeof t.visibility).toBe('string');
  });

  test('raw tracks requires admin', async ({ request }) => {
    const email = `nonadmin-${Date.now()}@local.dev`;
    const signup = await signUp(request, email, 'testpass1');
    const res = await request.get(`${BASE}/api/tracks?raw=1`, {
      headers: authHeaders(signup.idToken),
    });
    const data = await res.json();
    // Non-admin gets public tracks, not raw
    expect(data.tracks).toBeDefined();
    // Should not contain unpublished tracks
    for (const t of data.tracks) {
      expect(t.formats).not.toHaveProperty('mp3'); // raw has object formats, public has array
    }
  });

  test('public endpoint returns empty when nothing published', async ({ request }) => {
    // Unpublish everything first — clear dumpId too so cascading publish doesn't kick in
    const raw = await getRawTracks(request, adminToken);
    const allUnpub = raw.tracks.map((t) => ({ ...t, published: false, dumpId: null }));
    await putTracks(request, adminToken, allUnpub);

    const res = await request.get(`${BASE}/api/tracks`);
    const data = await res.json();
    expect(data.tracks).toHaveLength(0);
    expect(data.dumps).toHaveLength(0);
  });

  test('publishing a track makes it visible publicly', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks.map((t, i) =>
      i === 0 ? { ...t, published: true, visibility: 'public' } : { ...t, published: false }
    );
    await putTracks(request, adminToken, tracks);

    const res = await request.get(`${BASE}/api/tracks`);
    const data = await res.json();
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].id).toBe(tracks[0].id);
    expect(data.tracks[0].streamUrls).toBeTruthy();
    // Stream URLs should go through our API proxy
    const url = Object.values(data.tracks[0].streamUrls)[0];
    expect(url).toContain('/api/stream?id=');
  });

  test('PUT tracks requires admin auth', async ({ request }) => {
    const res = await request.put(`${BASE}/api/tracks`, {
      data: { tracks: [] },
    });
    expect(res.status()).toBe(401);
  });
});

// ── Visibility & Permissions Tests ─────────────────────────────────────────────

test.describe('Visibility & Permissions', () => {
  let adminToken;
  let userToken;
  let userSub;
  let tracks;

  test('setup: publish 3 tracks with different visibility', async ({ request }) => {
    adminToken = await signIn(request);

    const email = `perm-${Date.now()}@local.dev`;
    const signup = await signUp(request, email, 'testpass1');
    userToken = signup.idToken;
    const me = await request.get(`${BASE}/api/auth/me`, {
      headers: authHeaders(userToken),
    });
    userSub = (await me.json()).user.sub;

    const raw = await getRawTracks(request, adminToken);
    tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: true, visibility: 'public', dumpId: null };
    tracks[1] = { ...tracks[1], published: true, visibility: 'authenticated', dumpId: null };
    tracks[2] = { ...tracks[2], published: true, visibility: 'restricted', dumpId: null };
    for (let i = 3; i < tracks.length; i++) {
      tracks[i] = { ...tracks[i], published: false };
    }
    await putTracks(request, adminToken, tracks);
  });

  test('anonymous sees only public tracks', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tracks`);
    const data = await res.json();
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].id).toBe(tracks[0].id);
  });

  test('authenticated user sees public + authenticated', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tracks`, {
      headers: authHeaders(userToken),
    });
    const data = await res.json();
    expect(data.tracks).toHaveLength(2);
    const ids = data.tracks.map((t) => t.id);
    expect(ids).toContain(tracks[0].id);
    expect(ids).toContain(tracks[1].id);
  });

  test('restricted track invisible without grant', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tracks`, {
      headers: authHeaders(userToken),
    });
    const data = await res.json();
    const ids = data.tracks.map((t) => t.id);
    expect(ids).not.toContain(tracks[2].id);
  });

  test('grant user access to restricted track', async ({ request }) => {
    const grant = await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: {
        trackId: tracks[2].id,
        targetType: 'user',
        targetId: userSub,
        action: 'grant',
      },
    });
    expect((await grant.json()).ok).toBe(true);

    const res = await request.get(`${BASE}/api/tracks`, {
      headers: authHeaders(userToken),
    });
    const data = await res.json();
    expect(data.tracks).toHaveLength(3);
    expect(data.tracks.map((t) => t.id)).toContain(tracks[2].id);
  });

  test('revoke access hides restricted track again', async ({ request }) => {
    await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: {
        trackId: tracks[2].id,
        targetType: 'user',
        targetId: userSub,
        action: 'revoke',
      },
    });

    const res = await request.get(`${BASE}/api/tracks`, {
      headers: authHeaders(userToken),
    });
    const data = await res.json();
    expect(data.tracks).toHaveLength(2);
  });

  test('get permissions for track', async ({ request }) => {
    // Grant first
    await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: tracks[2].id, targetType: 'user', targetId: userSub, action: 'grant' },
    });

    const res = await request.get(
      `${BASE}/api/admin/permissions?trackId=${tracks[2].id}`,
      { headers: authHeaders(adminToken) }
    );
    const data = await res.json();
    expect(data.users.length).toBeGreaterThanOrEqual(1);
    expect(data.users.some((u) => u.userId === userSub)).toBe(true);

    // Cleanup
    await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: tracks[2].id, targetType: 'user', targetId: userSub, action: 'revoke' },
    });
  });
});

// ── Stream / Download Tests ────────────────────────────────────────────────────

test.describe('Stream & Download', () => {
  let adminToken;
  let trackId;

  test('setup: publish first track', async ({ request }) => {
    adminToken = await signIn(request);
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: true, visibility: 'public', dumpId: null };
    for (let i = 1; i < tracks.length; i++) tracks[i] = { ...tracks[i], published: false };
    await putTracks(request, adminToken, tracks);
    trackId = tracks[0].id;
  });

  test('stream proxies audio through API', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${trackId}&format=mp3`
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('audio/mpeg');
    expect(res.headers()['content-disposition']).toContain('inline');
  });

  test('authenticated players can resolve a header-safe playback URL', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${trackId}&format=mp3&urlOnly=1`,
      { headers: authHeaders(adminToken), maxRedirects: 0 }
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    const data = await res.json();
    expect(data.url).toBeTruthy();
    expect(data.url).not.toContain('urlOnly=1');
  });

  test('download returns file with Content-Disposition', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${trackId}&format=mp3&download=1`
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('attachment');
    expect(res.headers()['content-disposition']).toContain('.mp3');
    expect(res.headers()['content-type']).toBe('audio/mpeg');
    expect(parseInt(res.headers()['content-length'])).toBeGreaterThan(0);
  });

  test('AIFF download works', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${trackId}&format=aiff&download=1`
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain('.aiff');
    expect(res.headers()['content-type']).toBe('audio/aiff');
  });

  test('admin can stream AIFF of unpublished track', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const unpub = raw.tracks.find((t) => !t.published && t.formats.aiff);
    expect(unpub).toBeTruthy();
    const res = await request.get(
      `${BASE}/api/stream?id=${unpub.id}&format=aiff`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('audio/aiff');
  });

  test('stream unpublished track returns 403 without auth', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const unpub = raw.tracks.find((t) => !t.published);
    const res = await request.get(
      `${BASE}/api/stream?id=${unpub.id}&format=mp3`
    );
    expect(res.status()).toBe(403);
  });

  test('admin can stream unpublished tracks with auth', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const unpub = raw.tracks.find((t) => !t.published && t.formats.mp3);
    expect(unpub).toBeTruthy();
    const res = await request.get(
      `${BASE}/api/stream?id=${unpub.id}&format=mp3`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('audio/mpeg');
  });

  test('non-admin cannot stream unpublished tracks', async ({ request }) => {
    const email = `stream-nonadmin-${Date.now()}@local.dev`;
    const signup = await signUp(request, email, 'testpass1');
    const raw = await getRawTracks(request, adminToken);
    const unpub = raw.tracks.find((t) => !t.published);
    const res = await request.get(
      `${BASE}/api/stream?id=${unpub.id}&format=mp3`,
      { headers: authHeaders(signup.idToken) }
    );
    expect(res.status()).toBe(403);
  });

  test('stream nonexistent track returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stream?id=nonexistent&format=mp3`);
    expect(res.status()).toBe(404);
  });

  test('stream restricted track without auth returns 401', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[1] = { ...tracks[1], published: true, visibility: 'restricted' };
    await putTracks(request, adminToken, tracks);

    const res = await request.get(
      `${BASE}/api/stream?id=${tracks[1].id}&format=mp3`
    );
    expect(res.status()).toBe(401);
  });

  test('missing id returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stream?format=mp3`);
    expect(res.status()).toBe(400);
  });

  test('unavailable format returns 404', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/stream?id=${trackId}&format=flac`
    );
    expect(res.status()).toBe(404);
  });
});

// ── Dumps Tests ────────────────────────────────────────────────────────────────

test.describe('Dumps', () => {
  let adminToken;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
  });

  test('create a dump', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: 'Test Dump', description: 'desc', artists: 'Aaron', visibility: 'public' },
    });
    const data = await res.json();
    expect(data.dump.id).toBeTruthy();
    expect(data.dump.name).toBe('Test Dump');
    expect(data.dump.published).toBe(false);
  });

  test('list dumps', async ({ request }) => {
    // Create one first
    await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: `Dump-${Date.now()}` },
    });

    const res = await request.get(`${BASE}/api/admin/dumps`, {
      headers: authHeaders(adminToken),
    });
    const data = await res.json();
    expect(data.dumps.length).toBeGreaterThan(0);
  });

  test('assign track to dump and see it in public response', async ({ request }) => {
    // Create published dump
    const dumpRes = await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: 'Published Dump', published: true, visibility: 'public' },
    });
    const dumpId = (await dumpRes.json()).dump.id;

    // Assign first track to dump and publish it
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: true, visibility: 'public', dumpId };
    for (let i = 1; i < tracks.length; i++) tracks[i] = { ...tracks[i], published: false, dumpId: null };
    await putTracks(request, adminToken, tracks);

    // Check public response
    const res = await request.get(`${BASE}/api/tracks`);
    const data = await res.json();
    expect(data.dumps.length).toBeGreaterThanOrEqual(1);
    const dump = data.dumps.find((d) => d.id === dumpId);
    expect(dump).toBeTruthy();
    expect(dump.tracks.length).toBe(1);
    expect(dump.tracks[0].id).toBe(tracks[0].id);
    expect(dump.tracks[0].streamUrls).toBeTruthy();
  });

  test('track in unpublished dump shows as loose', async ({ request }) => {
    // Create unpublished dump
    const dumpRes = await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: 'Unpub Dump', published: false },
    });
    const dumpId = (await dumpRes.json()).dump.id;

    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: true, visibility: 'public', dumpId };
    for (let i = 1; i < tracks.length; i++) tracks[i] = { ...tracks[i], published: false, dumpId: null };
    await putTracks(request, adminToken, tracks);

    const res = await request.get(`${BASE}/api/tracks`);
    const data = await res.json();
    // Should show as loose track, not in a dump
    expect(data.tracks.some((t) => t.id === tracks[0].id)).toBe(true);
    expect(data.dumps.every((d) => d.id !== dumpId)).toBe(true);
  });

  test('delete dump unlinks tracks', async ({ request }) => {
    const dumpRes = await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: 'To Delete', published: true },
    });
    const dumpId = (await dumpRes.json()).dump.id;

    // Assign track
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: true, visibility: 'public', dumpId };
    await putTracks(request, adminToken, tracks);

    // Delete dump
    const del = await request.delete(`${BASE}/api/admin/dumps?id=${dumpId}`, {
      headers: authHeaders(adminToken),
    });
    expect((await del.json()).ok).toBe(true);

    // Track should still exist but without dumpId
    const raw2 = await getRawTracks(request, adminToken);
    const track = raw2.tracks.find((t) => t.id === tracks[0].id);
    expect(track).toBeTruthy();
    expect(track.dumpId).toBeFalsy();
  });

  test('stream works for track in published dump even if track not individually published', async ({ request }) => {
    // Create a published dump
    const dumpRes = await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: 'Stream Dump Test', published: true, visibility: 'public' },
    });
    const dumpId = (await dumpRes.json()).dump.id;

    // Assign track to dump, mark track as NOT individually published
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: false, visibility: 'public', dumpId };
    for (let i = 1; i < tracks.length; i++) tracks[i] = { ...tracks[i], published: false, dumpId: null };
    await putTracks(request, adminToken, tracks);

    // Anonymous user should be able to stream this track (dump is published)
    const res = await request.get(
      `${BASE}/api/stream?id=${tracks[0].id}&format=mp3`
    );
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('audio/mpeg');

    // Cleanup
    await request.delete(`${BASE}/api/admin/dumps?id=${dumpId}`, {
      headers: authHeaders(adminToken),
    });
  });

  test('dumps API requires admin', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/dumps`);
    expect(res.status()).toBe(401);
  });
});

// ── Users & Groups Tests ───────────────────────────────────────────────────────

test.describe('Users & Groups', () => {
  let adminToken;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
  });

  test('list users', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/users`, {
      headers: authHeaders(adminToken),
    });
    const data = await res.json();
    expect(data.users.length).toBeGreaterThan(0);
    expect(data.users[0].email).toBeTruthy();
  });

  test('invite user', async ({ request }) => {
    const email = `invited-${Date.now()}@local.dev`;
    const res = await request.post(`${BASE}/api/admin/users`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });
    const data = await res.json();
    expect(data.user.email).toBe(email);
  });

  test('delete user', async ({ request }) => {
    const email = `todelete-${Date.now()}@local.dev`;
    await request.post(`${BASE}/api/admin/users`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });

    const del = await request.delete(
      `${BASE}/api/admin/users?username=${encodeURIComponent(email)}`,
      { headers: authHeaders(adminToken) }
    );
    expect((await del.json()).ok).toBe(true);
  });

  test('create group', async ({ request }) => {
    const name = `group-${Date.now()}`;
    const res = await request.post(`${BASE}/api/admin/groups`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name, description: 'test group' },
    });
    expect((await res.json()).ok).toBe(true);
  });

  test('add and remove group member', async ({ request }) => {
    const groupName = `grp-${Date.now()}`;
    await request.post(`${BASE}/api/admin/groups`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: groupName },
    });

    const email = `member-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    // Add
    const add = await request.post(`${BASE}/api/admin/groups`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { groupName, username: email, action: 'add' },
    });
    expect((await add.json()).ok).toBe(true);

    // Verify
    const list = await request.get(`${BASE}/api/admin/groups`, {
      headers: authHeaders(adminToken),
    });
    const groups = (await list.json()).groups;
    const grp = groups.find((g) => g.name === groupName);
    expect(grp.members.some((m) => m.email === email)).toBe(true);

    // Remove
    const rm = await request.post(`${BASE}/api/admin/groups`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { groupName, username: email, action: 'remove' },
    });
    expect((await rm.json()).ok).toBe(true);
  });

  test('group-based access to restricted track', async ({ request }) => {
    const groupName = `access-${Date.now()}`;
    await request.post(`${BASE}/api/admin/groups`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { name: groupName },
    });

    // Create user and add to group
    const email = `gaccess-${Date.now()}@local.dev`;
    const signup = await signUp(request, email, 'testpass1');

    await request.post(`${BASE}/api/admin/groups`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { groupName, username: email, action: 'add' },
    });

    // Publish a restricted track
    const raw = await getRawTracks(request, adminToken);
    const tracks = raw.tracks;
    tracks[0] = { ...tracks[0], published: true, visibility: 'restricted', dumpId: null };
    for (let i = 1; i < tracks.length; i++) tracks[i] = { ...tracks[i], published: false };
    await putTracks(request, adminToken, tracks);

    // Without group grant — user can't see it
    // Need to re-signin to pick up group membership
    const userToken = (await signIn(request, email, 'testpass1'));
    const before = await request.get(`${BASE}/api/tracks`, {
      headers: authHeaders(userToken),
    });
    expect((await before.json()).tracks).toHaveLength(0);

    // Grant group access
    await request.put(`${BASE}/api/admin/permissions`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { trackId: tracks[0].id, targetType: 'group', targetId: groupName, action: 'grant' },
    });

    // Now user sees it
    const after = await request.get(`${BASE}/api/tracks`, {
      headers: authHeaders(userToken),
    });
    const afterData = await after.json();
    expect(afterData.tracks).toHaveLength(1);
    expect(afterData.tracks[0].id).toBe(tracks[0].id);
  });

  test('users API requires admin', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/users`);
    expect(res.status()).toBe(401);
  });

  test('groups API requires admin', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/groups`);
    expect(res.status()).toBe(401);
  });
});

// ── Magic Links Tests ─────────────────────────────────────────────────────────

test.describe('Magic Links', () => {
  let adminToken;

  test('setup: sign in admin', async ({ request }) => {
    adminToken = await signIn(request);
  });

  test('create magic link for a user (secure defaults)', async ({ request }) => {
    const email = `magic-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    const res = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.link.token).toBeTruthy();
    expect(data.link.email).toBe(email);
    expect(data.link.expiresAt).toBeTruthy();
    expect(data.link.maxUses).toBe(1);
    expect(data.link.destination).toBe('/');
  });

  test('create magic link with explicit expiry', async ({ request }) => {
    const email = `magic-exp-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    const res = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email, expiresInDays: 7 },
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.link.expiresAt).toBeTruthy();
    const expiry = new Date(data.link.expiresAt);
    const now = new Date();
    const diffDays = (expiry - now) / 86400000;
    expect(diffDays).toBeGreaterThan(6.5);
    expect(diffDays).toBeLessThan(7.5);
  });

  test('magic destinations are allowlisted and resolve track titles', async ({ request }) => {
    const email = `magic-destination-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');
    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks[0];

    const safe = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email, destination: `/track/${encodeURIComponent(track.id)}` },
    });
    const safeLink = (await safe.json()).link;
    expect(safeLink.destination).toBe(`/track/${encodeURIComponent(track.id)}`);
    expect(safeLink.label).toBe(track.name);

    const listed = await request.get(`${BASE}/api/admin/magic-links?email=${encodeURIComponent(email)}`, {
      headers: authHeaders(adminToken),
    });
    const stored = (await listed.json()).links.find((link) => link.destination === safeLink.destination);
    expect(stored.copyAvailable).toBe(false);
    expect(stored.token).not.toBe(safeLink.token);

    const unsafe = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email, destination: 'https://evil.example/steal' },
    });
    expect((await unsafe.json()).link.destination).toBe('/');
  });

  test('redeem magic link logs user in', async ({ request }) => {
    const email = `magic-redeem-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    // Admin creates magic link
    const createRes = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email, destination: '/dump/tune-dump' },
    });
    const { link } = await createRes.json();

    // Redeem the link (no auth needed)
    const redeemRes = await request.get(
      `${BASE}/api/auth/magic?token=${link.token}`
    );
    expect(redeemRes.status()).toBe(200);
    const tokens = await redeemRes.json();
    expect(tokens.idToken).toBeTruthy();
    expect(tokens.email).toBe(email);
    expect(tokens.destination).toBe('/dump/tune-dump');

    // Verify the token works for authenticated requests
    const meRes = await request.get(`${BASE}/api/auth/me`, {
      headers: authHeaders(tokens.idToken),
    });
    const me = await meRes.json();
    expect(me.user.email).toBe(email);
  });

  test('magic link is single-use by default', async ({ request }) => {
    const email = `magic-reuse-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    const createRes = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });
    const { link } = await createRes.json();

    // The atomic use limit allows exactly one redemption.
    const res1 = await request.get(`${BASE}/api/auth/magic?token=${link.token}`);
    expect(res1.status()).toBe(200);
    const res2 = await request.get(`${BASE}/api/auth/magic?token=${link.token}`);
    expect(res2.status()).toBe(401);
  });

  test('invalid token returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/magic?token=bogus`);
    expect(res.status()).toBe(401);
  });

  test('missing token returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/magic`);
    expect(res.status()).toBe(400);
  });

  test('list magic links for user', async ({ request }) => {
    const email = `magic-list-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });

    const res = await request.get(
      `${BASE}/api/admin/magic-links?email=${encodeURIComponent(email)}`,
      { headers: authHeaders(adminToken) }
    );
    const data = await res.json();
    expect(data.links.length).toBeGreaterThanOrEqual(1);
    expect(data.links[0].email).toBe(email);
  });

  test('revoke magic link', async ({ request }) => {
    const email = `magic-revoke-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    const createRes = await request.post(`${BASE}/api/admin/magic-links`, {
      headers: { ...authHeaders(adminToken), 'Content-Type': 'application/json' },
      data: { email },
    });
    const { link } = await createRes.json();

    // Revoke it
    const delRes = await request.delete(
      `${BASE}/api/admin/magic-links?token=${link.token}`,
      { headers: authHeaders(adminToken) }
    );
    expect((await delRes.json()).ok).toBe(true);

    // Can no longer redeem
    const redeemRes = await request.get(`${BASE}/api/auth/magic?token=${link.token}`);
    expect(redeemRes.status()).toBe(401);
  });

  test('magic links API requires admin', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/magic-links`, {
      data: { email: 'test@test.com' },
    });
    expect(res.status()).toBe(401);
  });
});

// ── Upload Tests ───────────────────────────────────────────────────────────────

test.describe('Upload', () => {
  test('generate presigned upload URL', async ({ request }) => {
    const token = await signIn(request);
    const res = await request.post(`${BASE}/api/admin/upload`, {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { files: [{ filename: 'test-upload.mp3' }] },
    });
    const data = await res.json();
    expect(data.urls).toHaveLength(1);
    expect(data.urls[0].uploadUrl).toContain('aarons-recordings');
    expect(data.urls[0].key).toBe('test-upload.mp3');
  });

  test('accepts shared-basename audio and video variants without transcoding', async ({ request }) => {
    const token = await signIn(request);
    const filenames = ['mixed-take.mp3', 'mixed-take.wav', 'mixed-take.aac', 'mixed-take.m4a', 'mixed-take.mp4', 'mixed-take.webm'];
    const res = await request.post(`${BASE}/api/admin/upload`, {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { files: filenames.map((filename) => ({ filename })) },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.urls.map((entry) => entry.key)).toEqual(filenames);
    expect(data.urls.every((entry) => entry.uploadUrl && !entry.error)).toBe(true);
  });

  test('upload rejects unsupported format', async ({ request }) => {
    const token = await signIn(request);
    const res = await request.post(`${BASE}/api/admin/upload`, {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { files: [{ filename: 'test.exe' }] },
    });
    const data = await res.json();
    expect(data.urls[0].error).toContain('Unsupported');
  });

  test('upload requires admin', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/upload`, {
      data: { files: [{ filename: 'test.mp3' }] },
    });
    expect(res.status()).toBe(401);
  });
});

// ── UI Tests ───────────────────────────────────────────────────────────────────

test.describe('Music UI', () => {
  let uiDumpId;

  test('setup: publish tracks and a dump for UI tests', async ({ request }) => {
    const token = await signIn(request);

    // Create a published dump
    const dumpRes = await request.post(`${BASE}/api/admin/dumps`, {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { name: 'UI Test Dump', published: true, visibility: 'public', artists: 'Test Artist' },
    });
    uiDumpId = (await dumpRes.json()).dump.id;

    const raw = await getRawTracks(request, token);
    const tracks = raw.tracks;
    // Track 0 in the dump, track 1 loose
    tracks[0] = { ...tracks[0], published: true, visibility: 'public', dumpId: uiDumpId };
    tracks[1] = { ...tracks[1], published: true, visibility: 'public', dumpId: null };
    for (let i = 2; i < tracks.length; i++) tracks[i] = { ...tracks[i], published: false };
    await putTracks(request, token, tracks);
  });

  test('music page loads and shows tracks', async ({ page }) => {
    await page.goto('http://music.localhost:3000');
    await expect(page.locator('h1')).toContainText('Music');
    // Wait for tracks to load
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible({ timeout: 10000 });
    const cards = page.locator('[class*="trackCard"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

  test('track card is clickable and has download action', async ({ page }) => {
    await page.goto('http://music.localhost:3000');
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible({ timeout: 10000 });
    const card = page.locator('[class*="trackCard"]').first();
    // Whole card is the play button (role=button)
    await expect(card).toHaveAttribute('role', 'button');
    // Download action button visible on the card
    await expect(card.locator('[aria-label="Download options"]')).toBeVisible();
  });

  test('download dropdown links point to stream API with download=1', async ({ page }) => {
    await page.goto('http://music.localhost:3000');
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible({ timeout: 10000 });
    // Open the download dropdown on the first card
    await page.locator('[class*="trackCard"]').first()
      .locator('[aria-label="Download options"]').click();
    const link = page.locator('[class*="downloadLink"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toContain('/api/stream');
    expect(href).toContain('download=1');
  });

  test('dump card visible on music page (anonymous)', async ({ page }) => {
    await page.goto('http://music.localhost:3000');
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible({ timeout: 10000 });
    // Dumps render as click-through cards on the grid — not inline track lists.
    const dumpCard = page.locator('[class*="dumpCardLink"]').filter({ hasText: 'UI Test Dump' });
    await expect(dumpCard).toBeVisible();
  });

  test('dump card is a clickable link that opens dump detail page', async ({ page }) => {
    await page.goto('http://music.localhost:3000');
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible({ timeout: 10000 });

    const dumpCard = page.locator('[class*="dumpCardLink"]').filter({ hasText: 'UI Test Dump' }).first();
    await expect(dumpCard).toBeVisible();
    await dumpCard.click();

    // Should navigate to dump detail page
    await page.waitForURL('**music.localhost:3000/dump/**', { timeout: 5000 });
    await expect(page.locator('h1', { hasText: 'UI Test Dump' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible();
  });

  test('logged-in user can see and click into a dump', async ({ page, request }) => {
    // Create user
    const email = `dumpui-${Date.now()}@local.dev`;
    await signUp(request, email, 'testpass1');

    // Log in via UI
    await page.goto('http://music.localhost:3000/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'testpass1');
    await page.click('button[type="submit"]');
    await page.waitForURL('**music.localhost:3000/', { timeout: 5000 });

    // Dump card should be visible on the grid
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible({ timeout: 10000 });
    const dumpCard = page.locator('[class*="dumpCardLink"]').filter({ hasText: 'UI Test Dump' }).first();
    await expect(dumpCard).toBeVisible();

    // Click into the dump
    await dumpCard.click();
    await page.waitForURL('**music.localhost:3000/dump/**', { timeout: 5000 });
    await expect(page.locator('h1', { hasText: 'UI Test Dump' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[class*="trackCard"]').first()).toBeVisible();
  });

  test('login page renders', async ({ page }) => {
    await page.goto('http://music.localhost:3000/login');
    await expect(page.locator('h1')).toContainText('Sign In');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('login and redirect', async ({ page }) => {
    await page.goto('http://music.localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@local.dev');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForURL('**music.localhost:3000/', { timeout: 5000 });
  });

  test('admin link visible after login', async ({ page }) => {
    await page.goto('http://music.localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@local.dev');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForURL('**music.localhost:3000/', { timeout: 5000 });
    await expect(page.locator('a', { hasText: 'Admin' })).toBeVisible({ timeout: 5000 });
  });

  test('admin page loads with tabs', async ({ page }) => {
    await page.goto('http://music.localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@local.dev');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForURL('**music.localhost:3000/', { timeout: 5000 });
    await page.goto('http://music.localhost:3000/admin');
    await expect(page.locator('h1')).toContainText('Music Admin');
    await expect(page.locator('button', { hasText: 'Tracks' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Dumps' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Users' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Groups' })).toBeVisible();
  });

  test('sign out works', async ({ page }) => {
    await page.goto('http://music.localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@local.dev');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForURL('**music.localhost:3000/', { timeout: 5000 });
    const anonymousRefresh = page.waitForResponse((response) =>
      response.url().includes('/api/tracks') &&
      response.request().method() === 'GET' &&
      !response.request().headers().authorization
    );
    await page.locator('button', { hasText: 'Sign Out' }).click();
    expect((await anonymousRefresh).status()).toBe(200);
    await expect(page.locator('a', { hasText: 'Sign In' })).toBeVisible({ timeout: 5000 });
  });

  test('signup page renders', async ({ page }) => {
    await page.goto('http://music.localhost:3000/signup');
    await expect(page.locator('h1')).toContainText('Create Account');
  });

  test('forgot password page renders', async ({ page }) => {
    await page.goto('http://music.localhost:3000/forgot-password');
    await expect(page.locator('h1')).toContainText('Forgot Password');
  });
});
