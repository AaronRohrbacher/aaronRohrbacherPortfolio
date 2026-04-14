'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Style from '@/components/music/MusicPlaylist.module.scss';
import { useAuth } from '@/components/music/AuthContext';
import { useMusicPlayer } from '@/components/music/MusicPlayerContext';
import Link from 'next/link';
import { useMusicHref } from '@/lib/musicLinks';
import { renderRichText } from '@/lib/richText';

export default function DumpPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const shareToken = searchParams.get('share');
  const { getAuthHeaders } = useAuth();
  const {
    currentTrack,
    isPlaying,
    pending,
    playTrack,
    setQueue: setPlayerQueue,
    setMinimized,
    analyserHolderRef,
  } = useMusicPlayer();
  const musicHref = useMusicHref();

  const [dump, setDump] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDump();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDump() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const url = `/api/music/dump?id=${encodeURIComponent(id)}${shareToken ? `&share=${encodeURIComponent(shareToken)}` : ''}`;
      const res = await fetch(url, { headers });
      if (res.status === 401) {
        setError('sign-in');
        return;
      }
      if (res.status === 403) {
        setError('denied');
        return;
      }
      if (!res.ok) {
        setError('not-found');
        return;
      }
      const data = await res.json();
      setDump(data.dump);
      setTracks(data.tracks || []);
      setPlayerQueue(data.tracks || []);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  }

  function handlePlay(track, index) {
    playTrack(track, index, tracks);
  }

  function getDownloadUrl(track, format) {
    const share = shareToken ? `&share=${encodeURIComponent(shareToken)}` : '';
    return `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${format}&download=1${share}`;
  }

  if (loading) {
    return (
      <div className={Style.page}>
        <div className={Style.loading}>
          <div className={Style.spinner} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error === 'sign-in') {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>You need to sign in to view this content.</p>
          <Link href={musicHref('/login')} className={Style.retryBtn}>Sign In</Link>
        </div>
      </div>
    );
  }

  if (error === 'denied') {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>You don&apos;t have access to this content.</p>
          <Link href={musicHref('/')} className={Style.retryBtn}>Back to Music</Link>
        </div>
      </div>
    );
  }

  if (error || !dump) {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>Could not find this release.</p>
          <Link href={musicHref('/')} className={Style.retryBtn}>Back to Music</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={Style.page}>
      <div className={Style.dumpSection}>
        <div className={Style.dumpHeader}>
          <h1 className={Style.dumpTitle}>{dump.name}</h1>
          {dump.artists && <p className={Style.dumpArtists}>{renderRichText(dump.artists)}</p>}
          {dump.description && <p className={Style.dumpDesc}>{renderRichText(dump.description)}</p>}
        </div>
        <div className={Style.trackList}>
          {tracks.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              index={index}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              pending={pending}
              onPlay={handlePlay}
              onExpand={() => setMinimized(false)}
              analyserHolderRef={analyserHolderRef}
              getDownloadUrl={getDownloadUrl}
            />
          ))}
        </div>
        {tracks.length === 0 && (
          <div className={Style.empty}>
            <p>No tracks in this release yet.</p>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href={musicHref('/')} className={Style.retryBtn}>
          <i className="fa-solid fa-arrow-left" /> All Music
        </Link>
      </div>
    </div>
  );
}

// Tiny live FFT rendered into the list-item play button. Reads from the
// same AnalyserNode the big player's waveform uses, via the context-level
// holder. Rendering stops automatically when the holder clears (track
// changed, player closed).
function MiniFFT({ analyserHolderRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const cnv = canvasRef.current;
    if (!cnv) return;
    let raf;
    const smoothed = new Float32Array(12);
    const freq = new Uint8Array(256);
    const ATTACK = 0.6;
    const DECAY = 0.18;
    function frame() {
      const analyser = analyserHolderRef?.current?.current;
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = c.clientWidth;
      const cssH = c.clientHeight;
      if (c.width !== Math.floor(cssW * dpr) || c.height !== Math.floor(cssH * dpr)) {
        c.width = Math.floor(cssW * dpr);
        c.height = Math.floor(cssH * dpr);
      }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (analyser) {
        const bins = Math.min(freq.length, analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
        const perBar = Math.max(1, Math.floor(bins / smoothed.length));
        for (let i = 0; i < smoothed.length; i++) {
          let sum = 0;
          for (let j = 0; j < perBar; j++) sum += freq[i * perBar + j] || 0;
          const target = (sum / perBar) / 255;
          const prev = smoothed[i];
          smoothed[i] = target > prev ? prev + (target - prev) * ATTACK : prev + (target - prev) * DECAY;
        }
      } else {
        for (let i = 0; i < smoothed.length; i++) smoothed[i] *= 0.9;
      }

      const gap = 1;
      const totalGap = gap * (smoothed.length - 1);
      const barW = Math.max(1, (cssW - totalGap) / smoothed.length);
      const floorH = 1.5;
      for (let i = 0; i < smoothed.length; i++) {
        const h = Math.max(floorH, smoothed[i] * (cssH - 2));
        const x = i * (barW + gap);
        const y = cssH - h;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(x, y, barW, h);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [analyserHolderRef]);
  return <canvas ref={canvasRef} className={Style.miniFFT} aria-hidden="true" />;
}

function TrackCard({ track, index, currentTrack, isPlaying, pending, onPlay, onExpand, analyserHolderRef, getDownloadUrl }) {
  const isActive = currentTrack?.id === track.id;
  const showWaveform = isActive && isPlaying && !pending;
  const formats = Array.isArray(track.formats) ? track.formats : Object.keys(track.formats);

  const handleClick = () => {
    if (pending) return;
    if (isActive) {
      // Active track: never pause from the list. Take the user to the big
      // player instead so they use the dedicated pause control there.
      if (onExpand) onExpand();
      return;
    }
    onPlay(track, index);
  };

  return (
    <div className={[Style.trackCard, isActive ? Style.active : ''].join(' ')}>
      <button
        className={Style.playBtn}
        onClick={handleClick}
        disabled={pending}
        aria-label={
          pending
            ? 'Loading'
            : isActive
              ? `Open player for ${track.name}`
              : `Play ${track.name}`
        }
      >
        {pending ? (
          <span className={Style.btnSpinner} aria-hidden="true" />
        ) : showWaveform ? (
          <MiniFFT analyserHolderRef={analyserHolderRef} />
        ) : (
          <i className="fa-solid fa-play" />
        )}
      </button>
      <div className={Style.trackInfo}>
        <h3 className={Style.trackName}>{track.name}</h3>
        {track.artists && <p className={Style.trackArtists}>{renderRichText(track.artists)}</p>}
        {track.description && <p className={Style.trackDesc}>{renderRichText(track.description)}</p>}
        <div className={Style.trackActionsRow}>
          <div className={Style.downloadGroup}>
            {formats.map((fmt) => (
              <a key={fmt} href={getDownloadUrl(track, fmt)} className={Style.downloadBtn}>
                <i className="fa-solid fa-download" aria-hidden="true" />
                <span className={Style.dlLabel}>
                  <span className={Style.dlKicker}>Download</span>
                  <span className={Style.dlFormat}>{fmt.toUpperCase()}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
