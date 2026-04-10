'use client';

import React, { useEffect, useState } from 'react';
import Style from './MusicNav.module.scss';
import Toggler from '../home/Toggler';
import SectionToggle from '../SectionToggle';
import Link from 'next/link';
import { useAuth } from './AuthContext';
import { useMusicHref } from '@/lib/musicLinks';

const navLinks = [
  { name: 'Music',   href: '/',       key: 'music' },
];

export default function MusicNav({ darkMode, handleToggle }) {
  const { user, loading, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const musicHref = useMusicHref();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={[
      Style.nav,
      darkMode ? Style.dark : Style.light,
      scrolled ? Style.scrolled : '',
    ].join(' ')}>
      {/* Logo + Section Toggle */}
      <div className={Style.logoGroup}>
        <Link href={musicHref('/')} className={Style.logo}>
          <span className={Style.logoText}>ar</span>
          <span className={Style.logoDot} />
        </Link>
        <SectionToggle active="music" />
      </div>

      {/* Links */}
      <ul className={Style.links}>
        {navLinks.map((link) => (
          <li key={link.key}>
            <Link href={musicHref(link.href)} className={Style.link}>
              {link.name}
              <span className={Style.underline} />
            </Link>
          </li>
        ))}
        {!loading && user?.isAdmin && (
          <li>
            <Link href={musicHref('/admin')} className={Style.link}>
              Admin
              <span className={Style.underline} />
            </Link>
          </li>
        )}
        {!loading && (
          <li>
            {user ? (
              <button onClick={signOut} className={Style.authBtn}>
                Sign Out
              </button>
            ) : (
              <Link href={musicHref('/login')} className={Style.link}>
                Sign In
                <span className={Style.underline} />
              </Link>
            )}
          </li>
        )}
      </ul>

      {/* Toggle */}
      <div className={Style.toggle}>
        <Toggler darkMode={darkMode} handleClick={handleToggle} />
      </div>
    </nav>
  );
}
