'use client';

import { createContext, createElement, useContext } from 'react';

const MusicHrefContext = createContext(false);

export function MusicHrefProvider({ isMusicSubdomain, children }) {
  return createElement(MusicHrefContext.Provider, { value: isMusicSubdomain }, children);
}

export function useMusicHref() {
  const isMusicSubdomain = useContext(MusicHrefContext);
  return (path = '/') => {
    if (isMusicSubdomain) return path;
    const normalized = path === '/' ? '' : path;
    return `/music${normalized}`;
  };
}
