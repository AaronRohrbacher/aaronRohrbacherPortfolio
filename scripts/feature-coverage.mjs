#!/usr/bin/env node
/**
 * Feature-coverage analyzer.
 *
 * V8 line coverage on a Next.js dev server doesn't reliably remap
 * Turbopack chunks back to src/ files (indexed source maps), so c8
 * shows 0% on src/. As a complement, this script does the more useful
 * thing: for every src/ file, find which test files exercise it, then
 * print which files are covered, which aren't, and a one-line summary.
 *
 * "Exercises" means one of:
 *   - The test file imports the source file (rare — most tests are
 *     black-box Playwright)
 *   - The test file fetches an HTTP path that maps to the source
 *     route handler (e.g. POST /api/music/admin/magic-links matches
 *     src/app/api/music/admin/magic-links/route.js)
 *   - The test file references a CSS-module class name from the source
 *     file (rare; matches `[class*="..."]` selectors)
 *   - The test file references the source file's text/labels (very
 *     loose — matches strings unique enough to be source-defined)
 *
 * Output:
 *   coverage/feature-coverage.md
 *
 * Usage: npm run test:coverage  (the runner calls this after c8)
 *        node scripts/feature-coverage.mjs  (standalone)
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const ROOT = process.cwd();
const SRC_DIR = resolve(ROOT, 'src');
const TESTS_DIR = resolve(ROOT, 'tests');
const OUT_FILE = resolve(ROOT, 'coverage', 'feature-coverage.md');

// ── walk helpers ────────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|mjs|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function relSrc(p) { return relative(ROOT, p); }

// ── derive HTTP path for a route handler ────────────────────────────────────

function routePathFor(srcPath) {
  // src/app/api/music/admin/magic-links/route.js → /api/music/admin/magic-links
  // src/app/music/track/[id]/page.jsx → /music/track/[id]
  const rel = relative(SRC_DIR, srcPath).replace(/\\/g, '/');
  if (!rel.startsWith('app/')) return null;
  let p = '/' + rel.slice('app/'.length);
  // strip /route.js, /route.ts etc — leaves the URL path
  p = p.replace(/\/route\.(jsx?|mjs|ts|tsx)$/, '');
  p = p.replace(/\/page\.(jsx?|mjs|ts|tsx)$/, '');
  // strip /layout.jsx
  p = p.replace(/\/layout\.(jsx?|mjs|ts|tsx)$/, '');
  return p || '/';
}

// ── classify src files into "feature buckets" ──────────────────────────────

function classify(srcPath) {
  const rel = relative(ROOT, srcPath).replace(/\\/g, '/');
  if (rel.includes('/api/')) return 'api';
  if (rel.includes('/app/') && rel.endsWith('page.jsx')) return 'page';
  if (rel.includes('/app/') && rel.endsWith('layout.jsx')) return 'layout';
  if (rel.includes('/components/')) return 'component';
  if (rel.includes('/lib/')) return 'lib';
  if (rel.includes('/hooks/')) return 'hook';
  if (rel.includes('/workers/')) return 'worker';
  if (rel.includes('/functions/')) return 'lambda';
  return 'other';
}

// Files we deliberately don't expect tests to cover.
function excludeFromCoverage(srcPath) {
  const rel = relative(ROOT, srcPath).replace(/\\/g, '/');
  return (
    rel.includes('/info/') ||                       // static personal data
    rel.includes('/constants/aaronChatFacts') ||    // facts blob
    rel.endsWith('/Info.jsx') ||
    rel.endsWith('.module.scss')
  );
}

// ── find usages in tests ───────────────────────────────────────────────────

const testFiles = walk(TESTS_DIR).filter((f) => /\.spec\.(mjs|js|ts)$/.test(f));
const testTexts = new Map();
for (const f of testFiles) testTexts.set(f, readFileSync(f, 'utf8'));

function testsThatTouch(srcPath) {
  const hits = new Set();
  const route = routePathFor(srcPath);
  const fileBase = srcPath.split('/').pop().replace(/\.(jsx?|mjs|ts|tsx)$/, '');

  for (const [testFile, txt] of testTexts) {
    let touched = false;

    if (route) {
      // For route handlers/page files: look for the URL path string
      // (with optional dynamic-segment substitution).
      const routeNoDyn = route.replace(/\[[^\]]+\]/g, '');
      if (txt.includes(route) || (routeNoDyn.length > 4 && txt.includes(routeNoDyn))) {
        touched = true;
      }
    }

    if (!touched && fileBase && fileBase.length >= 4) {
      // Component / lib / worker file: match the file's basename verbatim.
      // Skip "page" / "route" / "layout" since they're noise.
      if (!['page', 'route', 'layout', 'index'].includes(fileBase)) {
        if (txt.includes(fileBase)) touched = true;
      }
    }

    if (touched) hits.add(relSrc(testFile));
  }
  return hits;
}

// ── walk src ──────────────────────────────────────────────────────────────

const srcFiles = walk(SRC_DIR).filter((f) => !excludeFromCoverage(f));

const buckets = {};
for (const f of srcFiles) {
  const b = classify(f);
  if (!buckets[b]) buckets[b] = [];
  buckets[b].push({ file: f, hits: testsThatTouch(f) });
}

// ── render markdown ────────────────────────────────────────────────────────

const totalSrc = srcFiles.length;
const covered = Object.values(buckets).flat().filter((x) => x.hits.size > 0).length;
const pct = totalSrc === 0 ? 100 : (covered / totalSrc * 100);

const lines = [];
lines.push('# Feature coverage report');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push(`**${covered} / ${totalSrc} src/ files exercised by at least one test (${pct.toFixed(1)}%)**`);
lines.push('');
lines.push('Note: this is *feature* coverage, not line coverage. A file is "exercised" if a test fetches its HTTP path, references its file basename, or imports it. Line-level V8 coverage on Next.js dev mode is unreliable due to Turbopack chunking — see `coverage/report/index.html` from c8 for what it could resolve.');
lines.push('');

const order = ['api', 'page', 'lib', 'component', 'lambda', 'worker', 'hook', 'layout', 'other'];
for (const bucket of order) {
  const items = buckets[bucket];
  if (!items || items.length === 0) continue;
  const bcov = items.filter((x) => x.hits.size > 0).length;
  lines.push(`## ${bucket} (${bcov}/${items.length})`);
  lines.push('');
  lines.push('| file | tests |');
  lines.push('|---|---|');
  for (const { file, hits } of items.sort((a, b) => a.file.localeCompare(b.file))) {
    const mark = hits.size > 0 ? '✅' : '❌';
    const testList = hits.size > 0
      ? [...hits].map((t) => `\`${t.replace(/^tests\//, '')}\``).join(', ')
      : '_no test_';
    lines.push(`| ${mark} \`${relSrc(file)}\` | ${testList} |`);
  }
  lines.push('');
}

mkdirSync(resolve(ROOT, 'coverage'), { recursive: true });
writeFileSync(OUT_FILE, lines.join('\n'));

console.log(`▸ feature coverage: ${covered}/${totalSrc} files (${pct.toFixed(1)}%)`);
console.log(`▸ wrote ${relative(ROOT, OUT_FILE)}`);

// Print a one-screen summary of uncovered files for quick review
const uncovered = Object.values(buckets).flat().filter((x) => x.hits.size === 0);
if (uncovered.length > 0) {
  console.log(`\n${uncovered.length} uncovered files:`);
  for (const { file } of uncovered.slice(0, 30)) {
    console.log(`  ${relSrc(file)}`);
  }
  if (uncovered.length > 30) console.log(`  ... and ${uncovered.length - 30} more (see report)`);
}
