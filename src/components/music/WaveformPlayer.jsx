'use client';

import React, { useEffect, useRef, useState } from 'react';
import Style from './WaveformPlayer.module.scss';
import { useMusicPlayer } from './MusicPlayerContext';
import { useAuth } from './AuthContext';
import { waveformFormatFor } from '@/lib/mediaPlayback';

// Preserve the original player visual: a live, 48-band spectrum with a cyan
// playhead. Spectrum samples are calculated from the already-decoded audio
// used by the waveform UI, leaving the persistent media element on its native
// output path for reliable background playback.
const EQ_BAR_COUNT = 48;
const SPECTRUM_WINDOW_SIZE = 512;
const SPECTRUM_WINDOW = Float32Array.from(
  { length: SPECTRUM_WINDOW_SIZE },
  // Web Audio's analyser uses a Blackman window (alpha 0.16).
  (_, index) => 0.42
    - 0.5 * Math.cos((2 * Math.PI * index) / SPECTRUM_WINDOW_SIZE)
    + 0.08 * Math.cos((4 * Math.PI * index) / SPECTRUM_WINDOW_SIZE),
);

const WS_OPTS = {
  waveColor: 'rgba(0, 0, 0, 0)',
  progressColor: 'rgba(0, 0, 0, 0)',
  cursorColor: 'rgba(0, 229, 255, 0.95)',
  cursorWidth: 2,
  barWidth: 1,
  barGap: 0,
  barRadius: 0,
  height: 72,
  normalize: true,
  dragToSeek: true,
};

function formatTime(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function extractPeaks(buffer) {
  const channelCount = Math.min(2, buffer.numberOfChannels);
  const peaks = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    const samples = buffer.getChannelData(channel);
    const output = new Float32Array(Math.min(900, samples.length));
    const bucketSize = samples.length / output.length;
    for (let bucket = 0; bucket < output.length; bucket += 1) {
      const start = Math.floor(bucket * bucketSize);
      const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
      let peak = 0;
      for (let index = start; index < end; index += 1) {
        if (Math.abs(samples[index]) > Math.abs(peak)) peak = samples[index];
      }
      output[bucket] = peak;
    }
    peaks.push(output);
  }
  return peaks;
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function buildBinEdges(barCount, binCount) {
  const edges = new Array(barCount + 1);
  let previous = 0;
  for (let index = 0; index <= barCount; index += 1) {
    let edge = Math.round(Math.exp(Math.log(binCount) * (index / barCount)));
    if (edge <= previous) edge = previous + 1;
    if (edge > binCount) edge = binCount;
    edges[index] = edge;
    previous = edge;
  }
  edges[0] = 0;
  edges[barCount] = binCount;
  return edges;
}

const BIN_EDGES = buildBinEdges(EQ_BAR_COUNT, SPECTRUM_WINDOW_SIZE / 2);

function spectrumAtTime(buffer, seconds, output, real, imaginary) {
  const samples = buffer.getChannelData(0);
  const center = Math.floor(Math.max(0, seconds) * buffer.sampleRate);
  const start = Math.max(0, Math.min(samples.length - SPECTRUM_WINDOW_SIZE, center - SPECTRUM_WINDOW_SIZE / 2));

  for (let index = 0; index < SPECTRUM_WINDOW_SIZE; index += 1) {
    real[index] = (samples[start + index] || 0) * SPECTRUM_WINDOW[index];
    imaginary[index] = 0;
  }

  // In-place radix-2 FFT, yielding the same 256 linear-frequency bins as the
  // original AnalyserNode with fftSize=512.
  for (let index = 1, reversed = 0; index < SPECTRUM_WINDOW_SIZE; index += 1) {
    let bit = SPECTRUM_WINDOW_SIZE >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= SPECTRUM_WINDOW_SIZE; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const rootReal = Math.cos(angle);
    const rootImaginary = Math.sin(angle);
    for (let offset = 0; offset < SPECTRUM_WINDOW_SIZE; offset += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let index = 0; index < length / 2; index += 1) {
        const even = offset + index;
        const odd = even + length / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * rootReal - twiddleImaginary * rootImaginary;
        twiddleImaginary = twiddleReal * rootImaginary + twiddleImaginary * rootReal;
        twiddleReal = nextReal;
      }
    }
  }

  for (let band = 0; band < EQ_BAR_COUNT; band += 1) {
    const firstBin = BIN_EDGES[band];
    const finalBin = BIN_EDGES[band + 1];
    let total = 0;
    for (let bin = firstBin; bin < finalBin; bin += 1) {
      const magnitude = Math.hypot(real[bin], imaginary[bin]) / (SPECTRUM_WINDOW_SIZE / 2);
      const decibels = 20 * Math.log10(Math.max(magnitude, 1e-10));
      // AnalyserNode defaults: minDecibels=-100, maxDecibels=-30.
      total += Math.max(0, Math.min(1, (decibels + 100) / 70));
    }
    output[band] = finalBin > firstBin ? total / (finalBin - firstBin) : 0;
  }
}

