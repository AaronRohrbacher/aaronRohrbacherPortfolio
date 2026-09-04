import { test } from '@playwright/test';
test.use({ viewport: { width: 375, height: 812 } });

test('check the download URLs and their auth behavior', async ({ page }) => {
  await page.goto('http://music.localhost:3000/dump/tune-dump?share=d99c7b291aa3c71b81e9bd6d7a0b457041b60d48ddd56b16342491c59aa50283');
  await page.waitForLoadState('networkidle');

  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="trackCard"]');
    return Array.from(cards).map((card, i) => {
      const btns = card.querySelectorAll('a[class*="downloadBtn"]');
      return Array.from(btns).map((a) => a.getAttribute('href'));
    });
  });
  console.log('dump page download hrefs:', JSON.stringify(info, null, 2));

  // Directly hit each download URL and report status
  for (const hrefs of info) {
    for (const href of hrefs) {
      const res = await page.request.get('http://localhost:3000' + href, { maxRedirects: 0 });
      console.log(`  ${res.status()}  ${href.slice(0, 100)}`);
    }
  }
});
