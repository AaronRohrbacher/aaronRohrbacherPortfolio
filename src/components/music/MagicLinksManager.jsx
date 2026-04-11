'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Style from './MusicAdmin.module.scss';

const KIND_LABEL = {
  login: 'Login',
  dump:  'Dump',
  track: 'Track',
};

function buildPublicUrl(link, origin) {
  if (link.kind === 'login') {
    return `${origin}/music/login/magic?token=${link.token}`;
  }
  if (link.kind === 'dump') {
    return `${origin}/music/dump/${encodeURIComponent(link.dumpId)}?share=${link.token}`;
  }
  if (link.kind === 'track') {
    return `${origin}/music/track/${encodeURIComponent(link.trackId)}?share=${link.token}`;
  }
  return '';
}

function targetLabel(link) {
  if (link.kind === 'login') return link.email || '(no email)';
  if (link.kind === 'dump')  return link.dumpId || '(no dump)';
  if (link.kind === 'track') return link.trackId || '(no track)';
  return '';
}

function statusOf(link) {
  if (link.active === false) return 'inactive';
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return 'expired';
  return 'active';
}

export default function MagicLinksManager({ getAuthHeaders }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [filter, setFilter] = useState('all'); // all | login | dump | track
  const [showInactive, setShowInactive] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/share-links', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load links');
      setLinks(data.links || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  async function copyLink(link) {
    try {
      const url = buildPublicUrl(link, window.location.origin);
      await navigator.clipboard.writeText(url);
      setCopiedToken(link.token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(link) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/share-links', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: link.kind, token: link.token, active: !link.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      await fetchLinks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteLink(link) {
    if (!confirm(`Delete this ${KIND_LABEL[link.kind]} magic link? This cannot be undone.`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/music/admin/share-links?kind=${link.kind}&token=${encodeURIComponent(link.token)}`,
        { method: 'DELETE', headers }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      await fetchLinks();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEdit(patch) {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/music/admin/share-links', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: editing.kind, token: editing.token, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setEditing(null);
      await fetchLinks();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = links.filter((l) => {
    if (filter !== 'all' && l.kind !== filter) return false;
    if (!showInactive && statusOf(l) !== 'active') return false;
    return true;
  });

  if (loading) {
    return (
      <div className={Style.loadingWrap}>
        <div className={Style.spinner} />
        <p>Loading magic links...</p>
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

      <div className={Style.inlineForm} style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <label style={{ fontSize: '0.85rem' }}>
          Type:&nbsp;
          <select
            className={Style.input}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 'auto', display: 'inline-block' }}
          >
            <option value="all">All</option>
            <option value="login">Login</option>
            <option value="dump">Dump</option>
            <option value="track">Track</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive / expired
        </label>
        <button className={Style.btnSecondary} onClick={fetchLinks}>
          <i className="fa-solid fa-arrows-rotate" /> Refresh
        </button>
      </div>

      <div className={Style.list} style={{ marginTop: '1rem' }}>
        {filtered.length === 0 && (
          <p className={Style.emptyMsg}>
            {links.length === 0
              ? 'No magic links yet. Create one from a user, dump, or track.'
              : 'No links match the current filter.'}
          </p>
        )}
        {filtered.map((link) => {
          const status = statusOf(link);
          const isCopied = copiedToken === link.token;
          return (
            <div
              key={`${link.kind}:${link.token}`}
              className={[Style.item, status === 'active' ? Style.published : Style.unpublished].join(' ')}
            >
              <div className={Style.statusDot} title={status} />
              <div className={Style.itemInfo}>
                <strong>
                  {KIND_LABEL[link.kind]}
                  {link.label ? ` — ${link.label}` : ''}
                </strong>
                <span className={Style.trackId}>{targetLabel(link)}</span>
                <span className={Style.formats}>
                  {status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : 'Inactive'}
                  {' · '}
                  {link.expiresAt
                    ? `expires ${new Date(link.expiresAt).toLocaleDateString()}`
                    : 'no expiry'}
                  {' · '}
                  created {new Date(link.createdAt).toLocaleDateString()}
                  {link.createdBy ? ` by ${link.createdBy}` : ''}
                </span>
              </div>
              <div className={Style.itemActions}>
                <button className={Style.iconBtn} onClick={() => copyLink(link)}>
                  {isCopied ? (
                    <><i className="fa-solid fa-check" /> Copied</>
                  ) : (
                    <><i className="fa-solid fa-link" /> Copy URL</>
                  )}
                </button>
                <button className={Style.iconBtn} onClick={() => setEditing(link)}>
                  Edit
                </button>
                <button className={Style.iconBtn} onClick={() => toggleActive(link)}>
                  {link.active === false ? 'Reactivate' : 'Deactivate'}
                </button>
                <button
                  className={Style.iconBtn + ' ' + Style.unpublishBtn}
                  onClick={() => deleteLink(link)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ShareLinkEditor
          link={editing}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ShareLinkEditor({ link, onSave, onCancel }) {
  const [label, setLabel] = useState(link.label || '');
  const [active, setActive] = useState(link.active !== false);
  const [expiryMode, setExpiryMode] = useState(link.expiresAt ? 'date' : 'never');
  const [expiresDate, setExpiresDate] = useState(
    link.expiresAt ? link.expiresAt.split('T')[0] : ''
  );

  function handleSave() {
    const patch = { label, active };
    if (expiryMode === 'never') {
      patch.expiresAt = null;
    } else if (expiresDate) {
      // End-of-day so the date the user picked is fully usable
      patch.expiresAt = new Date(`${expiresDate}T23:59:59`).toISOString();
    }
    onSave(patch);
  }

  return (
    <div className={Style.overlay}>
      <div className={Style.modal}>
        <h2>Edit {KIND_LABEL[link.kind]} Magic Link</h2>
        <div className={Style.formGrid}>
          <div className={Style.metaInfo}>
            <span>Kind: <code>{link.kind}</code></span>
            <span>Target: <code>{targetLabel(link)}</code></span>
            <span>Token: <code>{link.token.slice(0, 12)}…</code></span>
          </div>
          <label>
            Label
            <input
              className={Style.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. for grandma"
            />
          </label>
          <label>
            Expiry
            <select
              className={Style.input}
              value={expiryMode}
              onChange={(e) => setExpiryMode(e.target.value)}
            >
              <option value="never">Never expires</option>
              <option value="date">Expires on date…</option>
            </select>
          </label>
          {expiryMode === 'date' && (
            <label>
              Expires on
              <input
                className={Style.input}
                type="date"
                value={expiresDate}
                onChange={(e) => setExpiresDate(e.target.value)}
              />
            </label>
          )}
          <label className={Style.memberCheckRow}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Active (uncheck to deactivate without deleting)</span>
          </label>
        </div>
        <div className={Style.modalActions}>
          <button className={Style.btnSecondary} onClick={onCancel}>Cancel</button>
          <button className={Style.btn} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
