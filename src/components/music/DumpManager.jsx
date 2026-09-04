'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Style from './MusicAdmin.module.scss';
import { promptInsertLink } from '@/lib/richText';

const AUDIO_EXTS = ['.mp3', '.wav', '.aac', '.m4a', '.aiff', '.aif', '.mp4', '.m4v', '.webm', '.mov'];

// Map the raw visibility enum to a user-facing label.
// Data values stay the same ('authenticated' etc.); only the label changes.
function visibilityLabel(visibility) {
  if (visibility === 'authenticated') return 'members';
  return visibility || 'public';
}

function isAudioFile(file) {
  const name = (file?.name || '').toLowerCase();
  return AUDIO_EXTS.some((ext) => name.endsWith(ext));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function dedupeFiles(existing, incoming) {
  const key = (f) => `${f.name}::${f.size}::${f.lastModified || ''}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const f of incoming) {
    const k = key(f);
    if (!seen.has(k)) { seen.add(k); out.push(f); }
  }
  return out;
}

function FileDropZone({ files, onFilesChange, disabled, idPrefix }) {
  const [dragActive, setDragActive] = useState(false);
  const [rejectMsg, setRejectMsg] = useState('');
  const dragCounter = useRef(0);
  const inputRef = useRef(null);
  const inputId = `${idPrefix}-file-input`;

  function handleFiles(list) {
    const arr = list ? [...list] : [];
    if (arr.length === 0) return;
    const accepted = arr.filter(isAudioFile);
    const rejected = arr.filter((f) => !isAudioFile(f));
    if (rejected.length > 0) {
      setRejectMsg(
        `Skipped ${rejected.length} file${rejected.length > 1 ? 's' : ''} ` +
        `(only MP3, WAV, AAC, AIFF, MP4, M4V, WebM, or MOV allowed): ${rejected.map((r) => r.name).join(', ')}`
      );
    } else {
      setRejectMsg('');
    }
    if (accepted.length > 0) {
      onFilesChange(dedupeFiles(files, accepted));
    }
  }

  function onDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounter.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setDragActive(true);
  }

  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragActive(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (disabled) return;
    handleFiles(e.dataTransfer?.files);
  }

  function removeAt(idx) {
    onFilesChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div
        className={[Style.dropZone, dragActive ? Style.dropZoneActive : ''].join(' ')}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <p>{dragActive ? 'Drop audio files here' : 'Drag & drop audio files here'}</p>
        <small>.mp3 · .wav · .aac · .m4a · .aiff · .mp4 · .m4v · .webm · .mov</small>
        <div className={Style.dropZoneActions}>
          <button
            type="button"
            className={Style.selectFilesBtn}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Select files
          </button>
          {files.length > 0 && (
            <button
              type="button"
              className={Style.selectFilesBtn}
              disabled={disabled}
              onClick={() => { onFilesChange([]); setRejectMsg(''); }}
            >
              Clear
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept=".mp3,.wav,.aac,.m4a,.aiff,.aif,.mp4,.m4v,.webm,.mov,audio/*,video/*"
          className={Style.hiddenFileInput}
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files);
            // reset so picking the same file twice re-triggers onChange
            e.target.value = '';
          }}
        />
      </div>

      {rejectMsg && <p className={Style.inlineError}>{rejectMsg}</p>}

      {files.length > 0 && (
        <div className={Style.fileList}>
          {files.map((f, idx) => (
            <div key={`${f.name}-${f.size}-${idx}`} className={Style.fileRow}>
              <span className={Style.fileName} title={f.name}>{f.name}</span>
              <span className={Style.fileSize}>{formatBytes(f.size)}</span>
              <button
                type="button"
                className={Style.removeFileBtn}
                onClick={() => removeAt(idx)}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DumpManager({ getAuthHeaders, onRefresh }) {
  const [dumps, setDumps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [form, setForm] = useState({ name: '', description: '', artists: '', visibility: 'public' });
  const [editing, setEditing] = useState(null);
  const [shareCopied, setShareCopied] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sortBy, setSortBy] = useState('manual');
  const [sortDir, setSortDir] = useState('asc');
  // Create form can also attach pre-existing tracks to the new dump — no
  // upload required at all. Stored as a Set of track IDs.
  const [createExistingTrackIds, setCreateExistingTrackIds] = useState(() => new Set());
  const [createAllTracks, setCreateAllTracks] = useState([]);
  const [createTracksLoading, setCreateTracksLoading] = useState(false);
  const [createTrackSearch, setCreateTrackSearch] = useState('');
  const createArtistsRef = useRef(null);
  const createDescriptionRef = useRef(null);

  async function createShareLink(dumpId) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/dump-share-links', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dumpId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create link');
      // Prefer the human-friendly slug for shared URLs; fall back to the
      // raw dump id for legacy rows that haven't been resaved yet.
      const target = dumps.find((d) => d.id === dumpId);
      const handle = target?.slug || dumpId;
      const url = `${window.location.origin}/dump/${encodeURIComponent(handle)}?share=${data.link.token}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(dumpId);
      setTimeout(() => setShareCopied(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  const fetchDumps = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/dumps', { headers });
      const data = await res.json();
      setDumps(data.dumps || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchDumps(); }, [fetchDumps]);

  // Lazy-load the existing-tracks list the first time the user opens the
  // create form — saves a fetch until they actually want to pick tracks.
  useEffect(() => {
    if (!creating || createAllTracks.length > 0 || createTracksLoading) return;
    let cancelled = false;
    (async () => {
      setCreateTracksLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/tracks?raw=1', { headers });
        const data = await res.json();
        if (!cancelled) setCreateAllTracks(data.tracks || []);
      } catch {} finally {
        if (!cancelled) setCreateTracksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creating]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createDump() {
    if (!form.name.trim()) return;
    setError('');

    // Uploads are optional now. The dump can be created empty, with only
    // existing-track assignments, with only new uploads, or with both.
    const audioFiles = selectedFiles.filter(isAudioFile);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/dumps', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, published: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const dump = data.dump;

      // Attach any pre-selected existing tracks to the new dump first (no
      // upload needed). Per-track PUT fires the backend's sibling sync.
      if (createExistingTrackIds.size > 0) {
        for (const t of createAllTracks) {
          if (!createExistingTrackIds.has(t.id)) continue;
          const currentDumpIds = Array.isArray(t.dumpIds)
            ? t.dumpIds
            : t.dumpId
            ? [t.dumpId]
            : [];
          if (currentDumpIds.includes(dump.id)) continue;
          const next = {
            ...t,
            dumpIds: [...currentDumpIds, dump.id],
            visibility: form.visibility,
          };
          delete next.dumpId;
          await fetch('/api/tracks', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ track: next }),
          });
        }
      }

      if (audioFiles.length > 0) {
        setUploading(true);
        setUploadProgress(`Uploading 0/${audioFiles.length}...`);

        const urlRes = await fetch('/api/admin/upload', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: audioFiles.map((f) => ({ filename: f.name })),
          }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlData.error);

        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          const urlInfo = urlData.urls.find((u) => u.filename === file.name);
          if (!urlInfo || urlInfo.error) continue;

          setUploadProgress(`Uploading ${i + 1}/${audioFiles.length}: ${file.name}`);
          const uploadRes = await fetch(urlInfo.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
          });
          if (!uploadRes.ok) {
            const body = await uploadRes.text().catch(() => '');
            throw new Error(`Upload failed for ${file.name}: ${uploadRes.status} ${body.slice(0, 200)}`);
          }
        }

        setUploadProgress('Syncing with S3...');
        const tracksRes = await fetch('/api/tracks?raw=1', { headers });
        const tracksData = await tracksRes.json();
        const allTracks = tracksData.tracks || [];

        const uploadedNames = audioFiles.map((f) =>
          f.name.replace(/\.(mp3|wav|aac|m4a|aiff|aif|mp4|m4v|webm|mov)$/i, '')
        );
        const toAssign = allTracks.filter((t) => uploadedNames.includes(t.id));
        // Use per-track PUT so the backend's diff-aware sibling sync fires
        for (const t of toAssign) {
          const currentDumpIds = Array.isArray(t.dumpIds)
            ? t.dumpIds
            : t.dumpId
            ? [t.dumpId]
            : [];
          if (currentDumpIds.includes(dump.id)) continue;
          const next = {
            ...t,
            dumpIds: [...currentDumpIds, dump.id],
            visibility: form.visibility,
          };
          delete next.dumpId;
          await fetch('/api/tracks', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ track: next }),
          });
        }

        setUploading(false);
        setUploadProgress('');
      }

      setForm({ name: '', description: '', artists: '', visibility: 'public' });
      setCreating(false);
      setSelectedFiles([]);
      setCreateExistingTrackIds(new Set());
      setCreateTrackSearch('');
      fetchDumps();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  }

  async function togglePublish(dump) {
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/admin/dumps', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dump, published: !dump.published }),
      });
      fetchDumps();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDump(id) {
    if (!confirm('Delete this dump? Tracks will be unlinked but not deleted from S3.')) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/admin/dumps?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      fetchDumps();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

  // Move a dump up/down in the visible (sorted) list. Renumbers every dump
  // in the current manual order so the persisted `order` field reflects the
  // new arrangement. Batch-persists via the admin endpoint's array body.
  async function moveDump(index, direction) {
    // Operate on the MANUAL order, not the currently-sorted view. If the
    // user is looking at a non-manual sort, up/down still walks them through
    // the manual order — but flip to manual first for clarity.
    if (sortBy !== 'manual') setSortBy('manual');
    const ordered = [...dumps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const fromIdx = ordered.findIndex((d) => d.id === sortedDumps[index]?.id);
    if (fromIdx === -1) return;
    const swapIdx = fromIdx + direction;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    [ordered[fromIdx], ordered[swapIdx]] = [ordered[swapIdx], ordered[fromIdx]];
    const renumbered = ordered.map((d, i) => ({ ...d, order: i }));
    setDumps(renumbered);
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/admin/dumps', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dumps: renumbered.map((d) => ({ id: d.id, order: d.order })) }),
      });
    } catch (err) {
      setError(err.message);
      fetchDumps();
    }
  }

  // Apply search + sort to the dumps list. Manual respects the persisted
  // order field; date uses createdAt; name uses localeCompare. Direction
  // flips per-mode with a sign.
  const sortedDumps = (() => {
    const sign = sortDir === 'asc' ? 1 : -1;
    const sorted = dumps.slice().sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }) * sign;
      }
      if (sortBy === 'created') {
        return (a.createdAt || '').localeCompare(b.createdAt || '') * sign;
      }
      // Manual (default)
      return ((a.order ?? 0) - (b.order ?? 0)) * sign;
    });
    return sorted;
  })();

  if (loading) {
    return (
      <div className={Style.loadingWrap}>
        <div className={Style.spinner} />
        <p>Loading dumps...</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className={Style.errorBanner}>
          <p>{error}</p>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {!creating ? (
        <button className={Style.btn} onClick={() => setCreating(true)} style={{ marginBottom: '1rem' }}>
          + New Dump
        </button>
      ) : (
        <div className={Style.createForm}>
          <div className={Style.fieldGroup}>
            <label className={Style.fieldLabel} htmlFor="dump-name">Dump name</label>
            <input
              id="dump-name"
              className={Style.input}
              placeholder="Release title"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className={Style.fieldGroup}>
            <div className={Style.labelRow}>
              <label className={Style.fieldLabel} htmlFor="dump-artists">Artists</label>
              <button
                type="button"
                className={Style.linkBtn}
                onClick={() => promptInsertLink(createArtistsRef, form.artists || '', (v) => setForm((f) => ({ ...f, artists: v })))}
                title="Insert link"
              >
                <i className="fa-solid fa-link" /> Link
              </button>
            </div>
            <input
              id="dump-artists"
              ref={createArtistsRef}
              className={Style.input}
              placeholder="Comma-separated. Paste URLs or click + Link."
              value={form.artists}
              onChange={(e) => setForm((f) => ({ ...f, artists: e.target.value }))}
            />
          </div>

          <div className={Style.fieldGroup}>
            <div className={Style.labelRow}>
              <label className={Style.fieldLabel} htmlFor="dump-description">Description</label>
              <button
                type="button"
                className={Style.linkBtn}
                onClick={() => promptInsertLink(createDescriptionRef, form.description || '', (v) => setForm((f) => ({ ...f, description: v })))}
                title="Insert link"
              >
                <i className="fa-solid fa-link" /> Link
              </button>
            </div>
            <textarea
              id="dump-description"
              ref={createDescriptionRef}
              className={Style.input}
              rows={2}
              placeholder="Optional. Paste URLs or click + Link."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className={Style.fieldGroup}>
            <label className={Style.fieldLabel} htmlFor="dump-visibility">Visibility</label>
            <select
              id="dump-visibility"
              className={Style.input}
              value={form.visibility}
              onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}
            >
              <option value="public">Public</option>
              <option value="authenticated">Members</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>

          <hr className={Style.sectionDivider} />

          <div className={Style.fieldGroup}>
            <label className={Style.fieldLabel}>Add existing tracks (optional)</label>
            <p className={Style.fieldHint}>
              Pick tracks already in the library to include in this dump. No upload needed.
            </p>
            <input
              className={Style.input}
              type="text"
              placeholder="Search tracks by name or artist..."
              value={createTrackSearch}
              onChange={(e) => setCreateTrackSearch(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <div className={Style.subList} style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {createTracksLoading && <p className={Style.emptyMsg}>Loading tracks...</p>}
              {!createTracksLoading && createAllTracks.length === 0 && (
                <p className={Style.emptyMsg}>No tracks in library yet</p>
              )}
              {!createTracksLoading &&
                createAllTracks
                  .filter((t) => {
                    if (!createTrackSearch.trim()) return true;
                    const q = createTrackSearch.toLowerCase();
                    return (
                      t.name?.toLowerCase().includes(q) ||
                      t.id?.toLowerCase().includes(q) ||
                      t.artists?.toLowerCase().includes(q)
                    );
                  })
                  .map((t) => {
                    const checked = createExistingTrackIds.has(t.id);
                    return (
                      <label key={t.id} className={Style.memberCheckRow}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCreateExistingTrackIds((prev) => {
                              const s = new Set(prev);
                              if (checked) s.delete(t.id);
                              else s.add(t.id);
                              return s;
                            })
                          }
                        />
                        <span>
                          {t.name}
                          {t.artists && <span className={Style.trackId}> — {t.artists}</span>}
                        </span>
                      </label>
                    );
                  })}
            </div>
            {createExistingTrackIds.size > 0 && (
              <p className={Style.fieldHint} style={{ marginTop: '0.35rem' }}>
                {createExistingTrackIds.size} track{createExistingTrackIds.size === 1 ? '' : 's'} will be added to this dump.
              </p>
            )}
          </div>

          <div className={Style.fieldGroup}>
            <label className={Style.fieldLabel}>Upload new audio files (optional)</label>
            <FileDropZone
              files={selectedFiles}
              onFilesChange={setSelectedFiles}
              disabled={uploading}
              idPrefix="create"
            />
          </div>

          {uploading && <p className={Style.uploadStatus}>{uploadProgress}</p>}

          <div className={Style.modalActions}>
            <button
              className={Style.btnSecondary}
              onClick={() => {
                setCreating(false);
                setSelectedFiles([]);
                setCreateExistingTrackIds(new Set());
                setCreateTrackSearch('');
              }}
              disabled={uploading}
            >
              Cancel
            </button>
            <button className={Style.btn} onClick={createDump} disabled={uploading}>
              {uploading
                ? 'Uploading...'
                : selectedFiles.filter(isAudioFile).length > 0
                ? `Create & Upload${createExistingTrackIds.size > 0 ? ' + Attach' : ''}`
                : createExistingTrackIds.size > 0
                ? 'Create & Attach'
                : 'Create Dump'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Sort by
          <select
            className={Style.selectSmall}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort dumps by"
          >
            <option value="manual">Manual (my order)</option>
            <option value="created">Date created</option>
            <option value="name">Name</option>
          </select>
        </label>
        <button
          type="button"
          className={Style.iconBtn}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'} (click to flip)`}
        >
          <i className={`fa-solid fa-arrow-${sortDir === 'asc' ? 'down-short-wide' : 'up-short-wide'}`} />
          {' '}
          {sortDir === 'asc' ? 'Asc' : 'Desc'}
        </button>
      </div>

      <div className={Style.list}>
        {sortedDumps.map((dump, index) => (
          <div key={dump.id}>
            <div className={[Style.item, dump.published ? Style.published : Style.unpublished].join(' ')}>
              <div className={Style.statusDot} title={dump.published ? 'Published' : 'Unpublished'} />
              <div className={Style.itemInfo}>
                <strong>{dump.name}</strong>
                {dump.artists && <span className={Style.artistsPreview}>{dump.artists}</span>}
                {dump.description && <span className={Style.descPreview}>{dump.description}</span>}
                <span className={Style.formats}>
                  {dump.tracks?.length || 0} tracks &middot; {visibilityLabel(dump.visibility)} &middot; {new Date(dump.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className={Style.itemActions}>
                <button className={Style.iconBtn} onClick={() => moveDump(index, -1)} title="Move up">
                  <i className="fa-solid fa-chevron-up" />
                </button>
                <button className={Style.iconBtn} onClick={() => moveDump(index, 1)} title="Move down">
                  <i className="fa-solid fa-chevron-down" />
                </button>
                <button className={Style.iconBtn} onClick={() => setEditing(dump)}>
                  Edit
                </button>
                <button
                  className={[Style.iconBtn, dump.published ? Style.unpublishBtn : Style.publishBtn].join(' ')}
                  onClick={() => togglePublish(dump)}
                >
                  {dump.published ? 'Unpublish' : 'Publish'}
                </button>
                <button className={Style.iconBtn} onClick={() => createShareLink(dump.id)}>
                  {shareCopied === dump.id ? 'Copied!' : 'Share Link'}
                </button>
                <button className={Style.iconBtn + ' ' + Style.unpublishBtn} onClick={() => deleteDump(dump.id)}>
                  Delete
                </button>
              </div>
            </div>
            {dump.tracks?.length > 0 && (
              <div className={Style.subList}>
                {dump.tracks.map((t) => (
                  <div key={t.id} className={Style.subItem}>
                    <span>{t.name}</span>
                    <span className={Style.formats}>
                      {Object.keys(t.formats || {}).map((f) => f.toUpperCase()).join(' / ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {sortedDumps.length === 0 && (
          <p className={Style.emptyMsg}>No dumps yet. Create one above.</p>
        )}
      </div>

      {editing && (
        <DumpEditor
          dump={editing}
          getAuthHeaders={getAuthHeaders}
          onRefresh={async () => {
            await fetchDumps();
            if (onRefresh) onRefresh();
          }}
          onSave={async (updated) => {
            try {
              const headers = await getAuthHeaders();
              await fetch('/api/admin/dumps', {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
              });
              setEditing(null);
              fetchDumps();
              if (onRefresh) onRefresh();
            } catch (err) {
              setError(err.message);
            }
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DumpEditor({ dump, getAuthHeaders, onSave, onCancel, onRefresh }) {
  const [form, setForm] = useState({ ...dump });
  const [perms, setPerms] = useState({ users: [], groups: [] });
  const [allUsers, setAllUsers] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [permLoading, setPermLoading] = useState(false);
  const [pending, setPending] = useState({});
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [editFiles, setEditFiles] = useState([]);
  const editArtistsRef = useRef(null);
  const editDescriptionRef = useRef(null);
  // Tracks in this dump — from the server-rendered `dump.tracks` on mount,
  // kept in local state so checkbox toggles update immediately without a full
  // refresh.
  const [dumpTrackIds, setDumpTrackIds] = useState(
    new Set((dump.tracks || []).map((t) => t.id))
  );
  const trackIds = Array.from(dumpTrackIds);
  // All tracks in the library for the "Add existing tracks" picker
  const [allTracks, setAllTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [trackSearch, setTrackSearch] = useState('');
  const [trackPending, setTrackPending] = useState({});

  async function uploadMore() {
    const audioFiles = editFiles.filter(isAudioFile);
    if (audioFiles.length === 0) {
      setUploadError('Pick at least one audio file (MP3, WAV, or AIFF).');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const headers = await getAuthHeaders();
      setUploadProgress(`Uploading 0/${audioFiles.length}...`);
      const urlRes = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: audioFiles.map((f) => ({ filename: f.name })) }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error);

      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const urlInfo = urlData.urls.find((u) => u.filename === file.name);
        if (!urlInfo || urlInfo.error) continue;
        setUploadProgress(`Uploading ${i + 1}/${audioFiles.length}: ${file.name}`);
        const uploadRes = await fetch(urlInfo.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!uploadRes.ok) {
          const body = await uploadRes.text().catch(() => '');
          throw new Error(`Upload failed for ${file.name}: ${uploadRes.status} ${body.slice(0, 200)}`);
        }
      }

      setUploadProgress('Syncing with S3...');
      const tracksRes = await fetch('/api/tracks?raw=1', { headers });
      const tracksData = await tracksRes.json();
      const allTracks = tracksData.tracks || [];
      const uploadedNames = audioFiles.map((f) => f.name.replace(/\.(mp3|wav|aac|m4a|aiff|aif|mp4|m4v|webm|mov)$/i, ''));
      const toAssign = allTracks.filter((t) => uploadedNames.includes(t.id));
      for (const t of toAssign) {
        const currentDumpIds = Array.isArray(t.dumpIds)
          ? t.dumpIds
          : t.dumpId
          ? [t.dumpId]
          : [];
        if (currentDumpIds.includes(form.id)) continue;
        const next = {
          ...t,
          dumpIds: [...currentDumpIds, form.id],
          visibility: form.visibility,
        };
        delete next.dumpId;
        await fetch('/api/tracks', {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ track: next }),
        });
      }
      setEditFiles([]);
      setUploadProgress('');
      if (onRefresh) await onRefresh();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    loadUsersAndGroups();
    loadAllTracksList();
    if (form.visibility === 'restricted' && trackIds.length > 0) {
      loadPerms();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAllTracksList() {
    setTracksLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tracks?raw=1', { headers });
      const data = await res.json();
      setAllTracks(data.tracks || []);
    } catch {} finally {
      setTracksLoading(false);
    }
  }

  async function toggleTrackInDump(track) {
    const key = `track:${track.id}`;
    setTrackPending((p) => ({ ...p, [key]: true }));
    const currentDumpIds = Array.isArray(track.dumpIds)
      ? track.dumpIds
      : track.dumpId
      ? [track.dumpId]
      : [];
    const isIn = dumpTrackIds.has(track.id);
    const nextDumpIds = isIn
      ? currentDumpIds.filter((d) => d !== form.id)
      : [...currentDumpIds, form.id];
    const next = { ...track, dumpIds: nextDumpIds };
    delete next.dumpId;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tracks', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: next }),
      });
      if (!res.ok) throw new Error('Save failed');
      setDumpTrackIds((prev) => {
        const s = new Set(prev);
        if (isIn) s.delete(track.id);
        else s.add(track.id);
        return s;
      });
      // Also update allTracks so subsequent toggles see the new dumpIds
      setAllTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, dumpIds: nextDumpIds } : t))
      );
      if (onRefresh) await onRefresh();
    } catch {} finally {
      setTrackPending((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  }

  useEffect(() => {
    if (form.visibility === 'restricted' && trackIds.length > 0 && perms.users.length === 0 && perms.groups.length === 0) {
      loadPerms();
    }
  }, [form.visibility]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsersAndGroups() {
    try {
      const headers = await getAuthHeaders();
      const [usersRes, groupsRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/groups', { headers }),
      ]);
      const usersData = await usersRes.json();
      const groupsData = await groupsRes.json();
      setAllUsers(usersData.users || []);
      setAllGroups(groupsData.groups || []);
    } catch {}
  }

  async function loadPerms() {
    if (trackIds.length === 0) return;
    setPermLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/permissions?trackId=${encodeURIComponent(trackIds[0])}`, { headers });
      const data = await res.json();
      setPerms(data);
    } catch {} finally {
      setPermLoading(false);
    }
  }

  async function toggleUserPerm(userId, hasAccess) {
    const action = hasAccess ? 'revoke' : 'grant';
    const key = `user:${userId}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const headers = await getAuthHeaders();
      await Promise.all(
        trackIds.map((trackId) =>
          fetch('/api/admin/permissions', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId, targetType: 'user', targetId: userId, action }),
          })
        )
      );
      // Optimistic update
      setPerms((prev) => ({
        ...prev,
        users: hasAccess
          ? prev.users.filter((p) => p.userId !== userId)
          : [...prev.users, { userId, grantedAt: new Date().toISOString() }],
      }));
    } catch {} finally {
      setPending((p) => { const next = { ...p }; delete next[key]; return next; });
    }
  }

  async function toggleGroupPerm(groupName, hasAccess) {
    const action = hasAccess ? 'revoke' : 'grant';
    const key = `group:${groupName}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const headers = await getAuthHeaders();
      await Promise.all(
        trackIds.map((trackId) =>
          fetch('/api/admin/permissions', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId, targetType: 'group', targetId: groupName, action }),
          })
        )
      );
      setPerms((prev) => ({
        ...prev,
        groups: hasAccess
          ? prev.groups.filter((p) => p.groupName !== groupName)
          : [...prev.groups, { groupName, grantedAt: new Date().toISOString() }],
      }));
    } catch {} finally {
      setPending((p) => { const next = { ...p }; delete next[key]; return next; });
    }
  }

  const permittedUserIds = new Set(perms.users.map((p) => p.userId));
  const permittedGroupNames = new Set(perms.groups.map((p) => p.groupName.toLowerCase()));

  const filteredUsers = userSearch.trim()
    ? allUsers.filter((u) =>
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username?.toLowerCase().includes(userSearch.toLowerCase())
      )
    : allUsers;

  const filteredGroups = groupSearch.trim()
    ? allGroups.filter((g) =>
        g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.description?.toLowerCase().includes(groupSearch.toLowerCase())
      )
    : allGroups;

  return (
    <div className={Style.overlay}>
      <div className={[Style.modal, Style.modalWide].join(' ')}>
        <h2>Edit Dump</h2>
        <p className={Style.fieldHint} style={{ marginTop: '-0.4rem' }}>
          Editing <strong>{dump.name}</strong>
        </p>

        <div className={Style.formGrid}>
          {/* ─── Details ────────────────────────────── */}
          <h3 className={Style.editorSectionHeader}>Details</h3>

          <label>
            Name
            <input
              className={Style.input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label>
            <span className={Style.labelRow}>
              Artists
              <button
                type="button"
                className={Style.linkBtn}
                onClick={() => promptInsertLink(editArtistsRef, form.artists || '', (v) => set('artists', v))}
                title="Insert link"
              >
                <i className="fa-solid fa-link" /> Link
              </button>
            </span>
            <input
              ref={editArtistsRef}
              className={Style.input}
              value={form.artists || ''}
              onChange={(e) => set('artists', e.target.value)}
              placeholder="Paste URLs or click + Link"
            />
          </label>
          <label>
            <span className={Style.labelRow}>
              Description
              <button
                type="button"
                className={Style.linkBtn}
                onClick={() => promptInsertLink(editDescriptionRef, form.description || '', (v) => set('description', v))}
                title="Insert link"
              >
                <i className="fa-solid fa-link" /> Link
              </button>
            </span>
            <textarea
              ref={editDescriptionRef}
              className={Style.input}
              rows={3}
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Paste URLs or click + Link"
            />
          </label>
          <label>
            Visibility
            <select
              className={Style.input}
              value={form.visibility || 'public'}
              onChange={(e) => set('visibility', e.target.value)}
            >
              <option value="public">Public</option>
              <option value="authenticated">Members</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>

          {/* ─── Tracks (existing picker FIRST — most common case) ───── */}
          <hr className={Style.sectionDivider} />
          <h3 className={Style.editorSectionHeader}>
            Tracks ({dumpTrackIds.size} in dump)
          </h3>
          <p className={Style.fieldHint}>
            A track can live in multiple dumps. Check to add, uncheck to remove.
          </p>
          <input
            className={Style.searchInput}
            type="text"
            placeholder="Search tracks..."
            value={trackSearch}
            onChange={(e) => setTrackSearch(e.target.value)}
            style={{ marginBottom: '0.5rem' }}
          />
          <div className={Style.subList} style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {tracksLoading && <p className={Style.emptyMsg}>Loading tracks...</p>}
            {!tracksLoading && allTracks.length === 0 && (
              <p className={Style.emptyMsg}>No tracks found</p>
            )}
            {!tracksLoading &&
              allTracks
                .filter((t) => {
                  if (!trackSearch.trim()) return true;
                  const q = trackSearch.toLowerCase();
                  return (
                    t.name?.toLowerCase().includes(q) ||
                    t.id?.toLowerCase().includes(q) ||
                    t.artists?.toLowerCase().includes(q)
                  );
                })
                .map((t) => {
                  const inDump = dumpTrackIds.has(t.id);
                  const key = `track:${t.id}`;
                  const isPending = !!trackPending[key];
                  return (
                    <label key={t.id} className={Style.memberCheckRow}>
                      <input
                        type="checkbox"
                        checked={inDump}
                        disabled={isPending}
                        onChange={() => toggleTrackInDump(t)}
                      />
                      <span className={isPending ? Style.pendingLabel : undefined}>
                        {t.name}
                        {t.artists && (
                          <span className={Style.trackId}> — {t.artists}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
          </div>

          {/* ─── Permissions (only if restricted) ────────────────── */}
          {form.visibility === 'restricted' && (
            <div className={Style.permSection}>
              <hr className={Style.sectionDivider} />
              <h3 className={Style.editorSectionHeader}>Permissions</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: '0 0 0.5rem' }}>
                Applied to all {trackIds.length} track{trackIds.length !== 1 ? 's' : ''} in this dump.
              </p>
              {trackIds.length === 0 ? (
                <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>No tracks in this dump yet.</p>
              ) : permLoading ? (
                <p>Loading...</p>
              ) : (
                <>
                  <div>
                    <h4>Users ({perms.users.length} granted)</h4>
                    <input
                      className={Style.searchInput}
                      type="text"
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      style={{ marginBottom: '0.5rem' }}
                    />
                    <div className={Style.subList} style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {filteredUsers.map((u) => {
                        const hasAccess = permittedUserIds.has(u.username) || permittedUserIds.has(u.email);
                        const key = `user:${u.username}`;
                        const isPending = !!pending[key];
                        return (
                          <label key={u.username} className={Style.memberCheckRow}>
                            <input
                              type="checkbox"
                              checked={hasAccess}
                              disabled={isPending}
                              onChange={() => toggleUserPerm(u.email, hasAccess)}
                            />
                            <span className={isPending ? Style.pendingLabel : undefined}>
                              {u.email}
                            </span>
                          </label>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <p className={Style.emptyMsg}>
                          {userSearch ? 'No users match search' : 'No users yet'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <h4>Groups ({perms.groups.length} granted)</h4>
                    <input
                      className={Style.searchInput}
                      type="text"
                      placeholder="Search groups..."
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      style={{ marginBottom: '0.5rem' }}
                    />
                    <div className={Style.subList} style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {filteredGroups.map((g) => {
                        const hasAccess = permittedGroupNames.has(g.name.toLowerCase());
                        const key = `group:${g.name}`;
                        const isPending = !!pending[key];
                        return (
                          <label key={g.name} className={Style.memberCheckRow}>
                            <input
                              type="checkbox"
                              checked={hasAccess}
                              disabled={isPending}
                              onChange={() => toggleGroupPerm(g.name, hasAccess)}
                            />
                            <span className={isPending ? Style.pendingLabel : undefined}>
                              {g.name}
                              {g.description && <span className={Style.trackId}> — {g.description}</span>}
                            </span>
                          </label>
                        );
                      })}
                      {filteredGroups.length === 0 && (
                        <p className={Style.emptyMsg}>
                          {groupSearch ? 'No groups match search' : 'No groups yet'}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Upload new tracks ────────────────────────── */}
          <hr className={Style.sectionDivider} />
          <h3 className={Style.editorSectionHeader}>Upload new tracks</h3>
          <p className={Style.fieldHint}>
            Drop audio files here to upload and attach them to this dump.
          </p>
          <FileDropZone
            files={editFiles}
            onFilesChange={setEditFiles}
            disabled={uploading}
            idPrefix="edit"
          />
          <div className={Style.dropZoneActions} style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className={Style.btn}
              onClick={uploadMore}
              disabled={uploading || editFiles.length === 0}
            >
              {uploading ? 'Uploading...' : `Upload & Add${editFiles.length > 0 ? ` (${editFiles.length})` : ''}`}
            </button>
            {uploadProgress && <span className={Style.uploadStatus}>{uploadProgress}</span>}
          </div>
          {uploadError && <p className={Style.inlineError}>{uploadError}</p>}

          <hr className={Style.sectionDivider} />
          <div className={Style.metaInfo}>
            <span>ID: <code>{form.id}</code></span>
            <span>Tracks: {trackIds.length}</span>
            <span>Created: {new Date(form.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className={Style.modalActions}>
          <button className={Style.btnSecondary} onClick={onCancel}>Cancel</button>
          <button className={Style.btn} onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}
