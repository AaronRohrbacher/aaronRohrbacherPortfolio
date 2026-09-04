'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Style from './MusicAdmin.module.scss';

export default function UserManager({ getAuthHeaders }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(null); // email of user whose link was just copied
  const [magicDestination, setMagicDestination] = useState('/');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', { headers });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function inviteUser() {
    if (!email.trim()) return;
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), autoConfirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmail('');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(username) {
    if (!confirm(`Delete user ${username}?`)) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/admin/users?username=${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers,
      });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function generateMagicLink(userEmail) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/magic-links', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, destination: magicDestination || '/' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const origin = window.location.origin;
      const url = `${origin}/login/magic?token=${data.link.token}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(userEmail);
      setTimeout(() => setLinkCopied(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className={Style.loadingWrap}>
        <div className={Style.spinner} />
        <p>Loading users...</p>
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
          type="email"
          placeholder="Invite by email..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && inviteUser()}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={autoConfirm}
            onChange={(e) => setAutoConfirm(e.target.checked)}
          />
          Auto-confirm (no email)
        </label>
        <button className={Style.btn} onClick={inviteUser}>Invite</button>
      </div>

      <div className={Style.inlineForm}>
        <label style={{ flex: '1 1 260px', fontSize: '0.82rem' }}>
          Magic-link destination
          <input
            className={Style.input}
            value={magicDestination}
            onChange={(event) => setMagicDestination(event.target.value)}
            placeholder="/track/id, /dump/slug, or /"
            inputMode="url"
          />
        </label>
        <span className={Style.formats}>Login links expire in 7 days and work once.</span>
      </div>

      <div className={Style.list}>
        {users.map((u) => (
          <div key={u.username} className={[Style.item, Style.published].join(' ')}>
            <div className={Style.itemInfo}>
              <strong>{u.email}</strong>
              <span className={Style.trackId}>{u.status}</span>
              {u.groups?.length > 0 && (
                <span className={Style.formats}>
                  Groups: {u.groups.join(', ')}
                </span>
              )}
            </div>
            <div className={Style.itemActions}>
              <button className={Style.iconBtn} onClick={() => generateMagicLink(u.email)}>
                {linkCopied === u.email ? (
                  <><i className="fa-solid fa-check" /> Copied!</>
                ) : (
                  <><i className="fa-solid fa-link" /> Magic Link</>
                )}
              </button>
              <button className={Style.iconBtn + ' ' + Style.unpublishBtn} onClick={() => deleteUser(u.username)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <p className={Style.emptyMsg}>No users yet. Invite someone above.</p>
        )}
      </div>
    </div>
  );
}
