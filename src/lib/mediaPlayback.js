const VIDEO_FORMATS = Object.freeze(['mp4', 'm4v', 'webm', 'mov']);
const AUDIO_FORMATS = Object.freeze(['mp3', 'aac', 'm4a', 'wav', 'aiff', 'aif']);

export function isVideoFormat(format) {
  return VIDEO_FORMATS.includes(String(format || '').toLowerCase());
}

// A playlist item chooses its playable upload automatically. Video is a
// first-class queue item; audio otherwise prefers the web-friendly MP3.
// Lossless/AAC variants remain available as downloads and are only playback
// fallbacks when no MP3 was uploaded.
export function playbackFormatFor(track) {
  const available = new Set(Object.keys(track?.streamUrls || {}).map((format) => format.toLowerCase()));
  return [...VIDEO_FORMATS, ...AUDIO_FORMATS].find((format) => available.has(format)) || '';
}

export function waveformFormatFor(track) {
  const available = new Set(Object.keys(track?.streamUrls || {}).map((format) => format.toLowerCase()));
  return AUDIO_FORMATS.find((format) => available.has(format)) || playbackFormatFor(track);
}
