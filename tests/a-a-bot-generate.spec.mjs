import { test, expect } from '@playwright/test';

// A-A-Bot fine-tuned Qwen2 model smoke test — BROWSER side.
//
// WARNING: this test is not practical in headless Chrome. Playwright's
// chrome-headless-shell uses single-threaded ONNX-WASM (SharedArrayBuffer
// and WebGPU are both unavailable), so loading a ~500MB quantized Qwen2
// takes longer than any reasonable timeout. Real Chrome with WebGPU runs
// the same model in seconds, so this spec is the right smoke test for
// manual QA against a real browser (`--headed --browser=chromium`) and is
// opt-in via A_A_BOT_GENERATE=1.
//
// For a fast, deterministic model-works check, see
// tests/unit/model-loads.test.mjs which loads the exact same files via
// the multi-threaded native ONNX runtime in Node
// (`A_A_BOT_NODE_LOAD=1 node --test tests/unit/model-loads.test.mjs`).

test.skip(
  !process.env.A_A_BOT_GENERATE,
  'Set A_A_BOT_GENERATE=1 to run the browser model test (needs real Chrome or 30+ minutes on headless WASM).',
);

async function openPanel(page) {
  const fab = page.locator('button[aria-label="Open chat"]');
  await expect(fab).toBeVisible({ timeout: 15000 });
  await fab.click();
  await expect(page.locator('strong').filter({ hasText: /A-A-Bot/i })).toBeVisible();
}

test('A-A-Bot generates a response about Aaron from the fine-tuned model', async ({ page }) => {
  test.setTimeout(600_000); // model download + generation

  await page.goto('/');
  await openPanel(page);

  const input = page.locator('input[placeholder*="Ask about Aaron"]');
  await input.fill('What programming languages does Aaron know?');
  await input.press('Enter');

  // Wait for generation to finish — worker goes idle when no spinner visible
  // and at least one assistant bubble has appeared after our user message.
  const bubbles = page.locator('[class*="bubbleAI"]');
  await expect.poll(
    async () => await bubbles.count(),
    { timeout: 540_000, intervals: [2000] },
  ).toBeGreaterThan(1); // greeting + at least one reply

  const last = await bubbles.last().innerText();
  // The model was fine-tuned on the fact "Aaron's programming languages
  // include JavaScript, TypeScript, Python, Ruby, Java, Kotlin, Swift, Rust,
  // PHP, SQL, and Bash." We don't assert exact phrasing — just that at
  // least one real language from that list shows up.
  expect(last).toMatch(
    /JavaScript|TypeScript|Python|Ruby|Kotlin|Swift|Rust|PHP|SQL|Bash/i,
  );
});
