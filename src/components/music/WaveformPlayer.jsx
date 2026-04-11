'use client';

import React, { useRef, useEffect, useState } from 'react';
import Style from './WaveformPlayer.module.scss';

// Fat, gappy bars for a modern bargraph look. Each bar = one amplitude slice.
const WS_OPTS = {
  waveColor: 'rgba(128, 128, 128, 0.35)',
  progressColor: 'rgba(0, 168, 120, 0.85)',
  cursorColor: 'rgba(124, 58, 237, 0.85)',
  cursorWidth: 2,
  barWidth: 5,
  barGap: 3,
  barRadius: 3,
  height: 72,
  normalize: true,
};

/**
 * @param {Object} props.streamUrls - { mp3?: url, wav?: url, aiff?: url }
 */
export default function WaveformPlayer({ streamUrls, isPlaying, onPlayPause, onEnd, onPrev, onNext, fetchHeaders }) {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loadError, setLoadError] = useState(null);

  const urlsKey = JSON.stringify(streamUrls || {});

  useEffect(() => {
    if (!streamUrls || !containerRef.current) return;

    let ws;
    let destroyed = false;

    // Try formats in order: aiff (decoded), wav, mp3
    // Fall back if one fails (e.g. CORS on AIFF)
    const candidates = [];
    if (streamUrls.aiff) candidates.push({ url: streamUrls.aiff, fmt: 'aiff' });
    if (streamUrls.wav) candidates.push({ url: streamUrls.wav, fmt: 'wav' });
    if (streamUrls.mp3) candidates.push({ url: streamUrls.mp3, fmt: 'mp3' });

    async function tryLoad(index) {
      if (destroyed || index >= candidates.length) {
        if (!destroyed) setLoadError('Failed to load audio');
        return;
      }

      const { url, fmt } = candidates[index];
      const WaveSurfer = (await import('wavesurfer.js')).default;
      if (destroyed) return;

      try {
        if (fmt === 'aiff') {
          const { default: decodeAiff } = await import('@audio/decode-aiff');
          const response = await fetch(url, fetchHeaders ? { headers: fetchHeaders } : undefined);
          if (!response.ok) throw new Error(`Fetch ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const { channelData, sampleRate } = await decodeAiff(arrayBuffer);

          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const audioBuffer = audioCtx.createBuffer(channelData.length, channelData[0].length, sampleRate);
          for (let ch = 0; ch < channelData.length; ch++) {
            audioBuffer.getChannelData(ch).set(channelData[ch]);
          }
          audioCtx.close();

          if (destroyed) return;
          ws = WaveSurfer.create({ container: containerRef.current, ...WS_OPTS });
          ws.loadBlob(audioBufferToWavBlob(audioBuffer));
        } else {
          // MP3/WAV — same-origin, WaveSurfer handles natively
          if (destroyed) return;
          const wsOpts = { container: containerRef.current, ...WS_OPTS, url };
          if (fetchHeaders) wsOpts.fetchParams = { headers: fetchHeaders };
          ws = WaveSurfer.create(wsOpts);
        }

        ws.on('ready', () => {
          if (destroyed) return;
          setReady(true);
          setDuration(ws.getDuration());
          ws.setVolume(volume);
        });
        ws.on('timeupdate', (t) => { if (!destroyed) setCurrentTime(t); });
        ws.on('seeking', (t) => { if (!destroyed) setCurrentTime(t); });
        // Snap to true zero on clicks within ~1s of the start so "click the
        // very beginning to restart" actually does, instead of landing at 0.03.
        ws.on('interaction', (t) => {
          if (destroyed) return;
          if (t < 1) {
            try { ws.seekTo(0); } catch {}
            setCurrentTime(0);
          }
        });
        ws.on('finish', () => { if (!destroyed && onEnd) onEnd(); });
        ws.on('error', () => {
          // WaveSurfer failed to decode this format — try next
          if (!destroyed) {
            try { ws.destroy(); } catch {}
            ws = null;
            tryLoad(index + 1);
          }
        });

        wavesurferRef.current = ws;
      } catch {
        // Fetch/decode failed — try next format
        if (!destroyed) tryLoad(index + 1);
      }
    }

    tryLoad(0);

    return () => {
      destroyed = true;
      if (ws) { try { ws.destroy(); } catch {} }
      wavesurferRef.current = null;
      setReady(false);
      setCurrentTime(0);
      setDuration(0);
      setLoadError(null);
    };
  }, [urlsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !ready) return;
    if (isPlaying && !ws.isPlaying()) ws.play();
    else if (!isPlaying && ws.isPlaying()) ws.pause();
  }, [isPlaying, ready]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (ws && ready) ws.setVolume(volume);
  }, [volume, ready]);

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function seekToStart() {
    const ws = wavesurferRef.current;
    if (!ws || !ready) return;
    try { ws.seekTo(0); } catch {}
    setCurrentTime(0);
  }

  return (
    <div className={Style.player}>
      <div className={Style.controls}>
        {onPrev && (
          <button className={Style.transportBtn} onClick={onPrev} aria-label="Previous">
            <i className="fa-solid fa-backward-step" />
          </button>
        )}
        <button
          className={Style.transportBtn}
          onClick={seekToStart}
          aria-label="Restart track"
          title="Restart (0:00)"
          disabled={!ready}
        >
          <i className="fa-solid fa-rotate-left" />
        </button>
        <button className={Style.playPauseBtn} onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
          <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
        </button>
        {onNext && (
          <button className={Style.transportBtn} onClick={onNext} aria-label="Next">
            <i className="fa-solid fa-forward-step" />
          </button>
        )}
      </div>

      <div className={Style.waveformWrap}>
        <div ref={containerRef} className={Style.waveform} />
        {!ready && !loadError && (
          <div className={Style.waveformLoading}><div className={Style.miniSpinner} /></div>
        )}
        {loadError && (
          <div className={Style.waveformLoading}>
            <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{loadError}</span>
          </div>
        )}
      </div>

      <div className={Style.meta}>
        <span className={Style.time}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className={Style.volumeWrap}>
          <i className={`fa-solid ${volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className={Style.volumeSlider}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}

function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const blockAlign = numChannels * 2;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);

  writeStr(v, 0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  writeStr(v, 8, 'WAVE');
  writeStr(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  writeStr(v, 36, 'data');
  v.setUint32(40, dataSize, true);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let off = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      v.setInt16(off, Math.max(-1, Math.min(1, channels[ch][i])) * 0x7FFF, true);
      off += 2;
    }
  }

  return new Blob([buf], { type: 'audio/wav' });
}

function writeStr(v, o, s) {
  for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}
