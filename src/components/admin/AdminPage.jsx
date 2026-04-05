'use client';

import React, { useState, useEffect } from 'react';
import { info } from '@/info/Info';
import Style from './AdminPage.module.scss';

const STORAGE_KEY = 'portfolio_items';
const MOCK_TYPES = ['laptop', 'browser', 'desktop-app', 'mobile'];

function blankProject() {
  return {
    id: Date.now(),
    title: '',
    desc: '',
    image: '',
    mobileImage: '',
    mockupType: 'browser',
    url: '',
    live: '',
    website: '',
    source: '',
  };
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (authed) {
      const stored = localStorage.getItem(STORAGE_KEY);
      setItems(stored ? JSON.parse(stored) : info.portfolio.map((p, i) => ({ ...p, id: i })));
    }
  }, [authed]);

  function login() {
    if (pw === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError('');
    } else {
      setPwError('Incorrect password.');
    }
  }

  function persist(next) {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function save(project) {
    const next = editing.isNew
      ? [...items, project]
      : items.map(i => i.id === project.id ? project : i);
    persist(next);
    setEditing(null);
  }

  function remove(id) {
    if (!confirm('Delete this project?')) return;
    persist(items.filter(i => i.id !== id));
  }

  function moveUp(index) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    persist(next);
  }

  function moveDown(index) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    persist(next);
  }

  function resetToDefaults() {
    if (!confirm('Reset to default portfolio items? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    setItems(info.portfolio.map((p, i) => ({ ...p, id: i })));
  }

  if (!authed) {
    return (
      <div className={Style.loginWrap}>
        <div className={Style.loginCard}>
          <h1>Admin</h1>
          <input
            type="password"
            placeholder="Password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            className={Style.input}
            autoFocus
          />
          {pwError && <p className={Style.error}>{pwError}</p>}
          <button className={Style.btn} onClick={login}>Enter</button>
        </div>
      </div>
    );
  }

  return (
    <div className={Style.wrap}>
      <div className={Style.header}>
        <h1>Portfolio Admin</h1>
        <div className={Style.headerActions}>
          {saved && <span className={Style.savedBadge}>Saved ✓</span>}
          <button className={Style.btnSecondary} onClick={resetToDefaults}>Reset to defaults</button>
          <button className={Style.btn} onClick={() => setEditing({ ...blankProject(), isNew: true })}>+ Add project</button>
        </div>
      </div>

      <div className={Style.list}>
        {items.map((project, index) => (
          <div key={project.id} className={Style.item}>
            {project.image && <img src={project.image} alt={project.title} className={Style.thumb} />}
            <div className={Style.itemInfo}>
              <strong>{project.title || '(untitled)'}</strong>
              <span>{project.desc?.slice(0, 80)}{project.desc?.length > 80 ? '…' : ''}</span>
            </div>
            <div className={Style.itemActions}>
              <button className={Style.iconBtn} onClick={() => moveUp(index)} title="Move up">↑</button>
              <button className={Style.iconBtn} onClick={() => moveDown(index)} title="Move down">↓</button>
              <button className={Style.iconBtn} onClick={() => setEditing({ ...project, isNew: false })}>Edit</button>
              <button className={[Style.iconBtn, Style.danger].join(' ')} onClick={() => remove(project.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing && <ProjectEditor project={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function ProjectEditor({ project, onSave, onCancel }) {
  const [form, setForm] = useState({ ...project });

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  return (
    <div className={Style.overlay}>
      <div className={Style.modal}>
        <h2>{project.isNew ? 'Add Project' : 'Edit Project'}</h2>
        <div className={Style.formGrid}>
          <label>Title
            <input className={Style.input} value={form.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label>Description
            <textarea className={Style.input} rows={3} value={form.desc} onChange={e => set('desc', e.target.value)} />
          </label>
          <label>Desktop image URL
            <input className={Style.input} value={form.image} onChange={e => set('image', e.target.value)} />
          </label>
          <label>Mobile image URL (optional)
            <input className={Style.input} value={form.mobileImage || ''} onChange={e => set('mobileImage', e.target.value)} />
          </label>
          <label>Mockup type
            <select className={Style.input} value={form.mockupType} onChange={e => set('mockupType', e.target.value)}>
              {MOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Address bar / URL label (browser mockup)
            <input className={Style.input} value={form.url || ''} onChange={e => set('url', e.target.value)} />
          </label>
          <label>Live demo link
            <input className={Style.input} value={form.live || ''} onChange={e => set('live', e.target.value)} />
          </label>
          <label>Website link
            <input className={Style.input} value={form.website || ''} onChange={e => set('website', e.target.value)} />
          </label>
          <label>Source code link
            <input className={Style.input} value={form.source || ''} onChange={e => set('source', e.target.value)} />
          </label>
        </div>
        <div className={Style.modalActions}>
          <button className={Style.btnSecondary} onClick={onCancel}>Cancel</button>
          <button className={Style.btn} onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}
