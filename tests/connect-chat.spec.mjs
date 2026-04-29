import { test, expect } from '@playwright/test';

// Obsolete: this test targeted the Connect-hosted chat widget popup. Live
// chat now runs inside the A-A-Bot panel via amazon-connect-chatjs — see
// tests/live-chat-in-panel.spec.mjs.
test.skip(true, 'Connect-hosted widget removed; replaced by in-panel live chat (see live-chat-in-panel.spec.mjs)');

async function sendMessage(chatFrame, page, text) {
  await page.waitForTimeout(2000);
  const input = chatFrame.locator('div[contenteditable="true"][role="textbox"]').first();
  await input.click();
  await input.fill(text);
  await input.press('Enter');
  console.log(`Sent: "${text}"`);
}

async function waitForNewBotMessage(chatFrame, page, keyword, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await chatFrame.locator('body').innerText({ timeout: 5000 });
    if (text.includes(keyword)) {
      await page.waitForTimeout(2000);
      return text;
    }
    await page.waitForTimeout(2000);
  }
  return chatFrame.locator('body').innerText({ timeout: 5000 });
}

test('Connect chat: correct script, offline message path', async ({ page }) => {
  test.setTimeout(240000);

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);

  const openBtn = page.locator('#amazon-connect-open-widget-button').first();
  await expect(openBtn).toBeVisible({ timeout: 15000 });
  await openBtn.click({ force: true });

  const chatFrame = page.frameLocator('iframe[id*="connect"]').first();

  // 1. Greeting — Aaron's exact script
  let text = await waitForNewBotMessage(chatFrame, page, 'A-A-Bot', 25000);
  expect(text).toContain("Thank you for visiting Aaron's portfolio");
  expect(text).toContain("I'm A-A-Bot, Aaron's digital assistant");
  console.log('✓ Greeting correct');

  // 2. Offline menu — Aaron's exact script
  text = await waitForNewBotMessage(chatFrame, page, 'Take a message', 20000);
  expect(text).toContain("Aaron has stepped away");
  expect(text).toContain("Take a message");
  expect(text).toContain("Schedule a 30-minute call");
  expect(text).toContain("voicemail");
  console.log('✓ Offline menu correct (3 options)');

  // 3. Choose 1 — leave a message
  await sendMessage(chatFrame, page, '1');
  text = await waitForNewBotMessage(chatFrame, page, 'name', 15000);
  expect(text).toContain('name');
  console.log('✓ Name prompt');

  // 4. Name
  await sendMessage(chatFrame, page, 'Test User');
  text = await waitForNewBotMessage(chatFrame, page, 'e-mail address or phone', 15000);
  expect(text).toContain('e-mail address or phone number');
  console.log('✓ Contact prompt (asks for actual address/number)');

  // 5. Contact
  await sendMessage(chatFrame, page, 'test@example.com');
  text = await waitForNewBotMessage(chatFrame, page, 'message to say', 15000);
  expect(text).toContain('message');
  console.log('✓ Message prompt');

  // 6. Message
  await sendMessage(chatFrame, page, 'Hello from Playwright test');
  text = await waitForNewBotMessage(chatFrame, page, 'sent to Aaron', 15000);
  expect(text).toContain('sent to Aaron');
  console.log('✓ Confirmation');

  // 7. Thank you + disconnect
  text = await waitForNewBotMessage(chatFrame, page, 'Chat has ended', 15000);
  expect(text).toContain("Thank you very much for visiting Aaron's site");
  expect(text).toContain('Chat has ended');
  console.log('✓ Thank-you and disconnect');

  await page.screenshot({ path: '/tmp/connect-chat-script.png', fullPage: true });
  console.log('\n=== ALL ASSERTIONS PASSED ===');
});
