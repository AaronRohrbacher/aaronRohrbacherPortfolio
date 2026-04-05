'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

export default function EventsPanel({ getAuthHeaders }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('');
  const [error, setError] = useState('');

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
        <button className={Style.btn} onClick={fetchEvents} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <span style={{ fontSize: '0.8rem', opacity: 0.55 }}>{events.length} event{events.length === 1 ? '' : 's'}</span>
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
              <th style={cellTh}>When</th>
              <th style={cellTh}>Type</th>
              <th style={cellTh}>Actor</th>
              <th style={cellTh}>Target</th>
              <th style={cellTh}>IP</th>
              <th style={cellTh}>UA</th>
              <th style={cellTh}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid rgba(128,128,128,0.1)' }}>
                <td style={cellTd}>{new Date(e.timestamp).toLocaleString()}</td>
                <td style={cellTd}><code>{e.type}</code></td>
                <td style={cellTd}>{e.actor || '—'}</td>
                <td style={cellTd}>{e.targetId ? `${e.targetType}:${e.targetId}` : '—'}</td>
                <td style={cellTd}>{e.ip || '—'}</td>
                <td style={{ ...cellTd, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.userAgent || ''}>
                  {e.userAgent ? e.userAgent.slice(0, 40) : '—'}
                </td>
                <td style={cellTd}>{e.detail || '—'}</td>
              </tr>
            ))}
            {events.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: '1rem', textAlign: 'center', opacity: 0.5 }}>No events yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellTh = { textAlign: 'left', padding: '0.5rem 0.6rem', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.7 };
const cellTd = { padding: '0.45rem 0.6rem', verticalAlign: 'top' };
