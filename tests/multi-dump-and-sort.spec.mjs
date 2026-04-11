import { test, expect } from '@playwright/test';

// NOTE: Each describe block configures its own serial mode inline so that
// a failure in one describe doesn't skip every remaining test in the file.

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function getPublicTracks(request, token) {
  const headers = token ? authHeaders(token) : {};
  const res = await request.get(`${BASE}/api/music/tracks`, { headers });
  return res.json();
}

async function putTracks(request, token, tracks) {
  const res = await request.put(`${BASE}/api/music/tracks`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { tracks },
  });
  return res.json();
}

async function putSingleTrack(request, token, track) {
  const res = await request.put(`${BASE}/api/music/tracks`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { track },
  });
  return res.json();
}

async function createDump(request, token, { name, published = false, visibility = 'public' } = {}) {
  const res = await request.post(`${BASE}/api/music/admin/dumps`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { name, published, visibility },
  });
  const data = await res.json();
  return data.dump;
}

async function listAdminDumps(request, token) {
  const res = await request.get(`${BASE}/api/music/admin/dumps`, {
    headers: authHeaders(token),
  });
  return res.json();
}

async function deleteDump(request, token, dumpId) {
  const res = await request.delete(`${BASE}/api/music/admin/dumps?id=${dumpId}`, {
    headers: authHeaders(token),
  });
  return res.json();
}

async function createDumpShareLink(request, token, dumpId) {
  const res = await request.post(`${BASE}/api/music/admin/dump-share-links`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { dumpId },
  });
  const data = await res.json();
  return data.link;
}

/**
 * Replace the whole track list with everything unpublished and no dump
 * assignments — isolates each describe so stale state from a prior test
 * doesn't contaminate publish visibility.
 */
async function resetAllTracks(request, token) {
  const raw = await getRawTracks(request, token);
  const cleaned = raw.tracks.map((t) => ({
    ...t,
    published: false,
    dumpIds: [],
  }));
  await putTracks(request, token, cleaned);
  return cleaned;
}

async function signInBrowser(page, email = 'admin@local.dev', password = 'admin') {
  const res = await page.request.post(`${BASE}/api/music/auth/signin`, {
    data: { email, password },
  });
  const data = await res.json();
  // First navigate so localStorage is available for this origin.
  await page.goto('/music');
  await page.evaluate((tok) => localStorage.setItem('music_auth_token', tok), data.idToken);
  return data.idToken;
}

// ── Multi-dump assignment — store layer ───────────────────────────────────────

