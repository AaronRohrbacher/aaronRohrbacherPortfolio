'use client';

import React, { useRef, useState, useEffect } from 'react';
import { PhoneMockup } from '@codinix/device-mockup';
import Style from './DeviceMockup.module.scss';

// Scales a fixed-dimension child to fill its container width.
function ScaledFrame({ nativeWidth, nativeHeight, children }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setScale(w / nativeWidth);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [nativeWidth]);

  const ready = scale !== null;

  return (
    <div ref={wrapRef} style={{ width: '100%', height: ready ? `${nativeHeight * scale}px` : 0, position: 'relative', overflow: 'visible', opacity: ready ? 1 : 0, transition: 'opacity 400ms ease' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: nativeWidth, transformOrigin: 'top left', transform: `scale(${scale ?? 1})` }}>
        {children}
      </div>
    </div>
  );
}

// Mirrors @codinix LaptopMockup exactly but serves keyboard from /public/
function LaptopFrame({ children }) {
  return (
    <div className="flex flex-col items-center gap-0">
      <div className="border-[3px] border-[#b2b0af] rounded-[16px] border-b-0">
        <div className="relative w-[700px] h-[420px] rounded-[12px] shadow-[0_30px_60px_rgba(0,0,0,0.3)] border-[15px] border-t-[24px] border-black bg-black overflow-hidden">
          <div className="w-full h-full bg-white">
            {children}
          </div>
        </div>
      </div>
      <img
        src="/mac-keyboard.png"
        alt=""
        className="w-[870px] mt-[-4px] select-none pointer-events-none touch-none"
      />
    </div>
  );
}

// Phone using @codinix/device-mockup's PhoneMockup — same library as the laptop,
// so shadow and styling match exactly. Native render size is 326×646px (320×640 screen + 3px border).
function PhoneFrame({ image, alt }) {
  const imgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
  return (
    <ScaledFrame nativeWidth={326} nativeHeight={646}>
      <PhoneMockup>
        <img src={image} alt={alt} style={imgStyle} />
      </PhoneMockup>
    </ScaledFrame>
  );
}

export default function DeviceMockup({ image, alt = 'screenshot', type = 'laptop', url = '' }) {
  const imgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

  if (type === 'laptop') {
    return (
      <ScaledFrame nativeWidth={870} nativeHeight={520}>
        <LaptopFrame>
          <img src={image} alt={alt} style={imgStyle} />
        </LaptopFrame>
      </ScaledFrame>
    );
  }

  if (type === 'mobile') {
    return <PhoneFrame image={image} alt={alt} />;
  }

  if (type === 'browser') {
    return (
      <div className={Style.browser}>
        <div className={Style.browserBar}>
          <span className={[Style.dot, Style.dotRed].join(' ')} />
          <span className={[Style.dot, Style.dotYellow].join(' ')} />
          <span className={[Style.dot, Style.dotGreen].join(' ')} />
          <div className={Style.addressBar}>
            <i className="fa-solid fa-lock" style={{ fontSize: '0.55rem', opacity: 0.4 }} />
            <span className={Style.url}>{url || alt}</span>
          </div>
        </div>
        <div className={Style.browserContent}>
          <img src={image} alt={alt} style={imgStyle} />
        </div>
      </div>
    );
  }

  return (
    <div className={Style.desktopApp}>
      <div className={Style.titleBar}>
        <span className={[Style.dot, Style.dotRed].join(' ')} />
        <span className={[Style.dot, Style.dotYellow].join(' ')} />
        <span className={[Style.dot, Style.dotGreen].join(' ')} />
        <span className={Style.appTitle}>{alt}</span>
      </div>
      <div className={Style.appContent}>
        <img src={image} alt={alt} style={imgStyle} />
      </div>
    </div>
  );
}
