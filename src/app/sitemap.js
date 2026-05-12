/**
 * Main sitemap for aaronrohrbacher.com (portfolio site).
 * Excludes /music and /portaputer — those live on their own subdomains
 * (music.aaronrohrbacher.com, portaputer.aaronrohrbacher.com) and each
 * has its own sitemap. Mixing subdomains into one sitemap confuses Google
 * (cross-host URLs require the sitemap to be at the parent host or be a
 * sitemap index, neither of which we want here).
 *
 * Next.js serves this at /sitemap.xml automatically.
 *
 * `lastModified` is fixed to BUILD_TIME (captured in next.config.mjs at
 * `next build` time). Using `new Date()` would re-stamp on every request
 * and dilute the signal — search engines treat lastmod as "content actually
 * changed at this time," not "this URL was just touched."
 */
const BASE = 'https://aaronrohrbacher.com';

export default function sitemap() {
  const lastModified = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME)
    : new Date();

  // Per-route priority + changeFrequency. Homepage gets 1.0 because it's
  // the canonical root entry point; resume + portfolio rank as primary
  // landing pages for most search intents (hiring, project lookup) and
  // change more often than about/contact, which are stable.
  const routes = [
    { path: '',          priority: 1.0, changeFrequency: 'weekly'  },
    { path: 'resume',    priority: 0.9, changeFrequency: 'monthly' },
    { path: 'portfolio', priority: 0.9, changeFrequency: 'monthly' },
    { path: 'about',     priority: 0.7, changeFrequency: 'yearly'  },
    { path: 'contact',   priority: 0.6, changeFrequency: 'yearly'  },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: path ? `${BASE}/${path}` : BASE,
    lastModified,
    changeFrequency,
    priority,
  }));
}
