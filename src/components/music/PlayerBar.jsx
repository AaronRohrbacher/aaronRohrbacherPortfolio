'use client';

import React, { useEffect, useRef } from 'react';
import Style from './PlayerBar.module.scss';
import WaveformPlayer from './WaveformPlayer';
import { useMusicPlayer } from './MusicPlayerContext';
import { renderRichText } from '@/lib/richText';

export default function PlayerBar() {
  const barRef = useRef(null);
  const {
    currentTrack,
    isPlaying,
    queueIndex,
    queue,
    minimized,
    setMinimized,
    pending,
    togglePlayPause,
    handlePrev,
    handleNext,
    closePlayer,
    mediaRef,
    isVideo,
  } = useMusicPlayer();

  useEffect(() => {
    if (currentTrack) {
      document.documentElement.dataset.musicPlayer = minimized ? 'minimized' : 'expanded';
      const bar = barRef.current;
      const publishHeight = () => {
        if (bar) {
          document.documentElement.style.setProperty('--music-player-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
        }
      };
      publishHeight();
      const observer = bar && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publishHeight) : null;
      if (bar && observer) observer.observe(bar);
      return () => {
        observer?.disconnect();
        delete document.documentElement.dataset.musicPlayer;
        document.documentElement.style.removeProperty('--music-player-height');
      };
    } else {
      delete document.documentElement.dataset.musicPlayer;
      document.documentElement.style.removeProperty('--music-player-height');
    }
    return undefined;
  }, [currentTrack, minimized]);

  if (!currentTrack) return null;

  return (
    <div ref={barRef} className={[Style.bar, minimized ? Style.minimized : Style.expanded].join(' ')}>
      {/* The sole media element stays mounted for the entire playback
          session. Native playback is not routed through WebAudio, so mobile
          browsers can continue while the page is backgrounded or locked. */}
      {/* Minimized view */}
      {minimized && (
        <div className={Style.miniBar}>
          <button
            className={Style.miniPlayBtn}
            onClick={pending ? undefined : togglePlayPause}
            disabled={pending}
            aria-label={pending ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
          >
            {pending ? (
              <span className={Style.miniSpinner} aria-hidden="true" />
            ) : (
              <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
            )}
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
          <div className={[Style.playbackStage, isVideo ? Style.videoStage : ''].join(' ')}>
            <video
              ref={mediaRef}
              className={[Style.persistentMedia, isVideo ? Style.videoVisible : ''].join(' ')}
              playsInline
              preload="metadata"
            />
            <div className={Style.waveformColumn}>
              <WaveformPlayer
                streamUrls={currentTrack.streamUrls}
                isPlaying={isPlaying}
                onPlayPause={togglePlayPause}
                onPrev={queueIndex > 0 ? handlePrev : null}
                onNext={queueIndex < queue.length - 1 ? handleNext : null}
              />
            </div>
          </div>
      </div>
    </div>
  );
}
