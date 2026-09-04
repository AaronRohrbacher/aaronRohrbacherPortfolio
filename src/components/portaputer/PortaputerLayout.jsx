'use client';

import React, { useEffect, useState } from 'react';
import Style from './PortaputerLayout.module.scss';
import PortaputerNav from './PortaputerNav';
import { Box } from '@mui/material';
import { getCookie, setCookie } from 'cookies-next';
import { PortaputerHrefProvider } from '@/lib/portaputerLinks';

export default function PortaputerLayout({ children }) {
  const [darkMode, setDarkMode] = useState(false);
  const [isPortaputerSubdomain, setIsPortaputerSubdomain] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setIsPortaputerSubdomain(host.startsWith('portaputer.') || host.startsWith('portaputer-'));

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

  function handleToggle() {
    const next = !darkMode;
    setCookie('darkMode', String(next), { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    setDarkMode(next);
  }

  const themeClass = darkMode ? Style.dark : Style.light;

  return (
    <PortaputerHrefProvider isPortaputerSubdomain={isPortaputerSubdomain}>
      <Box
        suppressHydrationWarning
        className={themeClass}
        data-theme={darkMode ? 'dark' : 'light'}
        sx={{ width: '100%', overflowX: 'hidden' }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            maxWidth: '100%',
            margin: 0,
            padding: 0,
            minHeight: '100vh',
            '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
          }}
        >
          <Box>
            <PortaputerNav darkMode={darkMode} handleToggle={handleToggle} />
          </Box>
          <Box sx={{ flexGrow: 1 }}>{children}</Box>
          <Box>
            <Box
              component="footer"
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: '1.5rem', opacity: 0.7, width: '100%' }}
            >
              <p>&copy; {new Date().getFullYear()} Aaron Rohrbacher</p>
            </Box>
          </Box>
        </Box>
      </Box>
    </PortaputerHrefProvider>
  );
}
