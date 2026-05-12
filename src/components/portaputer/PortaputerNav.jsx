'use client';

import React, { useEffect, useState } from 'react';
import Style from './PortaputerNav.module.scss';
import Toggler from '../home/Toggler';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePortaputerHref } from '@/lib/portaputerLinks';

const LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Installation and Use', path: '/installation' },
  { label: 'Features', path: '/features' },
  { label: 'Requirements', path: '/requirements' },
  { label: 'Troubleshooting', path: '/troubleshooting' },
];

export default function PortaputerNav({ darkMode, handleToggle }) {
  const [scrolled, setScrolled] = useState(false);
  const portaputerHref = usePortaputerHref();
  const pathname = usePathname() || '';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function isActive(linkPath) {
    if (linkPath === '/') {
      return pathname === '/' || pathname === '/portaputer' || pathname === '/portaputer/';
    }
    const candidates = [linkPath, `/portaputer${linkPath}`];
    return candidates.some((c) => pathname === c || pathname.startsWith(`${c}/`));
  }

  return (
    <nav
      className={[
        Style.nav,
        darkMode ? Style.dark : Style.light,
        scrolled ? Style.scrolled : '',
      ].join(' ')}
    >
      <div className={Style.logoGroup}>
        <Link href={portaputerHref('/')} className={Style.logo}>
          <span className={Style.logoText}>ar</span>
          <span className={Style.logoDot} />
        </Link>
      </div>

      <ul className={Style.links}>
        {LINKS.map((link) => (
          <li key={link.path}>
            <Link
              href={portaputerHref(link.path)}
              className={[Style.link, isActive(link.path) ? Style.active : ''].join(' ')}
            >
              {link.label}
              <span className={Style.underline} />
            </Link>
          </li>
        ))}
      </ul>

      <div className={Style.toggle}>
        <Toggler darkMode={darkMode} handleClick={handleToggle} />
      </div>
    </nav>
  );
}
