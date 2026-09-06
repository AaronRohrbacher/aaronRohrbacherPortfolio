'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { isVideoFormat, playbackFormatFor } from '@/lib/mediaPlayback';

const MusicPlayerContext = createContext(null);

export function MusicPlayerProvider({ children }) {
  const { getAuthHeaders } = useAuth();
  const mediaRef = useRef(null);
  const currentTrackRef = useRef(null);
  const desiredPlayingRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const suppressPauseRef = useRef(false);
  const heartbeatRef = useRef(-1);
  const playbackSessionRef = useRef(null);
  const resumeAtRef = useRef(0);
  const spectrumDataRef = useRef(new Float32Array(48));

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [minimized, setMinimized] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [selectedFormat, setSelectedFormatState] = useState('');
  const [resolvedMedia, setResolvedMedia] = useState(null);
  const [playbackError, setPlaybackError] = useState(null);

  currentTrackRef.current = currentTrack;
  desiredPlayingRef.current = isPlaying;

  const telemetry = useCallback(async (action, extra = {}) => {
    const track = currentTrackRef.current;
    if (!track || typeof window === 'undefined') return;
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/playback', {
        method: 'POST',
        keepalive: true,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          trackId: track.id,
          sessionId: playbackSessionRef.current,
          format: selectedFormat,
          seconds: mediaRef.current?.currentTime || 0,
          duration: mediaRef.current?.duration || 0,
          page: window.location.pathname,
          ...extra,
        }),
      });
    } catch {}
  }, [getAuthHeaders, selectedFormat]);

  const handleTrackEnd = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      playbackSessionRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      heartbeatRef.current = -1;
      setReady(false);
      setResolvedMedia(null);
      setSelectedFormatState(playbackFormatFor(queue[nextIdx]));
      setCurrentTrack(queue[nextIdx]);
      setQueueIndex(nextIdx);
      setIsPlaying(true);
      setPending(true);
    } else {
      setIsPlaying(false);
    }
  }, [queueIndex, queue]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onLoaded = () => {
      setReady(true);
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      if (resumeAtRef.current > 0 && Number.isFinite(media.duration)) {
        media.currentTime = Math.min(resumeAtRef.current, Math.max(0, media.duration - 0.25));
      }
      resumeAtRef.current = 0;
      if (desiredPlayingRef.current) {
        media.play().catch((error) => {
          setPending(false);
          setPlaybackError('Playback was blocked. Tap play to retry.');
          telemetry('error', { message: error?.message || 'play rejected' });
        });
      } else setPending(false);
    };
    const onPlay = () => { setIsPlaying(true); setPending(false); setPlaybackError(null); telemetry('start'); };
    const onPause = () => {
      if (!media.ended) setIsPlaying(false);
      if (!suppressPauseRef.current && !media.ended) telemetry('pause');
    };
    const onTime = () => {
      setCurrentTime(media.currentTime || 0);
      const bucket = Math.floor((media.currentTime || 0) / 30);
      if (bucket > 0 && bucket !== heartbeatRef.current) { heartbeatRef.current = bucket; telemetry('progress'); }
    };
    const onDuration = () => setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    const onEnded = () => { telemetry('complete'); setIsPlaying(false); handleTrackEnd(); };
    const onError = () => {
      if (!media.currentSrc) return;
      setPending(false);
      setPlaybackError('This uploaded media variant could not be played.');
      telemetry('error', { message: media.error?.message || `media error ${media.error?.code || ''}` });
    };
    for (const event of ['loadedmetadata', 'canplay']) media.addEventListener(event, onLoaded);
    media.addEventListener('play', onPlay); media.addEventListener('pause', onPause);
    media.addEventListener('timeupdate', onTime); media.addEventListener('durationchange', onDuration);
    media.addEventListener('ended', onEnded); media.addEventListener('error', onError);
    return () => {
      for (const event of ['loadedmetadata', 'canplay']) media.removeEventListener(event, onLoaded);
      media.removeEventListener('play', onPlay); media.removeEventListener('pause', onPause);
      media.removeEventListener('timeupdate', onTime); media.removeEventListener('durationchange', onDuration);
      media.removeEventListener('ended', onEnded); media.removeEventListener('error', onError);
    };
  }, [handleTrackEnd, telemetry]);

  useEffect(() => {
    const automaticFormat = playbackFormatFor(currentTrack);
    if (!currentTrack || !automaticFormat) return;
    if (selectedFormat !== automaticFormat) { setSelectedFormatState(automaticFormat); return; }
    const media = mediaRef.current;
    if (!media) return;
    const sequence = ++loadSequenceRef.current;
    const load = async () => {
      setPending(true); setReady(false); setPlaybackError(null); suppressPauseRef.current = true;
      try {
        const headers = await getAuthHeaders();
        const endpoint = new URL(currentTrack.streamUrls[selectedFormat], window.location.href);
        endpoint.searchParams.set('urlOnly', '1');
        const response = await fetch(endpoint, { headers });
        if (!response.ok) throw new Error(`Stream authorization failed (${response.status})`);
        const data = await response.json();
        if (!data?.url || sequence !== loadSequenceRef.current) return;
        setResolvedMedia({ trackId: currentTrack.id, format: selectedFormat, url: data.url });
        // Keep the media element same-origin by default. Setting
        // crossOrigin="anonymous" here makes the browser require CORS on
        // CDN responses and breaks otherwise playable uploaded videos.
        // The stream endpoint already resolves authorization before the
        // element is pointed at the media URL.
        media.removeAttribute('crossorigin');
        media.src = new URL(data.url, window.location.href).href;
        media.load();
      } catch (error) {
        if (sequence !== loadSequenceRef.current) return;
        setPending(false); setPlaybackError(error?.message || 'Failed to load media');
        telemetry('error', { message: error?.message || 'load failed' });
      } finally { queueMicrotask(() => { suppressPauseRef.current = false; }); }
    };
    load();
  }, [currentTrack, selectedFormat, getAuthHeaders, telemetry]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !media.src || !ready) return;
    if (isPlaying && media.paused) {
      media.play().catch((error) => { setPending(false); setPlaybackError('Playback was blocked. Tap play to retry.'); telemetry('error', { message: error?.message || 'play rejected' }); });
    } else if (!isPlaying && !media.paused) media.pause();
  }, [isPlaying, ready, telemetry]);

  useEffect(() => { if (mediaRef.current) mediaRef.current.volume = volume; }, [volume]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !currentTrack) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: currentTrack.name, artist: currentTrack.artists || 'Aaron Rohrbacher', album: 'Aaron Rohrbacher Music' });
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (queueIndex > 0) { setReady(false); setResolvedMedia(null); setSelectedFormatState(playbackFormatFor(queue[queueIndex - 1])); setCurrentTrack(queue[queueIndex - 1]); setQueueIndex(queueIndex - 1); setIsPlaying(true); }
      });
      navigator.mediaSession.setActionHandler('nexttrack', handleTrackEnd);
    } catch {}
  }, [currentTrack, queue, queueIndex, handleTrackEnd]);

  const playTrack = useCallback((track, index = 0, newQueue) => {
    const activeQueue = newQueue || queue;
    if (newQueue) setQueue(newQueue);
    const found = activeQueue.findIndex((item) => item.id === track.id);
    setMinimized(typeof window !== 'undefined' && window.innerWidth < 768);
    if (currentTrackRef.current?.id === track.id) { setIsPlaying((playing) => !playing); return; }
    playbackSessionRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    heartbeatRef.current = -1; resumeAtRef.current = 0;
    setReady(false); setResolvedMedia(null);
    setSelectedFormatState(playbackFormatFor(track)); setCurrentTrack(track);
    setQueueIndex(found >= 0 ? found : index); setIsPlaying(true); setPending(true);
  }, [queue]);

  const handlePrev = useCallback(() => {
    if (queueIndex <= 0) return;
    playbackSessionRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    heartbeatRef.current = -1; setReady(false); setResolvedMedia(null); setSelectedFormatState(playbackFormatFor(queue[queueIndex - 1]));
    setCurrentTrack(queue[queueIndex - 1]); setQueueIndex(queueIndex - 1); setIsPlaying(true); setPending(true);
  }, [queue, queueIndex]);
  const togglePlayPause = useCallback(() => setIsPlaying((playing) => !playing), []);
  const closePlayer = useCallback(() => {
    const media = mediaRef.current;
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); }
    setPending(false); setReady(false); setResolvedMedia(null); setIsPlaying(false); setCurrentTrack(null); setQueueIndex(-1);
  }, []);
  const seek = useCallback((seconds) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = Math.max(0, Math.min(Number(seconds) || 0, mediaRef.current.duration || Infinity));
    setCurrentTime(mediaRef.current.currentTime);
  }, []);
  const setVolume = useCallback((next) => setVolumeState(Math.max(0, Math.min(1, Number(next) || 0))), []);
  return (
    <MusicPlayerContext.Provider value={{
      currentTrack, isPlaying, queue, queueIndex, minimized, setMinimized, pending,
      mediaRef, spectrumDataRef, ready, currentTime, duration, volume, setVolume, selectedFormat, resolvedMedia,
      playbackError, isVideo: isVideoFormat(selectedFormat),
      markPlaybackStarted: () => setPending(false), markPlaybackFailed: () => setPending(false),
      playTrack, togglePlayPause, handleTrackEnd, handlePrev, handleNext: handleTrackEnd,
      closePlayer, setQueue, seek,
    }}>{children}</MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  return ctx;
}
