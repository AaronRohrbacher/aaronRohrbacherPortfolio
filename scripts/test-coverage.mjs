#!/usr/bin/env node
/**
 * Run the full Playwright test suite with V8 coverage on the dev server.
 *
 * Strategy:
 *   1. Wipe coverage/raw and coverage/report
 *   2. Start `npm run dev` ourselves with NODE_V8_COVERAGE set
 *   3. Wait for it to be reachable on port 3000
 *   4. Run `npx playwright test` (it reuses the running server)
 *   5. Send SIGTERM to the dev server so V8 flushes coverage to disk
 *   6. Run `c8 report` against coverage/raw
 *
 * Output:
 *   coverage/raw/      raw V8 coverage JSON files (one per process)
 *   coverage/report/   c8 HTML + lcov + text-summary report
 *
 * Usage: npm run test:coverage
 */

import { spawn } from 'child_process';
import { rmSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import net from 'net';

const ROOT = process.cwd();
const RAW_DIR = resolve(ROOT, 'coverage', 'raw');
const REPORT_DIR = resolve(ROOT, 'coverage', 'report');
const PORT = 3000;

// ── helpers ────────────────────────────────────────────────────────────────

function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function spawnChild(cmd, args, env) {
  return spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
}

function waitExit(child) {
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 0)));
}

// ── 1. fresh dirs ──────────────────────────────────────────────────────────

console.log('▸ wiping coverage dirs');
rmSync(RAW_DIR, { recursive: true, force: true });
rmSync(REPORT_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

// Also wipe DynamoDB Local data so tests start from a known state.
const DDB_DATA = resolve(ROOT, '.data', 'dynamodb');
if (existsSync(DDB_DATA)) {
  console.log('▸ wiping local DynamoDB data');
  rmSync(DDB_DATA, { recursive: true, force: true });
}

// ── 2. start dev server with NODE_V8_COVERAGE set ─────────────────────────

if (await isPortOpen(PORT)) {
  console.error(`! port ${PORT} already in use — kill the existing dev server first.`);
  process.exit(1);
}

console.log('▸ starting dev server with V8 coverage');
const dev = spawnChild('npm', ['run', 'dev'], {
  NODE_V8_COVERAGE: RAW_DIR,
});

const ready = await waitForPort(PORT, 60000);
if (!ready) {
  console.error('! dev server failed to start within 60s');
  dev.kill('SIGTERM');
  process.exit(1);
}
console.log('▸ dev server ready');

// ── 3. run playwright tests ─────────────────────────────────────────────────

const test = spawnChild('npx', ['playwright', 'test', '--reporter=list'], {
  NODE_V8_COVERAGE: RAW_DIR,
});
const testCode = await waitExit(test);
console.log(`▸ playwright exit code: ${testCode}`);

// ── 4. stop dev server gracefully so V8 flushes ────────────────────────────

console.log('▸ stopping dev server (SIGTERM, then SIGKILL after 10s)');
dev.kill('SIGTERM');
const killed = await Promise.race([
  waitExit(dev),
  new Promise((r) => setTimeout(() => r(null), 10000)),
]);
if (killed === null) {
  console.log('▸ dev server didn\'t exit, sending SIGKILL');
  dev.kill('SIGKILL');
  await waitExit(dev);
}

// Give the OS a moment to flush the JSON files
await new Promise((r) => setTimeout(r, 500));

// ── 5. c8 report ───────────────────────────────────────────────────────────

console.log('▸ generating coverage report');
const c8 = spawnChild('node_modules/.bin/c8', [
  'report',
  '--reporter=text',
  '--reporter=text-summary',
  '--reporter=html',
  '--reporter=lcov',
  '--report-dir', REPORT_DIR,
  '--temp-directory', RAW_DIR,
  '--include', 'src/**',
  '--exclude', 'src/info/**',
  '--exclude', 'src/**/*.module.scss',
  '--exclude', 'src/**/*.test.*',
  '--exclude', '**/node_modules/**',
  '--all',
], {});
const c8Code = await waitExit(c8);

// ── 6. feature coverage (file-level, complements c8 line coverage which
//      doesn't reliably remap Turbopack chunks back to src/) ──────────────

console.log('▸ running feature coverage analyzer');
const fc = spawnChild('node', ['scripts/feature-coverage.mjs'], {});
const fcCode = await waitExit(fc);

console.log(`\n▸ done.`);
console.log(`▸ c8 line report:    ${join(REPORT_DIR, 'index.html')}`);
console.log(`▸ feature coverage:  ${resolve(ROOT, 'coverage', 'feature-coverage.md')}`);
console.log(`▸ tests=${testCode}, c8=${c8Code}, feature=${fcCode}`);

process.exit(testCode || c8Code || fcCode);
