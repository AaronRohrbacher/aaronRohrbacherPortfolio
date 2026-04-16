import { test, expect } from '@playwright/test';

// Diagnostic spec — reproduce the "My model hiccuped" error path by
// opening the chat, clicking "Ask about Aaron" → typing a suggestion,
// and capturing every console message / page error so we can see the
// actual worker failure instead of guessing.
//
// Intentionally not asserting on success. The goal is to log what the
// worker reports when it errors, so we can fix the real root cause.
//
// Opt-in: set A_A_BOT_DIAG=1 to run.

test.skip(
  !process.env.A_A_BOT_DIAG,
  'Set A_A_BOT_DIAG=1 to run the chat worker diagnostic.',
);

test('capture worker error on suggestion click', async ({ page }) => {
  test.setTimeout(1_200_000); // 20 min — 1.2B decode on CPU WASM is slow

  const logs = [];
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    logs.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    logs.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`);
  });

  await page.goto('/');
  await page.locator('button[aria-label="Open chat"]').click();
  await expect(page.locator('strong').filter({ hasText: /A-A-Bot/i })).toBeVisible();

  // Click "Ask about Aaron" quick action to get the suggestions to show.
  await page.locator('button').filter({ hasText: /Ask about Aaron/i }).click();
  await page.waitForTimeout(500);

  // Type the exact question the user reported failing, bypassing chip clicks
  // so we hit the model path directly.
  const input = page.locator('input[placeholder*="Ask about Aaron"]');
  await input.fill('What cloud platforms?');
  await input.press('Enter');

  // Wait up to 15 minutes for a reply — 1.2B int8 on single-threaded WASM
  // takes several minutes to decode a ~120-token response.
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    const bubbleCount = await page.locator('[class*="bubbleAI"]').count();
    if (bubbleCount >= 2) break;
    const erred = logs.some((l) => /Worker error|hiccuped|pageerror/i.test(l));
    if (erred) break;
    await page.waitForTimeout(500);
  }

  // Dump everything captured.
  console.log('\n==== CAPTURED BROWSER LOGS ====');
  for (const line of logs) console.log(line);
  console.log('==== END CAPTURED LOGS ====\n');

  // Also dump the last assistant bubble text so we can see what the UI shows.
  const bubbles = page.locator('[class*="bubbleAI"]');
  const count = await bubbles.count();
  if (count > 0) {
    const last = await bubbles.nth(count - 1).innerText();
    console.log('LAST ASSISTANT BUBBLE:', JSON.stringify(last));
  }
});
