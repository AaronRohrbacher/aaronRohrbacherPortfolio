import { test, expect } from '@playwright/test';

// Diagnostic: measure WebLLM inference speed.
// Run with: A_A_BOT_DIAG=1 npx playwright test tests/a-a-bot-speed-diag.spec.mjs --headed

test.skip(
  !process.env.A_A_BOT_DIAG,
  'Set A_A_BOT_DIAG=1 to run.',
);

test('A-A-Bot multi-message speed diagnostic', async ({ page }) => {
  test.setTimeout(600_000);

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto('/');

  const webgpu = await page.evaluate(() => !!navigator.gpu);
  const hwConc = await page.evaluate(() => navigator.hardwareConcurrency);
  console.log(`WebGPU: ${webgpu}, hardwareConcurrency: ${hwConc}`);

  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 15000 });
  await fab.click();
  await expect(page.locator('strong').filter({ hasText: /A-A-Bot/i })).toBeVisible();

  const input = page.locator('input[placeholder*="Ask about Aaron"]');

  const ERROR_FALLBACKS = [
    'I tripped over that one',
    'My model hiccuped',
    'connect me',
  ];

  // Send a single message, wait for real inference reply, return elapsed seconds + reply.
  async function sendAndTime(prompt) {
    const startBubbleCount = await page.locator('[class*="bubbleAI"]:not([class*="bubbleStream"])').count();
    await input.fill(prompt);
    const startTime = Date.now();
    await input.press('Enter');

    let firstTokenTime = null;
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      const ai = await page.locator('[class*="bubbleAI"]:not([class*="bubbleStream"])').count();
      const streaming = await page.locator('[class*="bubbleStream"]').count();
      if (firstTokenTime === null && streaming > 0) {
        firstTokenTime = ((Date.now() - startTime) / 1000).toFixed(1);
      }
      if (ai > startBubbleCount) break;
      await page.waitForTimeout(500);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const reply = await page.locator('[class*="bubbleAI"]').last().innerText();
    const isErrorFallback = ERROR_FALLBACKS.some((s) => reply.includes(s));
    return { elapsed, firstTokenTime, reply, isErrorFallback };
  }

  // Send 3 messages in sequence. First pays the prefill cost; with useCache:true,
  // subsequent messages should reuse the system-prompt KV cache and skip prefill.
  const prompts = [
    'What does Aaron do?',
    'What AWS services does he know?',
    'Does he play any instruments?',
  ];

  const results = [];
  for (const p of prompts) {
    console.log(`\n→ Sending: "${p}"`);
    const r = await sendAndTime(p);
    results.push({ prompt: p, ...r });
    console.log(`  total=${r.elapsed}s first-token=${r.firstTokenTime}s errorFallback=${r.isErrorFallback}`);
    console.log(`  reply: ${r.reply.slice(0, 200).replace(/\n/g, ' ')}`);
  }

  console.log(`\n==== DIAGNOSTIC RESULTS ====`);
  console.log(`WebGPU: ${webgpu}, hardwareConcurrency: ${hwConc}`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`Msg ${i + 1}: total=${r.elapsed}s  firstToken=${r.firstTokenTime}s  errorFallback=${r.isErrorFallback}`);
  }
  console.log(`==== END DIAGNOSTIC ====\n`);

  // If any message hit the error fallback, dump all captured console/page errors
  // so the failure is debuggable.
  if (results.some((r) => r.isErrorFallback)) {
    console.log(`\n==== CONSOLE LOGS (${logs.length}) ====`);
    for (const l of logs) console.log(l);
    console.log(`==== END CONSOLE LOGS ====\n`);
  }

  // All messages must produce real inference (not error fallback).
  for (const r of results) {
    expect(r.isErrorFallback).toBe(false);
    expect(r.reply.trim().length).toBeGreaterThan(10);
  }
});