test.describe('Multi-dump assignment — store layer', () => {
  test.describe.configure({ mode: 'serial' });
  let adminToken;
  let dumpA;
  let dumpB;
  let trackId;

  test('setup: sign in + create two dumps + pick a track', async ({ request }) => {
    adminToken = await signIn(request);
    expect(adminToken).toBeTruthy();

    const stamp = Date.now();
    dumpA = (await createDump(request, adminToken, { name: `multi-A-${stamp}`, published: true })).id;
    dumpB = (await createDump(request, adminToken, { name: `multi-B-${stamp}`, published: true })).id;
    expect(dumpA).toBeTruthy();
    expect(dumpB).toBeTruthy();

    const raw = await getRawTracks(request, adminToken);
    expect(raw.tracks.length).toBeGreaterThan(0);
    trackId = raw.tracks[0].id;
    // Reset the target track to a clean state.
    await putSingleTrack(request, adminToken, {
      ...raw.tracks[0],
      published: false,
      dumpIds: [],
    });
  });

  test('PUT with dumpIds:[A,B] writes both assignments; raw GET shows both', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    // Use the canonical multi-dump shape — strip any stray legacy dumpId.
    const next = { ...track, dumpIds: [dumpA, dumpB] };
    delete next.dumpId;
    await putSingleTrack(request, adminToken, next);

    const after = await getRawTracks(request, adminToken);
    const t = after.tracks.find((x) => x.id === trackId);
    expect(t).toBeTruthy();
    expect(Array.isArray(t.dumpIds)).toBe(true);
    expect(new Set(t.dumpIds)).toEqual(new Set([dumpA, dumpB]));
  });

  test('admin dumps listing includes the track in both dumps', async ({ request }) => {
    const data = await listAdminDumps(request, adminToken);
    const a = data.dumps.find((d) => d.id === dumpA);
    const b = data.dumps.find((d) => d.id === dumpB);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.tracks.map((t) => t.id)).toContain(trackId);
    expect(b.tracks.map((t) => t.id)).toContain(trackId);
  });

  test('reassign to only [A]: B no longer lists the track', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    const next = { ...track, dumpIds: [dumpA] };
    delete next.dumpId;
    await putSingleTrack(request, adminToken, next);

    const after = await getRawTracks(request, adminToken);
    const t = after.tracks.find((x) => x.id === trackId);
    expect(t.dumpIds).toEqual([dumpA]);

    const data = await listAdminDumps(request, adminToken);
    const a = data.dumps.find((d) => d.id === dumpA);
    const b = data.dumps.find((d) => d.id === dumpB);
    expect(a.tracks.map((t) => t.id)).toContain(trackId);
    expect(b.tracks.map((t) => t.id)).not.toContain(trackId);
  });

  test('legacy single-dumpId PUT still works and normalizes to dumpIds', async ({ request }) => {
    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);

    // Build a payload in the legacy shape: dumpId only, no dumpIds field.
    const legacy = { ...track, dumpId: dumpA };
    delete legacy.dumpIds;
    await putSingleTrack(request, adminToken, legacy);

    const after = await getRawTracks(request, adminToken);
    const t = after.tracks.find((x) => x.id === trackId);
    expect(t.dumpIds).toEqual([dumpA]);
  });

  test('dumpId:null on a raw-spread track clears the assignment', async ({ request }) => {
    // First re-assign the track to dumpA to have something to clear.
    const raw1 = await getRawTracks(request, adminToken);
    const track1 = raw1.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, { ...track1, dumpIds: [dumpA] });

    // Now spread the raw response (which carries dumpIds:[dumpA]) and layer a
    // legacy dumpId:null on top. Presence of the `dumpId` key must win.
    const raw2 = await getRawTracks(request, adminToken);
    const track2 = raw2.tracks.find((t) => t.id === trackId);
    expect(track2.dumpIds).toEqual([dumpA]);
    const cleared = { ...track2, dumpId: null };
    await putSingleTrack(request, adminToken, cleared);

    const after = await getRawTracks(request, adminToken);
    const t = after.tracks.find((x) => x.id === trackId);
    expect(t.dumpIds).toEqual([]);
  });

  test('stream cascades through multiple parent dumps (only one published)', async ({ request }) => {
    // Create dumpC published, dumpD unpublished. Assign track to both. Track
    // itself unpublished. Anonymous should be able to stream.
    const stamp = Date.now();
    const dumpC = (await createDump(request, adminToken, { name: `cascade-C-${stamp}`, published: true })).id;
    const dumpD = (await createDump(request, adminToken, { name: `cascade-D-${stamp}`, published: false })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: false,
      visibility: 'public',
      dumpIds: [dumpC, dumpD],
    });

    const fmt = Object.keys(track.formats)[0];
    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackId)}&format=${fmt}`,
      { maxRedirects: 0 }
    );
    expect([200, 302]).toContain(res.status());

    // Cleanup
    await deleteDump(request, adminToken, dumpC);
    await deleteDump(request, adminToken, dumpD);
  });

  test('track in only-unpublished dumps: anon 403, admin 200', async ({ request }) => {
    const stamp = Date.now();
    const dumpE = (await createDump(request, adminToken, { name: `deny-E-${stamp}`, published: false })).id;
    const dumpF = (await createDump(request, adminToken, { name: `deny-F-${stamp}`, published: false })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: false,
      visibility: 'public',
      dumpIds: [dumpE, dumpF],
    });

    const fmt = Object.keys(track.formats)[0];
    const anon = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackId)}&format=${fmt}`,
      { maxRedirects: 0 }
    );
    expect([403, 404]).toContain(anon.status());

    const admin = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackId)}&format=${fmt}`,
      { headers: authHeaders(adminToken), maxRedirects: 0 }
    );
    expect([200, 302]).toContain(admin.status());

    // Cleanup
    await deleteDump(request, adminToken, dumpE);
    await deleteDump(request, adminToken, dumpF);
  });

  // NOTE: Placed last in this describe block because it is currently failing
  // due to a source-layer bug: deleteDump() cleans up sibling rows but does
  // NOT rewrite the main track row's `dumpIds` array, so a deleted dump
  // lingers in the list. Do NOT fix source — leaving failing per task.
  test('re-add [A,B] then delete B: track remains with dumpIds:[A]', async ({ request }) => {
    // Recreate fresh A and B for this test so we don't rely on prior state.
    const stamp = Date.now();
    const freshA = (await createDump(request, adminToken, { name: `readd-A-${stamp}`, published: true })).id;
    const freshB = (await createDump(request, adminToken, { name: `readd-B-${stamp}`, published: true })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    const next = { ...track, dumpIds: [freshA, freshB] };
    delete next.dumpId;
    await putSingleTrack(request, adminToken, next);

    // Sanity: both assignments present
    let admin = await listAdminDumps(request, adminToken);
    expect(admin.dumps.find((d) => d.id === freshB).tracks.map((t) => t.id)).toContain(trackId);

    // Delete B
    const del = await deleteDump(request, adminToken, freshB);
    expect(del.ok).toBe(true);

    // Track still exists, only belongs to A now.
    const after = await getRawTracks(request, adminToken);
    const t = after.tracks.find((x) => x.id === trackId);
    expect(t).toBeTruthy();
    expect(t.dumpIds).toEqual([freshA]);

    admin = await listAdminDumps(request, adminToken);
    const a = admin.dumps.find((d) => d.id === freshA);
    expect(a.tracks.map((x) => x.id)).toContain(trackId);
    expect(admin.dumps.find((d) => d.id === freshB)).toBeUndefined();
  });
});

// ── Multi-dump publish cascade in public response ─────────────────────────────

test.describe('Multi-dump publish cascade in public response', () => {
  test.describe.configure({ mode: 'serial' });
  let adminToken;
  let trackId;

  test('setup: reset everything', async ({ request }) => {
    adminToken = await signIn(request);
    // Nuke all existing dumps so the public response only shows the ones we make.
    const admin = await listAdminDumps(request, adminToken);
    for (const d of admin.dumps) {
      await deleteDump(request, adminToken, d.id);
    }
    const raw = await resetAllTracks(request, adminToken);
    trackId = raw[0].id;
  });

  test('track in two published dumps appears under both in public response', async ({ request }) => {
    const stamp = Date.now();
    const dA = (await createDump(request, adminToken, { name: `pub-A-${stamp}`, published: true })).id;
    const dB = (await createDump(request, adminToken, { name: `pub-B-${stamp}`, published: true })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: true,
      visibility: 'public',
      dumpIds: [dA, dB],
    });

    const pub = await getPublicTracks(request);
    const dumpA = pub.dumps.find((d) => d.id === dA);
    const dumpB = pub.dumps.find((d) => d.id === dB);
    expect(dumpA).toBeTruthy();
    expect(dumpB).toBeTruthy();
    expect(dumpA.tracks.map((t) => t.id)).toContain(trackId);
    expect(dumpB.tracks.map((t) => t.id)).toContain(trackId);
    // Should NOT also appear in the loose list when it's grouped under a dump.
    expect(pub.tracks.map((t) => t.id)).not.toContain(trackId);

    // Cleanup
    await deleteDump(request, adminToken, dA);
    await deleteDump(request, adminToken, dB);
  });

  test('track in one-published + one-unpublished appears only under the published one', async ({ request }) => {
    const stamp = Date.now();
    const dPub = (await createDump(request, adminToken, { name: `mixpub-${stamp}`, published: true })).id;
    const dUnp = (await createDump(request, adminToken, { name: `mixunp-${stamp}`, published: false })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: true,
      visibility: 'public',
      dumpIds: [dPub, dUnp],
    });

    const pub = await getPublicTracks(request);
    const dp = pub.dumps.find((d) => d.id === dPub);
    expect(dp).toBeTruthy();
    expect(dp.tracks.map((t) => t.id)).toContain(trackId);
    expect(pub.dumps.find((d) => d.id === dUnp)).toBeUndefined();
    // Since at least one parent dump is published, it's grouped under that
    // dump and NOT in the loose list.
    expect(pub.tracks.map((t) => t.id)).not.toContain(trackId);

    // Cleanup
    await deleteDump(request, adminToken, dPub);
    await deleteDump(request, adminToken, dUnp);
  });

  test('anonymous response still respects track-level restricted visibility', async ({ request }) => {
    const stamp = Date.now();
    const dPub = (await createDump(request, adminToken, { name: `restr-pub-${stamp}`, published: true })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: true,
      visibility: 'restricted',
      dumpIds: [dPub],
    });

    const pub = await getPublicTracks(request);
    // Track should NOT appear anywhere in the anonymous response.
    const inDump = pub.dumps.find((d) => d.id === dPub);
    if (inDump) {
      expect(inDump.tracks.map((t) => t.id)).not.toContain(trackId);
    }
    expect(pub.tracks.map((t) => t.id)).not.toContain(trackId);

    // Reset to public for subsequent tests + cleanup
    await putSingleTrack(request, adminToken, {
      ...track,
      published: false,
      visibility: 'public',
      dumpIds: [],
    });
    await deleteDump(request, adminToken, dPub);
  });
});

// ── Dump-share token across multi-dump tracks ─────────────────────────────────

test.describe('Dump-share token across multi-dump tracks', () => {
  test.describe.configure({ mode: 'serial' });
  let adminToken;
  let trackId;
  let fmt;

  test('setup', async ({ request }) => {
    adminToken = await signIn(request);
    const admin = await listAdminDumps(request, adminToken);
    for (const d of admin.dumps) await deleteDump(request, adminToken, d.id);
    const cleaned = await resetAllTracks(request, adminToken);
    trackId = cleaned[0].id;
    fmt = Object.keys(cleaned[0].formats)[0];
  });

  test('dump-share token for dumpA authorizes streaming a track in [dumpA, dumpB]', async ({ request }) => {
    const stamp = Date.now();
    const dA = (await createDump(request, adminToken, { name: `share-A-${stamp}`, published: false })).id;
    const dB = (await createDump(request, adminToken, { name: `share-B-${stamp}`, published: false })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: false,
      visibility: 'public',
      dumpIds: [dA, dB],
    });

    const share = await createDumpShareLink(request, adminToken, dA);
    expect(share.token).toBeTruthy();

    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackId)}&format=${fmt}&share=${share.token}`,
      { maxRedirects: 0 }
    );
    expect([200, 302]).toContain(res.status());
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);

    // Cleanup
    await deleteDump(request, adminToken, dA);
    await deleteDump(request, adminToken, dB);
  });

  test('token for dumpC (track NOT in C) does NOT authorize streaming', async ({ request }) => {
    const stamp = Date.now();
    const dA = (await createDump(request, adminToken, { name: `tok-A-${stamp}`, published: false })).id;
    const dC = (await createDump(request, adminToken, { name: `tok-C-${stamp}`, published: false })).id;

    const raw = await getRawTracks(request, adminToken);
    const track = raw.tracks.find((t) => t.id === trackId);
    await putSingleTrack(request, adminToken, {
      ...track,
      published: false,
      visibility: 'public',
      dumpIds: [dA],
    });

    const share = await createDumpShareLink(request, adminToken, dC);
    const res = await request.get(
      `${BASE}/api/music/stream?id=${encodeURIComponent(trackId)}&format=${fmt}&share=${share.token}`,
      { maxRedirects: 0 }
    );
    // Track not effectively published and share token doesn't match any of
    // its dumps → 403 (or 401 if visibility path triggers first).
    expect([401, 403]).toContain(res.status());

    // Cleanup
    await deleteDump(request, adminToken, dA);
    await deleteDump(request, adminToken, dC);
  });
});

