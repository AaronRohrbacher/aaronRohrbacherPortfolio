'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Style from './MusicPlaylist.module.scss';
import { useAuth } from './AuthContext';
import { useMusicPlayer } from './MusicPlayerContext';
import { useMusicHref } from '@/lib/musicLinks';
import { renderRichText } from '@/lib/richText';

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
  const { getAuthHeaders, authVersion } = useAuth();
  const { currentTrack, isPlaying, pending, playTrack, setQueue: setPlayerQueue } = useMusicPlayer();
  const musicHref = useMusicHref();

  const hasInitial = initialTracks.length > 0 || initialDumps.length > 0;
  // `tracks` is the loose-track list — the source of truth for both the
  // rendered loose cards and the global player queue. It must NEVER contain
  // tracks that are grouped under a dump card, otherwise the first paint
  // flashes those tracks as loose cards before fetchTracks trims them.
  const [tracks, setTracks] = useState(initialTracks);
  const [dumps, setDumps] = useState(initialDumps);
  const [loading, setLoading] = useState(!hasInitial);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (tracks.length > 0) setPlayerQueue(tracks);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTracks();
    fetchSettings();
  }, [authVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.tracksPerPage) setPerPage(data.tracksPerPage);
    } catch {}
  }

  async function fetchTracks() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tracks', { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const looseTracks = data.tracks || [];
      const dumpList = data.dumps || [];
      setTracks(looseTracks);
      setDumps(dumpList);
      // Main-page queue is loose tracks only. Tracks that live inside a dump
      // are reachable by clicking into the dump page — they don't get
      // queued/played from the main list.
      setPlayerQueue(looseTracks);
    } catch (err) {
      if (!hasInitial) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePlay(track, globalIndex) {
    playTrack(track, globalIndex, tracks);
  }

  function getDownloadUrl(track, format) {
    return `/api/stream?id=${encodeURIComponent(track.id)}&format=${format}&download=1`;
  }

  // Render the hero (h1 + bio) ALWAYS, even while loading or on error,
  // so the SSR HTML always carries real, indexable copy. Otherwise an
  // empty playlist + spinner-only render gets flagged as soft 404 by
  // search engines.
  const noContent = !loading && !error && tracks.length === 0 && dumps.length === 0;

  // Main-page search runs over BOTH the loose track list and the dump list
  // — each kind has its own filter. Clicking a dump card navigates to the
  // dump page for its tracks; the main page never inlines dump contents.
  const q = search.trim().toLowerCase();
  const filteredLoose = q
    ? tracks.filter((t) => (
        t.name?.toLowerCase().includes(q) ||
        t.artists?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      ))
    : tracks;

  const visibleDumps = q
    ? dumps.filter((d) => (
        d.name?.toLowerCase().includes(q) ||
        d.artists?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
      ))
    : dumps;

  const totalPages = Math.ceil(filteredLoose.length / perPage);
  const pageStart = page * perPage;
  const pageEnd = pageStart + perPage;
  const visibleLoose = filteredLoose.slice(pageStart, pageEnd);
  const filteredIndexMap = new Map(filteredLoose.map((t, i) => [t.id, i]));

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

      {tracks.length > 0 && (
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
          {/* Dumps — card only, click to view tracks on the dump page */}
          {visibleDumps.length > 0 && (
            <div className={Style.dumpGrid}>
              {visibleDumps.map((dump) => {
                const handle = dump.slug || dump.id;
                const trackCount = dump.tracks?.length || 0;
                return (
                  <Link
                    key={dump.id}
                    href={musicHref(`/dump/${handle}`)}
                    className={Style.dumpCardLink}
                  >
                    <div className={Style.dumpHeader}>
                      <div className={Style.dumpArt} style={{ background: trackGradient(dump.name) }}>
                        <i className="fa-solid fa-layer-group" />
                      </div>
                      <div className={Style.dumpMeta}>
                        <span className={Style.dumpLabel}>Collection</span>
                        <h2 className={Style.dumpTitle}>{dump.name}</h2>
                        {dump.artists && <p className={Style.dumpArtists}>{renderRichText(dump.artists)}</p>}
                        {dump.description && <p className={Style.dumpDesc}>{renderRichText(dump.description)}</p>}
                        <span className={Style.dumpCount}>
                          {trackCount} track{trackCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Loose Tracks — tracks NOT inside any published dump */}
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
                  pending={pending}
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

function TrackCard({ track, trackNum, index, currentTrack, isPlaying, pending, onPlay, getDownloadUrl }) {
  const isActive = currentTrack?.id === track.id;
  const formats = Array.isArray(track.formats) ? track.formats : Object.keys(track.formats);
  const [showDownloads, setShowDownloads] = useState(false);
  const playLabel = isActive && isPlaying ? `Pause ${track.name}` : `Play ${track.name}`;

  const handlePlay = (e) => {
    if (pending) return;
    e?.stopPropagation?.();
    onPlay(track, index);
  };

  return (
    <div
      className={[Style.trackCard, isActive ? Style.active : '', pending ? Style.trackCardDisabled : ''].join(' ')}
      onClick={pending ? undefined : () => onPlay(track, index)}
      role="button"
      aria-label={playLabel}
      aria-disabled={pending || undefined}
    >
      {/* Art / Number — also the canonical Play/Pause button for a11y +
          tests. The whole card stays mouse-clickable (div onClick) but
          the button is the keyboard/screen-reader target. */}
      <button
        type="button"
        className={Style.trackArt}
        style={{ background: trackGradient(track.name) }}
        onClick={handlePlay}
        disabled={pending}
        aria-label={playLabel}
      >
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
      </button>

      {/* Info */}
      <div className={Style.trackInfo}>
        <h3 className={Style.trackName}>{track.name}</h3>
        {track.artists && <p className={Style.trackArtists}>{renderRichText(track.artists)}</p>}
        {track.description && <p className={Style.trackDesc}>{renderRichText(track.description)}</p>}
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
