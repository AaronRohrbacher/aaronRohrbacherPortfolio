import React from 'react';

// Rich-text helpers for user-typed fields (track name, artists, description, etc.)
//
// Supports two link forms, mixed freely with plain text:
//   1. Markdown-style: [label](https://example.com)
//   2. Bare URL:       https://example.com  (or  www.example.com)
//
// The admin editor has a "+ Link" button that inserts a markdown snippet at
// the cursor, so users never have to type the syntax by hand — but they can
// also just paste a URL and it'll auto-linkify on display.

function normalizeUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\./i.test(s)) return 'https://' + s;
  return s;
}

// Combined matcher: markdown link first so a URL inside (…) doesn't double-match.
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/g;

export function renderRichText(text) {
  if (text == null || text === '') return null;
  const str = String(text);
  const nodes = [];
  let lastIndex = 0;
  let key = 0;
  // Each regex needs its own lastIndex, so reset by recreating.
  const re = new RegExp(LINK_RE.source, 'g');
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > lastIndex) nodes.push(str.slice(lastIndex, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <a
          key={`l${key++}`}
          href={normalizeUrl(m[2])}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {m[1]}
        </a>
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <a
          key={`u${key++}`}
          href={normalizeUrl(m[3])}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {m[3]}
        </a>
      );
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < str.length) nodes.push(str.slice(lastIndex));
  return nodes;
}

// Prompt for a URL + label and insert `[label](url)` at the current cursor
// position of the given textarea/input. Caller passes the current value and
// an onChange handler to update controlled state.
export function promptInsertLink(textareaRef, value, onChange) {
  const raw = typeof window !== 'undefined' ? window.prompt('URL (https://…):') : '';
  if (!raw) return;
  const url = normalizeUrl(raw);
  const label = typeof window !== 'undefined' ? window.prompt('Link text (leave blank to show the URL):') : '';
  const safeLabel = label && label.trim() ? label.trim() : url;
  const snippet = `[${safeLabel}](${url})`;
  const el = textareaRef?.current;
  const current = value || '';
  if (!el) {
    onChange(current + (current ? ' ' : '') + snippet);
    return;
  }
  const start = typeof el.selectionStart === 'number' ? el.selectionStart : current.length;
  const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : current.length;
  const next = current.slice(0, start) + snippet + current.slice(end);
  onChange(next);
  // Restore focus + cursor just after the inserted snippet on the next tick,
  // once React has applied the new value.
  const caret = start + snippet.length;
  setTimeout(() => {
    try {
      el.focus();
      el.setSelectionRange(caret, caret);
    } catch {}
  }, 0);
}
