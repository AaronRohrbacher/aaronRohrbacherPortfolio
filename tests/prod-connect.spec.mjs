import { test, expect } from '@playwright/test';

test('local widget', async ({ page }) => {
  page.on('requestfailed', req => {
    if (!req.url().includes('google')) console.log('FAILED:', req.url(), req.failure()?.errorText);
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('connect') && !url.includes('google')) {
      console.log(`${resp.status()} ${url}`);
      if (resp.status() >= 400) try { console.log('body:', await resp.text()); } catch {}
    }
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(15000);

  const btn = page.locator('#amazon-connect-open-widget-button').first();
  if (await btn.isVisible()) {
    await btn.click({ force: true });
    await page.waitForTimeout(10000);
    const widget = page.locator('#amazon-connect-chat-widget').first();
    const text = await widget.innerText();
    console.log('Widget text:', text.substring(0, 300));
  } else {
    console.log('No button visible');
  }
});
