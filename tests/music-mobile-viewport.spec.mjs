import { test, expect } from '@playwright/test';
import { resetMusicDb } from './helpers/reset-music-db.mjs';

// Reset DB state before this file — specs preceding it in the playwright
// run mutate tracks/dumps and don't restore. See viewport-matrix for
// details.
test.beforeAll(async () => {
  await resetMusicDb();
});

test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

test('music front page: content visible above the fold on mobile', async ({ page }) => {
  await page.goto('http://music.localhost:3000');
  await page.waitForLoadState('networkidle');

  const body = await page.evaluate(() => ({
    scrollX: document.documentElement.scrollWidth,
    clientX: document.documentElement.clientWidth,
  }));
  // No horizontal overflow
  expect(body.scrollX).toBeLessThanOrEqual(body.clientX + 1);

  // At least one dump card or track must appear in the initial viewport —
  // otherwise Mom sees only the navbar+title and thinks it's broken.
  const firstItem = page.locator('a[href*="/dump/"], button[aria-label^="Play"]').first();
  await expect(firstItem).toBeVisible();
  const box = await firstItem.boundingBox();
  expect(box.y).toBeLessThan(500);
});

test('music front page: play a track, minimized bar is in-view and track list still visible', async ({ page }) => {
  await page.goto('http://music.localhost:3000');
  await page.waitForLoadState('networkidle');

  // Try to find a play button on a track and click it
  const playBtn = page.locator('button[aria-label^="Play"]').first();
  const count = await playBtn.count();
  if (count === 0) {
    test.skip(true, 'No tracks on /music — skipping player test');
    return;
  }

  await playBtn.click();

  const media = page.locator('video');
  await expect(media).toHaveCount(1);
  await media.evaluate((element) => { element.dataset.persistenceProbe = 'same-element'; });

  // Player bar should appear — in minimized form on mobile
  const miniBar = page.locator('button[aria-label="Expand player"]');
  await expect(miniBar).toBeVisible({ timeout: 5000 });

  // Check it's actually in viewport
  const barBox = await miniBar.boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  console.log('bar bottom:', barBox?.y + barBox?.height, 'viewport h:', vh);
  expect(barBox).not.toBeNull();
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(vh + 1);

  // The first track card should still be visible above the bar
  const firstTrack = page.locator('button[aria-label^="Play"], button[aria-label^="Pause"]').first();
  await expect(firstTrack).toBeVisible();
  const trackBox = await firstTrack.boundingBox();
  // The track should not be covered by the player bar
  expect(trackBox.y).toBeLessThan(barBox.y);

  // Expanding/minimizing changes only the controls. The one native media
  // element must remain mounted so lock-screen/background playback survives.
  await miniBar.click();
  await expect(page.locator('button[aria-label="Minimize player"]')).toBeVisible();
  await expect(media).toHaveAttribute('data-persistence-probe', 'same-element');
  await page.locator('button[aria-label="Minimize player"]').click();
  await expect(media).toHaveCount(1);
  await expect(media).toHaveAttribute('data-persistence-probe', 'same-element');
});

test('dump page: player defaults minimized on mobile and tracks visible', async ({ page, request }) => {
  // Fetch dumps list via SSR page and grab first dump slug
  await page.goto('http://music.localhost:3000');
  await page.waitForLoadState('networkidle');
  const dumpLink = page.locator('a[href*="/dump/"]').first();
  const linkCount = await dumpLink.count();
  if (linkCount === 0) {
    test.skip(true, 'No dump cards on /music — skipping dump test');
    return;
  }
  const href = await dumpLink.getAttribute('href');
  await page.goto(href);
  await page.waitForLoadState('networkidle');

  const playBtn = page.locator('button[aria-label^="Play"]').first();
  if ((await playBtn.count()) === 0) {
    test.skip(true, 'No tracks on dump page');
    return;
  }
  await playBtn.click();

  const miniBar = page.locator('button[aria-label="Expand player"]');
  await expect(miniBar).toBeVisible({ timeout: 5000 });
  const box = await miniBar.boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
});
