'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Style from '@/components/music/MusicPlaylist.module.scss';
import { useAuth } from '@/components/music/AuthContext';
import { useMusicPlayer } from '@/components/music/MusicPlayerContext';
import { useMusicHref } from '@/lib/musicLinks';

export default function TrackPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const shareToken = searchParams.get('share');
  const { getAuthHeaders } = useAuth();
  const { currentTrack, isPlaying, playTrack, setQueue: setPlayerQueue } = useMusicPlayer();
  const musicHref = useMusicHref();

  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTrack();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTrack() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const url = `/api/music/track?id=${encodeURIComponent(id)}${shareToken ? `&share=${encodeURIComponent(shareToken)}` : ''}`;
      const res = await fetch(url, { headers });
      if (res.status === 401) { setError('sign-in'); return; }
      if (res.status === 403) { setError('denied'); return; }
      if (!res.ok)            { setError('not-found'); return; }
      const data = await res.json();
      setTrack(data.track);
      setPlayerQueue([data.track]);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  }

  function handlePlay() {
    if (track) playTrack(track, 0, [track]);
  }

  function getDownloadUrl(format) {
    const share = shareToken ? `&share=${encodeURIComponent(shareToken)}` : '';
    return `/api/music/stream?id=${encodeURIComponent(id)}&format=${format}&download=1${share}`;
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
          <p>You need to sign in to view this track.</p>
          <Link href={musicHref('/login')} className={Style.retryBtn}>Sign In</Link>
        </div>
      </div>
    );
  }

  if (error === 'denied') {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>You don&apos;t have access to this track.</p>
          <Link href={musicHref('/')} className={Style.retryBtn}>Back to Music</Link>
        </div>
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>Could not find this track.</p>
          <Link href={musicHref('/')} className={Style.retryBtn}>Back to Music</Link>
        </div>
      </div>
    );
  }

  const isActive = currentTrack?.id === track.id;
  const formats = track.formats || [];

  return (
    <div className={Style.page}>
      <div className={Style.dumpSection}>
        <div className={Style.dumpHeader}>
          <h1 className={Style.dumpTitle}>{track.name}</h1>
          {track.artists && <p className={Style.dumpArtists}>{track.artists}</p>}
          {track.description && <p className={Style.dumpDesc}>{track.description}</p>}
        </div>
        <div className={Style.trackList}>
          <div className={[Style.trackCard, isActive ? Style.active : ''].join(' ')}>
            <button
              className={Style.playBtn}
              onClick={handlePlay}
              aria-label={isActive && isPlaying ? `Pause ${track.name}` : `Play ${track.name}`}
            >
              <i className={isActive && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
            </button>
            <div className={Style.trackInfo}>
              <h3 className={Style.trackName}>{track.name}</h3>
              {track.artists && <p className={Style.trackArtists}>{track.artists}</p>}
              <div className={Style.trackActionsRow}>
                <button className={Style.playInline} onClick={handlePlay}>
                  <i className={isActive && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
                  {isActive && isPlaying ? ' Pause' : ' Play in Browser'}
                </button>
                <div className={Style.downloadGroup}>
                  {formats.map((fmt) => (
                    <a key={fmt} href={getDownloadUrl(fmt)} className={Style.downloadLink}>
                      <i className="fa-solid fa-download" /> Download {fmt.toUpperCase()}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href={musicHref('/')} className={Style.retryBtn}>
          <i className="fa-solid fa-arrow-left" /> All Music
        </Link>
      </div>
    </div>
  );
}
