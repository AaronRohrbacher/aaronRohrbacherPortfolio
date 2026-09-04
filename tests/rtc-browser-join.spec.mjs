import { test, expect, chromium } from '@playwright/test';

// End-to-end: click Voice call in the browser with fake mic, verify the
// Chime SDK actually joins the meeting (WebSocket opens to Chime). This
// exercises everything from button click → /api/connect-start-rtc →
// ChatAgent's Chime init → meeting join. Uses Chromium fake-media flags
// so there's no real hardware dep.

async function launchWithFakeMedia() {
  return chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

test('Voice call: Chime SDK joins the meeting (WebSocket opens)', async () => {
  test.skip(process.env.RUN_LIVE_CONNECT_TESTS !== '1', 'Requires live Amazon Chime infrastructure');
  test.setTimeout(60000);
  const browser = await launchWithFakeMedia();
  const ctx = await browser.newContext({
    permissions: ['microphone'],
  });
  const page = await ctx.newPage();

  const chimeWs = [];
  page.on('websocket', (ws) => {
    const url = ws.url();
    if (/chime/i.test(url) || /signal\.m3/i.test(url)) chimeWs.push(url);
  });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.locator('button[aria-label="Open chat"]').click();
  await expect(page.getByText(/A-A-Bot · Aaron/i)).toBeVisible();

  await page.locator('button', { hasText: 'Voice call' }).first().click();

  // Wait for Chime signaling WebSocket to open (means MeetingSession.start()
  // succeeded and the SDK reached the Chime media server).
  await expect.poll(() => chimeWs.length, {
    timeout: 25000,
    message: `Chime WebSocket never opened. Console errors: ${consoleErrors.join(' | ')}`,
  }).toBeGreaterThan(0);

  console.log(`[test] Chime signaling opened: ${chimeWs[0]}`);

  // UI reflects connected state.
  await expect(page.getByText(/Voice call with Aaron — live/i)).toBeVisible({ timeout: 10000 });

  // End-call button exists below input.
  await expect(page.getByRole('button', { name: /End voice call/i })).toBeVisible();

  await browser.close();
});

test('Video call: Chime SDK joins meeting + video element attached', async () => {
  test.skip(process.env.RUN_LIVE_CONNECT_TESTS !== '1', 'Requires live Amazon Chime infrastructure');
  test.setTimeout(60000);
  const browser = await launchWithFakeMedia();
  const ctx = await browser.newContext({
    permissions: ['microphone', 'camera'],
  });
  const page = await ctx.newPage();

  const chimeWs = [];
  page.on('websocket', (ws) => {
    const url = ws.url();
    if (/chime/i.test(url) || /signal\.m3/i.test(url)) chimeWs.push(url);
  });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.locator('button[aria-label="Open chat"]').click();
  await page.locator('button', { hasText: 'Video call' }).first().click();

  await expect.poll(() => chimeWs.length, {
    timeout: 25000,
    message: `Chime WS never opened. Console: ${consoleErrors.join(' | ')}`,
  }).toBeGreaterThan(0);

  await expect(page.getByText(/Video call with Aaron — live/i)).toBeVisible({ timeout: 10000 });

  // Video elements present in DOM.
  const videoCount = await page.locator('video').count();
  expect(videoCount).toBeGreaterThanOrEqual(2); // remote + local

  await browser.close();
});
