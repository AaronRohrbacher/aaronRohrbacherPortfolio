'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Style from '@/components/music/MusicPlaylist.module.scss';
import { useAuth } from '@/components/music/AuthContext';
import { useMusicPlayer } from '@/components/music/MusicPlayerContext';
import Link from 'next/link';

export default function DumpPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const shareToken = searchParams.get('share');
  const { getAuthHeaders } = useAuth();
  const { currentTrack, isPlaying, playTrack, setQueue: setPlayerQueue } = useMusicPlayer();

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
          <Link href="/music/login" className={Style.retryBtn}>Sign In</Link>
        </div>
      </div>
    );
  }

  if (error === 'denied') {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>You don&apos;t have access to this content.</p>
          <Link href="/music" className={Style.retryBtn}>Back to Music</Link>
        </div>
      </div>
    );
  }

  if (error || !dump) {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>Could not find this release.</p>
          <Link href="/music" className={Style.retryBtn}>Back to Music</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={Style.page}>
      <div className={Style.dumpSection}>
        <div className={Style.dumpHeader}>
          <h1 className={Style.dumpTitle}>{dump.name}</h1>
          {dump.artists && <p className={Style.dumpArtists}>{dump.artists}</p>}
          {dump.description && <p className={Style.dumpDesc}>{dump.description}</p>}
        </div>
        <div className={Style.trackList}>
          {tracks.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              index={index}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handlePlay}
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
        <Link href="/music" className={Style.retryBtn}>
          <i className="fa-solid fa-arrow-left" /> All Music
        </Link>
      </div>
    </div>
  );
}

function TrackCard({ track, index, currentTrack, isPlaying, onPlay, getDownloadUrl }) {
  const isActive = currentTrack?.id === track.id;
  const formats = Array.isArray(track.formats) ? track.formats : Object.keys(track.formats);

  return (
    <div className={[Style.trackCard, isActive ? Style.active : ''].join(' ')}>
      <button
        className={Style.playBtn}
        onClick={() => onPlay(track, index)}
        aria-label={isActive && isPlaying ? `Pause ${track.name}` : `Play ${track.name}`}
      >
        {isActive && isPlaying ? (
          <i className="fa-solid fa-pause" />
        ) : (
          <i className="fa-solid fa-play" />
        )}
      </button>
      <div className={Style.trackInfo}>
        <h3 className={Style.trackName}>{track.name}</h3>
        {track.artists && <p className={Style.trackArtists}>{track.artists}</p>}
        {track.description && <p className={Style.trackDesc}>{track.description}</p>}
        <div className={Style.trackActionsRow}>
          <button className={Style.playInline} onClick={() => onPlay(track, index)}>
            <i className={isActive && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
            {isActive && isPlaying ? ' Pause' : ' Play in Browser'}
          </button>
          <div className={Style.downloadGroup}>
            {formats.map((fmt) => (
              <a key={fmt} href={getDownloadUrl(track, fmt)} className={Style.downloadBtn}>
                <i className="fa-solid fa-download" /> Download {fmt.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
