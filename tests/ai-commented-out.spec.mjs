import { test, expect } from '@playwright/test';

// A-A-Bot (the in-browser AI chat) is live again. The filename is kept for
// git-history continuity; the assertions below cover the re-enabled state.
//
// What we verify on localhost (the Connect chat *backend* is CORS-blocked
// on localhost, so we can only smoke-test the wiring — the end-to-end live
// chat flow is covered by prod-connect.spec.mjs and connect-chat.spec.mjs):
//
//   1. A-A-Bot's floating FAB is mounted and clickable.
//   2. The Amazon Connect script loaded and registered window.amazon_connect.
//   3. A-A-Bot hid the AC widget button (CSS injection), so A-A-Bot is the
//      only visible chat entry point.
//   4. Each page's trigger dispatches 'open-chat-agent' and the A-A-Bot
//      panel opens in response.
//   5. /api/ask still reachable and /music page still loads (regression
//      protection for unrelated features).

const AC_CONTAINER = '#amazon-connect-chat-widget';

async function waitForAcReady(page) {
  await expect(page.locator(AC_CONTAINER)).toBeAttached({ timeout: 15000 });
  await page.waitForFunction(() => typeof window.amazon_connect === 'function', null, { timeout: 15000 });
}

async function expectFab(page) {
  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 15000 });
  return fab;
}

async function expectPanelOpen(page) {
  // A-A-Bot appears twice (home hero tagline + panel header); target the panel header.
  await expect(page.getByText(/A-A-Bot · Aaron/i)).toBeVisible({ timeout: 5000 });
}

test.describe('A-A-Bot live + Amazon Connect integration', () => {
  test('home: A-A-Bot FAB mounted, AC script loaded, AC button hidden', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await waitForAcReady(page);
    await expectFab(page);

    // AC widget button exists in DOM but is CSS-hidden by A-A-Bot.
    const acButtonHidden = await page.evaluate(() => {
      const btn = document.getElementById('amazon-connect-open-widget-button');
      if (!btn) return 'no-element';
      const cs = getComputedStyle(btn);
      return cs.display;
    });
    expect(acButtonHidden === 'none' || acButtonHidden === 'no-element').toBe(true);

    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toEqual([]);
  });

  test("home: Let's Chat! dispatches open-chat-agent and opens A-A-Bot panel", async ({ page }) => {
    await page.goto('/');
    await waitForAcReady(page);
    await expectFab(page);

    await page.getByRole('button', { name: /^Let's Chat!$/ }).click();
    await expectPanelOpen(page);
  });

  test('contact: Open Chat dispatches open-chat-agent and opens A-A-Bot panel', async ({ page }) => {
    await page.goto('/contact');
    await waitForAcReady(page);
    await expectFab(page);

    // Match only by visible text "Open Chat" (capital C) — the FAB's
    // accessible name is "Open chat" (lowercase), so a case-sensitive regex
    // uniquely matches the contact button.
    await page.getByRole('button', { name: /Open Chat/ }).first().click();
    await expectPanelOpen(page);
  });

  test('resume: A-A-Bot FAB mounted on /resume, page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/resume');
    await waitForAcReady(page);
    await expectFab(page);
    // Ignore ResizeObserver noise framer-motion occasionally emits.
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toEqual([]);
  });

  test('music page still loads (no regressions)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto('http://music.localhost:3000', { waitUntil: 'domcontentloaded' });
    expect(res.status()).toBeLessThan(400);
    // Using 'load' instead of 'networkidle' — A-A-Bot and AC keep the
    // page active long after first paint, so 'networkidle' would time out.
    await page.waitForLoadState('load');
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toEqual([]);
  });

  test('api/ask route still reachable', async ({ request }) => {
    const res = await request.post('/api/ask', { data: {} });
    expect(res.status()).not.toBe(404);
  });
});
