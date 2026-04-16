import { test, expect, chromium } from '@playwright/test';

// Diagnostic using the FULL chromium (not chrome-headless-shell) with
// WebGPU enabled so we can actually test the webgpu EP path. Playwright's
// default headless mode uses chrome-headless-shell which has no WebGPU.
//
// Opt-in: A_A_BOT_WEBGPU=1.

test.skip(!process.env.A_A_BOT_WEBGPU, 'Set A_A_BOT_WEBGPU=1 to run the WebGPU diagnostic.');

test('WebGPU adapter + model load diag', async () => {
  test.setTimeout(600_000);

  // Two modes: "minimal" mimics the user's plain Chrome (no unsafe flags),
  // "enabled" uses our full WebGPU flag set. Pick via env WEBGPU_MODE.
  const mode = process.env.WEBGPU_MODE || 'enabled';
  const args = mode === 'minimal'
    ? ['--no-sandbox']
    : [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=vulkan',
        '--disable-dawn-features=disallow_unsafe_apis',
        '--no-sandbox',
      ];
  console.log(`\n=== WEBGPU_MODE=${mode} args=${JSON.stringify(args)} ===\n`);
  const browser = await chromium.launch({ headless: false, args });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  // First: just check navigator.gpu from the page.
  await page.goto('http://localhost:3000/');
  const gpuProbe = await page.evaluate(async () => {
    const out = { hasNavigatorGpu: typeof navigator.gpu !== 'undefined', adapter: null, adapterInfo: null, error: null };
    if (!out.hasNavigatorGpu) return out;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      out.adapter = !!adapter;
      if (adapter) {
        try {
          const info = typeof adapter.requestAdapterInfo === 'function'
            ? await adapter.requestAdapterInfo()
            : (adapter.info || null);
          out.adapterInfo = info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
        } catch (e) { out.adapterInfoErr = e.message; }
        out.limits = {};
        for (const k of Object.keys(adapter.limits || {})) out.limits[k] = adapter.limits[k];
      }
    } catch (e) {
      out.error = e.message || String(e);
    }
    return out;
  });
  console.log('\n==== WEBGPU PROBE ====');
  console.log(JSON.stringify(gpuProbe, null, 2));
  console.log('======================\n');

  // Then: drive the chat to actually load the model and capture logs.
  await page.locator('button[aria-label="Open chat"]').click();
  await page.locator('button').filter({ hasText: /Ask about Aaron/i }).click();
  await page.waitForTimeout(300);
  const input = page.locator('input[placeholder*="Ask about Aaron"]');
  await input.fill('cloud platforms?');
  await input.press('Enter');

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const bubbleCount = await page.locator('[class*="bubbleAI"]').count();
    if (bubbleCount >= 2) break;
    const erred = logs.some((l) => /Worker error|pipeline FAILED/i.test(l));
    if (erred) break;
    await page.waitForTimeout(500);
  }

  console.log('\n==== BROWSER CONSOLE ====');
  for (const l of logs) console.log(l);
  console.log('=========================\n');

  const bubbles = page.locator('[class*="bubbleAI"]');
  if (await bubbles.count() > 0) {
    console.log('LAST BUBBLE:', JSON.stringify(await bubbles.last().innerText()));
  }

  await browser.close();
});
