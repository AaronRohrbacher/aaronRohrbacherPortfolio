import { test, expect } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

const MAIN = 'http://localhost:3000';
const MUSIC = 'http://music.localhost:3000';
const PORTAPUTER = 'http://portaputer.localhost:3000';

async function assertMobileAdmin(page, rootSelector, { controlsRequired = true } = {}) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  const controls = page.locator(rootSelector).locator(
    'button:visible, input:not([type="checkbox"]):not([type="radio"]):visible, select:visible'
  );
  const count = await controls.count();
  if (controlsRequired) expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    if (box) expect.soft(box.height, `control ${index} is not touch-safe`).toBeGreaterThanOrEqual(42);
  }
}

test.use({ viewport: { width: 320, height: 700 } });

test('Main admin is mobile-safe without horizontal overflow', async ({ page }) => {
  await page.goto(`${MAIN}/admin`);
  await page.locator('input[type="password"]').fill(process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '');
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio Admin' })).toBeVisible();
  await assertMobileAdmin(page, '[data-testid="main-admin-root"]');
});

test('Music admin tabs are mobile-safe without horizontal overflow', async ({ page, request }) => {
  const signedIn = await request.post(`${MUSIC}/api/auth/signin`, {
    data: { email: 'admin@local.dev', password: 'admin' },
  });
  const { idToken } = await signedIn.json();
  await page.goto(`${MUSIC}/`);
  await page.evaluate((token) => localStorage.setItem('music_auth_token', token), idToken);
  await page.goto(`${MUSIC}/admin`);
  await expect(page.getByRole('button', { name: 'Tracks', exact: true })).toBeVisible();

  for (const tab of ['Tracks', 'Dumps', 'Users', 'Groups', 'Magic links', 'Events', 'Settings']) {
    await page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).click();
    await assertMobileAdmin(page, '[data-testid="music-admin-root"]');
  }
});

test('PortaPuter admin is mobile-safe without horizontal overflow', async ({ page, request }) => {
  const signedIn = await request.post(`${MUSIC}/api/auth/signin`, {
    data: { email: 'admin@local.dev', password: 'admin' },
  });
  const { idToken } = await signedIn.json();
  await page.goto(`${PORTAPUTER}/`);
  await page.evaluate((token) => localStorage.setItem('music_auth_token', token), idToken);
  await page.goto(`${PORTAPUTER}/admin`);
  await expect(page.getByRole('heading', { name: 'PortaPuter Downloads' })).toBeVisible();
  await assertMobileAdmin(page, '[data-testid="portaputer-admin-root"]', { controlsRequired: false });
});
