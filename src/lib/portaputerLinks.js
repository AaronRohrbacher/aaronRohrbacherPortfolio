'use client';

import { createContext, createElement, useContext } from 'react';

const PortaputerHrefContext = createContext(false);

export function PortaputerHrefProvider({ isPortaputerSubdomain, children }) {
  return createElement(
    PortaputerHrefContext.Provider,
    { value: isPortaputerSubdomain },
    children,
  );
}

export function usePortaputerHref() {
  const isPortaputerSubdomain = useContext(PortaputerHrefContext);
  return (path = '/') => {
    if (isPortaputerSubdomain) return path;
    const normalized = path === '/' ? '' : path;
    return `/portaputer${normalized}`;
  };
}
