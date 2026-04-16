import { test, expect } from '@playwright/test';

// Obsolete: this suite was written against the old KB + rhyme + fact-retrieval
// implementation of ChatAgent. A-A-Bot now delegates everything to the
// fine-tuned model; many of the assertions here (e.g. canned KB age redirect,
// suggestion chips count) no longer match. Replaced by tests/a-a-bot.spec.mjs
// and tests/a-a-bot-generate.spec.mjs.
test.skip(true, 'Obsolete after A-A-Bot rewrite — see tests/a-a-bot.spec.mjs.');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openChat(page) {
  const fab = page.locator('button[aria-label="Open chat"]');
  await fab.click();
  await expect(page.locator('strong').filter({ hasText: "Aaron's AI Assistant" })).toBeVisible();
}

async function sendMessage(page, text) {
  const input = page.locator('input[placeholder*="Ask about Aaron"]');
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(500);
}

// Wait for worker to go idle and return the last AI bubble text.
// Default 90s — models are cached after the first AI test in each run.
async function lastAssistantMessage(page, timeout = 90000) {
  await page.waitForFunction(() => document.querySelectorAll('.fa-spinner').length === 0, { timeout });
  await page.waitForTimeout(300);
  const bubbles = page.locator('[class*="bubbleAI"]');
  const count = await bubbles.count();
  if (count === 0) return '';
  return (await bubbles.nth(count - 1).textContent()).trim();
}

// ── Suite ─────────────────────────────────────────────────────────────────────
// Serial mode + shared page so the model is downloaded once and cached for all
// subsequent tests (Transformers.js stores models in the browser Cache API).
test.describe.configure({ mode: 'serial' });

