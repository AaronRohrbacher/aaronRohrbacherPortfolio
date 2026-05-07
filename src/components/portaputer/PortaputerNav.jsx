'use client';

import React, { useEffect, useState } from 'react';
import Style from './PortaputerNav.module.scss';
import Toggler from '../home/Toggler';
import Link from 'next/link';

export default function PortaputerNav({ darkMode, handleToggle }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={[
        Style.nav,
        darkMode ? Style.dark : Style.light,
        scrolled ? Style.scrolled : '',
      ].join(' ')}
    >
      <div className={Style.logoGroup}>
        <Link href="/" className={Style.logo}>
          <span className={Style.logoText}>ar</span>
          <span className={Style.logoDot} />
        </Link>
      </div>

      <ul className={Style.links}>
        <li>
          <a href="#features" className={Style.link}>
            Features
            <span className={Style.underline} />
          </a>
        </li>
        <li>
          <a href="#how-it-works" className={Style.link}>
            How It Works
            <span className={Style.underline} />
          </a>
        </li>
        <li>
          <a href="#requirements" className={Style.link}>
            Requirements
            <span className={Style.underline} />
          </a>
        </li>
      </ul>

      <div className={Style.toggle}>
        <Toggler darkMode={darkMode} handleClick={handleToggle} />
      </div>
    </nav>
  );
}
