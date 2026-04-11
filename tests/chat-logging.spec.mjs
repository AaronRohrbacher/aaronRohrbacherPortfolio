import { test, expect } from '@playwright/test';

// AI ChatAgent commented out — see AI_COMMENTED_OUT.md. Skipped until reactivated.
test.skip(true, 'AI ChatAgent commented out — see AI_COMMENTED_OUT.md');

// Verifies that chat messages POST to /api/chat-log and firstMessage=true is
// set only on the first message of a session.

test.describe.configure({ mode: 'serial' });

test('chat messages are logged with session ID and first-message flag', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Intercept chat-log POSTs
  const logCalls = [];
  await page.route('**/api/chat-log', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      logCalls.push(body);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto('/');
  const fab = page.locator('button[aria-label="Open chat"]');
  await fab.click();
  await expect(page.locator('strong').filter({ hasText: "Aaron's AI Assistant" })).toBeVisible();

  // Send an off-topic question (instant redirect, no model needed)
  const input = page.locator('input[placeholder*="Ask about Aaron"]');
  await input.fill('What is the weather?');
  await input.press('Enter');
  await page.waitForTimeout(1500);

  // Should have logged: user message, assistant redirect
  expect(logCalls.length).toBeGreaterThanOrEqual(2);

  // First logged message: user's question, with firstMessage: true
  expect(logCalls[0].role).toBe('user');
  expect(logCalls[0].content).toContain('weather');
  expect(logCalls[0].firstMessage).toBe(true);
  expect(logCalls[0].sessionId).toBeTruthy();

  // Second logged message: assistant response, with firstMessage: false
  expect(logCalls[1].role).toBe('assistant');
  expect(logCalls[1].firstMessage).toBe(false);
  expect(logCalls[1].sessionId).toBe(logCalls[0].sessionId);

  // Send another message and confirm first-message flag stays false
  await input.fill('Another question');
  await input.press('Enter');
  await page.waitForTimeout(1500);

  const laterUserCall = logCalls.find((c, i) => i > 1 && c.role === 'user');
  expect(laterUserCall).toBeTruthy();
  expect(laterUserCall.firstMessage).toBe(false);
  expect(laterUserCall.sessionId).toBe(logCalls[0].sessionId);

  await ctx.close();
});
