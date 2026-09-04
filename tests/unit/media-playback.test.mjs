import assert from 'node:assert/strict';
import test from 'node:test';
import { isVideoFormat, playbackFormatFor, waveformFormatFor } from '../../src/lib/mediaPlayback.js';

test('video is a first-class playlist item without a format choice', () => {
  const track = { streamUrls: { wav: '/wav', mp3: '/mp3', mp4: '/video' } };
  assert.equal(playbackFormatFor(track), 'mp4');
  assert.equal(isVideoFormat(playbackFormatFor(track)), true);
});

test('audio playlist items prefer MP3 while preserving other uploads', () => {
  assert.equal(playbackFormatFor({ streamUrls: { wav: '/wav', aac: '/aac', mp3: '/mp3' } }), 'mp3');
  assert.equal(playbackFormatFor({ streamUrls: { wav: '/wav', aac: '/aac' } }), 'aac');
});

test('video uses its shared-basename audio variant to draw the waveform', () => {
  const track = { streamUrls: { mp4: '/video', wav: '/wav', mp3: '/mp3' } };
  assert.equal(waveformFormatFor(track), 'mp3');
});