export default function WaveformPlayer({ streamUrls, isPlaying, onPlayPause, onPrev, onNext }) {
  const { getAuthHeaders } = useAuth();
  const {
    currentTrack,
    pending,
    ready,
    currentTime,
    duration,
    volume,
    setVolume,
    seek,
    playbackError,
    mediaRef,
    spectrumDataRef,
    resolvedMedia,
  } = useMusicPlayer();
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const wavesurferRef = useRef(null);
  const animationRef = useRef(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const streamKey = JSON.stringify(streamUrls || {});

  useEffect(() => {
    const media = mediaRef.current;
    const container = containerRef.current;
    const waveformFormat = waveformFormatFor(currentTrack);
    const waveformEndpoint = waveformFormat && streamUrls?.[waveformFormat];
    if (!media || !container || !ready || !duration || !waveformEndpoint) return;

    let cancelled = false;
    let wavesurfer;
    setWaveformLoading(true);

    async function renderWaveform() {
      let audioContext;
      try {
        let resolved = resolvedMedia?.trackId === currentTrack.id && resolvedMedia.format === waveformFormat
          ? { url: resolvedMedia.url }
          : null;
        if (!resolved) {
          const headers = await getAuthHeaders();
          const endpoint = new URL(waveformEndpoint, window.location.href);
          endpoint.searchParams.set('urlOnly', '1');
          const authorization = await fetch(endpoint, { headers });
          if (!authorization.ok) throw new Error(`Waveform authorization failed (${authorization.status})`);
          resolved = await authorization.json();
          if (!resolved?.url) throw new Error('Waveform URL was unavailable');
        }

        const response = await fetch(new URL(resolved.url, window.location.href));
        if (!response.ok) throw new Error(`Waveform media failed (${response.status})`);
        const encodedAudio = await response.arrayBuffer();
        if (cancelled) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Audio decoding is unavailable');
        audioContext = new AudioContext();
        const decoded = await audioContext.decodeAudioData(encodedAudio.slice(0));
        if (cancelled) return;

        const WaveSurfer = (await import('wavesurfer.js')).default;
        if (cancelled) return;
        wavesurfer = WaveSurfer.create({
          container,
          media,
          peaks: extractPeaks(decoded),
          duration,
          ...WS_OPTS,
        });
        wavesurferRef.current = wavesurfer;

        const smoothed = spectrumDataRef.current;
        const raw = new Float32Array(EQ_BAR_COUNT);
        const fftReal = new Float32Array(SPECTRUM_WINDOW_SIZE);
        const fftImaginary = new Float32Array(SPECTRUM_WINDOW_SIZE);
        const draw = () => {
          const canvas = canvasRef.current;
          if (cancelled || !canvas) return;
          const dpr = window.devicePixelRatio || 1;
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
          }
          const context = canvas.getContext('2d');
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          context.clearRect(0, 0, width, height);

          if (!media.paused && !media.ended) spectrumAtTime(decoded, media.currentTime, raw, fftReal, fftImaginary);
          else raw.fill(0);
          for (let band = 0; band < EQ_BAR_COUNT; band += 1) {
            const speed = raw[band] > smoothed[band] ? 0.55 : 0.12;
            smoothed[band] += (raw[band] - smoothed[band]) * speed;
          }

          const gap = 2;
          const barWidth = Math.max(1, (width - gap * (EQ_BAR_COUNT - 1)) / EQ_BAR_COUNT);
          for (let band = 0; band < EQ_BAR_COUNT; band += 1) {
            const barHeight = Math.max(1.5, smoothed[band] * (height - 2));
            const x = band * (barWidth + gap);
            const y = height - barHeight;
            const gradient = context.createLinearGradient(0, y, 0, height);
            gradient.addColorStop(0, 'rgba(124, 58, 237, 0.95)');
            gradient.addColorStop(1, 'rgba(0, 168, 120, 0.95)');
            context.fillStyle = gradient;
            roundedRect(context, x, y, barWidth, barHeight, 1.5);
            context.fill();
          }
          animationRef.current = requestAnimationFrame(draw);
        };
        draw();
      } catch (error) {
        // Playback remains native and uninterrupted if visual decoding fails.
        console.warn('[WaveformPlayer] waveform render failed:', error);
      } finally {
        if (audioContext) audioContext.close().catch(() => {});
        if (!cancelled) setWaveformLoading(false);
      }
    }

    renderWaveform();
    return () => {
      cancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      spectrumDataRef.current.fill(0);
      if (wavesurfer) wavesurfer.destroy();
      if (wavesurferRef.current === wavesurfer) wavesurferRef.current = null;
    };
  }, [currentTrack, duration, getAuthHeaders, mediaRef, ready, resolvedMedia, streamKey, streamUrls]);

  return (
    <div className={Style.player}>
      <div className={Style.controls}>
        {onPrev && <button className={Style.transportBtn} onClick={onPrev} aria-label="Previous" disabled={pending}><i className="fa-solid fa-backward-step" /></button>}
        <button className={Style.transportBtn} onClick={() => seek(0)} aria-label="Restart track" disabled={!ready || pending}><i className="fa-solid fa-rotate-left" /></button>
        <button className={Style.playPauseBtn} onClick={pending ? undefined : onPlayPause} disabled={pending} aria-label={pending ? 'Loading' : isPlaying ? 'Pause' : 'Play'}>
          {pending ? <span className={Style.btnSpinner} aria-hidden="true" /> : <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />}
        </button>
        {onNext && <button className={Style.transportBtn} onClick={onNext} aria-label="Next" disabled={pending}><i className="fa-solid fa-forward-step" /></button>}
      </div>
      <div className={Style.waveformWrap} data-testid="persistent-waveform">
        <div ref={containerRef} className={Style.waveform} />
        <canvas ref={canvasRef} className={Style.eqCanvas} data-testid="live-spectrum" aria-hidden="true" />
        {waveformLoading && <div className={Style.waveformLoading}><div className={Style.miniSpinner} /></div>}
        {playbackError && !pending && <div className={Style.waveformError} role="alert"><i className="fa-solid fa-triangle-exclamation" /><span>{playbackError}</span></div>}
      </div>
      <div className={Style.meta}>
        <span className={Style.time}>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <div className={Style.volumeWrap}><i className={`fa-solid ${volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`} /><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(event.target.value)} className={Style.volumeSlider} aria-label="Volume" /></div>
      </div>
    </div>
  );
}
