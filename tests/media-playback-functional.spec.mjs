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
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'libmp3lame', '-q:a', '7', mp3Path]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x301060:s=320x180:d=6', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=6', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', mp4Path]);
  mp3Fixture = readFileSync(mp3Path);
  mp4Fixture = readFileSync(mp4Path);
});

test.afterAll(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

test('video plays as a queued item beside a persistent waveform, then advances to audio', async ({ page }) => {
  let streamAuthorizationRequests = 0;
  const streamUrls = (id) => ({
    mp3: `/api/stream?id=${id}&format=mp3`,
    ...(id === 'video-item' ? { mp4: `/api/stream?id=${id}&format=mp4` } : {}),
  });
  const tracks = [
    { id: 'video-item', name: 'Video Item', formats: ['mp3', 'mp4'], streamUrls: streamUrls('video-item') },
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
  await expect(page.locator('video')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('persistent-waveform')).toBeVisible();
  await expect(page.locator('select[aria-label="Playback format"]')).toHaveCount(0);

  await expect.poll(() => page.getByTestId('persistent-waveform').evaluate((wrap) => {
    const host = [...wrap.querySelectorAll('*')].find((element) => element.shadowRoot);
    return host?.shadowRoot?.querySelectorAll('canvas').length || 0;
  })).toBeGreaterThan(0);

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
  // Video needs one MP4 playback grant plus one MP3 visualization grant;
  // audio reuses its single MP3 grant for both playback and visualization.
  expect(streamAuthorizationRequests).toBe(3);
});
