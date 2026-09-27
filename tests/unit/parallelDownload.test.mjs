import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parallelDownload } from '../../src/lib/parallelDownload.js';

function fixture(size = 103) {
  const source = Uint8Array.from({ length: size }, (_, i) => i % 251);
  const saved = new Uint8Array(size);
  const state = { closed: false, aborted: false, requests: [], active: 0, peak: 0 };
  const manifest = { size, etag: '"fixture"', url: 'https://fixture.invalid/file' };
  const writable = {
    async write({ position, data }) { saved.set(data, position); },
    async truncate(length) { assert.equal(length, size); },
    async close() { state.closed = true; },
    async abort() { state.aborted = true; },
  };
  async function fetchImpl(_url, { headers, signal }) {
    assert.equal(headers['If-Match'], manifest.etag);
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(headers.Range);
    const start = Number(a), end = Number(b);
    state.requests.push([start, end]);
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    await new Promise(resolve => setTimeout(resolve, start === 0 ? 20 : 1));
    state.active--;
    signal.throwIfAborted();
    return new Response(source.slice(start, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${size}`, ETag: manifest.etag } });
  }
  return { source, saved, state, manifest, writable, fetchImpl, signal: new AbortController().signal, chunkSize: 16, concurrency: 4 };
}

test('parallel ranges produce an exact file despite out-of-order completion', async () => {
  const f = fixture();
  let progress = 0;
  await parallelDownload({ ...f, onProgress: bytes => { assert.ok(bytes > progress); progress = bytes; } });
  assert.deepEqual(f.saved, f.source);
  assert.equal(progress, f.source.length);
  assert.equal(f.state.closed, true);
  assert.equal(f.state.aborted, false);
  assert.equal(f.state.peak, 4);
  assert.deepEqual(f.state.requests, [[0,15],[16,31],[32,47],[48,63],[64,79],[80,95],[96,102]]);
});

test('a server ignoring Range is cancelled before reading a full object', async () => {
  const f = fixture();
  let cancelled = 0;
  await assert.rejects(parallelDownload({ ...f, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 200 }) }), /rejected/);
  assert.ok(cancelled > 0);
  assert.equal(f.state.closed, false);
  assert.equal(f.state.aborted, true);
});

test('cancel aborts all active requests and prevents new ranges', async () => {
  const f = fixture();
  const controller = new AbortController();
  let requests = 0, stopped = 0;
  const pending = parallelDownload({ ...f, signal: controller.signal, fetchImpl: async (_url, { signal }) => {
    requests++;
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => { stopped++; reject(signal.reason); }, { once: true }));
  } });
  controller.abort();
  await assert.rejects(pending);
  assert.equal(requests, 4);
  assert.equal(stopped, 4);
  assert.equal(f.state.aborted, true);
  assert.equal(f.state.closed, false);
});

test('disk errors stop the download without retrying successful ranges', async () => {
  const f = fixture();
  f.writable.write = async () => { throw new Error('Disk full'); };
  await assert.rejects(parallelDownload(f), /Disk full/);
  assert.equal(f.state.aborted, true);
  assert.equal(f.state.closed, false);
  assert.equal(f.state.requests.length, 4);
});

test('truncated ranges retry at most twice then stop', async () => {
  const f = fixture(16);
  let requests = 0;
  await assert.rejects(parallelDownload({ ...f, fetchImpl: async () => {
    requests++;
    return new Response(new Uint8Array(4), { status: 206, headers: { 'Content-Range': 'bytes 0-15/16', ETag: f.manifest.etag } });
  } }), /Incomplete/);
  assert.equal(requests, 3);
  assert.equal(f.state.aborted, true);
});
