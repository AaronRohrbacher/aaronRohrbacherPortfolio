'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Style from './MusicAdmin.module.scss';

const AUDIO_EXTS = ['.mp3', '.wav', '.aiff', '.aif'];

// Map the raw visibility enum to a user-facing label.
// Data values stay the same ('authenticated' etc.); only the label changes.
function visibilityLabel(visibility) {
  if (visibility === 'authenticated') return 'members';
  return visibility || 'public';
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
  const fileRef = useRef(null);

  async function createShareLink(dumpId) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/dump-share-links', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dumpId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create link');
      const url = `${window.location.origin}/music/dump/${encodeURIComponent(dumpId)}?share=${data.link.token}`;
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
      const res = await fetch('/api/music/admin/dumps', { headers });
      const data = await res.json();
      setDumps(data.dumps || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchDumps(); }, [fetchDumps]);

  async function createDump() {
    if (!form.name.trim()) return;
    setError('');

    const files = fileRef.current?.files;
    const audioFiles = files ? [...files].filter((f) =>
      AUDIO_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext))
    ) : [];

    if (audioFiles.length === 0) {
      setError('Add at least one audio file (MP3, WAV, or AIFF) before creating the dump.');
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/dumps', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, published: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const dump = data.dump;

      if (audioFiles.length > 0) {
        setUploading(true);
        setUploadProgress(`Uploading 0/${audioFiles.length}...`);

        const urlRes = await fetch('/api/music/admin/upload', {
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
            throw new Error(`Upload failed for ${file.name} (${uploadRes.status}). Check S3 bucket CORS settings.`);
          }
        }

        setUploadProgress('Syncing with S3...');
        const tracksRes = await fetch('/api/music/tracks?raw=1', { headers });
        const tracksData = await tracksRes.json();
        const allTracks = tracksData.tracks || [];

        const uploadedNames = audioFiles.map((f) =>
          f.name.replace(/\.(mp3|wav|aiff|aif)$/i, '')
        );
        const toAssign = allTracks.filter((t) => uploadedNames.includes(t.id) && !t.dumpId);
        if (toAssign.length > 0) {
          const updated = allTracks.map((t) =>
            toAssign.find((a) => a.id === t.id)
              ? { ...t, dumpId: dump.id, visibility: form.visibility }
              : t
          );
          await fetch('/api/music/tracks', {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: updated }),
          });
        }

        setUploading(false);
        setUploadProgress('');
      }

      setForm({ name: '', description: '', artists: '', visibility: 'public' });
      setCreating(false);
      if (fileRef.current) fileRef.current.value = '';
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
      await fetch('/api/music/admin/dumps', {
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
      await fetch(`/api/music/admin/dumps?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      fetchDumps();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

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
          <input
            className={Style.input}
            placeholder="Dump name / release title"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <textarea
            className={Style.input}
            rows={2}
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <input
            className={Style.input}
            placeholder="Artists"
            value={form.artists}
            onChange={(e) => setForm((f) => ({ ...f, artists: e.target.value }))}
          />
          <select
            className={Style.input}
            value={form.visibility}
            onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value }))}
          >
            <option value="public">Public</option>
            <option value="authenticated">Members</option>
            <option value="restricted">Restricted</option>
          </select>
          <label className={Style.fileLabel}>
            Audio Files
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".mp3,.wav,.aiff,.aif,audio/*"
              className={Style.fileInput}
            />
          </label>
          {uploading && <p className={Style.savingBadge}>{uploadProgress}</p>}
          <div className={Style.modalActions}>
            <button className={Style.btnSecondary} onClick={() => setCreating(false)}>Cancel</button>
            <button className={Style.btn} onClick={createDump} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Create & Upload'}
            </button>
          </div>
        </div>
      )}

      <div className={Style.list}>
        {dumps.map((dump) => (
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
        {dumps.length === 0 && (
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
              await fetch('/api/music/admin/dumps', {
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
  const editFileRef = useRef(null);
  const trackIds = (dump.tracks || []).map((t) => t.id);

  async function uploadMore() {
    const files = editFileRef.current?.files;
    const audioFiles = files ? [...files].filter((f) =>
      AUDIO_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext))
    ) : [];
    if (audioFiles.length === 0) {
      setUploadError('Pick at least one audio file (MP3, WAV, or AIFF).');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const headers = await getAuthHeaders();
      setUploadProgress(`Uploading 0/${audioFiles.length}...`);
      const urlRes = await fetch('/api/music/admin/upload', {
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
          throw new Error(`Upload failed for ${file.name} (${uploadRes.status}). Check S3 bucket CORS settings.`);
        }
      }

      setUploadProgress('Syncing with S3...');
      const tracksRes = await fetch('/api/music/tracks?raw=1', { headers });
      const tracksData = await tracksRes.json();
      const allTracks = tracksData.tracks || [];
      const uploadedNames = audioFiles.map((f) => f.name.replace(/\.(mp3|wav|aiff|aif)$/i, ''));
      const toAssign = allTracks.filter((t) => uploadedNames.includes(t.id) && !t.dumpId);
      if (toAssign.length > 0) {
        const updated = allTracks.map((t) =>
          toAssign.find((a) => a.id === t.id)
            ? { ...t, dumpId: form.id, visibility: form.visibility }
            : t
        );
        await fetch('/api/music/tracks', {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: updated }),
        });
      }
      if (editFileRef.current) editFileRef.current.value = '';
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
    if (form.visibility === 'restricted' && trackIds.length > 0) {
      loadPerms();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (form.visibility === 'restricted' && trackIds.length > 0 && perms.users.length === 0 && perms.groups.length === 0) {
      loadPerms();
    }
  }, [form.visibility]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUsersAndGroups() {
    try {
      const headers = await getAuthHeaders();
      const [usersRes, groupsRes] = await Promise.all([
        fetch('/api/music/admin/users', { headers }),
        fetch('/api/music/admin/groups', { headers }),
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
      const res = await fetch(`/api/music/admin/permissions?trackId=${encodeURIComponent(trackIds[0])}`, { headers });
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
          fetch('/api/music/admin/permissions', {
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
          fetch('/api/music/admin/permissions', {
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
      <div className={Style.modal}>
        <h2>Edit Dump</h2>
        <div className={Style.formGrid}>
          <label>
            Name
            <input
              className={Style.input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label>
            Artists
            <input
              className={Style.input}
              value={form.artists || ''}
              onChange={(e) => set('artists', e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              className={Style.input}
              rows={3}
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
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

          {form.visibility === 'restricted' && (
            <div className={Style.permSection}>
              <h3>Permissions</h3>
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

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Add tracks to this dump</label>
            <input
              type="file"
              ref={editFileRef}
              multiple
              accept=".mp3,.wav,.aiff,.aif"
              disabled={uploading}
              style={{ display: 'block', marginTop: '0.35rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                className={Style.btn}
                onClick={uploadMore}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload & Add'}
              </button>
              {uploadProgress && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{uploadProgress}</span>}
            </div>
            {uploadError && (
              <p style={{ color: '#d14', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>{uploadError}</p>
            )}
          </div>

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
