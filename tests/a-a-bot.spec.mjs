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
  // There's an A-A-Bot mention on the home page (hero tagline) in addition
  // to the panel header, so use the panel-specific text to target.
  await expect(page.getByText(/A-A-Bot · Aaron/i)).toBeVisible();
}

test.describe('A-A-Bot UI + flows', () => {
  test('opens, shows greeting, shows quick actions', async ({ page }) => {
    await page.goto('/');
    await openPanel(page);
    await expect(page.getByText("I'm A-A-Bot").first()).toBeVisible();
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

  // Stub the StartChatContact endpoint so we can count calls without
  // actually opening a WebSocket. Returns a malformed token so chatjs
  // fails fast (surfaced as a typed error message) — we only care that
  // the action reached our backend.
  async function stubStartChat(page) {
    let hits = 0;
    await page.route('**/api/connect-start-chat', async (route) => {
      hits++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contactId: 'stub-contact',
          participantId: 'stub-participant',
          participantToken: 'stub-token',
          region: 'us-west-2',
        }),
      });
    });
    return () => hits;
  }

  test('Live chat action POSTs /api/connect-start-chat', async ({ page }) => {
    await stubOnline(page, true);
    const hits = await stubStartChat(page);
    await page.goto('/');

    await openPanel(page);
    await page.locator('button', { hasText: 'Live chat' }).first().click();
    // startLiveChat is debounced ~400ms then fetches the endpoint.
    await page.waitForTimeout(2000);
    expect(hits()).toBeGreaterThanOrEqual(1);
  });

  test('Typing "connect me" routes to live chat (online: POSTs start-chat; offline: notice)', async ({ page }) => {
    await stubOnline(page, true);
    const hits = await stubStartChat(page);
    await page.goto('/');

    await openPanel(page);
    const input = page.locator('input[placeholder*="Ask about Aaron"]');
    await input.fill('connect me');
    await input.press('Enter');
    await page.waitForTimeout(2000);
    expect(hits()).toBeGreaterThanOrEqual(1);
  });

  test('Offline mode: Live chat hidden, offline presence banner shown, leave-message still shown', async ({ page }) => {
    await stubOnline(page, false);
    await page.goto('/');
    await openPanel(page);

    // Online-only actions should not render. Voice/video are gone entirely
    // (not just offline-gated) — they aren't implemented in the in-panel
    // client.
    await expect(page.locator('button', { hasText: /^Live chat$/ })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /^Voice call$/ })).toHaveCount(0);
    await expect(page.locator('button', { hasText: /^Video call$/ })).toHaveCount(0);
    // Offline presence banner shows status explicitly.
    await expect(page.getByText(/Aaron is offline/i).first()).toBeVisible();
    // Offline still lets the user leave a message, request contact info,
    // or schedule a call (scheduling doesn't require AC online).
    await expect(page.locator('button', { hasText: 'Leave a message' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Request contact info' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Schedule a call' }).first()).toBeVisible();
  });

  test('Online mode: presence banner is clickable; voice/video quick actions present', async ({ page }) => {
    await stubOnline(page, true);
    await page.goto('/');
    await openPanel(page);

    await expect(page.locator('button', { hasText: 'Voice call' }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Video call' }).first()).toBeVisible();

    const banner = page.getByText(/Aaron is online — tap to start a live chat/i).first();
    await expect(banner).toBeVisible();

    let hits = 0;
    await page.route('**/api/connect-start-chat', async (route) => {
      hits++;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ contactId: 's', participantId: 'p', participantToken: 't', region: 'us-west-2' }),
      });
    });
    await banner.click();
    await page.waitForTimeout(2000);
    expect(hits).toBeGreaterThanOrEqual(1);
  });

  test('Voice-call action POSTs /api/connect-start-rtc with video=false', async ({ page }) => {
    await stubOnline(page, true);
    let lastBody = null;
    await page.route('**/api/connect-start-rtc', async (route) => {
      try { lastBody = route.request().postDataJSON(); } catch { lastBody = null; }
      // Fail the call so Chime SDK init doesn't run — we only care the
      // action reaches the right endpoint with the right flag.
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stub"}' });
    });
    await page.goto('/');
    await openPanel(page);
    await page.locator('button', { hasText: 'Voice call' }).first().click();
    await page.waitForTimeout(2500);
    expect(lastBody).toMatchObject({ video: false });
  });

  test('Video-call action POSTs /api/connect-start-rtc with video=true', async ({ page }) => {
    await stubOnline(page, true);
    let lastBody = null;
    await page.route('**/api/connect-start-rtc', async (route) => {
      try { lastBody = route.request().postDataJSON(); } catch { lastBody = null; }
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stub"}' });
    });
    await page.goto('/');
    await openPanel(page);
    await page.locator('button', { hasText: 'Video call' }).first().click();
    await page.waitForTimeout(2500);
    expect(lastBody).toMatchObject({ video: true });
  });

  test('Chat disclaimer identifies A-A-Bot as Aaron\'s AI assistant + hallucination warning', async ({ page }) => {
    await stubOnline(page, true);
    await page.goto('/');
    await openPanel(page);
    await expect(page.getByText(/Aaron's AI assistant/i).first()).toBeVisible();
    await expect(page.getByText(/hallucinates facts/i)).toBeVisible();
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
