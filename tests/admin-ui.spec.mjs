// Admin UI tests: Magic Links tab, per-track "Magic Link" button,
// and the Dumps drag-and-drop file picker.
//
// These tests drive the real browser UI (not just the API) and rely on the
// dev server auto-started by playwright.config.mjs plus DynamoDB Local.
//
// State is shared with other specs, so every test creates its own isolated
// targets (dumps, links, emails) and keys off unique labels where possible.

import { test, expect } from '@playwright/test';

// Use default parallel-per-worker scheduling; within each describe we set
// serial mode where the tests mutate shared admin state. File-wide serial
// would cascade-skip every remaining test on a single flake.

const BASE = 'http://music.localhost:3000';

// ── Helpers ────────────────────────────────────────────────────────────────

async function adminToken(request) {
  const res = await request.post(`${BASE}/api/auth/signin`, {
    data: { email: 'admin@local.dev', password: 'admin' },
  });
  const data = await res.json();
  return data.idToken;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function retryable(fn, { tries = 3, delayMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Sign the browser in as admin by seeding the localStorage token the same way
 * the LoginForm would. We must do this AFTER landing on a /music page so the
 * site's origin matches and localStorage is writable.
 *
 * The Next.js dev server occasionally drops the first request after cold
 * compile — retry signin + goto a couple of times to soak up that flake.
 */
async function signInBrowser(page) {
  const idToken = await retryable(async () => {
    const res = await page.request.post(`${BASE}/api/auth/signin`, {
      data: { email: 'admin@local.dev', password: 'admin' },
    });
    const data = await res.json();
    if (!data.idToken) throw new Error('signin returned no idToken');
    return data.idToken;
  });
  await retryable(() => page.goto('http://music.localhost:3000'));
  await page.evaluate((t) => localStorage.setItem('music_auth_token', t), idToken);
  return idToken;
}

async function gotoAdmin(page) {
  await page.goto('http://music.localhost:3000/admin');
  // Wait for the tabs row to render (means auth passed and admin UI mounted).
  await expect(page.getByRole('button', { name: /^Tracks$/i })).toBeVisible({ timeout: 15000 });
}

async function createLoginMagicLink(request, token, label) {
  const email = `ml-ui-${Date.now()}-${Math.floor(Math.random() * 1e6)}@local.dev`;
  // The user has to exist for the UI's target column to render cleanly, but
  // createMagicLink doesn't require it — either way this is fine for list UI.
  const res = await request.post(`${BASE}/api/admin/magic-links`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { email, label },
  });
  const body = await res.json();
  return { email, token: body.link.token };
}

async function createDump(request, token, name) {
  const res = await request.post(`${BASE}/api/admin/dumps`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { name, description: '', artists: '', visibility: 'public', published: false },
  });
  const body = await res.json();
  return body.dump;
}

async function createDumpShareLink(request, token, dumpId, label) {
  const res = await request.post(`${BASE}/api/admin/dump-share-links`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { dumpId, label },
  });
  const body = await res.json();
  return body.link;
}

async function createTrackShareLink(request, token, trackId, label) {
  const res = await request.post(`${BASE}/api/admin/track-share-links`, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    data: { trackId, label },
  });
  const body = await res.json();
  return body.link;
}

async function getAllShareLinks(request, token) {
  const res = await request.get(`${BASE}/api/admin/share-links`, {
    headers: authHeaders(token),
  });
  const data = await res.json();
  return data.links || [];
}

async function getFirstTrackId(request, token) {
  const res = await request.get(`${BASE}/api/tracks?raw=1`, {
    headers: authHeaders(token),
  });
  const data = await res.json();
  return data.tracks?.[0]?.id || null;
}

/**
 * Find the link row in the MagicLinksManager list by unique label text.
 * Returns a locator for the row element.
 *
 * Note: the row's CSS-module class is something like `MusicAdmin_item__abc`,
 * but *several* ancestors also contain the substring "item" (itemInfo,
 * itemActions…). A naive `xpath=ancestor::*[contains(@class, "item")][1]`
 * picks up the innermost `itemInfo` wrapper and then can't find the Edit
 * button. Instead we look for any <div> that (a) contains the labeled
 * <strong>, and (b) also contains the Copy URL action button — that's only
 * true of the row wrapper itself.
 */
