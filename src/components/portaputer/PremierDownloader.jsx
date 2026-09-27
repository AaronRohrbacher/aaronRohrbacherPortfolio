'use client';

import { useEffect, useRef, useState } from 'react';
import { parallelDownload } from '@/lib/parallelDownload';

function formatRemaining(seconds) {
  const rounded = Math.max(1, Math.ceil(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

export default function PremierDownloader({ downloadKey }) {
  const [supported, setSupported] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const active = useRef(null);
  const endpoint = `/premier-download/file?key=${encodeURIComponent(downloadKey)}`;

  useEffect(() => {
    setSupported(typeof window.showSaveFilePicker === 'function');
    const stop = () => active.current?.abort();
    const warn = event => {
      if (!active.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', stop);
    window.addEventListener('beforeunload', warn);
    return () => {
      stop();
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('beforeunload', warn);
    };
  }, []);

  async function start() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setProgress(0);
    let writable;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: 'Premier-Installer.zip', types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }] });
      controller.signal.throwIfAborted();
      setStatus('Preparing download…');
      const response = await fetch(`${endpoint}&manifest=1`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Download is temporarily unavailable.');
      const manifest = await response.json();
      controller.signal.throwIfAborted();
      writable = await handle.createWritable();
      const started = performance.now();
      setStatus('Downloading… estimating time remaining.');
      await parallelDownload({
        manifest, writable, signal: controller.signal,
        onProgress: (bytes, total) => {
          const speed = bytes / Math.max((performance.now() - started) / 1000, 0.001) / 1e6;
          const eta = bytes >= total
            ? 'Finalizing file…'
            : `About ${formatRemaining((total - bytes) / (speed * 1e6))} remaining`;
          setProgress(bytes / total * 100);
          setStatus(`${(bytes / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB · ${speed.toFixed(1)} MB/s · ${eta}`);
        },
      });
      setStatus('Download complete. Your ZIP file is saved.');
    } catch (error) {
      await writable?.abort().catch(() => {});
      setStatus(controller.signal.aborted || error.name === 'AbortError' ? 'Download cancelled. All transfers stopped.' : error.message);
    } finally {
      active.current = null;
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>Download Premier</h1>
      <p>Save Premier-Installer.zip using six parallel connections. Choose a drive with at least 52 GB free and keep this tab open until it finishes.</p>
      {supported === false ? <p>For parallel downloads, open this link in desktop Chrome or Edge. You can also use the standard download below.</p> : (
        <button onClick={start} disabled={busy || supported === null} style={{ padding: '0.8rem 1.2rem', marginTop: '1rem', cursor: 'pointer' }}>Download Premier</button>
      )}
      {busy && <button onClick={() => { setStatus('Stopping transfers…'); active.current?.abort(); }} style={{ marginLeft: '1rem', padding: '0.8rem 1.2rem' }}>Cancel download</button>}
      {(busy || progress > 0) && <progress aria-label="Download progress" value={progress} max={100} style={{ display: 'block', width: '100%', marginTop: '1.5rem' }} />}
      <p role="status" aria-live="polite" style={{ marginTop: '1rem' }}>{status}</p>
      {!busy && <p><a href={endpoint} referrerPolicy="no-referrer">Standard download</a></p>}
      <p style={{ marginTop: '1rem', opacity: 0.75 }}>Nothing downloads until you start. Cancelling stops every connection; restarting begins a new download.</p>
    </section>
  );
}
