'use client';

import { createElement } from 'react';

export function MusicHrefProvider({ isMusicSubdomain, children }) {
  void isMusicSubdomain;
  return createElement('div', { style: { display: 'contents' } }, children);
}

export function useMusicHref() {
  return (path = '/') => path;
}
