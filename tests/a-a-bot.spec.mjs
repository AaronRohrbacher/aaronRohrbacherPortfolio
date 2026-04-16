import { test, expect } from '@playwright/test';

// A-A-Bot interaction tests. These cover the UI + behavior shape: panel
// open/close, collecting flows, offline action gating, intent routing to
// AC. They DO NOT exercise the fine-tuned Qwen model itself (that's a
// 500MB one-time download + 10+ seconds of generation per prompt, which
// isn't viable in per-test timeouts). Model generation is smoke-tested
// separately in a-a-bot-generate.spec.mjs.

async function openPanel(page) {
  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 15000 });
  await fab.click();
  await expect(page.locator('strong').filter({ hasText: /A-A-Bot/i })).toBeVisible();
}

test.describe('A-A-Bot UI + flows', () => {
  test('opens, shows greeting, shows quick actions', async ({ page }) => {
    await page.goto('/');
    await openPanel(page);
    await expect(page.getByText("I'm A-A-Bot, Aaron's AI assistant")).toBeVisible();
    await expect(page.locator('button', { hasText: 'Leave a message' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Request contact info' })).toBeVisible();
  });

  test('Leave a message — 3-step collecting flow submits to /api/chat-agent', async ({ page }) => {
    let captured = null;
    await page.route('**/api/chat-agent', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/');
    await openPanel(page);

    await page.locator('button', { hasText: 'Leave a message' }).first().click();
    await expect(page.getByText("What's your name?")).toBeVisible();

    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('Playwright Tester');
    await input.press('Enter');
    await expect(page.getByText(/best way for Aaron to reach you/i)).toBeVisible();

    await input.fill('tester@example.com');
    await input.press('Enter');
    await expect(page.getByText(/would you like to tell Aaron/i)).toBeVisible();

    await input.fill('Hello from the smoke test');
    await input.press('Enter');
    await expect(page.getByText(/Aaron will get back to you/i)).toBeVisible({ timeout: 10000 });

    expect(captured).not.toBeNull();
    expect(captured.type).toBe('message');
    expect(captured.name).toBe('Playwright Tester');
    expect(captured.contactMethod).toBe('tester@example.com');
    expect(captured.message).toBe('Hello from the smoke test');
  });

  test('Request contact info — 2-step collecting flow submits as contact_request', async ({ page }) => {
    let captured = null;
    await page.route('**/api/chat-agent', async (route) => {
      captured = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/');
    await openPanel(page);

    await page.locator('button', { hasText: 'Request contact info' }).first().click();
    await expect(page.getByText("What's your name?")).toBeVisible();

    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('Jane Doe');
    await input.press('Enter');
    await expect(page.getByText(/Where should Aaron send/i)).toBeVisible();

    await input.fill('jane@example.com');
    await input.press('Enter');
    await expect(page.getByText(/Aaron will send you his contact details/i)).toBeVisible({ timeout: 10000 });

    expect(captured).not.toBeNull();
    expect(captured.type).toBe('contact_request');
    expect(captured.name).toBe('Jane Doe');
    expect(captured.contactMethod).toBe('jane@example.com');
  });

  test('Bail out of collecting flow with "no"', async ({ page }) => {
    await page.goto('/');
    await openPanel(page);

    await page.locator('button', { hasText: 'Leave a message' }).first().click();
    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('no');
    await input.press('Enter');
    await expect(page.getByText(/What else can I help with/i)).toBeVisible();
  });

  // On localhost /api/connect-status returns offline (AC backend is CORS-
  // blocked), so we stub it to simulate an online agent for these tests.
  async function stubOnline(page, online = true) {
    await page.route('**/api/connect-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ online }),
      });
    });
  }

  test('Live chat action clicks the (hidden) AC widget button via openConnect', async ({ page }) => {
    await stubOnline(page, true);
    await page.goto('/');
    // Give the AC script time to mount the button, then instrument it.
    await page.waitForFunction(() => !!document.getElementById('amazon-connect-open-widget-button'), null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__ac_click_count = 0;
      const btn = document.getElementById('amazon-connect-open-widget-button');
      btn.addEventListener('click', () => { window.__ac_click_count++; }, true);
    });

    await openPanel(page);

    await page.locator('button', { hasText: 'Live chat' }).first().click();
    // openConnect is debounced ~400ms then clicks the hidden AC button.
    await page.waitForTimeout(1500);
    const clickCount = await page.evaluate(() => window.__ac_click_count ?? 0);
    expect(clickCount).toBeGreaterThanOrEqual(1);
  });

  test('Typing "connect me" routes to live chat (online: AC click; offline: notice)', async ({ page }) => {
    await stubOnline(page, true);
    await page.goto('/');
    await page.waitForFunction(() => !!document.getElementById('amazon-connect-open-widget-button'), null, { timeout: 15000 });
    await page.evaluate(() => {
      window.__ac_click_count = 0;
      const btn = document.getElementById('amazon-connect-open-widget-button');
      btn.addEventListener('click', () => { window.__ac_click_count++; }, true);
    });

    await openPanel(page);
    const input = page.locator('input[placeholder*="Ask about Aaron"]');
    await input.fill('connect me');
    await input.press('Enter');
    await page.waitForTimeout(1500);

    const clicked = await page.evaluate(() => window.__ac_click_count ?? 0);
    expect(clicked).toBeGreaterThanOrEqual(1);
  });

  test('Offline mode: Live chat / Voice / Video buttons hidden, leave-message still shown', async ({ page }) => {
    await stubOnline(page, false);
    await page.goto('/');
    await openPanel(page);

    // Online-only actions should not render.
    await expect(page.locator('button', { hasText: /^Live chat$/ })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /^Voice call$/ })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /^Video call$/ })).toHaveCount(0);
    // Offline still lets the user leave a message, request contact info,
    // or schedule a call (scheduling doesn't require AC online).
    await expect(page.locator('button', { hasText: 'Leave a message' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Request contact info' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Schedule a call' }).first()).toBeVisible();
  });

  test('Schedule a call — fetches slots, picks one, submits booking', async ({ page }) => {
    const fakeSlots = [
      { iso: '2026-05-01T18:00:00.000-07:00', label: 'Thu May 1, 11:00AM PT' },
      { iso: '2026-05-01T18:30:00.000-07:00', label: 'Thu May 1, 11:30AM PT' },
      { iso: '2026-05-02T18:00:00.000-07:00', label: 'Fri May 2, 11:00AM PT' },
    ];
    await page.route('**/api/schedule', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ slots: fakeSlots, lastSlotIso: fakeSlots.at(-1).iso }),
        });
        return;
      }
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        expect(body.slotIso).toBe(fakeSlots[1].iso);
        expect(body.customerName).toBe('Jane Scheduler');
        expect(body.contactMethod).toBe('jane@example.com');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, bookedLabel: fakeSlots[1].label, eventId: 'evt-xyz' }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/');
    await openPanel(page);

    await page.locator('button', { hasText: 'Schedule a call' }).first().click();
    await expect(page.getByText(/Here are Aaron's next open times/)).toBeVisible({ timeout: 10000 });
    // Verify at least one slot label is rendered
    await expect(page.getByText(fakeSlots[1].label)).toBeVisible();

    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('2'); // pick second slot
    await input.press('Enter');
    await expect(page.getByText(/What's your name for the calendar invite\?/)).toBeVisible();

    await input.fill('Jane Scheduler');
    await input.press('Enter');
    await expect(page.getByText(/email for the Google Calendar invite/)).toBeVisible();

    await input.fill('jane@example.com');
    await input.press('Enter');
    await expect(page.getByText(/Booked for Thu May 1, 11:30AM PT/)).toBeVisible({ timeout: 10000 });
  });

  test('Schedule a call — 503 falls back to take-a-message suggestion', async ({ page }) => {
    await page.route('**/api/schedule', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Scheduling not configured.', configured: false }),
      });
    });
    await page.goto('/');
    await openPanel(page);

    await page.locator('button', { hasText: 'Schedule a call' }).first().click();
    await expect(page.getByText(/Calendar booking isn't configured/i)).toBeVisible({ timeout: 10000 });
  });

  test('Typing "book a call" triggers schedule flow via intent', async ({ page }) => {
    await page.route('**/api/schedule', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slots: [{ iso: '2026-05-01T18:00:00.000-07:00', label: 'Thu May 1, 11:00AM PT' }],
          lastSlotIso: '2026-05-01T18:00:00.000-07:00',
        }),
      });
    });
    await page.goto('/');
    await openPanel(page);
    const input = page.locator('input[placeholder*="Ask about Aaron"]');
    await input.fill('book a call');
    await input.press('Enter');
    await expect(page.getByText(/Thu May 1, 11:00AM PT/)).toBeVisible({ timeout: 10000 });
  });

  test('Leave a message — dev fallback returns ok without Resend configured', async ({ page }) => {
    // Do NOT stub /api/chat-agent — let it hit the real dev endpoint so the
    // dev-mode fallback (log + return ok) is exercised end-to-end.
    await page.goto('/');
    await openPanel(page);

    await page.locator('button', { hasText: 'Leave a message' }).first().click();
    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('Dev Fallback Tester');
    await input.press('Enter');
    await input.fill('dev@fallback.test');
    await input.press('Enter');
    await input.fill('End-to-end dev-fallback smoke');
    await input.press('Enter');
    await expect(page.getByText(/Aaron will get back to you/i)).toBeVisible({ timeout: 10000 });
  });
});