function rowByLabel(page, label) {
  const re = new RegExp(`— ${escapeRegex(label)}(\\b|$)`);
  // Closest-ancestor div that has an Edit button in its subtree — in
  // MagicLinksManager this resolves to the row wrapper. Using [1] in XPath
  // from an ancestor axis returns the nearest ancestor (not document order).
  return page
    .locator('strong', { hasText: re })
    .locator('xpath=ancestor::div[.//button[normalize-space()="Edit"]][1]');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function clickMagicLinksTab(page) {
  await page.getByRole('button', { name: /^Magic links$/i }).click();
  // The tab has no explicit "ready" signal, but the filter dropdown only
  // renders once the initial fetch resolves (before that the component shows
  // a loading spinner).
  await expect(page.locator('select').filter({ hasText: /Login|All|Dump|Track/ }).first())
    .toBeVisible({ timeout: 15000 });
  // Belt-and-suspenders: click Refresh so we always pick up links created
  // AFTER the component mounted. This also serves as a "reload" of the list.
  await page.getByRole('button', { name: /Refresh/i }).click();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Admin tabs include Magic Links', () => {
  test('Magic links tab is present and renders the manager', async ({ page }) => {
    await signInBrowser(page);
    await gotoAdmin(page);

    const tab = page.getByRole('button', { name: /^Magic links$/i });
    await expect(tab).toBeVisible();
    await tab.click();

    // Filter dropdown + Refresh button are the distinguishing features.
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Show inactive \/ expired/i)).toBeVisible();
  });
});

