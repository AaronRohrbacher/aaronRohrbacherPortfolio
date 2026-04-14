import { test, expect } from '@playwright/test';

const DEVICES = [
  { name: 'iPhone-SE1-320', w: 320, h: 568 },
  { name: 'iPhone-SE3-375', w: 375, h: 667 },
  { name: 'iPhone-14-Pro',  w: 390, h: 844 },
  { name: 'iPhone-PM-430',  w: 430, h: 932 },
];

for (const d of DEVICES) {
  test(`active player fits @ ${d.name}`, async ({ page }) => {
    await page.setViewportSize({ width: d.w, height: d.h });
    await page.goto('/music/dump/tune-dump?share=d99c7b291aa3c71b81e9bd6d7a0b457041b60d48ddd56b16342491c59aa50283');
    await page.waitForLoadState('networkidle');
    await page.locator('button[class*="playBtn"]').first().click();
    await expect(page.locator('button[aria-label="Pause"]').first()).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/player-${d.name}.png`, fullPage: false });

    // The expanded player's bottom should not exceed viewport
    const bar = page.locator('[class*="bar"]').filter({ has: page.locator('[class*="expandedBar"]') }).first();
    const box = await bar.boundingBox();
    expect.soft(box, `no player bar on ${d.name}`).not.toBeNull();
    if (box) {
      expect.soft(box.y + box.height, `player overflows bottom on ${d.name}`).toBeLessThanOrEqual(d.h + 1);
      expect.soft(box.x + box.width, `player overflows right on ${d.name}`).toBeLessThanOrEqual(d.w + 1);
    }
    // No horizontal doc overflow
    const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect.soft(doc.sw, `h-overflow on ${d.name}`).toBeLessThanOrEqual(doc.cw + 1);
  });
}
