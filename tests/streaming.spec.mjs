import { test, expect } from '@playwright/test';

// Obsolete: this spec targeted the old "fact retrieval vs all-facts" streaming
// branches that no longer exist. A-A-Bot now always streams all facts through
// the model. Leaving the file in place for history; suite is skipped.
test.skip(true, 'Obsolete after A-A-Bot fine-tune — single streaming path now.');

// Targeted tests for streaming behavior:
// - Fact-matched questions → thinking dots (no stream bubble, final content appears in one shot)
// - On-topic all-facts questions → stream bubble visible, content grows over time

test.describe.configure({ mode: 'serial' });

test.describe('ChatAgent streaming', () => {
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

  async function waitForIdle(timeout = 120000) {
    await page.waitForFunction(() => document.querySelectorAll('.fa-spinner').length === 0, { timeout });
  }

  test('fact-matched question: shows thinking dots, NO stream bubble', async () => {
    // "What languages does he know?" matches languages fact → thinking dots mode
    await send('What languages does he know?');

    // Wait for generation to start (thinking dots appear)
    const thinking = page.locator('[class*="thinking"]');
    const streamBubble = page.locator('[class*="bubbleStream"]');

    // Sample during generation: should see thinking dots, should NOT see stream bubble
    let sawThinking = false;
    let sawStream = false;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (await thinking.count() > 0) sawThinking = true;
      if (await streamBubble.count() > 0) sawStream = true;
      const spinners = await page.locator('.fa-spinner').count();
      if (spinners === 0 && sawThinking) break;
      await page.waitForTimeout(100);
    }

    expect(sawThinking, 'fact-matched should show thinking dots').toBe(true);
    expect(sawStream, 'fact-matched should NOT show stream bubble').toBe(false);
    await waitForIdle();
  });

  test('on-topic all-facts question: stream bubble appears and grows', async () => {
    // On-topic (DOMAIN_RE: "hire") — goes to the model with full facts injected.
    await send('Can someone hire him?');

    const streamBubble = page.locator('[class*="bubbleStream"]');
    const lengths = [];
    let sawStream = false;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const count = await streamBubble.count();
      if (count > 0) {
        sawStream = true;
        const txt = await streamBubble.first().textContent();
        lengths.push((txt || '').length);
      }
      const spinners = await page.locator('.fa-spinner').count();
      if (spinners === 0 && sawStream) break;
      await page.waitForTimeout(100);
    }

    expect(sawStream, 'all-facts mode should show stream bubble').toBe(true);
    // Length should grow across samples (strictly increase at some point)
    const grew = lengths.some((len, i) => i > 0 && len > lengths[i - 1]);
    expect(grew, `stream bubble content should grow (lengths: ${lengths.join(',')})`).toBe(true);
    await waitForIdle();
  });
});
