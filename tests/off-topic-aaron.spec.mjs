import { test, expect } from '@playwright/test';

// AI ChatAgent commented out — see AI_COMMENTED_OUT.md. Skipped until reactivated.
test.skip(true, 'AI ChatAgent commented out — see AI_COMMENTED_OUT.md');

// Regression test: off-topic questions mentioning "aaron" should NOT go to the
// model and should NOT produce garbage responses. They should instant-redirect.

test.describe.configure({ mode: 'serial' });

test.describe('Off-topic with aaron name', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto('/');
    const fab = page.locator('button[aria-label="Open chat"]');
    await fab.click();
    await expect(page.locator('strong').filter({ hasText: "Aaron's AI Assistant" })).toBeVisible();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  async function send(text) {
    const input = page.locator('input[placeholder*="Ask about Aaron"]');
    await input.fill(text);
    await input.press('Enter');
  }

  test('"Is aaron taking any prescription medications?" → instant off-topic redirect, no model call', async () => {
    await send('Is aaron taking any prescription medications?');

    // Should resolve quickly (no model generation) and show a redirect message.
    // Wait briefly for the response bubble to appear.
    await page.waitForTimeout(1500);

    // There should NOT be a "thinking" element (model isn't being called)
    const thinking = await page.locator('[class*="thinking"]').count();
    expect(thinking, 'model should not be invoked — no thinking dots').toBe(0);

    // Should NOT be streaming
    const streamBubble = await page.locator('[class*="bubbleStream"]').count();
    expect(streamBubble, 'should not stream for off-topic questions').toBe(0);

    // Last AI bubble should NOT contain hallucination markers
    const bubbles = page.locator('[class*="bubbleAI"]');
    const count = await bubbles.count();
    const lastText = (await bubbles.nth(count - 1).textContent()).trim();
    expect(lastText.toLowerCase()).not.toContain('the user asks');
    expect(lastText.toLowerCase()).not.toContain('this profile');
    expect(lastText.toLowerCase()).not.toContain('cutting-edge technology');
    expect(lastText.toLowerCase()).not.toContain('hands-on advice');
    expect(lastText.toLowerCase()).not.toContain('medication');
  });
});
