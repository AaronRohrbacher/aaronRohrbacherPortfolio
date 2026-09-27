import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fixtureDir;
let mp3Fixture;
let mp4Fixture;

test.beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'music-mixed-playback-'));
  const mp3Path = join(fixtureDir, 'fixture.mp3');
  const mp4Path = join(fixtureDir, 'fixture.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-filter:a', 'volume=0.92-0.84*t/6:eval=frame', '-c:a', 'libmp3lame', '-q:a', '7', mp3Path]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x301060:s=320x180:d=6', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=6', '-filter:a', 'volume=0.08+0.92*t/6:eval=frame', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', mp4Path]);
  mp3Fixture = readFileSync(mp3Path);
  mp4Fixture = readFileSync(mp4Path);
});

test.afterAll(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

test('video plays as a queued item beside a persistent waveform, then advances to audio', async ({ page }) => {
  let streamAuthorizationRequests = 0;
  const streamUrls = (id) => id === 'video-item'
    ? { mp4: `/api/stream?id=${id}&format=mp4` }
    : { mp3: `/api/stream?id=${id}&format=mp3` };
  const tracks = [
    { id: 'video-item', name: 'Video Item', formats: ['mp4'], streamUrls: streamUrls('video-item') },
    { id: 'audio-item', name: 'Audio Item', formats: ['mp3'], streamUrls: streamUrls('audio-item') },
  ];

  await page.route('**/api/tracks', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ tracks, dumps: [] }),
  }));
  await page.route('**/api/stream?**', (route) => {
    streamAuthorizationRequests += 1;
    const url = new URL(route.request().url());
    const format = url.searchParams.get('format');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: `/__mixed_fixture__.${format}`, requiresAuth: false }),
    });
  });
  await page.route('**/__mixed_fixture__.mp3', (route) => route.fulfill({ contentType: 'audio/mpeg', body: mp3Fixture }));
  await page.route('**/__mixed_fixture__.mp4', (route) => route.fulfill({ contentType: 'video/mp4', body: mp4Fixture }));

  await page.goto('http://music.localhost:3000');
  await page.locator('button[aria-label="Play Video Item"]').click();
  await expect(page.locator('video')).toHaveAttribute('src', /__mixed_fixture__\.mp4/);
  await expect(page.locator('video')).toHaveAttribute('controls', '');
  await expect(page.locator('video')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('video').evaluate((media) => media.paused)).toBe(true);
  await expect(page.getByTestId('persistent-waveform')).toBeVisible();
  await expect(page.locator('select[aria-label="Playback format"]')).toHaveCount(0);

  await expect.poll(() => page.getByTestId('persistent-waveform').evaluate((wrap) => {
    const host = [...wrap.querySelectorAll('*')].find((element) => element.shadowRoot);
    const canvases = [...(host?.shadowRoot?.querySelectorAll('canvas') || [])];
    let renderedColumns = 0;
    let totalColumns = 0;
    for (const canvas of canvases) {
      const context = canvas.getContext('2d');
      if (!context || canvas.width === 0 || canvas.height === 0) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      totalColumns += canvas.width;
      for (let x = 0; x < canvas.width; x += 1) {
        let columnHasWaveform = false;
        for (let y = 0; y < canvas.height; y += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
            columnHasWaveform = true;
            break;
          }
        }
        if (columnHasWaveform) renderedColumns += 1;
      }
    }
    return totalColumns ? renderedColumns / totalColumns : 0;
  })).toBeGreaterThan(0.5);

  await expect.poll(() => page.getByTestId('persistent-waveform').evaluate((wrap) => {
    const host = [...wrap.querySelectorAll('*')].find((element) => element.shadowRoot);
    const canvases = [...(host?.shadowRoot?.querySelectorAll('canvas') || [])];
    const spans = [];
    let tallestCanvas = 0;
    for (const canvas of canvases) {
      const context = canvas.getContext('2d');
      if (!context || canvas.width === 0 || canvas.height === 0) continue;
      tallestCanvas = Math.max(tallestCanvas, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let x = 0; x < canvas.width; x += 1) {
        let top = canvas.height;
        let bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
            top = Math.min(top, y);
            bottom = y;
          }
        }
        if (bottom >= top) spans.push(bottom - top + 1);
      }
    }
    if (!tallestCanvas || spans.length === 0) return 0;
    return (Math.max(...spans) - Math.min(...spans)) / tallestCanvas;
  })).toBeGreaterThan(0.3);

  const videoBox = await page.locator('video').boundingBox();
  const renderedWaveformBox = await page.getByTestId('persistent-waveform').boundingBox();
  expect(videoBox).not.toBeNull();
  expect(renderedWaveformBox).not.toBeNull();
  expect(renderedWaveformBox.width).toBeGreaterThan(300);
  expect(renderedWaveformBox.height).toBeGreaterThanOrEqual(96);
  expect(renderedWaveformBox.y).toBeGreaterThan(videoBox.y + videoBox.height);
  await page.locator('video').evaluate((media) => media.play());
  await expect.poll(() => page.locator('video').evaluate((media) => media.paused)).toBe(false);

  // The original live FFT—not WaveSurfer's static amplitude bars—is visible
  // and contains actual non-background pixels while the fixture is playing.
  await expect(page.getByTestId('live-spectrum')).toBeVisible();
  await expect.poll(() => page.getByTestId('live-spectrum').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let firstColoredRow = canvas.height;
    for (let pixel = 0; pixel < pixels.length / 4; pixel += 1) {
      if (pixels[pixel * 4 + 3] > 0) firstColoredRow = Math.min(firstColoredRow, Math.floor(pixel / canvas.width));
    }
    return firstColoredRow;
  })).toBeLessThan(36);

  const waveform = page.getByTestId('persistent-waveform');
  const box = await waveform.boundingBox();
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect.poll(() => page.locator('video').evaluate((media) => media.currentTime)).toBeGreaterThan(3);

  await page.locator('video').evaluate((media) => media.dispatchEvent(new Event('ended')));
  await expect(page.getByText('Audio Item', { exact: true }).last()).toBeVisible();
  await expect(page.locator('video')).toHaveAttribute('src', /__mixed_fixture__\.mp3/);
  await expect(page.locator('video')).toHaveCSS('opacity', '0');
  await expect(page.getByTestId('persistent-waveform')).toBeVisible();
  await expect.poll(() => page.getByTestId('persistent-waveform').evaluate((wrap) => {
    const host = [...wrap.querySelectorAll('*')].find((element) => element.shadowRoot);
    const canvases = [...(host?.shadowRoot?.querySelectorAll('canvas') || [])];
    const spans = [];
    let tallestCanvas = 0;
    for (const canvas of canvases) {
      const context = canvas.getContext('2d');
      if (!context || canvas.width === 0 || canvas.height === 0) continue;
      tallestCanvas = Math.max(tallestCanvas, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let x = 0; x < canvas.width; x += 1) {
        let top = canvas.height;
        let bottom = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
            top = Math.min(top, y);
            bottom = y;
          }
        }
        if (bottom >= top) spans.push(bottom - top + 1);
      }
    }
    if (!tallestCanvas || spans.length === 0) return 0;
    return (Math.max(...spans) - Math.min(...spans)) / tallestCanvas;
  })).toBeGreaterThan(0.3);
  await page.locator('video').evaluate((media) => media.pause());
  // The video and its waveform reuse the MP4 grant; the following audio item
  // reuses its MP3 grant for playback and visualization.
  expect(streamAuthorizationRequests).toBe(2);
});
