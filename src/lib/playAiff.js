/**
 * Fetches an AIFF file and returns a playable Blob URL.
 * Uses @audio/decode-aiff to decode AIFF to PCM, then wraps in a WAV container.
 * Works in all browsers.
 */

export async function aiffToBlobUrl(url, fetchOptions = {}) {
  const decode = (await import('@audio/decode-aiff')).default;
  const response = await fetch(url, fetchOptions);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const { channelData, sampleRate } = await decode(buffer);

  const numChannels = channelData.length;
  const numFrames = channelData[0].length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  // WAV header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, s * 0x7FFF, true);
      offset += 2;
    }
  }

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
