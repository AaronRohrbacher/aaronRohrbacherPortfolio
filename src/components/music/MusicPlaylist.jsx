'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Style from './MusicPlaylist.module.scss';
import { useAuth } from './AuthContext';
import { useMusicPlayer } from './MusicPlayerContext';
import { useMusicHref } from '@/lib/musicLinks';

const DEFAULT_PER_PAGE = 10;

// Deterministic gradient from track name — gives each track a unique color swatch
function trackGradient(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue1 = ((h % 360) + 360) % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 55%, 45%), hsl(${hue2}, 60%, 35%))`;
}

export default function MusicPlaylist({ initialTracks = [], initialDumps = [] }) {
  const { getAuthHeaders } = useAuth();
  const { currentTrack, isPlaying, playTrack, setQueue: setPlayerQueue } = useMusicPlayer();
  const musicHref = useMusicHref();

  const hasInitial = initialTracks.length > 0 || initialDumps.length > 0;
  const [tracks, setTracks] = useState(initialTracks);
  const [dumps, setDumps] = useState(initialDumps);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(null);
  const [queue, setQueue] = useState(() => {
    // Dedupe by id — a track may appear in multiple dumps
    const seen = new Set();
    const combined = [...initialDumps.flatMap((d) => d.tracks || []), ...initialTracks];
    return combined.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  });
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (queue.length > 0) setPlayerQueue(queue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const seen = new Set();
      const allTracks = [
        ...dumpList.flatMap((d) => d.tracks || []),
        ...looseTracks,
      ].filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
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

  // Render the hero (h1 + bio) ALWAYS, even while loading or on error,
  // so the SSR HTML always carries real, indexable copy. Otherwise an
  // empty playlist + spinner-only render gets flagged as soft 404 by
  // search engines.
  const noContent = !loading && !error && tracks.length === 0 && dumps.length === 0;

  const filtered = search.trim()
    ? queue.filter((t) => {
        const q = search.toLowerCase();
        const trackDumpIds = Array.isArray(t.dumpIds) ? t.dumpIds : t.dumpId ? [t.dumpId] : [];
        const matchesDump = trackDumpIds.some((id) =>
          dumps.find((d) => d.id === id)?.name?.toLowerCase().includes(q)
        );
        return (
          t.name?.toLowerCase().includes(q) ||
          t.artists?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          matchesDump
        );
      })
    : queue;

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageStart = page * perPage;
  const pageEnd = pageStart + perPage;
  const visibleQueue = filtered.slice(pageStart, pageEnd);

  const visibleDumpMap = {};
  const visibleLoose = [];
  const seenLooseIds = new Set();
  for (const t of visibleQueue) {
    const trackDumpIds = Array.isArray(t.dumpIds) ? t.dumpIds : t.dumpId ? [t.dumpId] : [];
    // A track may live in multiple dumps; group into the first known dump
    // that exists in our rendered dumps list so it doesn't get double-counted.
    const matchingDumpId = trackDumpIds.find((id) => dumps.some((d) => d.id === id));
    if (matchingDumpId) {
      if (!visibleDumpMap[matchingDumpId]) visibleDumpMap[matchingDumpId] = [];
      visibleDumpMap[matchingDumpId].push(t);
    } else if (!seenLooseIds.has(t.id)) {
      visibleLoose.push(t);
      seenLooseIds.add(t.id);
    }
  }
  const visibleDumps = dumps.filter((d) => visibleDumpMap[d.id]);

  const filteredIndexMap = new Map(filtered.map((t) => [t.id, queue.indexOf(t)]));

  return (
    <div className={Style.page}>
      {/* Hero */}
      <div className={Style.hero}>
        <div className={Style.heroInner}>
          <h1 className={Style.title}>Music</h1>
          <p className={Style.subtitle}>
            Oh hey. My name is Aaron Rohrbacher. I live in Portland, Oregon, and am the outright owner of a tenor saxophone and clarinet. You can occasionally find me playing about town, largely in jam/open-mic scenarios. As a (very) amateur audio engineer and recording artist, I wanted to share a few tunes I&apos;ve thoroughly ruined — listen at your own risk!
          </p>
        </div>
      </div>

      {queue.length > 0 && (
        <div className={Style.searchWrap}>
          <i className={`fa-solid fa-magnifying-glass ${Style.searchIcon}`} />
          <input
            className={Style.searchInput}
            type="text"
            placeholder="Search tracks, artists, descriptions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      )}

      {loading && (
        <div className={Style.loading}>
          <div className={Style.spinner} />
          <p>Loading tracks...</p>
        </div>
      )}

      {error && !loading && (
        <div className={Style.error}>
          <p>Could not load tracks: {error}</p>
          <button className={Style.retryBtn} onClick={() => { setError(null); setLoading(true); fetchTracks(); }}>
            Retry
          </button>
        </div>
      )}

      {noContent ? (
        <div className={Style.empty}>
          <i className="fa-solid fa-music" style={{ fontSize: '2rem', opacity: 0.2 }} />
          <p>No tracks published yet. Check back soon!</p>
        </div>
      ) : (
        <>
          {/* Dumps */}
          {visibleDumps.map((dump) => {
            const dumpTracks = visibleDumpMap[dump.id];
            return (
              <div key={dump.id} className={Style.dumpSection}>
                <div className={Style.dumpHeader}>
                  <div className={Style.dumpArt} style={{ background: trackGradient(dump.name) }}>
                    <i className="fa-solid fa-layer-group" />
                  </div>
                  <div className={Style.dumpMeta}>
                    <span className={Style.dumpLabel}>Collection</span>
                    <Link href={musicHref(`/dump/${dump.id}`)} className={Style.dumpTitleLink}>
                      <h2 className={Style.dumpTitle}>{dump.name}</h2>
                    </Link>
                    {dump.artists && <p className={Style.dumpArtists}>{dump.artists}</p>}
                    {dump.description && <p className={Style.dumpDesc}>{dump.description}</p>}
                    <span className={Style.dumpCount}>{dumpTracks.length} track{dumpTracks.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className={Style.trackList}>
                  {dumpTracks.map((track, i) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      trackNum={i + 1}
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

          {/* Loose Tracks */}
          {visibleLoose.length > 0 && (
            <div className={Style.trackList}>
              {visibleLoose.map((track, i) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  trackNum={visibleDumps.length > 0 ? null : i + 1}
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
              <button className={Style.pageBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>
                <i className="fa-solid fa-chevron-left" /> Prev
              </button>
              <span className={Style.pageInfo}>{page + 1} / {totalPages}</span>
              <button className={Style.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                Next <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrackCard({ track, trackNum, index, currentTrack, isPlaying, onPlay, getDownloadUrl }) {
  const isActive = currentTrack?.id === track.id;
  const formats = Array.isArray(track.formats) ? track.formats : Object.keys(track.formats);
  const [showDownloads, setShowDownloads] = useState(false);

  return (
    <div
      className={[Style.trackCard, isActive ? Style.active : ''].join(' ')}
      onClick={() => onPlay(track, index)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(track, index); } }}
    >
      {/* Art / Number */}
      <div className={Style.trackArt} style={{ background: trackGradient(track.name) }}>
        <span className={Style.trackArtInner}>
          {isActive && isPlaying ? (
            <span className={Style.eqBars}>
              <span /><span /><span />
            </span>
          ) : trackNum ? (
            <span className={Style.trackNum}>{trackNum}</span>
          ) : (
            <i className="fa-solid fa-music" />
          )}
        </span>
        {/* Play overlay on hover */}
        <span className={Style.trackArtHover}>
          <i className={isActive && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
        </span>
      </div>

      {/* Info */}
      <div className={Style.trackInfo}>
        <h3 className={Style.trackName}>{track.name}</h3>
        {track.artists && <p className={Style.trackArtists}>{track.artists}</p>}
        {track.description && <p className={Style.trackDesc}>{track.description}</p>}
      </div>

      {/* Right side: date + download */}
      <div className={Style.trackRight} onClick={(e) => e.stopPropagation()}>
        {track.addedAt && (
          <span className={Style.trackDate}>
            {new Date(track.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        <div className={Style.trackActions}>
          <button
            className={Style.actionBtn}
            onClick={(e) => { e.stopPropagation(); setShowDownloads(!showDownloads); }}
            aria-label="Download options"
            title="Download"
          >
            <i className="fa-solid fa-download" />
          </button>
        </div>
        {showDownloads && (
          <div className={Style.downloadDropdown}>
            {formats.map((fmt) => (
              <a key={fmt} href={getDownloadUrl(track, fmt)} className={Style.downloadLink}>
                {fmt.toUpperCase()}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
