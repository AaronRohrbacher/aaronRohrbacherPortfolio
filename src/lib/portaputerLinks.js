'use client';

import { createElement } from 'react';

export function PortaputerHrefProvider({ isPortaputerSubdomain, children }) {
  void isPortaputerSubdomain;
  return createElement('div', { style: { display: 'contents' } }, children);
}

export function usePortaputerHref() {
  return (path = '/') => path;
}
