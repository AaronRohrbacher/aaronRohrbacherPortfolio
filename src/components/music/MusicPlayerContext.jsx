'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const MusicPlayerContext = createContext(null);

export function MusicPlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [minimized, setMinimized] = useState(false);
  // `pending` is true from the moment a play action is triggered until
  // WaveformPlayer reports it as resolved — either `markPlaybackStarted`
  // (WaveSurfer's first non-zero `timeupdate`) or `markPlaybackFailed`
  // (tryLoad exhausted or resume/play rejected). No time-based watchdog;
  // the event sources of truth decide when pending ends.
  const [pending, setPending] = useState(false);
  // Shared holder for the current WaveformPlayer's AnalyserNode. List-item
  // play buttons read this on their own rAF loop to render a tiny live
  // waveform inside the button when their track is the active one.
  const analyserHolderRef = useRef({ current: null });

  const markPlaybackStarted = useCallback(() => {
    setPending(false);
  }, []);

  const markPlaybackFailed = useCallback(() => {
    setPending(false);
  }, []);

  const playTrack = useCallback((track, index, newQueue) => {
    if (newQueue) {
      setQueue(newQueue);
      // Recalculate index in new queue
      const idx = newQueue.findIndex((t) => t.id === track.id);
      if (idx !== -1) index = idx;
    }
    // Desktop: hitting play expands the player (the user's attention is on
    // what they started). Mobile: default to minimized so the track list
    // stays visible — Mom should see a small bar, not a full-screen takeover.
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    setMinimized(isMobile);
    if (currentTrack?.id === track.id) {
      // Same-track toggle: audio is already decoded, no loading gate. Just
      // flip the play/pause state.
      setIsPlaying((p) => !p);
    } else {
      // New track: WaveformPlayer will remount, fetch, decode. Gate clicks
      // until playback confirms (first non-zero timeupdate) or fails.
      setCurrentTrack(track);
      setQueueIndex(index);
      setIsPlaying(true);
      setPending(true);
    }
  }, [currentTrack]);

  const handleTrackEnd = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      setCurrentTrack(queue[nextIdx]);
      setQueueIndex(nextIdx);
      setIsPlaying(true);
      setPending(true);
    } else {
      setIsPlaying(false);
    }
  }, [queueIndex, queue]);

  const handlePrev = useCallback(() => {
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      setCurrentTrack(queue[prevIdx]);
      setQueueIndex(prevIdx);
      setIsPlaying(true);
      setPending(true);
    }
  }, [queueIndex, queue]);

  const handleNext = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      setCurrentTrack(queue[nextIdx]);
      setQueueIndex(nextIdx);
      setIsPlaying(true);
      setPending(true);
    }
  }, [queueIndex, queue]);

  const togglePlayPause = useCallback(() => {
    // Toggle on an already-mounted track: WaveSurfer's play/pause is
    // synchronous, no loading gate needed.
    setIsPlaying((p) => !p);
  }, []);

  const closePlayer = useCallback(() => {
    setPending(false);
    setIsPlaying(false);
    setCurrentTrack(null);
    setQueueIndex(-1);
  }, []);

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        queue,
        queueIndex,
        minimized,
        setMinimized,
        pending,
        analyserHolderRef,
        markPlaybackStarted,
        markPlaybackFailed,
        playTrack,
        togglePlayPause,
        handleTrackEnd,
        handlePrev,
        handleNext,
        closePlayer,
        setQueue,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return ctx;
}
