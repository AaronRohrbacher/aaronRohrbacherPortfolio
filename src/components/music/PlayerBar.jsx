'use client';

import React, { useState, useEffect } from 'react';
import Style from './PlayerBar.module.scss';
import WaveformPlayer from './WaveformPlayer';
import { useMusicPlayer } from './MusicPlayerContext';
import { useAuth } from './AuthContext';
import { renderRichText } from '@/lib/richText';

export default function PlayerBar() {
  const { getAuthHeaders } = useAuth();
  const {
    currentTrack,
    isPlaying,
    queueIndex,
    queue,
    minimized,
    setMinimized,
    togglePlayPause,
    handleTrackEnd,
    handlePrev,
    handleNext,
    closePlayer,
  } = useMusicPlayer();

  const [authHeaders, setAuthHeaders] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Reset to null when track changes so we don't reuse stale headers
    // and don't start streaming with missing auth.
    setAuthHeaders(null);
    getAuthHeaders().then((h) => { if (!cancelled) setAuthHeaders(h || {}); });
    return () => { cancelled = true; };
  }, [currentTrack, getAuthHeaders]);

  if (!currentTrack) return null;

  return (
    <div className={[Style.bar, minimized ? Style.minimized : Style.expanded].join(' ')}>
      {/* Minimized view */}
      {minimized && (
        <div className={Style.miniBar}>
          <button className={Style.miniPlayBtn} onClick={togglePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
            <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
          </button>
          <div className={Style.miniInfo} onClick={() => setMinimized(false)}>
            <span className={Style.miniTitle}>{currentTrack.name}</span>
            {currentTrack.artists && (
              <span className={Style.miniArtist}>{renderRichText(currentTrack.artists)}</span>
            )}
          </div>
          <div className={Style.miniActions}>
            <button className={Style.miniActionBtn} onClick={() => setMinimized(false)} aria-label="Expand player">
              <i className="fa-solid fa-chevron-up" />
            </button>
            <button className={Style.miniActionBtn} onClick={closePlayer} aria-label="Close player">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded view — always mounted so audio keeps playing when minimized */}
      <div className={Style.expandedBar} style={minimized ? { display: 'none' } : undefined}>
        <div className={Style.expandedHeader}>
          <div className={Style.expandedInfo}>
            <span className={Style.nowPlayingLabel}>Now Playing</span>
            <h3 className={Style.expandedTitle}>{currentTrack.name}</h3>
            {currentTrack.artists && (
              <p className={Style.expandedArtist}>{renderRichText(currentTrack.artists)}</p>
            )}
          </div>
          <div className={Style.expandedActions}>
            <button className={Style.miniActionBtn} onClick={() => setMinimized(true)} aria-label="Minimize player">
              <i className="fa-solid fa-chevron-down" />
            </button>
            <button className={Style.miniActionBtn} onClick={closePlayer} aria-label="Close player">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
        {authHeaders !== null && (
          <WaveformPlayer
            key={currentTrack.id}
            streamUrls={currentTrack.streamUrls}
            isPlaying={isPlaying}
            onPlayPause={togglePlayPause}
            onEnd={handleTrackEnd}
            onPrev={queueIndex > 0 ? handlePrev : null}
            onNext={queueIndex < queue.length - 1 ? handleNext : null}
            fetchHeaders={authHeaders}
          />
        )}
      </div>
    </div>
  );
}
