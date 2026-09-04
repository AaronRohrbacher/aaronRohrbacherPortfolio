import { test, expect } from '@playwright/test';

// End-to-end test: live chat with Aaron happens INSIDE the A-A-Bot panel
// (no Connect-hosted widget popup). Exercises StartChatContact → ChatSession
// WebSocket → inbound bot messages rendered as agent bubbles → outbound
// sendMessage.

test.describe.configure({ mode: 'serial' });

test('live chat opens in-panel and receives flow greeting', async ({ page }) => {
  test.skip(process.env.RUN_LIVE_CONNECT_TESTS !== '1', 'Requires live Amazon Connect chat infrastructure');
  test.setTimeout(90000);

  // Forward browser console + page errors to the test runner so failures
  // inside the chatjs bundle aren't swallowed.
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      console.log(`[browser ${t}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => { console.log(`[pageerror] ${err.message}`); });

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Open ChatAgent
  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 15000 });
  await fab.click();
  await expect(page.locator('text=A-A-Bot · Aaron\'s AI Assistant')).toBeVisible();

  // Trigger live chat quick action
  const liveChatBtn = page.getByRole('button', { name: /Live chat/i }).first();
  await expect(liveChatBtn).toBeVisible();
  await liveChatBtn.click();

  // Header should transition to connecting / connected.
  await expect(page.locator('text=/Connecting you to Aaron|Live chat with Aaron/i').first())
    .toBeVisible({ timeout: 20000 });

  // Wait for connected state (header copy changes).
  await expect(page.locator('text=Live chat with Aaron')).toBeVisible({ timeout: 25000 });

  // A bubble from the bot/agent should arrive within ~20s. The Connect
  // inbound flow emits either the greeting ("A-A-Bot" self-intro) or a
  // routing message. Accept either — what matters is we see a server
  // message rendered as an agent bubble inside our panel.
  const agentBubble = page.locator('[class*="bubbleAgent"]').first();
  await expect(agentBubble).toBeVisible({ timeout: 25000 });
  // Must contain actual server-delivered text, not just an empty bubble.
  const agentText = (await agentBubble.innerText()).trim();
  expect(agentText.length).toBeGreaterThan(5);
  console.log(`[test] agent bubble: "${agentText.slice(0, 120)}"`);

  // If Aaron is online (/api/connect-status says so), the flow MUST reach
  // the online menu ("Looks like he's online and ready to take your call")
  // — not the offline menu ("Aaron has stepped away"). Regression guard
  // against the CheckMetricData+AgentId bug.
  const statusRes = await page.request.get('http://localhost:3000/api/connect-status');
  const { online } = await statusRes.json();
  if (online) {
    // Give the flow up to 20s to emit the menu after the greeting.
    const onlineMenuSeen = await page.locator('[class*="bubbleAgent"]', {
      hasText: /online and ready to take your call/i,
    }).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    const offlineMenuSeen = await page.locator('[class*="bubbleAgent"]', {
      hasText: /Aaron has stepped away/i,
    }).first().isVisible().catch(() => false);
    expect(offlineMenuSeen, 'offline menu should NOT appear when status is online').toBe(false);
    expect(onlineMenuSeen, 'online menu should appear when status is online').toBe(true);
  }

  // Send an outbound message through the ChatJS session.
  const input = page.locator('input[placeholder*="Message Aaron"]');
  await expect(input).toBeVisible();
  await input.fill('Playwright e2e test');
  await input.press('Enter');

  // Our outbound message appears as a user bubble.
  await expect(page.locator('[class*="bubbleUser"]:has-text("Playwright e2e test")'))
    .toBeVisible({ timeout: 10000 });

  // End the chat.
  const endBtn = page.getByRole('button', { name: /Disconnect from Aaron/i });
  await endBtn.click();
  // Disconnect message copy (exact ask from Aaron).
  await expect(page.getByText(/chat has disconnected.*re-connect/i).first())
    .toBeVisible({ timeout: 15000 });
});