test.describe('ChatAgent', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto('/');
  });

  test.afterAll(async () => {
    await page?.close();
  });

  // ── UI smoke tests (no model needed) ───────────────────────────────────────

  test('opens and shows greeting with quick actions', async () => {
    await page.goto('/');
    await openChat(page);
    await expect(page.locator('text=Hey! I\'m Aaron\'s AI assistant')).toBeVisible();
    await expect(page.locator('text=Ask about Aaron')).toBeVisible();
    await expect(page.locator('text=Leave a message')).toBeVisible();
    await expect(page.locator('text=Live chat')).toBeVisible();
  });

  test('"Ask about Aaron" shows suggestion chips', async () => {
    await page.goto('/');
    await openChat(page);
    await page.locator('button').filter({ hasText: 'Ask about Aaron' }).click();
    await page.waitForTimeout(300);
    const suggestions = page.locator('[class*="suggestionChip"]');
    await expect(suggestions.first()).toBeVisible();
    expect(await suggestions.count()).toBe(3);
  });

  test('KB: age question redirects gracefully (no model needed)', async () => {
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'How old is Aaron?');
    // KB fast-path — instant response, short wait is fine
    const reply = await lastAssistantMessage(page, 5000);
    expect(reply).not.toMatch(/\b\d{2}\s*(years?)\b/);
    expect(reply).toMatch(/Live Chat|professional/i);
  });

  test('collecting flow: bail out with "no"', async () => {
    await page.goto('/');
    await openChat(page);
    await page.locator('button').filter({ hasText: 'Leave a message' }).first().click();
    await page.waitForTimeout(300);
    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('no');
    await input.press('Enter');
    await page.waitForTimeout(300);
    const reply = await lastAssistantMessage(page, 5000);
    expect(reply).toContain('What else can I help');
  });

  // ── AI Q&A tests (embedding model + generation model) ─────────────────────
  // First AI test triggers model downloads. Subsequent tests use cached models.

  test('AI: programming languages — correct, not spoken languages', async () => {
    test.setTimeout(300000); // first AI test: model downloads on first run
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'What programming languages does Aaron know?');
    const reply = await lastAssistantMessage(page, 240000);
    expect(reply).toContain('JavaScript');
    expect(reply).toContain('Python');
    expect(reply).not.toMatch(/\b(Spanish|French|Arabic|German)\b/);
  });

  test('AI: Forbes role — accurate, no hallucination', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'What did he do at Forbes?');
    const reply = await lastAssistantMessage(page);
    expect(reply).toContain('Forbes');
    expect(reply).not.toContain('Adobe');
    expect(reply).not.toContain('CEO Level');
  });

  test('AI: current status — seeking next role', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, "Is Aaron available for hire?");
    const reply = await lastAssistantMessage(page);
    expect(reply).toMatch(/seeking|available|open|hire/i);
    expect(reply).not.toMatch(/artisanal/i);
    expect(reply).not.toMatch(/\bCTO\b/);
  });

  test('AI: Rust — confirms knowledge and context', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'Does he know Rust?');
    const reply = await lastAssistantMessage(page);
    expect(reply).toContain('Rust');
  });

  test('AI: infrastructure tools — returns Docker/Kubernetes/Terraform', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'What infrastructure tools does he use?');
    const reply = await lastAssistantMessage(page);
    expect(reply).toMatch(/Docker|Kubernetes|Terraform/i);
  });

  test('AI: AWS certs — accurate', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'What AWS certifications does he have?');
    const reply = await lastAssistantMessage(page);
    expect(reply).toMatch(/Cloud Practitioner|Developer Associate/i);
  });

  // ── Off-topic detection (embedding similarity below threshold) ─────────────

  test('off-topic: "do you eat moose" gets rhyming redirect', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'Do you eat moose?');
    const reply = await lastAssistantMessage(page);
    expect(reply).not.toContain("I can't assist");
    expect(reply).not.toContain('I apologize');
    expect(reply).toMatch(/aaron|skill|project|experience|career/i);
  });

  test('off-topic: "is he an axe murderer" gets redirect', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'Is he an axe murderer?');
    const reply = await lastAssistantMessage(page);
    expect(reply).not.toContain("I can't assist");
    expect(reply).not.toContain('I apologize');
  });

  test('off-topic: "what is the meaning of life" gets redirect', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'What is the meaning of life?');
    const reply = await lastAssistantMessage(page);
    expect(reply).toMatch(/aaron|skill|project|experience|career/i);
  });

  test('off-topic: "make me a cool site" gets redirect (not a task)', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'Can you make me a cool site?');
    const reply = await lastAssistantMessage(page);
    expect(reply).not.toContain('Sorry');
    // Either redirects or talks about Aaron's portfolio work
    expect(reply).toMatch(/aaron|skill|project|experience|career|built|work/i);
  });

  // ── Interaction integrity ──────────────────────────────────────────────────

  test('collecting flow: question breaks out and gets answered by AI', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await page.locator('button').filter({ hasText: 'Leave a message' }).first().click();
    await page.waitForTimeout(300);
    const input = page.locator('input[placeholder*="Type your answer"]');
    await input.fill('What languages does he know?');
    await input.press('Enter');
    await page.waitForTimeout(500);
    const reply = await lastAssistantMessage(page);
    expect(reply).toContain('JavaScript');
    expect(reply).not.toContain('Thanks, What languages');
  });

  test('suggestion chips trigger AI questions', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await page.locator('button').filter({ hasText: 'Ask about Aaron' }).click();
    await page.waitForTimeout(300);
    const chip = page.locator('[class*="suggestionChip"]').first();
    const chipText = await chip.textContent();
    await chip.click();
    await page.waitForTimeout(500);
    const userBubbles = page.locator('[class*="bubbleUser"]');
    expect((await userBubbles.last().textContent()).trim()).toBe(chipText.trim());
    const reply = await lastAssistantMessage(page);
    expect(reply.length).toBeGreaterThan(10);
  });

  test('no duplicate messages in output', async () => {
    test.setTimeout(180000);
    await page.goto('/');
    await openChat(page);
    await sendMessage(page, 'What did he do at Forbes?');
    await page.waitForTimeout(1000);
    const reply = await lastAssistantMessage(page);
    const allBubbles = page.locator('[class*="bubbleAI"]');
    const count = await allBubbles.count();
    let dupes = 0;
    for (let i = 0; i < count; i++) {
      const text = await allBubbles.nth(i).textContent();
      if (text.trim() === reply) dupes++;
    }
    expect(dupes).toBe(1);
  });
});
