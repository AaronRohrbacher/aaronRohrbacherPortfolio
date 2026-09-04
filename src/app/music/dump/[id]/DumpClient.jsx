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
  const { getAuthHeaders, authVersion } = useAuth();
  const {
    currentTrack,
    isPlaying,
    pending,
    playTrack,
    setQueue: setPlayerQueue,
    setMinimized,
    spectrumDataRef,
  } = useMusicPlayer();
  const musicHref = useMusicHref();

  const [dump, setDump] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDump();
  }, [id, authVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDump() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const url = `/api/dump?id=${encodeURIComponent(id)}${shareToken ? `&share=${encodeURIComponent(shareToken)}` : ''}`;
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
    return `/api/stream?id=${encodeURIComponent(track.id)}&format=${format}&download=1${share}`;
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
              spectrumDataRef={spectrumDataRef}
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

function MiniFFT({ spectrumDataRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let animation;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
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
      const spectrum = spectrumDataRef?.current || [];
      const barCount = 12;
      const gap = 1;
      const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
      for (let bar = 0; bar < barCount; bar += 1) {
        const start = Math.floor((bar * spectrum.length) / barCount);
        const end = Math.max(start + 1, Math.floor(((bar + 1) * spectrum.length) / barCount));
        let total = 0;
        for (let index = start; index < end; index += 1) total += spectrum[index] || 0;
        const barHeight = Math.max(1.5, (total / (end - start)) * (height - 2));
        context.fillStyle = 'rgba(255, 255, 255, 0.95)';
        context.fillRect(bar * (barWidth + gap), height - barHeight, barWidth, barHeight);
      }
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (animation) cancelAnimationFrame(animation); };
  }, [spectrumDataRef]);
  return <canvas ref={canvasRef} className={Style.miniFFT} aria-hidden="true" />;
}

function TrackCard({ track, index, currentTrack, isPlaying, pending, onPlay, onExpand, spectrumDataRef, getDownloadUrl }) {
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
          <MiniFFT spectrumDataRef={spectrumDataRef} />
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
