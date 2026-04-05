'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Style from './MusicAdmin.module.scss';

export default function GroupManager({ getAuthHeaders }) {
  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [pending, setPending] = useState({}); // { "groupName:username": true }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [groupsRes, usersRes] = await Promise.all([
        fetch('/api/music/admin/groups', { headers }),
        fetch('/api/music/admin/users', { headers }),
      ]);
      const groupsData = await groupsRes.json();
      const usersData = await usersRes.json();
      setGroups(groupsData.groups || []);
      setAllUsers(usersData.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function createGroup() {
    if (!name.trim()) return;
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/groups', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setName('');
      setDesc('');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteGroup(groupName) {
    if (!confirm(`Delete group "${groupName}"?`)) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/music/admin/groups?name=${encodeURIComponent(groupName)}`, {
        method: 'DELETE',
        headers,
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleMember(groupName, username, isMember) {
    const key = `${groupName}:${username}`;
    setPending((p) => ({ ...p, [key]: true }));
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/groups', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, username, action: isMember ? 'remove' : 'add' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Optimistic local update
      setGroups((prev) =>
        prev.map((g) => {
          if (g.name !== groupName) return g;
          const members = isMember
            ? g.members.filter((m) => m.username !== username)
            : [...(g.members || []), allUsers.find((u) => u.username === username) || { username }];
          return { ...g, members };
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setPending((p) => { const next = { ...p }; delete next[key]; return next; });
    }
  }

  async function addAllUsers(groupName, nonMembers) {
    if (!nonMembers.length) return;
    setError('');
    const headers = await getAuthHeaders();
    const results = await Promise.allSettled(
      nonMembers.map((u) => {
        const key = `${groupName}:${u.username}`;
        setPending((p) => ({ ...p, [key]: true }));
        return fetch('/api/music/admin/groups', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupName, username: u.username, action: 'add' }),
        }).finally(() => {
          setPending((p) => { const next = { ...p }; delete next[key]; return next; });
        });
      })
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) setError(`${failed.length} additions failed`);
    fetchData();
  }

  async function removeAllUsers(groupName, members) {
    if (!members.length) return;
    setError('');
    const headers = await getAuthHeaders();
    const results = await Promise.allSettled(
      members.map((m) => {
        const key = `${groupName}:${m.username}`;
        setPending((p) => ({ ...p, [key]: true }));
        return fetch('/api/music/admin/groups', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupName, username: m.username, action: 'remove' }),
        }).finally(() => {
          setPending((p) => { const next = { ...p }; delete next[key]; return next; });
        });
      })
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) setError(`${failed.length} removals failed`);
    fetchData();
  }

  if (loading) {
    return (
      <div className={Style.loadingWrap}>
        <div className={Style.spinner} />
        <p>Loading groups...</p>
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

      <div className={Style.inlineForm}>
        <input
          className={Style.input}
          placeholder="Group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={Style.input}
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <button className={Style.btn} onClick={createGroup}>Create</button>
      </div>

      <div className={Style.list}>
        {groups.map((g) => {
          const memberUsernames = new Set((g.members || []).map((m) => m.username));
          const memberCount = memberUsernames.size;
          const nonMembers = allUsers.filter((u) => !memberUsernames.has(u.username));

          return (
            <div key={g.name}>
              <div className={[Style.item, Style.published].join(' ')}>
                <div className={Style.itemInfo}>
                  <strong>{g.name}</strong>
                  {g.description && <span className={Style.trackId}>{g.description}</span>}
                  <span className={Style.formats}>
                    {memberCount}/{allUsers.length} users
                  </span>
                </div>
                <div className={Style.itemActions}>
                  <button className={Style.iconBtn} onClick={() => setExpanded(expanded === g.name ? null : g.name)}>
                    {expanded === g.name ? 'Collapse' : 'Members'}
                  </button>
                  <button className={Style.iconBtn + ' ' + Style.unpublishBtn} onClick={() => deleteGroup(g.name)}>
                    Delete
                  </button>
                </div>
              </div>

              {expanded === g.name && (
                <div className={Style.subList}>
                  {allUsers.length > 1 && (
                    <div className={Style.bulkActions}>
                      <button
                        className={Style.iconBtn}
                        onClick={() => addAllUsers(g.name, nonMembers)}
                        disabled={!nonMembers.length}
                      >
                        Add all
                      </button>
                      <button
                        className={Style.iconBtn}
                        onClick={() => removeAllUsers(g.name, g.members || [])}
                        disabled={!memberCount}
                      >
                        Remove all
                      </button>
                    </div>
                  )}
                  {allUsers.map((u) => {
                    const isMember = memberUsernames.has(u.username);
                    const key = `${g.name}:${u.username}`;
                    const isPending = !!pending[key];
                    return (
                      <label key={u.username} className={Style.memberCheckRow}>
                        <input
                          type="checkbox"
                          checked={isMember}
                          disabled={isPending}
                          onChange={() => toggleMember(g.name, u.username, isMember)}
                        />
                        <span className={isPending ? Style.pendingLabel : undefined}>
                          {u.email}
                        </span>
                        {u.status !== 'CONFIRMED' && (
                          <span className={Style.trackId}>{u.status}</span>
                        )}
                      </label>
                    );
                  })}
                  {allUsers.length === 0 && (
                    <p className={Style.emptyMsg}>No users yet. Invite some in the Users tab first.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className={Style.emptyMsg}>No groups yet. Create one above.</p>
        )}
      </div>
    </div>
  );
}
