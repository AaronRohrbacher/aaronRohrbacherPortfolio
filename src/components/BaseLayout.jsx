'use client';

import React, { useEffect, useState } from 'react';
import Style from './BaseLayout.module.scss';
import Navbar from './Navbar';
import PageTransition from './PageTransition';
import { Box, Grid } from '@mui/material';
import { singlePage } from '@/info/Info';
import useScrollObserver from '@/hooks/useScrollObserver';
import { setCookie } from 'cookies-next';

export default function BaseLayout({ children, activePage, initialDark }) {
  const [active, setActive] = useState(activePage || 'home');
  const refHome = useScrollObserver(setActive);
  const refAbout = useScrollObserver(setActive);
  const refPortfolio = useScrollObserver(setActive);
  const [darkMode, setDarkMode] = useState(initialDark === true);

  function handleToggleDarkMode() {
    const next = !darkMode;
    setCookie('darkMode', String(next), { maxAge: 60 * 60 * 24 * 365 });
    setDarkMode(next);
  }

  useEffect(() => {
    // On first visit with no saved preference, respect system preference
    if (initialDark === null) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) setDarkMode(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <Grid container display={'flex'} flexDirection={'column'} minHeight={'100vh'} justifyContent={'space-between'} sx={{ maxWidth: '100%', margin: 0, padding: 0 }}>
        <Grid>
          <Navbar darkMode={darkMode} handleClick={handleToggleDarkMode} active={active} setActive={setActive} />
        </Grid>
        <Grid flexGrow={1}>
          <PageTransition>
            {singlePage ? (
              <Box mt={'3rem'}>
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
        </Grid>
        <Grid>
          <Box component={'footer'} display={'flex'} flexDirection={'column'} alignItems={'center'}
            py={'1.5rem'} sx={{ opacity: 0.7 }} width={'100%'}>
            <p>&copy; {new Date().getFullYear()} Aaron Rohrbacher</p>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
