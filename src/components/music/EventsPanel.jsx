'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Style from './MusicAdmin.module.scss';

const TYPE_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Sign-ins', value: 'auth.sign_in' },
  { label: 'Failed sign-ins', value: 'auth.sign_in_fail' },
  { label: 'Sign-ups', value: 'auth.sign_up' },
  { label: 'Magic redeem', value: 'auth.magic_redeem' },
  { label: 'Streams', value: 'content.stream' },
  { label: 'Downloads', value: 'content.download' },
  { label: 'Share created', value: 'share.create' },
  { label: 'Share redeemed', value: 'share.redeem' },
];

// Column definitions — order matches the table headers.
const COLUMNS = [
  { key: 'timestamp', label: 'When' },
  { key: 'type', label: 'Type' },
  { key: 'actor', label: 'Actor' },
  { key: 'target', label: 'Target' },
  { key: 'ip', label: 'IP' },
  { key: 'userAgent', label: 'UA' },
  { key: 'detail', label: 'Detail' },
];

function targetStr(e) {
  return e.targetId ? `${e.targetType || ''}:${e.targetId}` : '';
}

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function EventsPanel({ getAuthHeaders }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // sort: { key: string, dir: 'asc' | 'desc' } or null
  const [sort, setSort] = useState(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const qs = type ? `?type=${encodeURIComponent(type)}&limit=200` : '?limit=200';
      const res = await fetch(`/api/music/admin/events${qs}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load events');
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, type]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Filter + sort pipeline. Memoized so CSV + render share the same view.
  const viewEvents = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = q
      ? events.filter((e) => {
          const whenStr = e.timestamp ? new Date(e.timestamp).toLocaleString() : '';
          const hay = [
            whenStr,
            e.type,
            e.actor,
            targetStr(e),
            e.ip,
            e.userAgent,
            e.detail,
          ]
            .map((v) => (v == null ? '' : String(v)))
            .join(' \u0000 ')
            .toLowerCase();
          return hay.includes(q);
        })
      : events.slice();

    if (sort) {
      const { key, dir } = sort;
      const mul = dir === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        let av;
        let bv;
        if (key === 'timestamp') {
          av = a.timestamp ? Date.parse(a.timestamp) : 0;
          bv = b.timestamp ? Date.parse(b.timestamp) : 0;
          if (Number.isNaN(av)) av = 0;
          if (Number.isNaN(bv)) bv = 0;
          return (av - bv) * mul;
        }
        if (key === 'target') {
          av = targetStr(a);
          bv = targetStr(b);
        } else {
          av = a[key] == null ? '' : String(a[key]);
          bv = b[key] == null ? '' : String(b[key]);
        }
        return av.localeCompare(bv) * mul;
      });
    }

    return filtered;
  }, [events, search, sort]);

  const toggleSort = useCallback((key) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // third click clears
    });
  }, []);

  const exportCsv = useCallback(() => {
    const headers = ['When', 'Type', 'Actor', 'TargetType', 'TargetId', 'IP', 'UserAgent', 'Detail'];
    const rows = viewEvents.map((e) => [
      e.timestamp ? new Date(e.timestamp).toLocaleString() : '',
      e.type || '',
      e.actor || '',
      e.targetType || '',
      e.targetId || '',
      e.ip || '',
      e.userAgent || '',
      e.detail || '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `events-${ymd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give the browser a tick before revoking — Safari can bail otherwise.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [viewEvents]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <select
          className={Style.input}
          style={{ width: 'auto', minWidth: '180px' }}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <input
          type="text"
          className={Style.input}
          style={{ width: 'auto', minWidth: '220px', flex: '1 1 220px', maxWidth: '360px' }}
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className={Style.btn} onClick={fetchEvents} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button
          className={Style.btn}
          onClick={exportCsv}
          disabled={viewEvents.length === 0}
          title="Download currently filtered + sorted events as CSV"
        >
          <i className="fa-solid fa-file-csv" style={{ marginRight: '0.35rem' }} />
          Export CSV
        </button>
        <span style={{ fontSize: '0.8rem', opacity: 0.55 }}>
          {viewEvents.length} of {events.length} event{events.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className={Style.errorBanner}>
          <p>{error}</p>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'rgba(128,128,128,0.08)', backdropFilter: 'blur(4px)' }}>
            <tr>
              {COLUMNS.map((col) => {
                const active = sort && sort.key === col.key;
                const indicator = active ? (sort.dir === 'asc' ? '↑' : '↓') : '';
                return (
                  <th
                    key={col.key}
                    style={cellTh}
                    className={Style.sortableTh}
                    onClick={() => toggleSort(col.key)}
                    title="Click to sort"
                  >
                    {col.label}
                    {active && <span className={Style.sortIndicator}>{indicator}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {viewEvents.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid rgba(128,128,128,0.1)' }}>
                <td style={cellTd}>{new Date(e.timestamp).toLocaleString()}</td>
                <td style={cellTd}><code>{e.type}</code></td>
                <td style={cellTd}>{e.actor || '—'}</td>
                <td style={cellTd}>{e.targetId ? `${e.targetType}:${e.targetId}` : '—'}</td>
                <td style={cellTd}>{e.ip || '—'}</td>
                <td style={{ ...cellTd, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.userAgent || ''}>
                  {e.userAgent ? e.userAgent.slice(0, 40) : '—'}
                </td>
                <td style={cellTd}>{e.detail ? (typeof e.detail === 'object' ? JSON.stringify(e.detail) : e.detail) : '—'}</td>
              </tr>
            ))}
            {viewEvents.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>
                {events.length === 0 ? 'No events yet' : 'No events match your search'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellTh = { textAlign: 'left', padding: '0.5rem 0.6rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.7 };
const cellTd = { padding: '0.45rem 0.6rem', verticalAlign: 'top' };
