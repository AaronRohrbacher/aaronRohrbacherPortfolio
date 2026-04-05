import { test, expect } from '@playwright/test';

// What's testable on localhost (AC's chat backend is CORS-blocked here):
//  1. AI floating chat is NOT mounted (Transformers.js fab absent).
//  2. Amazon Connect script loaded and registered window.amazon_connect.
//  3. window.__connectLaunch is a function on every page that needs it —
//     this proves AmazonConnect.jsx's customLaunchBehavior queue call
//     was consumed by the AC SDK after script load. If this is missing,
//     the page buttons are broken.
//  4. Each page's AC-launch button is present and clicking it throws no error.
//  5. Music page still loads; api/ask still routes.

const AC_CONTAINER = '#amazon-connect-chat-widget';

async function countAiFab(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button[aria-label="Open chat"], button[aria-label="Close chat"]'));
    return buttons.filter(b => !b.closest('#amazon-connect-chat-widget')).length;
  });
}

async function waitForAcReady(page) {
  await expect(page.locator(AC_CONTAINER)).toBeAttached({ timeout: 15000 });
  // AC SDK finished processing the customLaunchBehavior queue call.
  await page.waitForFunction(() => typeof window.__connectLaunch === 'function', null, { timeout: 15000 });
  await page.waitForFunction(() => typeof window.amazon_connect === 'function', null, { timeout: 15000 });
}

async function clickSafely(locator, page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(locator).toBeVisible();
  await locator.click();
  return errors;
}

test.describe('AI commented out, Amazon Connect restored', () => {
  test('home: AC script loaded, __connectLaunch registered, AI fab absent, Let\'s Chat! clicks clean', async ({ page }) => {
    await page.goto('/');
    await waitForAcReady(page);
    expect(await countAiFab(page)).toBe(0);
    const errors = await clickSafely(page.getByRole('button', { name: /Let's Chat!/ }), page);
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toEqual([]);
  });

  test('resume: AC script loaded, __connectLaunch registered, AI fab absent, Open AI Chat clicks clean', async ({ page }) => {
    await page.goto('/resume');
    await waitForAcReady(page);
    expect(await countAiFab(page)).toBe(0);
    const openAiChat = page.getByRole('button', { name: /Open AI Chat/i });
    if (!(await openAiChat.isVisible().catch(() => false))) {
      const tab = page.getByRole('button', { name: /^Ask AI|^AI$/i }).first();
      if (await tab.isVisible().catch(() => false)) await tab.click();
    }
    const errors = await clickSafely(openAiChat, page);
    expect(errors).toEqual([]);
  });

  test('contact: AC script loaded, __connectLaunch registered, AI fab absent, Open Chat clicks clean', async ({ page }) => {
    await page.goto('/contact');
    await waitForAcReady(page);
    expect(await countAiFab(page)).toBe(0);
    const errors = await clickSafely(page.getByRole('button', { name: /Open Chat/i }), page);
    expect(errors).toEqual([]);
  });

  test('music page still loads (new feature not broken)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto('/music');
    expect(res.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('api/ask route still reachable (not commented out)', async ({ request }) => {
    const res = await request.post('/api/ask', { data: {} });
    expect(res.status()).not.toBe(404);
  });
});
