import { test, expect } from '@playwright/test';

const TITLE_MATRIX = [
  ['http://localhost:3000/', 'Aaron Rohrbacher | Lead Software Engineer & DevOps Architect', true],
  ['http://localhost:3000/about', 'About | Aaron Rohrbacher', true],
  ['http://localhost:3000/contact', 'Contact | Aaron Rohrbacher', true],
  ['http://localhost:3000/portfolio', 'Software Projects | Aaron Rohrbacher', true],
  ['http://localhost:3000/resume', 'Software Engineer Resume | Aaron Rohrbacher', true],
  ['http://localhost:3000/admin', 'Portfolio Admin | Aaron Rohrbacher', false],
  ['http://music.localhost:3000/', 'Aaron Rohrbacher Music | Recordings & Downloads', true],
  ['http://music.localhost:3000/login', 'Sign In | Aaron Rohrbacher Music', false],
  ['http://music.localhost:3000/login/magic', 'Magic Sign-In | Aaron Rohrbacher Music', false],
  ['http://music.localhost:3000/signup', 'Sign Up | Aaron Rohrbacher Music', false],
  ['http://music.localhost:3000/forgot-password', 'Reset Password | Aaron Rohrbacher Music', false],
  ['http://music.localhost:3000/admin', 'Admin | Aaron Rohrbacher Music', false],
  ['http://portaputer.localhost:3000/', 'PortaPuter | Portable Windows PC Capture', true],
  ['http://portaputer.localhost:3000/features', 'Features | PortaPuter', true],
  ['http://portaputer.localhost:3000/installation', 'Installation & Use | PortaPuter', true],
  ['http://portaputer.localhost:3000/requirements', 'System Requirements | PortaPuter', true],
  ['http://portaputer.localhost:3000/troubleshooting', 'Troubleshooting | PortaPuter', true],
  ['http://portaputer.localhost:3000/admin', 'Admin | PortaPuter', false],
];

test.describe('standardized rendered titles', () => {
  for (const [url, expectedTitle, indexable] of TITLE_MATRIX) {
    test(`${new URL(url).host}${new URL(url).pathname}`, async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle(expectedTitle);
      await expect(page.locator('head > title')).toHaveCount(1);

      if (indexable) {
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', expectedTitle);
      } else {
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      }
    });
  }

  test('public track and dump pages use their content names', async ({ page, request }) => {
    const response = await request.get('http://music.localhost:3000/api/tracks');
    expect(response.ok()).toBeTruthy();
    const catalog = await response.json();
    const dump = catalog.dumps?.[0];
    const track = catalog.tracks?.[0] || dump?.tracks?.[0];

    expect(track, 'the deterministic local catalog must contain a public track').toBeTruthy();
    await page.goto(`http://music.localhost:3000/track/${encodeURIComponent(track.id)}`);
    const trackTitle = `${track.name} | Aaron Rohrbacher Music`;
    await expect(page).toHaveTitle(trackTitle);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', trackTitle);

    expect(dump, 'the deterministic local catalog must contain a public dump').toBeTruthy();
    await page.goto(`http://music.localhost:3000/dump/${encodeURIComponent(dump.slug || dump.id)}`);
    const dumpTitle = `${dump.name} | Aaron Rohrbacher Music`;
    await expect(page).toHaveTitle(dumpTitle);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', dumpTitle);
  });

  test('unknown Music content uses a neutral noindex title', async ({ page }) => {
    await page.goto('http://music.localhost:3000/track/definitely-not-a-real-track');
    await expect(page).toHaveTitle('Music Unavailable | Aaron Rohrbacher Music');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

// Regression coverage for the music subdomain Soft 404 issue.
//
// Background: when there are no published tracks/dumps, the music page
// previously rendered a spinner-only body to the bot, which Search Console
// flagged as "Page cannot be indexed: Soft 404". The fix is to always SSR
// substantive content (h1 + bio + JSON-LD identity) regardless of how many
// tracks have been published.

const BASE = 'http://music.localhost:3000';

async function fetchAsBot(request, path) {
  const res = await request.get(`${BASE}${path}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      // Exercise the public host-native URL through the Next 16 proxy.
    },
  });
  return { status: res.status(), html: await res.text() };
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test.describe('Music subdomain SSR — soft-404 prevention', () => {
  test('GET / returns 200', async ({ request }) => {
    const { status } = await fetchAsBot(request, '/');
    expect(status).toBe(200);
  });

  test('SSR HTML contains the page hero (h1 "Music" + bio paragraph)', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/');
    // h1 with "Music"
    expect(html).toMatch(/<h1[^>]*>\s*Music\s*<\/h1>/);
    // Real prose from the hero subtitle, not just a placeholder
    const text = visibleText(html);
    expect(text).toContain('Aaron Rohrbacher');
    expect(text).toContain('Portland, Oregon');
    expect(text).toContain('saxophone');
  });

  test('SSR body text is substantive (>= 250 chars of human copy)', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/');
    const text = visibleText(html);
    expect(text.length).toBeGreaterThanOrEqual(250);
  });

  test('canonical link points to music subdomain', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/');
    expect(html).toMatch(/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/music\.aaronrohrbacher\.com\/?["']/);
  });

  test('OpenGraph metadata is present', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/');
    expect(html).toMatch(/<meta[^>]+property=["']og:title["'][^>]+content=["'][^"']+["']/);
    expect(html).toMatch(/<meta[^>]+property=["']og:description["'][^>]+content=["'][^"']+["']/);
    expect(html).toMatch(/<meta[^>]+property=["']og:type["'][^>]+content=["']music\.playlist["']/);
  });

  test('JSON-LD includes identity entities even with empty playlist', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/');
    // Pull out the JSON-LD blob
    const m = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const data = JSON.parse(m[1]);
    // We use a @graph with multiple types
    expect(data['@graph']).toBeTruthy();
    const types = data['@graph'].map((n) => n['@type']);
    expect(types).toContain('Person');
    expect(types).toContain('MusicGroup');
    expect(types).toContain('CollectionPage');
    expect(types).toContain('MusicPlaylist');
  });

  test('SSR does not lead with the loading spinner only', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/');
    // Strip scripts/styles, then ensure the visible text is more than just
    // the loading message — i.e. the hero is rendered above it.
    const text = visibleText(html);
    if (text.includes('Loading tracks')) {
      // Loading text is allowed, but only if substantive copy comes BEFORE it.
      const before = text.split('Loading tracks')[0].trim();
      expect(before.length).toBeGreaterThan(200);
    }
  });
});

test.describe('Music subdomain rewrites', () => {
  test('robots.txt is reachable on the music subdomain (not 404)', async ({ request }) => {
    const res = await request.get(`${BASE}/robots.txt`);
    expect(res.status()).toBeLessThan(400);
  });

  test('sitemap.xml route returns valid XML', async ({ request }) => {
    const res = await request.get(`${BASE}/sitemap.xml`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/<\?xml/);
    expect(body).toMatch(/<urlset/);
    // The music subdomain index URL must be in there.
    expect(body).toContain('https://music.aaronrohrbacher.com/');
  });
});
