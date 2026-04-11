'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Style from './MusicAdmin.module.scss';
import { useAuth } from './AuthContext';
import { useMusicPlayer } from './MusicPlayerContext';
import { useRouter } from 'next/navigation';
import UserManager from './UserManager';
import GroupManager from './GroupManager';
import DumpManager from './DumpManager';
import EventsPanel from './EventsPanel';
import { useMusicHref } from '@/lib/musicLinks';


const TABS = ['tracks', 'dumps', 'users', 'groups', 'events', 'settings'];

export default function MusicAdmin() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const router = useRouter();
  const musicHref = useMusicHref();
  const [tab, setTab] = useState('tracks');
  const [tracks, setTracks] = useState([]);
  const [dumps, setDumps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tracksPerPage, setTracksPerPage] = useState(10);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/tracks?raw=1', { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTracks(data.tracks || []);
      setDumps(data.dumps || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/music/admin/settings');
      const data = await res.json();
      if (data.tracksPerPage) setTracksPerPage(data.tracksPerPage);
    } catch {}
  }, []);

  useEffect(() => {
    if (user?.isAdmin) { fetchTracks(); fetchSettings(); }
  }, [user, fetchTracks, fetchSettings]);

  async function saveOneTrack(track) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/tracks', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ track }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setTracks((prev) => prev.map((t) => (t.id === track.id ? track : t)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBatchTracks(updated) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/tracks', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: updated }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setTracks(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function togglePublish(trackId) {
    const track = tracks.find((t) => t.id === trackId);
    if (track) saveOneTrack({ ...track, published: !track.published });
  }

  function moveTrack(index, direction) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    next.forEach((t, i) => (t.order = i));
    saveBatchTracks(next);
  }

  function updateTrackVisibility(trackId, visibility) {
    const track = tracks.find((t) => t.id === trackId);
    if (track) saveOneTrack({ ...track, visibility });
  }

  function assignDump(trackId, dumpId) {
    const track = tracks.find((t) => t.id === trackId);
    if (track) saveOneTrack({ ...track, dumpId: dumpId || null });
  }

  function saveEdit(updated) {
    saveOneTrack(updated);
    setEditing(null);
  }

  if (authLoading) {
    return (
      <div className={Style.loadingWrap}>
        <div className={Style.spinner} />
      </div>
    );
  }

  if (!user) {
    router.push(musicHref('/login'));
    return null;
  }

  if (!user.isAdmin) {
    return (
      <div className={Style.loginWrap}>
        <div className={Style.loginCard}>
          <h1>Access Denied</h1>
          <p>You don&apos;t have admin access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={Style.wrap}>
      <div className={Style.header}>
        <h1>Music Admin</h1>
        <div className={Style.headerActions}>
          {saved && <span className={Style.savedBadge}>Saved</span>}
          {saving && <span className={Style.savingBadge}>Saving...</span>}
          {tab === 'tracks' && (
            <button className={Style.btnSecondary} onClick={fetchTracks} disabled={loading}>
              <i className="fa-solid fa-arrows-rotate" /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={Style.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            className={[Style.tab, tab === t ? Style.tabActive : ''].join(' ')}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className={Style.errorBanner}>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Tracks Tab */}
      {tab === 'tracks' && (
        loading ? (
          <div className={Style.loadingWrap}>
            <div className={Style.spinner} />
            <p>Loading tracks...</p>
          </div>
        ) : (
          <div className={Style.list}>
            <input
              className={Style.searchInput}
              type="text"
              placeholder="Search tracks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {tracks.length === 0 && (
              <p className={Style.emptyMsg}>No tracks found in the S3 bucket.</p>
            )}
            {tracks.filter((t) => {
              if (!search.trim()) return true;
              const q = search.toLowerCase();
              return (
                t.name?.toLowerCase().includes(q) ||
                t.id?.toLowerCase().includes(q) ||
                t.artists?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q) ||
                dumps.find((d) => d.id === t.dumpId)?.name?.toLowerCase().includes(q)
              );
            }).map((track, index) => (
              <div
                key={track.id}
                className={[Style.item, track.published ? Style.published : Style.unpublished].join(' ')}
              >
                <div className={Style.statusDot} title={track.published ? 'Published' : 'Unpublished'} />

                <div className={Style.itemInfo}>
                  <strong>{track.name}</strong>
                  <span className={Style.trackId}>{track.id}</span>
                  <div className={Style.formats}>
                    {Object.entries(track.formats || {}).map(([fmt, key]) => (
                      <span key={fmt} className={Style.fmtGroup}>
                        {fmt.toUpperCase()}
                        {' '}
                        <button
                          className={Style.iconBtn}
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}
                          title={`Download ${fmt.toUpperCase()}`}
                          onClick={async () => {
                            const headers = await getAuthHeaders();
                            const res = await fetch(`/api/music/stream?id=${encodeURIComponent(track.id)}&format=${fmt}&download=1&urlOnly=1`, { headers });
                            if (!res.ok) { alert('Download failed'); return; }
                            const { url } = await res.json();
                            window.location.href = url;
                          }}
                        >
                          <i className="fa-solid fa-download" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <AdminPlayer track={track} />
                  <span className={Style.visibilityBadge}>{track.visibility || 'public'}</span>
                  {track.addedAt && <span className={Style.trackId}>{new Date(track.addedAt).toLocaleDateString()}</span>}
                  {track.artists && <span className={Style.artistsPreview}>{track.artists}</span>}
                </div>

                <div className={Style.itemActions}>
                  <button className={Style.iconBtn} onClick={() => moveTrack(index, -1)} title="Move up">
                    <i className="fa-solid fa-chevron-up" />
                  </button>
                  <button className={Style.iconBtn} onClick={() => moveTrack(index, 1)} title="Move down">
                    <i className="fa-solid fa-chevron-down" />
                  </button>
                  <select
                    className={Style.selectSmall}
                    value={track.dumpId || ''}
                    onChange={(e) => assignDump(track.id, e.target.value)}
                  >
                    <option value="">No dump</option>
                    {dumps.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <select
                    className={Style.selectSmall}
                    value={track.visibility || 'public'}
                    onChange={(e) => updateTrackVisibility(track.id, e.target.value)}
                  >
                    <option value="public">Public</option>
                    <option value="authenticated">Auth Required</option>
                    <option value="restricted">Restricted</option>
                  </select>
                  <button
                    className={[Style.iconBtn, track.published ? Style.unpublishBtn : Style.publishBtn].join(' ')}
                    onClick={() => togglePublish(track.id)}
                  >
                    {track.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className={Style.iconBtn} onClick={() => setEditing({ ...track })}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Dumps Tab */}
      {tab === 'dumps' && (
        <DumpManager getAuthHeaders={getAuthHeaders} onRefresh={fetchTracks} />
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <UserManager getAuthHeaders={getAuthHeaders} />
      )}

      {/* Groups Tab */}
      {tab === 'groups' && (
        <GroupManager getAuthHeaders={getAuthHeaders} />
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <EventsPanel getAuthHeaders={getAuthHeaders} />
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className={Style.createForm}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Tracks per page (public playlist)
            <input
              className={Style.input}
              type="number"
              min={1}
              max={100}
              value={tracksPerPage}
              onChange={(e) => setTracksPerPage(Number(e.target.value))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
          <button
            className={Style.btn}
            onClick={async () => {
              const headers = await getAuthHeaders();
              await fetch('/api/music/admin/settings', {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracksPerPage }),
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            Save Settings
          </button>
        </div>
      )}

      {editing && (
        <TrackEditor
          track={editing}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
          getAuthHeaders={getAuthHeaders}
        />
      )}
    </div>
  );
}

function TrackEditor({ track, onSave, onCancel, getAuthHeaders }) {
  const [form, setForm] = useState({ ...track });
  const [perms, setPerms] = useState({ users: [], groups: [] });
  const [allUsers, setAllUsers] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [permLoading, setPermLoading] = useState(false);
  const [pending, setPending] = useState({});
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  useEffect(() => {
    loadUsersAndGroups();
    if (form.visibility === 'restricted') loadPerms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (form.visibility === 'restricted' && perms.users.length === 0 && perms.groups.length === 0) {
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
      setAllUsers((await usersRes.json()).users || []);
      setAllGroups((await groupsRes.json()).groups || []);
    } catch {}
  }

  async function loadPerms() {
    setPermLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/music/admin/permissions?trackId=${track.id}`, { headers });
      setPerms(await res.json());
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
      await fetch('/api/music/admin/permissions', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id, targetType: 'user', targetId: userId, action }),
      });
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
      await fetch('/api/music/admin/permissions', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id, targetType: 'group', targetId: groupName, action }),
      });
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
    ? allUsers.filter((u) => u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : allUsers;

  const filteredGroups = groupSearch.trim()
    ? allGroups.filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
    : allGroups;

  return (
    <div className={Style.overlay}>
      <div className={Style.modal}>
        <h2>Edit Track</h2>
        <div className={Style.formGrid}>
          <label>
            Display Name
            <input
              className={Style.input}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Track title shown to users"
            />
          </label>
          <label>
            Artists
            <textarea
              className={Style.input}
              rows={2}
              value={form.artists}
              onChange={(e) => set('artists', e.target.value)}
              placeholder="e.g., Aaron Rohrbacher on keys, with Sarah on vocals..."
            />
          </label>
          <label>
            Description
            <textarea
              className={Style.input}
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Tell listeners about this track..."
            />
          </label>
          <label>
            Date Added
            <input
              className={Style.input}
              type="date"
              value={form.addedAt ? form.addedAt.split('T')[0] : ''}
              onChange={(e) => set('addedAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
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
              <option value="authenticated">Authenticated Only</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          {form.visibility === 'restricted' && (
            <div className={Style.permSection}>
              <h3>Permissions</h3>
              {permLoading ? (
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
                            <span className={isPending ? Style.pendingLabel : undefined}>{u.email}</span>
                          </label>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <p className={Style.emptyMsg}>{userSearch ? 'No users match' : 'No users yet'}</p>
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
                        <p className={Style.emptyMsg}>{groupSearch ? 'No groups match' : 'No groups yet'}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <div className={Style.metaInfo}>
            <span>S3 ID: <code>{form.id}</code></span>
            <span>Formats: {Object.keys(form.formats || {}).map((f) => f.toUpperCase()).join(', ')}</span>
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

function AdminPlayer({ track }) {
  const { currentTrack, isPlaying, playTrack } = useMusicPlayer();
  const fmtKeys = Object.keys(track.formats || {});
  if (fmtKeys.length === 0) return null;

  const isActive = currentTrack?.id === track.id;

  function handlePlay() {
    // Build a player-compatible track object with streamUrls
    const playerTrack = {
      ...track,
      formats: fmtKeys,
      streamUrls: Object.fromEntries(
        fmtKeys.map((f) => [f, `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${f}`])
      ),
    };
    playTrack(playerTrack, 0);
  }

  return (
    <button className={Style.iconBtn} onClick={handlePlay}>
      <i className={isActive && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'} />
      {' '}{isActive && isPlaying ? 'Pause' : 'Play'}
    </button>
  );
}
