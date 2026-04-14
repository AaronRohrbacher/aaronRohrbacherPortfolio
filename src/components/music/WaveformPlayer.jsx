'use client';

import React, { useRef, useEffect, useState } from 'react';
import Style from './WaveformPlayer.module.scss';
import { useMusicPlayer } from './MusicPlayerContext';

// The visible bars in the player are NOT WaveSurfer's amplitude waveform —
// they're a live FFT spectrum rendered to an overlay canvas. WaveSurfer is
// kept underneath purely for (a) audio decode + playback, (b) click-to-seek
// on the waveform track, and (c) progress/cursor positioning. Its own
// waveform + progress colors are made fully transparent so only the EQ bars
// show; the cursor stays faintly visible so users have a "playhead" cue.
const WS_OPTS = {
  waveColor: 'rgba(0, 0, 0, 0)',
  progressColor: 'rgba(0, 0, 0, 0)',
  // Cyan playhead — contrasts the purple→green bar gradient so the cursor
  // reads as a distinct "you are here" mark against the EQ bars.
  cursorColor: 'rgba(0, 229, 255, 0.95)',
  cursorWidth: 2,
  barWidth: 1,
  barGap: 0,
  barRadius: 0,
  height: 72,
  normalize: true,
};

// Number of EQ bars. The FFT produces fftSize/2 bins; we bucket them into
// log-spaced groups so the bass end gets more detail (matching how a DAW's
// spectrum analyser looks).
const EQ_BAR_COUNT = 48;
const EQ_FFT_SIZE = 512;

// Build log-spaced bin edges once. Each bar averages magnitudes for bins in
// its [start, end) range. Minimum span of 1 bin per bar so the low frequencies
// don't collapse to empty buckets.
function buildBinEdges(barCount, binCount) {
  const edges = new Array(barCount + 1);
  const minFreq = 1;
  const maxFreq = binCount;
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);
  let prev = 0;
  for (let i = 0; i <= barCount; i++) {
    const t = i / barCount;
    const f = Math.exp(logMin + (logMax - logMin) * t);
    let edge = Math.round(f);
    if (edge <= prev) edge = prev + 1;
    if (edge > binCount) edge = binCount;
    edges[i] = edge;
    prev = edge;
  }
  edges[0] = 0;
  edges[barCount] = binCount;
  return edges;
}

const BIN_EDGES = buildBinEdges(EQ_BAR_COUNT, EQ_FFT_SIZE / 2);

/**
 * @param {Object} props.streamUrls - { mp3?: url, wav?: url, aiff?: url }
 */
