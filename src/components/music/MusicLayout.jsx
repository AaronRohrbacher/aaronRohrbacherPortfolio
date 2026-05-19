'use client';

import React, { useEffect, useState } from 'react';
import Style from './MusicLayout.module.scss';
import MusicNav from './MusicNav';
import { AuthProvider } from './AuthContext';
import { MusicPlayerProvider } from './MusicPlayerContext';
import { MusicHrefProvider } from '@/lib/musicLinks';
import PlayerBar from './PlayerBar';
import { Box, Grid } from '@mui/material';
import { getCookie, setCookie } from 'cookies-next';

export default function MusicLayout({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [isMusicSubdomain, setIsMusicSubdomain] = useState(false);

  function handleToggleDarkMode() {
    const next = !darkMode;
    setCookie('darkMode', String(next), { maxAge: 60 * 60 * 24 * 365 });
    setDarkMode(next);
  }

  useEffect(() => {
    const host = window.location.hostname;
    setIsMusicSubdomain(host.startsWith('music.') || host.startsWith('music-'));

    const cookie = getCookie('darkMode');
    if (cookie === 'true') {
      setDarkMode(true);
    } else if (cookie === undefined) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode ? '#1f1f1f' : '#f8f8f8';
  }, [darkMode]);

  const themeClass = darkMode ? Style.dark : Style.light;

  return (
    <MusicHrefProvider isMusicSubdomain={isMusicSubdomain}>
    <AuthProvider>
      <MusicPlayerProvider>
        <Box suppressHydrationWarning className={themeClass} data-theme={darkMode ? 'dark' : 'light'} sx={{ width: '100%', overflowX: 'hidden' }}>
          <Grid container display="flex" flexDirection="column" justifyContent="space-between" sx={{ maxWidth: '100%', margin: 0, padding: 0, minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' } }}>
            <Grid>
              <MusicNav darkMode={darkMode} handleToggle={handleToggleDarkMode} />
            </Grid>
            <Grid flexGrow={1}>
              {children}
            </Grid>
            <Grid>
              <Box component="footer" display="flex" flexDirection="column" alignItems="center"
                py="1.5rem" sx={{ opacity: 0.7, paddingBottom: '5rem' }} width="100%">
                <p>&copy; 2025 Aaron Rohrbacher</p>
              </Box>
            </Grid>
          </Grid>
          <PlayerBar />
        </Box>
      </MusicPlayerProvider>
    </AuthProvider>
    </MusicHrefProvider>
  );
}