test.describe('MagicLinksManager — list / filter / show inactive', () => {
  let token;
  let loginLabel;
  let dumpLabel;
  let trackLabel;
  let loginLink;
  let dumpLink;
  let trackLink;
  let dump;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    const stamp = Date.now();
    loginLabel = `uiLogin-${stamp}`;
    dumpLabel = `uiDump-${stamp}`;
    trackLabel = `uiTrack-${stamp}`;

    loginLink = await createLoginMagicLink(request, token, loginLabel);

    dump = await createDump(request, token, `ui-dump-${stamp}`);
    dumpLink = await createDumpShareLink(request, token, dump.id, dumpLabel);

    // Track share link needs a real track id — pull the first one from the
    // live tracks list. If there are no tracks, skip the track case gracefully.
    const trackId = await getFirstTrackId(request, token);
    if (trackId) {
      trackLink = await createTrackShareLink(request, token, trackId, trackLabel);
    }
  });

  test('list shows one of each kind with correct labels', async ({ page }) => {
    await signInBrowser(page);
    await gotoAdmin(page);
    await clickMagicLinksTab(page);

    await expect(rowByLabel(page, loginLabel)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(new RegExp(`^Login — ${escapeRegex(loginLabel)}`))).toBeVisible();

    await expect(rowByLabel(page, dumpLabel)).toBeVisible();
    await expect(page.getByText(new RegExp(`^Dump — ${escapeRegex(dumpLabel)}`))).toBeVisible();

    if (trackLink) {
      await expect(rowByLabel(page, trackLabel)).toBeVisible();
      await expect(page.getByText(new RegExp(`^Track — ${escapeRegex(trackLabel)}`))).toBeVisible();
    }
  });

  test('type filter narrows to single kind', async ({ page }) => {
    await signInBrowser(page);
    await gotoAdmin(page);
    await clickMagicLinksTab(page);

    // Find the type filter select (values all|login|dump|track).
    const typeSelect = page.locator('select').filter({
      has: page.locator('option[value="login"]'),
    }).first();
    await expect(typeSelect).toBeVisible();

    // Login filter
    await typeSelect.selectOption('login');
    await expect(rowByLabel(page, loginLabel)).toBeVisible();
    await expect(rowByLabel(page, dumpLabel)).toHaveCount(0);
    if (trackLink) await expect(rowByLabel(page, trackLabel)).toHaveCount(0);

    // Dump filter
    await typeSelect.selectOption('dump');
    await expect(rowByLabel(page, dumpLabel)).toBeVisible();
    await expect(rowByLabel(page, loginLabel)).toHaveCount(0);
    if (trackLink) await expect(rowByLabel(page, trackLabel)).toHaveCount(0);

    // Track filter
    if (trackLink) {
      await typeSelect.selectOption('track');
      await expect(rowByLabel(page, trackLabel)).toBeVisible();
      await expect(rowByLabel(page, loginLabel)).toHaveCount(0);
      await expect(rowByLabel(page, dumpLabel)).toHaveCount(0);
    }

    // All filter
    await typeSelect.selectOption('all');
    await expect(rowByLabel(page, loginLabel)).toBeVisible();
    await expect(rowByLabel(page, dumpLabel)).toBeVisible();
    if (trackLink) await expect(rowByLabel(page, trackLabel)).toBeVisible();
  });

  test('show inactive checkbox hides deactivated links until toggled on', async ({ page, request }) => {
    // Deactivate via API so this test is deterministic regardless of UI flow.
    await request.patch(`${BASE}/api/admin/share-links`, {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { kind: 'login', token: loginLink.token, active: false },
    });

    await signInBrowser(page);
    await gotoAdmin(page);
    await clickMagicLinksTab(page);

    // showInactive starts OFF — the deactivated login row should NOT appear.
    await expect(rowByLabel(page, loginLabel)).toHaveCount(0);

    // Toggle "Show inactive / expired" and the row reappears.
    const showInactive = page.getByRole('checkbox', { name: /Show inactive \/ expired/i });
    await showInactive.check();
    await expect(rowByLabel(page, loginLabel)).toBeVisible();

    // Clean up: reactivate so it doesn't pollute later tests.
    await request.patch(`${BASE}/api/admin/share-links`, {
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      data: { kind: 'login', token: loginLink.token, active: true },
    });
  });

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup. Ignore failures.
    if (loginLink) {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=login&token=${loginLink.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
    if (dumpLink) {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=dump&token=${dumpLink.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
    if (trackLink) {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=track&token=${trackLink.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
    if (dump) {
      await request.delete(`${BASE}/api/admin/dumps?id=${dump.id}`, {
        headers: authHeaders(token),
      }).catch(() => {});
    }
  });
});

test.describe('MagicLinksManager — edit modal', () => {
  let token;
  let originalLabel;
  let link;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    originalLabel = `editOrig-${Date.now()}`;
    link = (await createLoginMagicLink(request, token, originalLabel));
  });

  test.afterAll(async ({ request }) => {
    if (link) {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=login&token=${link.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
  });

  test('edit modal opens, saves a new label, and keeps login expiry mandatory', async ({ page }) => {
    await signInBrowser(page);
    await gotoAdmin(page);
    await clickMagicLinksTab(page);

    const row = rowByLabel(page, originalLabel);
    await expect(row).toBeVisible({ timeout: 10000 });

    // ── Open modal, rename label ─────────────────────────────────────────────
    await row.getByRole('button', { name: /^Edit$/ }).click();

    const labelInput = page.locator('label', { hasText: /^Label/ }).locator('input');
    await expect(labelInput).toBeVisible();
    // Expiry select
    const expirySelect = page.locator('label', { hasText: /^Expiry/ }).locator('select');
    await expect(expirySelect).toBeVisible();
    // Active checkbox
    const activeCheckbox = page.getByRole('checkbox', { name: /Active/ });
    await expect(activeCheckbox).toBeVisible();
    // Save / Cancel buttons
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Cancel$/ })).toBeVisible();

    const newLabel = `editNew-${Date.now()}`;
    await labelInput.fill(newLabel);
    await page.getByRole('button', { name: /^Save$/ }).click();

    // Modal should close, and the new label should render.
    await expect(page.locator('label', { hasText: /^Label/ })).toHaveCount(0, { timeout: 10000 });
    await expect(rowByLabel(page, newLabel)).toBeVisible({ timeout: 10000 });

    // ── Set expiry 30 days from today ────────────────────────────────────────
    await rowByLabel(page, newLabel).getByRole('button', { name: /^Edit$/ }).click();
    await page.locator('label', { hasText: /^Expiry/ }).locator('select').selectOption('date');
    const dateInput = page.locator('label', { hasText: /Expires on/ }).locator('input[type="date"]');
    await expect(dateInput).toBeVisible();
    const target = new Date(Date.now() + 30 * 86400000);
    const yyyy = target.getUTCFullYear();
    const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(target.getUTCDate()).padStart(2, '0');
    await dateInput.fill(`${yyyy}-${mm}-${dd}`);
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.locator('label', { hasText: /^Label/ })).toHaveCount(0, { timeout: 10000 });

    // Row should now show "expires <date>" in its meta line (not "no expiry").
    const updatedRow = rowByLabel(page, newLabel);
    await expect(updatedRow.getByText(/expires /)).toBeVisible();
    await expect(updatedRow.getByText(/no expiry/)).toHaveCount(0);

    // Login links are required to expire; the UI must not offer an unsafe
    // never-expiring choice.
    await updatedRow.getByRole('button', { name: /^Edit$/ }).click();
    await expect(page.locator('label', { hasText: /^Expiry/ }).locator('option[value="never"]')).toHaveCount(0);

    // ── Cancel doesn't persist changes ───────────────────────────────────────
    const cancelLabelInput = page.locator('label', { hasText: /^Label/ }).locator('input');
    await cancelLabelInput.fill('THIS_SHOULD_NOT_PERSIST');
    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.locator('label', { hasText: /^Label/ })).toHaveCount(0, { timeout: 10000 });
    await expect(rowByLabel(page, newLabel)).toBeVisible();
    await expect(page.locator('strong', { hasText: /THIS_SHOULD_NOT_PERSIST/ })).toHaveCount(0);
  });
});

