'use client';

import React, { useState, useEffect } from 'react';
import Style from './SectionToggle.module.scss';

export default function SectionToggle({ active = 'software' }) {
  const isMusic = active === 'music';
  const otherLabel = isMusic ? 'software' : 'music';
  const otherIcon = isMusic ? 'fa-solid fa-code' : 'fa-solid fa-music';

  const [otherHref, setOtherHref] = useState(isMusic ? 'http://localhost:3000' : 'http://music.localhost:3000');

  useEffect(() => {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
    if (isLocal) {
      const port = window.location.port ? `:${window.location.port}` : '';
      setOtherHref(isMusic ? `http://localhost${port}` : `http://music.localhost${port}`);
    } else {
      setOtherHref(isMusic
        ? 'https://aaronrohrbacher.com'
        : 'https://music.aaronrohrbacher.com');
    }
  }, [isMusic]);

  return (
    <div className={Style.wrap}>
      <span className={Style.current}>
        {isMusic ? 'music' : 'software'}
      </span>
      <a href={otherHref} className={Style.switchLink} title={`Switch to ${otherLabel}`}>
        <i className={otherIcon} />
        <span>{otherLabel}</span>
      </a>
    </div>
  );
}