export default function WaveformPlayer({ streamUrls, isPlaying, onPlayPause, onEnd, onPrev, onNext, fetchHeaders }) {
  const { pending, analyserHolderRef, markPlaybackStarted, markPlaybackFailed } = useMusicPlayer();
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const wavesurferRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  // Smoothed bar heights held in a ref so the rAF loop can mutate without
  // triggering React re-renders every frame.
  const smoothedRef = useRef(new Float32Array(EQ_BAR_COUNT));
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loadError, setLoadError] = useState(null);
  const playbackConfirmedRef = useRef(false);

  const urlsKey = JSON.stringify(streamUrls || {});

  useEffect(() => {
    if (!streamUrls || !containerRef.current) return;

    // Explicitly clear any error/stalled visual state from a previous
    // track. React unmount already does this via local-state reset, but
    // being defensive here prevents any possible one-frame flash of a
    // stale overlay on track switch.
    setLoadError(null);

    let ws;
    let destroyed = false;

    // Prefer MP3 for playback: it streams instantly, while WAV/AIFF force a
    // full file download (tens of MB) before audio starts — and AIFF also
    // needs a JS decode pass through @audio/decode-aiff. Lossless downloads
    // are still reachable from the download buttons; streaming just needs
    // something that starts quickly.
    const candidates = [];
    if (streamUrls.mp3) candidates.push({ url: streamUrls.mp3, fmt: 'mp3' });
    if (streamUrls.wav) candidates.push({ url: streamUrls.wav, fmt: 'wav' });
    if (streamUrls.aiff) candidates.push({ url: streamUrls.aiff, fmt: 'aiff' });

    async function tryLoad(index) {
      if (destroyed || index >= candidates.length) {
        if (!destroyed) {
          setLoadError('Failed to load audio');
          markPlaybackFailed();
        }
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
          // MP3/WAV — the stream endpoint redirects to a cross-origin S3
          // (or CDN) URL, so the media element must opt into CORS up front
          // or the MediaElementAudioSourceNode → AnalyserNode path reads
          // silence (browser marks the element "tainted" without CORS).
          if (destroyed) return;
          const mediaEl = document.createElement('audio');
          mediaEl.crossOrigin = 'anonymous';
          mediaEl.preload = 'auto';
          const wsOpts = { container: containerRef.current, ...WS_OPTS, url, media: mediaEl };
          if (fetchHeaders) wsOpts.fetchParams = { headers: fetchHeaders };
          ws = WaveSurfer.create(wsOpts);
        }

        ws.on('ready', () => {
          if (destroyed) return;
          setReady(true);
          setDuration(ws.getDuration());
          ws.setVolume(volume);
          attachAnalyser(ws);
        });
        ws.on('timeupdate', (t) => {
          if (destroyed) return;
          setCurrentTime(t);
          // First non-zero tick = audio is actually flowing. Lifts the
          // context-level click gate so users can press play/pause again.
          if (!playbackConfirmedRef.current && t > 0) {
            playbackConfirmedRef.current = true;
            markPlaybackStarted();
          }
        });
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

    function attachAnalyser(wsInstance) {
      try {
        const mediaEl = wsInstance.getMediaElement && wsInstance.getMediaElement();
        if (!mediaEl) return;
        // AudioContext + MediaElementSource can only be created once per
        // media element, so we cache both on the element and reuse across
        // re-attaches (e.g. after a React re-render that re-inits WS).
        let ctx = audioCtxRef.current;
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
          audioCtxRef.current = ctx;
        }
        let source = mediaEl.__eqSource;
        if (!source) {
          source = ctx.createMediaElementSource(mediaEl);
          mediaEl.__eqSource = source;
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = EQ_FFT_SIZE;
        analyser.smoothingTimeConstant = 0.75;
        try { source.disconnect(); } catch {}
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
        // Publish to the context holder so list-item buttons can render a
        // tiny live waveform pulled from the same AnalyserNode.
        if (analyserHolderRef) analyserHolderRef.current.current = analyser;
        smoothedRef.current = new Float32Array(EQ_BAR_COUNT);
        startDrawLoop();
      } catch (err) {
        // If AnalyserNode attach fails, the canvas stays blank. Playback
        // still works via WaveSurfer.
        console.warn('[WaveformPlayer] analyser attach failed:', err);
      }
    }

    function startDrawLoop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const analyser = analyserRef.current;
      const canvas = canvasRef.current;
      if (!analyser || !canvas) return;
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const smoothed = smoothedRef.current;
      const ATTACK = 0.55;
      const DECAY = 0.12;

      function frame() {
        if (destroyed) return;
        const cnv = canvasRef.current;
        if (!cnv) { rafRef.current = requestAnimationFrame(frame); return; }
        const dpr = window.devicePixelRatio || 1;
        const cssW = cnv.clientWidth;
        const cssH = cnv.clientHeight;
        if (cnv.width !== Math.floor(cssW * dpr) || cnv.height !== Math.floor(cssH * dpr)) {
          cnv.width = Math.floor(cssW * dpr);
          cnv.height = Math.floor(cssH * dpr);
        }
        const ctx2d = cnv.getContext('2d');
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2d.clearRect(0, 0, cssW, cssH);

        analyser.getByteFrequencyData(freqData);

        // Bucket raw bins into EQ bars via pre-computed log edges.
        const rawHeights = new Array(EQ_BAR_COUNT);
        for (let i = 0; i < EQ_BAR_COUNT; i++) {
          const start = BIN_EDGES[i];
          const end = BIN_EDGES[i + 1];
          let sum = 0;
          let count = 0;
          for (let j = start; j < end; j++) { sum += freqData[j]; count++; }
          rawHeights[i] = count > 0 ? sum / count / 255 : 0;
        }

        // Attack/decay smoothing — fast-up, slow-down feels like a real meter.
        for (let i = 0; i < EQ_BAR_COUNT; i++) {
          const target = rawHeights[i];
          if (target > smoothed[i]) {
            smoothed[i] = smoothed[i] + (target - smoothed[i]) * ATTACK;
          } else {
            smoothed[i] = smoothed[i] + (target - smoothed[i]) * DECAY;
          }
        }

        const gap = 2;
        const totalGap = gap * (EQ_BAR_COUNT - 1);
        const barW = Math.max(1, (cssW - totalGap) / EQ_BAR_COUNT);
        const floorH = 1.5;

        for (let i = 0; i < EQ_BAR_COUNT; i++) {
          const h = Math.max(floorH, smoothed[i] * (cssH - 2));
          const x = i * (barW + gap);
          const y = cssH - h;
          // Gradient fade from purple top to accent green bottom — applied
          // to every bar regardless of playhead position so the EQ stays
          // fully saturated across the whole track.
          const grad = ctx2d.createLinearGradient(0, y, 0, cssH);
          grad.addColorStop(0, 'rgba(124, 58, 237, 0.95)');
          grad.addColorStop(1, 'rgba(0, 168, 120, 0.95)');
          ctx2d.fillStyle = grad;
          roundedRect(ctx2d, x, y, barW, h, 1.5);
          ctx2d.fill();
        }

        rafRef.current = requestAnimationFrame(frame);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    tryLoad(0);

    return () => {
      destroyed = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} }
      analyserRef.current = null;
      if (analyserHolderRef) analyserHolderRef.current.current = null;
      if (ws) { try { ws.destroy(); } catch {} }
      wavesurferRef.current = null;
      setReady(false);
      setCurrentTime(0);
      setDuration(0);
      setLoadError(null);
      playbackConfirmedRef.current = false;
    };
  }, [urlsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !ready) return;
    let cancelled = false;
    if (isPlaying && !ws.isPlaying()) {
      // Mobile browsers (iOS especially) suspend the AudioContext when the
      // tab backgrounds. Without resume() the media element still "plays"
      // but the entire WebAudio pipeline is frozen — no sound, and the
      // analyser reads zeros so the FFT canvas collapses to its 1.5px
      // floor bars. Resume before every play to be safe.
      const ctx = audioCtxRef.current;
      const startPlay = () => {
        if (cancelled) return;
        const w = wavesurferRef.current;
        if (!w || w.isPlaying()) return;
        // WaveSurfer's play() returns a Promise that rejects if the
        // underlying <audio> element refuses (autoplay policy, context
        // still suspended, media decode failure). Propagate that as a
        // real loadError so the user gets a genuine signal instead of
        // a dead-silent button.
        let p;
        try { p = w.play(); } catch (err) {
          if (!cancelled) {
            setLoadError('Playback blocked — tap play to retry');
            markPlaybackFailed();
          }
          return;
        }
        if (p && typeof p.then === 'function') {
          p.catch(() => {
            if (!cancelled) {
              setLoadError('Playback blocked — tap play to retry');
              markPlaybackFailed();
            }
          });
        }
      };
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(startPlay).catch(() => {
          if (!cancelled) {
            setLoadError('Audio blocked by browser — tap play to retry');
            markPlaybackFailed();
          }
        });
      } else {
        startPlay();
      }
    } else if (!isPlaying && ws.isPlaying()) {
      ws.pause();
    }
    return () => { cancelled = true; };
  }, [isPlaying, ready]);

  // Resume the AudioContext on any user gesture or when the tab returns to
  // the foreground. iOS requires resume() to run inside a gesture callback,
  // so we listen at the document level and catch any click/touch — this is
  // the only way to recover an audio pipeline that was suspended while the
  // phone was locked.
  useEffect(() => {
    function resume() {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }
    function onVisible() {
      if (document.visibilityState === 'visible') resume();
    }
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('touchstart', resume, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('touchstart', resume);
    };
  }, []);

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
          <button className={Style.transportBtn} onClick={onPrev} aria-label="Previous" disabled={pending}>
            <i className="fa-solid fa-backward-step" />
          </button>
        )}
        <button
          className={Style.transportBtn}
          onClick={seekToStart}
          aria-label="Restart track"
          title="Restart (0:00)"
          disabled={!ready || pending}
        >
          <i className="fa-solid fa-rotate-left" />
        </button>
        <button
          className={Style.playPauseBtn}
          onClick={pending ? undefined : onPlayPause}
          disabled={pending}
          aria-label={pending ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
        >
          {pending ? (
            <span className={Style.btnSpinner} aria-hidden="true" />
          ) : (
            <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
          )}
        </button>
        {onNext && (
          <button
            className={Style.transportBtn}
            onClick={onNext}
            aria-label="Next"
            disabled={pending}
          >
            <i className="fa-solid fa-forward-step" />
          </button>
        )}
      </div>

      <div className={Style.waveformWrap}>
        <div ref={containerRef} className={Style.waveform} />
        {/* The EQ canvas sits above the waveform and is the only thing the
            user sees — WaveSurfer's own bars are made transparent. Clicks
            must still fall through to the waveform div for seeking, so the
            canvas is pointer-events:none. */}
        <canvas ref={canvasRef} className={Style.eqCanvas} />
        {!ready && !loadError && (
          <div className={Style.waveformLoading}><div className={Style.miniSpinner} /></div>
        )}
        {/* Error overlay is shown only when loadError is set AND we're
            not currently re-loading — the signal comes from tryLoad /
            play-rejection paths, which also flip `pending` back off. */}
        {loadError && !pending && (
          <div className={Style.waveformError} role="alert">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <span>{loadError}</span>
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
