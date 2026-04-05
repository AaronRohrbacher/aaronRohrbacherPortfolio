'use client';

import React from 'react';
import Link from 'next/link';
import Style from './SectionToggle.module.scss';

export default function SectionToggle({ active = 'software' }) {
  const isMusic = active === 'music';
  const otherHref = isMusic ? '/' : '/music';
  const otherLabel = isMusic ? 'software' : 'music';
  const otherIcon = isMusic ? 'fa-solid fa-code' : 'fa-solid fa-music';

  return (
    <div className={Style.wrap}>
      <span className={Style.current}>
        {isMusic ? 'music' : 'software'}
      </span>
      <Link href={otherHref} className={Style.switchLink} title={`Switch to ${otherLabel}`}>
        <i className={otherIcon} />
        <span>{otherLabel}</span>
      </Link>
    </div>
  );
}
