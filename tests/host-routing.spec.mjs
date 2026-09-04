import { test, expect } from '@playwright/test';

const MAIN = 'http://localhost:3000';
const MUSIC = 'http://music.localhost:3000';
const PORTAPUTER = 'http://portaputer.localhost:3000';

test.describe('hostname/path isolation matrix', () => {
  const cases = [
    [MAIN, '/', 200], [MAIN, '/about', 200],
    [MAIN, '/music', 404], [MAIN, '/portaputer', 404],
    [MAIN, '/api/music/tracks', 404], [MAIN, '/api/portaputer/download', 404],

    [MUSIC, '/', 200], [MUSIC, '/login', 200], [MUSIC, '/admin', 200],
    [MUSIC, '/about', 404], [MUSIC, '/features', 404],
    [MUSIC, '/music', 404], [MUSIC, '/portaputer', 404],
    [MUSIC, '/api/music/tracks', 404], [MUSIC, '/api/portaputer/download', 404],

    [PORTAPUTER, '/', 200], [PORTAPUTER, '/features', 200], [PORTAPUTER, '/admin', 200],
    [PORTAPUTER, '/about', 404], [PORTAPUTER, '/login', 404],
    [PORTAPUTER, '/music', 404], [PORTAPUTER, '/portaputer', 404],
    [PORTAPUTER, '/api/music/tracks', 404], [PORTAPUTER, '/api/portaputer/download', 404],
  ];

  for (const [origin, path, status] of cases) {
    test(`${origin}${path} -> ${status}`, async ({ request }) => {
      const response = await request.get(`${origin}${path}`, { maxRedirects: 0 });
      expect(response.status()).toBe(status);
    });
  }

  test('clean auth APIs are routed only on their owning hosts', async ({ request }) => {
    expect((await request.get(`${MUSIC}/api/auth/me`)).status()).toBe(200);
    expect((await request.get(`${PORTAPUTER}/api/auth/me`)).status()).toBe(200);
    expect((await request.get(`${MAIN}/api/auth/me`)).status()).toBe(404);
  });
});

test.describe('host-aware search metadata', () => {
  test('robots files expose only clean host-native rules', async ({ request }) => {
    for (const [origin, sitemap] of [
      [MAIN, 'https://aaronrohrbacher.com/sitemap.xml'],
      [MUSIC, 'https://music.aaronrohrbacher.com/sitemap.xml'],
      [PORTAPUTER, 'https://portaputer.aaronrohrbacher.com/sitemap.xml'],
    ]) {
      const response = await request.get(`${origin}/robots.txt`);
      expect(response.status()).toBe(200);
      const body = await response.text();
      expect(body).toContain(`Sitemap: ${sitemap}`);
      const directives = body.split('\n').filter((line) => /^(Allow|Disallow):/i.test(line));
      expect(directives.join('\n')).not.toMatch(/\/(music|portaputer)(\/|$)/);
    }
  });

  test('sitemaps contain URLs for their own hostname only', async ({ request }) => {
    const expectations = [
      [MAIN, 'https://aaronrohrbacher.com', ['music.aaronrohrbacher.com', 'portaputer.aaronrohrbacher.com']],
      [MUSIC, 'https://music.aaronrohrbacher.com', ['<loc>https://aaronrohrbacher.com/', 'portaputer.aaronrohrbacher.com']],
      [PORTAPUTER, 'https://portaputer.aaronrohrbacher.com', ['music.aaronrohrbacher.com', '<loc>https://aaronrohrbacher.com/']],
    ];
    for (const [origin, expected, forbidden] of expectations) {
      const response = await request.get(`${origin}/sitemap.xml`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/xml');
      const body = await response.text();
      expect(body).toContain(`<loc>${expected}`);
      for (const value of forbidden) expect(body).not.toContain(value);
      expect(body).not.toMatch(/<loc>[^<]+\/(music|portaputer)(\/|<)/);
    }
  });

  test('music HTML and navigation use clean URLs', async ({ page }) => {
    await page.goto(`${MUSIC}/`);
    await expect(page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible();
    const internal = await page.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')).filter(Boolean));
    expect(internal.some((href) => href.startsWith('/music') || href.startsWith('/api/music'))).toBe(false);
  });

  test('PortaPuter HTML and navigation use clean URLs', async ({ page }) => {
    await page.goto(`${PORTAPUTER}/`);
    await expect(page.locator('body')).toContainText('PortaPuter');
    const internal = await page.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')).filter(Boolean));
    expect(internal.some((href) => href.startsWith('/portaputer') || href.startsWith('/api/portaputer'))).toBe(false);
  });
});