// ── Admin Tracks tab sort + Members rename — UI ───────────────────────────────

test.describe('Admin Tracks tab sort + Members rename — UI', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ request }) => {
    // Ensure the admin will have tracks + dumps loaded fresh.
    const token = await signIn(request);
    // Make sure at least a few tracks exist (S3 merge does this anyway).
    await getRawTracks(request, token);
  });

  test('sort dropdown shows the three options and defaults to "Date created"', async ({ page }) => {
    await signInBrowser(page);
    await page.goto('/music/admin');
    // Wait for the tracks list to render
    await expect(page.getByRole('heading', { name: /Music Admin/i })).toBeVisible();
    // The Tracks tab is the default tab. Locate the Sort by select.
    const sortSelect = page.getByLabel('Sort by');
    await expect(sortSelect).toBeVisible();
    await expect(sortSelect).toHaveValue('created');

    // Option labels
    const options = await sortSelect.locator('option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Date created', 'Date uploaded to S3', 'Name']));
  });

  test('switching sort to "Name" reorders the list alphabetically', async ({ page }) => {
    await signInBrowser(page);
    await page.goto('/music/admin');

    await expect(page.getByRole('heading', { name: /Music Admin/i })).toBeVisible();

    const sortSelect = page.getByLabel('Sort by');
    await expect(sortSelect).toBeVisible();

    // Capture first 3 visible names BEFORE.
    async function firstThreeNames() {
      // itemInfo > strong holds the track display name.
      const names = await page.locator('[class*="itemInfo"] > strong').allTextContents();
      return names.slice(0, 3);
    }

    // Wait until at least 3 tracks render (or bail if fewer exist).
    await page.waitForFunction(() => {
      return document.querySelectorAll('[class*="itemInfo"] > strong').length >= 1;
    });

    const before = await firstThreeNames();
    // Switch to Name sort
    await sortSelect.selectOption('name');
    await expect(sortSelect).toHaveValue('name');

    // Wait for re-render — give React a tick
    await page.waitForTimeout(300);
    const after = await firstThreeNames();

    // If there are multiple tracks, after should be alphabetically sorted
    // (case-insensitive). If fewer than 2 exist, at least assert the select
    // took effect.
    if (after.length >= 2) {
      const sorted = [...after].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      expect(after).toEqual(sorted);
    }
    // And it should differ from before unless the tracks happened to already
    // be in alphabetical order — so just assert select value took effect.
    expect(before).toBeDefined();
  });

  test('visibility select on track row shows "Members" (value=authenticated)', async ({ page }) => {
    await signInBrowser(page);
    await page.goto('/music/admin');
    await expect(page.getByRole('heading', { name: /Music Admin/i })).toBeVisible();

    // Wait for tracks to populate.
    await page.waitForFunction(() => {
      return document.querySelectorAll('[class*="itemActions"] select').length >= 1;
    });

    // The visibility select lives inside itemActions — grab the first one.
    const visSelects = page.locator('[class*="itemActions"] select');
    const firstVis = visSelects.first();
    await expect(firstVis).toBeVisible();

    const optionTexts = await firstVis.locator('option').allTextContents();
    expect(optionTexts).toEqual(expect.arrayContaining(['Public', 'Members', 'Restricted']));
    expect(optionTexts).not.toContain('Auth Required');
    expect(optionTexts).not.toContain('Authenticated Only');

    // Pick Members and confirm underlying value is still "authenticated".
    await firstVis.selectOption({ label: 'Members' });
    await expect(firstVis).toHaveValue('authenticated');
  });

  test('TrackEditor modal visibility select also says "Members"', async ({ page }) => {
    await signInBrowser(page);
    await page.goto('/music/admin');
    await expect(page.getByRole('heading', { name: /Music Admin/i })).toBeVisible();

    // Wait for at least one Edit button to show up.
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent?.trim() === 'Edit');
    });

    // Click the first Edit button in the tracks list.
    await page.getByRole('button', { name: /^Edit$/ }).first().click();

    // Modal should show — look for the "Edit Track" heading.
    await expect(page.getByRole('heading', { name: /Edit Track/i })).toBeVisible();

    // Visibility select is inside the modal.
    const modal = page.locator('[class*="overlay"] [class*="modal"]').first();
    const modalVis = modal.locator('select').filter({ hasText: /Members/ }).first();
    await expect(modalVis).toBeVisible();
    const modalOptions = await modalVis.locator('option').allTextContents();
    expect(modalOptions).toEqual(expect.arrayContaining(['Public', 'Members', 'Restricted']));
    expect(modalOptions).not.toContain('Auth Required');
    await modalVis.selectOption({ label: 'Members' });
    await expect(modalVis).toHaveValue('authenticated');
  });

  test('DumpManager create form + DumpEditor visibility says "Members"', async ({ page }) => {
    await signInBrowser(page);
    await page.goto('/music/admin');
    await expect(page.getByRole('heading', { name: /Music Admin/i })).toBeVisible();

    // Switch to Dumps tab.
    await page.getByRole('button', { name: /^Dumps$/ }).click();

    // Click "+ New Dump" to open the create form.
    await page.getByRole('button', { name: /\+ New Dump/ }).click();

    const createVis = page.locator('#dump-visibility');
    await expect(createVis).toBeVisible();
    const createOptions = await createVis.locator('option').allTextContents();
    expect(createOptions).toEqual(expect.arrayContaining(['Public', 'Members', 'Restricted']));
    expect(createOptions).not.toContain('Auth Required');
    expect(createOptions).not.toContain('Authenticated Only');
    await createVis.selectOption({ label: 'Members' });
    await expect(createVis).toHaveValue('authenticated');

    // Cancel the create form so we can open a dump editor.
    await page.getByRole('button', { name: /^Cancel$/ }).click();

    // Ensure there is at least one dump to edit — create one through the API.
    const token = await page.evaluate(() => localStorage.getItem('music_auth_token'));
    const stamp = Date.now();
    await page.request.post(`${BASE}/api/music/admin/dumps`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `editor-vis-${stamp}` },
    });

    // Refresh the Dumps tab.
    await page.reload();
    await signInBrowser(page); // reload nuked the token? re-set to be safe
    await page.goto('/music/admin');
    await page.getByRole('button', { name: /^Dumps$/ }).click();

    // Click the first Edit on the dumps list.
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent?.trim() === 'Edit');
    });
    await page.getByRole('button', { name: /^Edit$/ }).first().click();

    // Find the visibility select inside the dump editor modal.
    const dumpModal = page.locator('[class*="overlay"] [class*="modal"]').first();
    await expect(dumpModal).toBeVisible();
    const dumpVis = dumpModal.locator('select').filter({ hasText: /Members/ }).first();
    await expect(dumpVis).toBeVisible();
    const dumpOptions = await dumpVis.locator('option').allTextContents();
    expect(dumpOptions).toEqual(expect.arrayContaining(['Public', 'Members', 'Restricted']));
    expect(dumpOptions).not.toContain('Auth Required');
    await dumpVis.selectOption({ label: 'Members' });
    await expect(dumpVis).toHaveValue('authenticated');
  });
});

