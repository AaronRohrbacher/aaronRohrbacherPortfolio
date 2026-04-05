'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Style from './MusicPlaylist.module.scss';
import { useAuth } from './AuthContext';
import { useMusicPlayer } from './MusicPlayerContext';

const DEFAULT_PER_PAGE = 10;

export default function MusicPlaylist({ initialTracks = [], initialDumps = [] }) {
  const { getAuthHeaders } = useAuth();
  const { currentTrack, isPlaying, playTrack, setQueue: setPlayerQueue } = useMusicPlayer();

  // Use SSR data immediately, then refresh client-side (picks up auth'd content)
  const hasInitial = initialTracks.length > 0 || initialDumps.length > 0;
  const [tracks, setTracks] = useState(initialTracks);
  const [dumps, setDumps] = useState(initialDumps);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(null);
  const [queue, setQueue] = useState(() => {
    const q = [...initialDumps.flatMap((d) => d.tracks || []), ...initialTracks];
    return q;
  });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState('');

  // Set initial queue in player context
  useEffect(() => {
    if (queue.length > 0) setPlayerQueue(queue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side refresh to pick up auth-gated tracks
  useEffect(() => {
    fetchTracks();
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSettings() {
    try {
      const res = await fetch('/api/music/admin/settings');
      const data = await res.json();
      if (data.tracksPerPage) setPerPage(data.tracksPerPage);
    } catch {}
  }

  async function fetchTracks() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/tracks', { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const looseTracks = data.tracks || [];
      const dumpList = data.dumps || [];
      setTracks(looseTracks);
      setDumps(dumpList);
      const allTracks = [
        ...dumpList.flatMap((d) => d.tracks || []),
        ...looseTracks,
      ];
      setQueue(allTracks);
      setPlayerQueue(allTracks);
    } catch (err) {
      if (!hasInitial) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePlay(track, globalIndex) {
    playTrack(track, globalIndex, queue);
  }

  function getDownloadUrl(track, format) {
    return `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${format}&download=1`;
  }

  if (loading) {
    return (
      <div className={Style.page}>
        <div className={Style.loading}>
          <div className={Style.spinner} />
          <p>Loading tracks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={Style.page}>
        <div className={Style.error}>
          <p>Could not load tracks: {error}</p>
          <button className={Style.retryBtn} onClick={() => { setError(null); setLoading(true); fetchTracks(); }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const noContent = tracks.length === 0 && dumps.length === 0;

  // Filter by search
  const filtered = search.trim()
    ? queue.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.name?.toLowerCase().includes(q) ||
          t.artists?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          dumps.find((d) => d.id === t.dumpId)?.name?.toLowerCase().includes(q)
        );
      })
    : queue;

  // Pagination over filtered results
  const totalPages = Math.ceil(filtered.length / perPage);
  const pageStart = page * perPage;
  const pageEnd = pageStart + perPage;
  const visibleQueue = filtered.slice(pageStart, pageEnd);

  // Map visible items back to dump/loose grouping
  const visibleDumpMap = {};
  const visibleLoose = [];
  for (const t of visibleQueue) {
    if (t.dumpId) {
      if (!visibleDumpMap[t.dumpId]) visibleDumpMap[t.dumpId] = [];
      visibleDumpMap[t.dumpId].push(t);
    } else {
      visibleLoose.push(t);
    }
  }
  const visibleDumps = dumps.filter((d) => visibleDumpMap[d.id]);

  // Global index uses original queue position for correct playback
  const filteredIndexMap = new Map(filtered.map((t) => [t.id, queue.indexOf(t)]));

  return (
    <div className={Style.page}>
      {/* Hero */}
      <div className={Style.hero}>
        <h1 className={Style.title}>Music</h1>
        <p className={Style.subtitle}>
          Listen, enjoy, and download. All tracks available for streaming right here.
        </p>
      </div>

      {queue.length > 0 && (
        <input
          className={Style.searchInput}
          type="text"
          placeholder="Search tracks..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      )}

      {noContent ? (
        <div className={Style.empty}>
          <p>No tracks published yet. Check back soon!</p>
        </div>
      ) : (
        <>
          {/* Dumps on this page */}
          {visibleDumps.map((dump) => {
            const dumpTracks = visibleDumpMap[dump.id];
            return (
              <div key={dump.id} className={Style.dumpSection}>
                <div className={Style.dumpHeader}>
                  <Link href={`/music/dump/${dump.id}`} className={Style.dumpTitleLink}>
                    <h2 className={Style.dumpTitle}>{dump.name}</h2>
                  </Link>
                  {dump.artists && <p className={Style.dumpArtists}>{dump.artists}</p>}
                  {dump.description && <p className={Style.dumpDesc}>{dump.description}</p>}
                </div>
                <div className={Style.trackList}>
                  {dumpTracks.map((track) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      index={filteredIndexMap.get(track.id) ?? 0}
                      currentTrack={currentTrack}
                      isPlaying={isPlaying}
                      onPlay={handlePlay}
                      getDownloadUrl={getDownloadUrl}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Loose Tracks on this page */}
          {visibleLoose.length > 0 && (
            <div className={Style.trackList}>
              {visibleLoose.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  index={filteredIndexMap.get(track.id) ?? 0}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  onPlay={handlePlay}
                  getDownloadUrl={getDownloadUrl}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={Style.pagination}>
              <button
                className={Style.pageBtn}
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <i className="fa-solid fa-chevron-left" /> Prev
              </button>
              <span className={Style.pageInfo}>
                {page + 1} / {totalPages}
              </span>
              <button
                className={Style.pageBtn}
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrackCard({ track, index, currentTrack, isPlaying, onPlay, getDownloadUrl }) {
  const isActive = currentTrack?.id === track.id;
  const formats = Array.isArray(track.formats) ? track.formats : Object.keys(track.formats);

  return (
    <div className={[Style.trackCard, isActive ? Style.active : ''].join(' ')}>
      {/* Left: Play button */}
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

      {/* Center: Track info */}
      <div className={Style.trackInfo}>
        <h3 className={Style.trackName}>{track.name}</h3>
        {track.artists && <p className={Style.trackArtists}>{track.artists}</p>}
        {track.addedAt && <p className={Style.trackDate}>{new Date(track.addedAt).toLocaleDateString()}</p>}
        {track.description && <p className={Style.trackDesc}>{track.description}</p>}

        {/* Actions row */}
        <div className={Style.trackActionsRow}>
          <button
            className={Style.playInline}
            onClick={() => onPlay(track, index)}
          >
            <i className={isActive && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
            {isActive && isPlaying ? ' Pause' : ' Play in Browser'}
          </button>

          <div className={Style.downloadGroup}>
            {formats.map((fmt) => (
              <a
                key={fmt}
                href={getDownloadUrl(track, fmt)}
                className={Style.downloadBtn}
              >
                <i className="fa-solid fa-download" />
                {' Download ' + fmt.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
