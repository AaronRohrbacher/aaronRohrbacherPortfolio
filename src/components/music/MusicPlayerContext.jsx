'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

const MusicPlayerContext = createContext(null);

export function MusicPlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [minimized, setMinimized] = useState(false);

  const playTrack = useCallback((track, index, newQueue) => {
    if (newQueue) {
      setQueue(newQueue);
      // Recalculate index in new queue
      const idx = newQueue.findIndex((t) => t.id === track.id);
      if (idx !== -1) index = idx;
    }
    if (currentTrack?.id === track.id) {
      setIsPlaying((p) => !p);
    } else {
      setCurrentTrack(track);
      setQueueIndex(index);
      setIsPlaying(true);
      setMinimized(false);
    }
  }, [currentTrack]);

  const handleTrackEnd = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      setCurrentTrack(queue[nextIdx]);
      setQueueIndex(nextIdx);
      setIsPlaying(true);
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
    }
  }, [queueIndex, queue]);

  const handleNext = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      setCurrentTrack(queue[nextIdx]);
      setQueueIndex(nextIdx);
      setIsPlaying(true);
    }
  }, [queueIndex, queue]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const closePlayer = useCallback(() => {
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
