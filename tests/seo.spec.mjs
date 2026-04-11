import { test, expect } from '@playwright/test';

// Regression coverage for the music subdomain Soft 404 issue.
//
// Background: when there are no published tracks/dumps, the music page
// previously rendered a spinner-only body to the bot, which Search Console
// flagged as "Page cannot be indexed: Soft 404". The fix is to always SSR
// substantive content (h1 + bio + JSON-LD identity) regardless of how many
// tracks have been published.

const BASE = 'http://localhost:3000';

async function fetchAsBot(request, path) {
  const res = await request.get(`${BASE}${path}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      // The middleware rewrites music.aaronrohrbacher.com → /music. We
      // hit /music directly here since there's no DNS subdomain on
      // localhost — same SSR path.
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
  test('GET /music returns 200', async ({ request }) => {
    const { status } = await fetchAsBot(request, '/music');
    expect(status).toBe(200);
  });

  test('SSR HTML contains the page hero (h1 "Music" + bio paragraph)', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/music');
    // h1 with "Music"
    expect(html).toMatch(/<h1[^>]*>\s*Music\s*<\/h1>/);
    // Real prose from the hero subtitle, not just a placeholder
    const text = visibleText(html);
    expect(text).toContain('Aaron Rohrbacher');
    expect(text).toContain('Portland, Oregon');
    expect(text).toContain('saxophone');
  });

  test('SSR body text is substantive (>= 250 chars of human copy)', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/music');
    const text = visibleText(html);
    expect(text.length).toBeGreaterThanOrEqual(250);
  });

  test('canonical link points to music subdomain', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/music');
    expect(html).toMatch(/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/music\.aaronrohrbacher\.com\/?["']/);
  });

  test('OpenGraph metadata is present', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/music');
    expect(html).toMatch(/<meta[^>]+property=["']og:title["'][^>]+content=["'][^"']+["']/);
    expect(html).toMatch(/<meta[^>]+property=["']og:description["'][^>]+content=["'][^"']+["']/);
    expect(html).toMatch(/<meta[^>]+property=["']og:type["'][^>]+content=["']music\.playlist["']/);
  });

  test('JSON-LD includes identity entities even with empty playlist', async ({ request }) => {
    const { html } = await fetchAsBot(request, '/music');
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
    const { html } = await fetchAsBot(request, '/music');
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
    // Localhost doesn't have a real subdomain, but the music-robots.txt
    // route the middleware rewrites to should serve OK directly.
    const res = await request.get(`${BASE}/music-robots.txt`);
    // Either the file exists (200) or is the inherited site robots.txt
    // (also 200). What we don't want is a 404.
    expect(res.status()).toBeLessThan(400);
  });

  test('music-sitemap.xml route returns valid XML', async ({ request }) => {
    const res = await request.get(`${BASE}/music-sitemap.xml`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/<\?xml/);
    expect(body).toMatch(/<urlset/);
    // The music subdomain index URL must be in there.
    expect(body).toContain('https://music.aaronrohrbacher.com/');
  });
});
