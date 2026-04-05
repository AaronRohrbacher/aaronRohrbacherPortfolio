'use client';

import React, { useEffect, useState } from 'react';
import Style from './Navbar.module.scss';
import Toggler from './home/Toggler';
import SectionToggle from './SectionToggle';
import Link from 'next/link';
import { info } from '@/info/Info';

const navLinks = [
  { name: 'Home',      to: '/',          active: 'home' },
  { name: 'About',     to: '/about',     active: 'about' },
  { name: 'Portfolio', to: '/portfolio', active: 'portfolio' },
  { name: 'Resume',    to: '/resume',    active: 'resume' },
  { name: 'Contact',   to: '/contact',   active: 'contact' },
];

export default function Navbar({ darkMode, handleClick, active, setActive }) {
  const [scrolled, setScrolled] = useState(false);

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
        <Link href="/" className={Style.logo} onClick={() => setActive('home')}>
          <span className={Style.logoText}>{info.initials}</span>
          <span className={Style.logoDot} />
        </Link>
        <SectionToggle active="software" />
      </div>

      {/* Links */}
      <ul className={Style.links}>
        {navLinks.map((link) => (
          <li key={link.active} className={active === link.active ? Style.activeItem : ''}>
            <Link
              href={link.to}
              className={Style.link}
              onClick={() => setActive(link.active)}
            >
              {link.name}
              <span className={Style.underline} />
            </Link>
          </li>
        ))}
      </ul>

      {/* Toggle */}
      <div className={Style.toggle}>
        <Toggler darkMode={darkMode} handleClick={handleClick} />
      </div>
    </nav>
  );
}