test.describe('MagicLinksManager — actions', () => {
  let token;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
  });

  test('stored login tokens are hashed and cannot be copied back out', async ({ page, request, context }) => {
    // Grant clipboard perms up front so navigator.clipboard.writeText doesn't reject.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const label = `copy-${Date.now()}`;
    const link = await createLoginMagicLink(request, token, label);
    try {
      await signInBrowser(page);
      await gotoAdmin(page);
      await clickMagicLinksTab(page);

      const row = rowByLabel(page, label);
      await expect(row).toBeVisible({ timeout: 10000 });

      const copyBtn = row.getByRole('button', { name: /Token hidden/i });
      await expect(copyBtn).toBeDisabled();
    } finally {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=login&token=${link.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
  });

  test('Deactivate / Reactivate toggles the row state', async ({ page, request }) => {
    const label = `deact-${Date.now()}`;
    const link = await createLoginMagicLink(request, token, label);
    try {
      await signInBrowser(page);
      await gotoAdmin(page);
      await clickMagicLinksTab(page);

      const row = rowByLabel(page, label);
      await expect(row).toBeVisible({ timeout: 10000 });

      // Click Deactivate — with showInactive OFF (default), the row disappears.
      await row.getByRole('button', { name: /^Deactivate$/ }).click();
      await expect(rowByLabel(page, label)).toHaveCount(0, { timeout: 10000 });

      // Toggle Show inactive on — row reappears, showing Reactivate.
      await page.getByRole('checkbox', { name: /Show inactive \/ expired/i }).check();
      const deactivatedRow = rowByLabel(page, label);
      await expect(deactivatedRow).toBeVisible({ timeout: 10000 });
      await expect(deactivatedRow.getByRole('button', { name: /^Reactivate$/ })).toBeVisible();

      // Reactivate — button should switch back to "Deactivate".
      await deactivatedRow.getByRole('button', { name: /^Reactivate$/ }).click();
      await expect(rowByLabel(page, label).getByRole('button', { name: /^Deactivate$/ }))
        .toBeVisible({ timeout: 10000 });
    } finally {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=login&token=${link.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
  });

  test('Delete removes the row after confirming', async ({ page, request }) => {
    const label = `del-${Date.now()}`;
    const link = await createLoginMagicLink(request, token, label);

    await signInBrowser(page);
    await gotoAdmin(page);
    await clickMagicLinksTab(page);

    const row = rowByLabel(page, label);
    await expect(row).toBeVisible({ timeout: 10000 });

    // Register confirm-dialog handler BEFORE clicking Delete.
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: /^Delete$/ }).click();

    await expect(rowByLabel(page, label)).toHaveCount(0, { timeout: 10000 });

    // Sanity: confirm it's also gone from the API.
    const links = await getAllShareLinks(request, token);
    expect(links.find((l) => l.token === link.token)).toBeUndefined();
  });
});

