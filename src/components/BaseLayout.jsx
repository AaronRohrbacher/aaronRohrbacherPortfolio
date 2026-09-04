'use client';

import React, { useEffect, useState } from 'react';
import Style from './BaseLayout.module.scss';
import Navbar from './Navbar';
import PageTransition from './PageTransition';
import { Box } from '@mui/material';
import { singlePage } from '@/info/Info';
import useScrollObserver from '@/hooks/useScrollObserver';
import { getCookie, setCookie } from 'cookies-next';

export default function BaseLayout({ children, activePage }) {
  const [active, setActive] = useState(activePage || 'home');
  const refHome = useScrollObserver(setActive);
  const refAbout = useScrollObserver(setActive);
  const refPortfolio = useScrollObserver(setActive);
  const [darkMode, setDarkMode] = useState(false);

  function handleToggleDarkMode() {
    const next = !darkMode;
    setCookie('darkMode', String(next), { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    setDarkMode(next);
  }

  useEffect(() => {
    const cookie = getCookie('darkMode');
    if (cookie === 'true') {
      setDarkMode(true);
    } else if (cookie === undefined) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    // Keep html background in sync so no white flash behind the layout
    document.documentElement.style.backgroundColor = darkMode ? '#1f1f1f' : '#f8f8f8';
    // Expose theme so global styles (e.g. native <select> options) can
    // adapt — CSS-module classes like .dark are hashed and can't be
    // targeted from globals.scss.
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const themeClass = darkMode ? Style.dark : Style.light;

  return (
    <Box suppressHydrationWarning className={themeClass} sx={{ width: '100%', overflowX: 'hidden', maxWidth: '100vw' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'space-between', maxWidth: '100%', margin: 0, padding: 0 }}>
        <Box>
          <Navbar darkMode={darkMode} handleClick={handleToggleDarkMode} active={active} setActive={setActive} />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <PageTransition>
            {singlePage ? (
              <Box sx={{ mt: '3rem' }}>
                {React.Children.map(children, (child) =>
                  React.cloneElement(child, {
                    innerRef: child.type.displayName === 'Home' ? refHome
                      : child.type.displayName === 'About' ? refAbout
                      : child.type.displayName === 'Portfolio' ? refPortfolio
                      : undefined,
                  })
                )}
              </Box>
            ) : (
              children
            )}
          </PageTransition>
        </Box>
        <Box>
          <Box component={'footer'} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: '1.5rem', opacity: 0.7, width: '100%' }}>
            <p>&copy; {new Date().getFullYear()} Aaron Rohrbacher</p>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
