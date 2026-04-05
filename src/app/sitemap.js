/**
 * Main sitemap for aaronrohrbacher.com (portfolio site).
 * Excludes /music — music lives on the music.aaronrohrbacher.com subdomain
 * which has its own sitemap at /music-sitemap.xml.
 *
 * Next.js serves this at /sitemap.xml automatically.
 */
const BASE = 'https://aaronrohrbacher.com';

export default function sitemap() {
  const lastModified = new Date();
  return [
    '',
    'about',
    'portfolio',
    'resume',
    'contact',
  ].map((path) => ({
    url: `${BASE}/${path}`.replace(/\/$/, '') || BASE,
    lastModified,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1.0 : 0.7,
  }));
}