test.describe('Per-track Magic Link button', () => {
  test('clicking creates a share link and flashes Copied!', async ({ page, request, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const token = await adminToken(request);
    const trackId = await getFirstTrackId(request, token);
    test.skip(!trackId, 'No tracks in the bucket — cannot test per-track magic link button');

    await signInBrowser(page);
    await gotoAdmin(page);

    // Tracks tab is the default — make sure we're on it.
    await page.getByRole('button', { name: /^Tracks$/i }).click();

    // Narrow to a specific track by typing its id into the search box so we
    // know exactly which row we're acting on.
    const search = page.getByPlaceholder(/Search tracks/i);
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill(trackId);

    // Walk up from the trackId span to a row div that has ANY button in its
    // subtree — this resolves to the track row wrapper and stays stable even
    // when the Magic Link button's text flips to "Copied!".
    const row = page
      .locator('span', { hasText: trackId })
      .locator('xpath=ancestor::div[.//button[normalize-space()="Edit"]][1]');
    await expect(row).toBeVisible({ timeout: 15000 });

    const btn = row.locator('button', { hasText: /Magic Link/ });
    await expect(btn).toBeVisible();

    // Snapshot existing track-share tokens for this trackId so we can diff.
    const before = await getAllShareLinks(request, token);
    const beforeTokens = new Set(
      before.filter((l) => l.kind === 'track' && l.trackId === trackId).map((l) => l.token),
    );

    await btn.click();

    // Button briefly shows "Copied!" then reverts to "Magic Link". The row
    // locator is keyed off the Edit button (stable) so it doesn't vanish
    // during the transition.
    await expect(row.locator('button', { hasText: /Copied!/ })).toBeVisible({ timeout: 10000 });
    await expect(row.locator('button', { hasText: /Magic Link/ })).toBeVisible({ timeout: 10000 });

    // Verify a new track-share link exists for this trackId.
    const after = await getAllShareLinks(request, token);
    const newOnes = after.filter(
      (l) => l.kind === 'track' && l.trackId === trackId && !beforeTokens.has(l.token),
    );
    expect(newOnes.length).toBeGreaterThanOrEqual(1);

    // Clean up the new link(s).
    for (const l of newOnes) {
      await request.delete(
        `${BASE}/api/admin/share-links?kind=track&token=${l.token}`,
        { headers: authHeaders(token) },
      ).catch(() => {});
    }
  });
});

test.describe('Dumps drag-and-drop file picker', () => {
  let token;
  let dumpToEdit;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    dumpToEdit = await createDump(request, token, `ui-dropzone-${Date.now()}`);
  });

  test.afterAll(async ({ request }) => {
    if (dumpToEdit) {
      await request.delete(`${BASE}/api/admin/dumps?id=${dumpToEdit.id}`, {
        headers: authHeaders(token),
      }).catch(() => {});
    }
  });

  test('create form exposes drop zone, stages audio, removes, clears, rejects non-audio', async ({ page }) => {
    await signInBrowser(page);
    await gotoAdmin(page);

    // Dumps tab.
    await page.getByRole('button', { name: /^Dumps$/i }).click();

    // Open "+ New Dump" — button text uses a + prefix in the source.
    const newDumpBtn = page.getByRole('button', { name: /New Dump/i });
    await expect(newDumpBtn).toBeVisible({ timeout: 10000 });
    await newDumpBtn.click();

    // Verify form chrome: "Select files" button + drop-zone text.
    await expect(page.getByRole('button', { name: /^Select files$/ })).toBeVisible();
    await expect(page.getByText(/Drag & drop audio files here/i)).toBeVisible();

    // Drop a fake mp3 via the hidden file input (scoped to create form).
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-track.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('fake mp3 data'),
    });

    // Staged file appears in the list.
    await expect(page.getByText('test-track.mp3').first()).toBeVisible({ timeout: 5000 });

    // × remove button exists and removes the file.
    const removeBtn = page.getByRole('button', { name: /Remove test-track\.mp3/i });
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();
    await expect(page.getByText('test-track.mp3')).toHaveCount(0);

    // Add file again, then click "Clear" — list goes empty.
    await fileInput.setInputFiles({
      name: 'test-track.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('fake mp3 data'),
    });
    await expect(page.getByText('test-track.mp3').first()).toBeVisible();
    await page.getByRole('button', { name: /^Clear$/ }).click();
    await expect(page.getByText('test-track.mp3')).toHaveCount(0);

    // Non-audio file → inline error mentions the allowed extensions.
    await fileInput.setInputFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not audio'),
    });
    await expect(page.getByText(/only MP3, WAV, AAC, AIFF, MP4, M4V, WebM, or MOV/i)).toBeVisible({ timeout: 5000 });

    // Cancel the create form.
    await page.getByRole('button', { name: /^Cancel$/ }).click();
  });

  test('edit modal also shows the same drop zone', async ({ page }) => {
    await signInBrowser(page);
    await gotoAdmin(page);
    await page.getByRole('button', { name: /^Dumps$/i }).click();

    // Find the dump we created in beforeAll and click its Edit. Same pitfall
    // as MagicLinksManager — walk up to the closest ancestor div that has an
    // Edit button.
    const dumpRow = page
      .locator('strong', { hasText: dumpToEdit.name })
      .locator('xpath=ancestor::div[.//button[normalize-space()="Edit"]][1]');
    await expect(dumpRow).toBeVisible({ timeout: 10000 });
    await dumpRow.getByRole('button', { name: /^Edit$/ }).click();

    // The DumpEditor modal should carry its own FileDropZone.
    await expect(page.getByRole('button', { name: /^Select files$/ })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Drag & drop audio files here/i)).toBeVisible();
  });
});
