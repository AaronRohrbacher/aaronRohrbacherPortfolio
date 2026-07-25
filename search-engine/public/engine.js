class SearchEngine {
  constructor(opts = {}) {
    this.proxyBase = opts.proxyBase || '/proxy';
    this.concurrency = opts.concurrency || 6;
    this.maxPages = opts.maxPages || 100;
    this.maxDepth = opts.maxDepth || 2;
    this.onResult = opts.onResult || (() => {});
    this.onStatus = opts.onStatus || (() => {});
    this.onDone = opts.onDone || (() => {});

    this.visited = new Set();
    this.queue = [];
    this.active = 0;
    this.crawled = 0;
    this.found = 0;
    this.running = false;
    this.domainLast = new Map();
  }

  stop() { this.running = false; }

  async search(query, seeds) {
    this.queryRaw = query;
    this.queryTerms = this.tokenize(query);
    this.queryLower = query.toLowerCase();
    this.visited.clear();
    this.queue = [];
    this.domainLast.clear();
    this.active = 0;
    this.crawled = 0;
    this.found = 0;
    this.running = true;

    for (const url of seeds) this.enqueue(url, 0, 100);

    await this.drain();
    this.running = false;
    this.onDone({ crawled: this.crawled, found: this.found });
  }

  // --- URL handling ---

  normalize(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 'source', 'fbclid', 'gclid'])
        u.searchParams.delete(p);
      return u.href;
    } catch { return null; }
  }

  domain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  enqueue(url, depth, priority) {
    const norm = this.normalize(url);
    if (!norm || this.visited.has(norm) || depth > this.maxDepth) return;

    const ext = norm.split('?')[0].split('/').pop().split('.').pop().toLowerCase();
    const skip = ['pdf','png','jpg','jpeg','gif','svg','webp','mp3','mp4','wav','zip','tar','gz','exe','dmg','css','js','xml','rss','atom','json','woff','woff2','ttf','ico'];
    if (skip.includes(ext) && ext !== norm.split('/').pop().toLowerCase()) return;

    this.visited.add(norm);
    const item = { url: norm, depth, priority };
    const i = this.queue.findIndex(q => q.priority < priority);
    if (i === -1) this.queue.push(item); else this.queue.splice(i, 0, item);
  }

  // --- Crawl loop ---

  async waitForDomain(url) {
    const d = this.domain(url);
    const last = this.domainLast.get(d) || 0;
    const wait = Math.max(0, last + 250 - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.domainLast.set(d, Date.now());
  }

  async drain() {
    const worker = async () => {
      while (this.running && (this.queue.length > 0) && this.crawled < this.maxPages) {
        const item = this.queue.shift();
        if (!item) { await new Promise(r => setTimeout(r, 50)); continue; }
        this.crawled++;
        this.active++;
        this.emitStatus();
        try {
          await this.waitForDomain(item.url);
          if (this.running) await this.processPage(item);
        } catch {}
        this.active--;
        this.emitStatus();
      }
    };
    await Promise.all(Array.from({ length: this.concurrency }, () => worker()));
  }

  emitStatus() {
    this.onStatus({ crawled: this.crawled, found: this.found, queued: this.queue.length, active: this.active });
  }

  async processPage({ url, depth }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);

    try {
      const resp = await fetch(`${this.proxyBase}?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) return;

      const html = await resp.text();
      const finalUrl = resp.headers.get('X-Final-URL') || url;
      const page = this.parse(html, finalUrl);
      const score = this.score(page);

      if (score > 0.5) {
        this.found++;
        this.onResult({ url: finalUrl, title: page.title || this.domain(finalUrl), snippet: this.snippet(page.body), score: Math.round(score * 100) / 100 });
      }

      for (const link of page.links.slice(0, 50)) {
        this.enqueue(link.href, depth + 1, this.linkPriority(link));
      }
    } catch {
      clearTimeout(timer);
    }
  }

  // --- Parsing ---

  parse(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = doc.createElement('base');
    base.href = baseUrl;
    doc.head.prepend(base);

    doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript, svg').forEach(el => el.remove());

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const meta = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
    const h1 = doc.querySelector('h1')?.textContent?.trim() || '';
    const body = doc.body?.textContent?.replace(/\s+/g, ' ')?.trim() || '';

    const links = [];
    const seen = new Set();
    for (const a of doc.querySelectorAll('a[href]')) {
      try {
        const href = new URL(a.getAttribute('href'), baseUrl).href;
        if (!href.startsWith('http') || seen.has(href)) continue;
        seen.add(href);
        links.push({ href, text: a.textContent?.trim() || '' });
      } catch {}
    }

    return { title, meta, h1, body, links };
  }

  // --- Scoring ---

  tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  }

  score({ title, meta, h1, body }) {
    const zones = [
      { text: title.toLowerCase(), w: 15 },
      { text: h1.toLowerCase(), w: 12 },
      { text: meta.toLowerCase(), w: 8 },
      { text: body.toLowerCase(), w: 1 },
    ];

    let score = 0;

    for (const z of zones) {
      if (z.text.includes(this.queryLower)) score += z.w * 3;
    }

    for (const term of this.queryTerms) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      for (const z of zones) {
        const m = z.text.match(re);
        if (!m) continue;
        const tf = m.length;
        const dl = z.text.split(/\s+/).length || 1;
        const k1 = 1.2, b = 0.75;
        const avgdl = z.w === 1 ? 500 : 20;
        score += (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgdl)) * z.w;
      }
    }

    return score;
  }

  linkPriority(link) {
    let p = 0;
    const text = (link.text + ' ' + link.href).toLowerCase();
    for (const t of this.queryTerms) if (text.includes(t)) p += 5;
    return p;
  }

  snippet(body) {
    const lower = body.toLowerCase();
    let idx = lower.indexOf(this.queryLower);

    if (idx === -1) {
      for (const t of this.queryTerms) {
        idx = lower.indexOf(t);
        if (idx !== -1) break;
      }
    }

    if (idx !== -1) {
      const start = Math.max(0, body.lastIndexOf(' ', idx - 80) + 1);
      let end = body.indexOf(' ', idx + 160);
      if (end === -1) end = Math.min(body.length, idx + 200);
      return (start > 0 ? '...' : '') + body.slice(start, end).trim() + (end < body.length ? '...' : '');
    }

    return body.slice(0, 200).trim() + (body.length > 200 ? '...' : '');
  }
}
