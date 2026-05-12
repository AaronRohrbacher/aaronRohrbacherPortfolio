'use client';

import React, { useEffect, useState } from 'react';
import Style from './PortaputerAdmin.module.scss';

function formatBytes(n) {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PortaputerAdmin() {
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadState, setUploadState] = useState({ status: 'idle', progress: 0, message: null });
  const [refreshTick, setRefreshTick] = useState(0);

  function login() {
    if (!pw) return;
    if (pw === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError('');
    } else {
      setPwError('Incorrect password.');
    }
  }

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/portaputer/downloads?limit=500', {
          headers: { Authorization: `Bearer ${pw}` },
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authed, pw, refreshTick]);

  async function uploadInstaller(file) {
    if (!file) return;
    setUploadState({ status: 'requesting', progress: 0, message: 'Requesting upload slot…' });
    try {
      const signRes = await fetch('/api/portaputer/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pw}`,
        },
        body: JSON.stringify({ contentType: 'application/octet-stream' }),
      });
      if (!signRes.ok) {
        const j = await signRes.json().catch(() => ({}));
        throw new Error(j.error || `Sign request failed (${signRes.status})`);
      }
      const sign = await signRes.json();

      setUploadState({ status: 'uploading', progress: 0, message: 'Uploading…' });
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(sign.method, sign.url);
        for (const [k, v] of Object.entries(sign.headers || {})) {
          xhr.setRequestHeader(k, v);
        }
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setUploadState((s) => ({ ...s, progress: pct }));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`S3 upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      setUploadState({
        status: 'done',
        progress: 100,
        message: `Uploaded ${file.name} as ${sign.key}.`,
      });
      setRefreshTick((t) => t + 1);
    } catch (err) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: err?.message || 'Upload failed',
      });
    }
  }

  function onFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) uploadInstaller(file);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadInstaller(file);
  }

  if (!authed) {
    return (
      <main className={Style.gate}>
        <div className={Style.gateCard}>
          <h1 className={Style.gateTitle}>PortaPuter Admin</h1>
          <input
            type="password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            className={Style.gateInput}
            autoFocus
          />
          <button onClick={login} className={Style.gateBtn}>
            Sign in
          </button>
          {pwError && <p className={Style.gateError}>{pwError}</p>}
        </div>
      </main>
    );
  }

  const stats = data?.stats;
  const events = data?.events || [];
  const installer = data?.installer;

  return (
    <main className={Style.wrap}>
      <header className={Style.header}>
        <h1 className={Style.title}>PortaPuter Downloads</h1>
        <p className={Style.subtitle}>
          Every click on the public download link, oldest at the bottom.
        </p>
      </header>

      <section className={Style.installerBox}>
        <h2 className={Style.sectionTitle}>Installer</h2>
        {!installer?.configured && (
          <p className={Style.warn}>
            Bucket hasn&apos;t been provisioned yet. Run{' '}
            <code>npx sst deploy</code> &mdash; that creates the bucket and
            wires the env vars automatically.
          </p>
        )}
        {installer?.configured && !installer?.meta && (
          <p className={Style.warn}>
            Bucket is ready, but no installer file yet. Drop one in below.
          </p>
        )}
        {installer?.meta && (
          <dl className={Style.metaList}>
            <div>
              <dt>Size</dt>
              <dd>{formatBytes(installer.meta.size)}</dd>
            </div>
            <div>
              <dt>Uploaded</dt>
              <dd>{formatTime(installer.meta.lastModified)}</dd>
            </div>
            <div>
              <dt>ETag</dt>
              <dd className={Style.mono}>{installer.meta.etag}</dd>
            </div>
          </dl>
        )}

        {installer?.configured && (
          <div
            className={[
              Style.dropZone,
              uploadState.status === 'uploading' ? Style.dropZoneBusy : '',
            ].join(' ')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <i className="fa-solid fa-cloud-arrow-up" />
            <div>
              <p className={Style.dropTitle}>
                {installer?.meta ? 'Replace installer' : 'Upload installer'}
              </p>
              <p className={Style.dropSub}>
                Drag <code>PortaPuterCapture-Setup.exe</code> here, or{' '}
                <label className={Style.dropLink}>
                  <input
                    type="file"
                    accept=".exe,application/octet-stream"
                    onChange={onFileInputChange}
                    hidden
                  />
                  choose a file
                </label>
                . Goes straight to S3 &mdash; doesn&apos;t pass through Lambda.
              </p>
              {uploadState.status === 'uploading' && (
                <div className={Style.progress}>
                  <div
                    className={Style.progressBar}
                    style={{ width: `${uploadState.progress}%` }}
                  />
                  <span className={Style.progressLabel}>
                    {uploadState.progress}%
                  </span>
                </div>
              )}
              {uploadState.message && uploadState.status !== 'uploading' && (
                <p
                  className={[
                    Style.uploadMsg,
                    uploadState.status === 'error' ? Style.uploadMsgError : '',
                    uploadState.status === 'done' ? Style.uploadMsgOk : '',
                  ].join(' ')}
                >
                  {uploadState.message}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className={Style.stats}>
        <div className={Style.stat}>
          <span className={Style.statValue}>{stats?.total ?? '—'}</span>
          <span className={Style.statLabel}>Total clicks</span>
        </div>
        <div className={Style.stat}>
          <span className={Style.statValue}>{stats?.ok ?? '—'}</span>
          <span className={Style.statLabel}>Successful</span>
        </div>
        <div className={Style.stat}>
          <span className={Style.statValue}>{stats?.failed ?? '—'}</span>
          <span className={Style.statLabel}>Failed / no file</span>
        </div>
        <div className={Style.stat}>
          <span className={Style.statValue}>{stats?.uniqueIps ?? '—'}</span>
          <span className={Style.statLabel}>Unique IPs</span>
        </div>
        <div className={Style.stat}>
          <span className={Style.statValue}>{stats?.uniqueCountries ?? '—'}</span>
          <span className={Style.statLabel}>Countries</span>
        </div>
      </section>

      <section>
        <h2 className={Style.sectionTitle}>Recent events</h2>
        {loading && <p className={Style.muted}>Loading…</p>}
        {error && <p className={Style.error}>{error}</p>}
        {!loading && !error && events.length === 0 && (
          <p className={Style.muted}>No downloads yet.</p>
        )}
        {events.length > 0 && (
          <div className={Style.tableWrap}>
            <table className={Style.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>IP</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>User-Agent</th>
                  <th>Referrer</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const d = ev.detail || {};
                  const loc = [d.city, d.region, d.country]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <tr key={ev.id}>
                      <td className={Style.nowrap}>{formatTime(ev.timestamp)}</td>
                      <td className={Style.mono}>{ev.ip || '—'}</td>
                      <td>{loc || '—'}</td>
                      <td>
                        <span className={[Style.badge, Style[`badge_${d.status || 'unknown'}`]].join(' ')}>
                          {d.status || 'unknown'}
                        </span>
                      </td>
                      <td className={Style.uaCell} title={ev.userAgent || ''}>
                        {ev.userAgent || '—'}
                      </td>
                      <td className={Style.refCell} title={d.referrer || ''}>
                        {d.referrer || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