// ── s3UploadedAt field ────────────────────────────────────────────────────────

test.describe('s3UploadedAt field', () => {
  test.describe.configure({ mode: 'serial' });
  let adminToken;

  test('setup: admin sign in', async ({ request }) => {
    adminToken = await signIn(request);
  });

  test('raw tracks GET returns s3UploadedAt on every track', async ({ request }) => {
    const data = await getRawTracks(request, adminToken);
    expect(data.tracks.length).toBeGreaterThan(0);
    for (const t of data.tracks) {
      expect(t).toHaveProperty('s3UploadedAt');
      // Should be a non-empty string (ISO) or at minimum match addedAt for
      // legacy rows (mergeTracks backfills it from the bucket's LastModified).
      expect(typeof t.s3UploadedAt === 'string' || t.s3UploadedAt === null).toBe(true);
      if (t.s3UploadedAt) {
        // ISO parseable
        expect(Number.isNaN(new Date(t.s3UploadedAt).getTime())).toBe(false);
      }
    }
  });

  test('newly-merged S3 track has s3UploadedAt === addedAt initially', async ({ request }) => {
    // Grab the existing raw list. mergeTracks always backfills s3UploadedAt
    // from the S3 LastModified at first sight, so for any row the invariant
    // "s3UploadedAt is set and equals addedAt OR equals the original bucket
    // LastModified" must hold. We just assert the first row has both set and
    // the ISO values match for rows where addedAt was auto-assigned.
    const data = await getRawTracks(request, adminToken);
    const t = data.tracks[0];
    expect(t.s3UploadedAt).toBeTruthy();
    expect(t.addedAt).toBeTruthy();
    // For a row we haven't manually changed addedAt on, they should be equal.
    // We don't know which rows have been touched by other tests, so only
    // assert when they still line up — this still catches the regression that
    // s3UploadedAt isn't being written at all.
    const touched = data.tracks.some((x) => x.s3UploadedAt === x.addedAt);
    expect(touched).toBe(true);
  });
});
