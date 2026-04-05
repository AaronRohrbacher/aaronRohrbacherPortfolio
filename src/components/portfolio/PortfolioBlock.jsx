'use client';

import React from 'react';
import DeviceMockup from '@/components/DeviceMockup';
import Style from './PortfolioBlock.module.scss';

/**
 * PortfolioBlock
 *
 * project shape:
 *   title       {string}
 *   desc        {string}
 *   image       {string}           – desktop screenshot
 *   mobileImage {string?}          – if provided, renders a phone mockup alongside
 *   mockupType  {'browser'|'desktop-app'}  – defaults to 'browser'
 *   url         {string?}          – address bar text
 *   live        {string?}          – live demo link
 *   website     {string?}          – marketing/product site link
 *   source      {string?}          – github/source link
 */
export default function PortfolioBlock({ project }) {
  const {
    title, desc,
    image, mobileImage,
    mockupType = 'laptop',
    url,
    live, website, source,
  } = project;

  return (
    <div className={Style.block}>
      {/* Mockup(s) */}
      <div className={Style.mockups}>
        {image && (
          <div className={Style.desktopMockup}>
            <DeviceMockup image={image} alt={title} type={mockupType} url={url} />
          </div>
        )}
        {mobileImage && (
          <div className={Style.mobileMockup}>
            <DeviceMockup image={mobileImage} alt={title} type="mobile" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className={Style.info}>
        <h2 className={Style.title}>{title}</h2>
        <p className={Style.desc}>{desc}</p>

        {/* Links */}
        <div className={Style.links}>
          {live && (
            <a href={live} target="_blank" rel="noopener noreferrer" className={Style.link}>
              <i className="fa-solid fa-arrow-up-right-from-square" />
              Live Demo
            </a>
          )}
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className={Style.link}>
              <i className="fa-solid fa-globe" />
              Website
            </a>
          )}
          {source && (
            <a href={source} target="_blank" rel="noopener noreferrer" className={[Style.link, Style.linkOutline].join(' ')}>
              <i className="fa-brands fa-github" />
              Source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
