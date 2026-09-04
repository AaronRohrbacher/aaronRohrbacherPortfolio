import { test, expect } from '@playwright/test';
import { resetMusicDb } from './helpers/reset-music-db.mjs';

// Reset DB state before this file runs — the preceding specs in the run
// (music.spec.mjs, share-links, multi-dump) publish/unpublish tracks and
// create/delete test dumps without restoring. Without this the /music
// page is empty by the time these viewport tests hit it.
test.beforeAll(async () => {
  await resetMusicDb();
});

const DEVICES = [
  { name: 'iPhone-SE1-320', w: 320, h: 568 },
  { name: 'Galaxy-S-360',   w: 360, h: 740 },
  { name: 'iPhone-SE3-375', w: 375, h: 667 },
  { name: 'iPhone-13-mini', w: 375, h: 812 },
  { name: 'iPhone-14-Pro',  w: 390, h: 844 },
  { name: 'iPhone-PM-430',  w: 430, h: 932 },
  { name: 'iPad-mini-768',  w: 768, h: 1024 },
];

const TARGETS = [
  { name: 'home',     path: 'http://music.localhost:3000' },
  { name: 'dump',     path: 'http://music.localhost:3000/dump/tune-dump?share=d99c7b291aa3c71b81e9bd6d7a0b457041b60d48ddd56b16342491c59aa50283' },
];

for (const device of DEVICES) {
  for (const target of TARGETS) {
    test(`${target.name} @ ${device.name}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: device.w, height: device.h });
      await page.goto(target.path);
      await page.waitForLoadState('networkidle');

      // No horizontal overflow
      const doc = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        scrollH: document.documentElement.scrollHeight,
      }));
      expect.soft(doc.scrollW, `horizontal overflow on ${target.name}@${device.name}`).toBeLessThanOrEqual(doc.clientW + 1);

      // A primary action (play button or dump card) must be visible in the initial viewport
      const primary = page.locator('button[class*="playBtn"], a[href*="/dump/"]').first();
      const count = await primary.count();
      expect(count, `no primary interactive on ${target.name}@${device.name}`).toBeGreaterThan(0);
      const box = await primary.boundingBox();
      expect.soft(box, `primary has no box on ${target.name}@${device.name}`).not.toBeNull();
      if (box) {
        expect.soft(box.y, `primary below fold (y=${box.y}) on ${target.name}@${device.name}`).toBeLessThan(device.h);
        expect.soft(box.y + box.height, `primary bottom past viewport on ${target.name}@${device.name}`).toBeLessThanOrEqual(device.h + 200); // allow some scroll
        expect.soft(box.x + box.width, `primary past viewport width on ${target.name}@${device.name}`).toBeLessThanOrEqual(device.w + 1);
      }

      // Save a screenshot for visual review
      await page.screenshot({
        path: `/tmp/vp-${target.name}-${device.name}.png`,
        fullPage: false,
      });

      expect(errors, `page errors on ${target.name}@${device.name}`).toEqual([]);
    });
  }
}
