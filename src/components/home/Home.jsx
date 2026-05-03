'use client';

import React from 'react';
import Style from './Home.module.scss';
import classNames from 'classnames';
import EmojiBullet from './EmojiBullet';
import SocialIcon from './SocialIcon';
import { Box } from '@mui/material';
import { info } from '@/info/Info';
import Slider from './Slider';

export default function Home({ innerRef }) {
  const openChatAgent = () => {
    window.dispatchEvent(new Event('open-chat-agent'));
  };

  return (
    <Box
      ref={innerRef}
      component="main"
      className={Style.hero}
    >
      {/* Avatar */}
      <Box
        className={classNames(Style.avatar, Style.shadowed)}
        style={{ background: info.gradient }}
      >
        <Slider />
      </Box>

      {/* Text content */}
      <div className={Style.content}>
        <h1>
          Hi, I'm{' '}
          <span style={{ background: info.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {info.firstName}
          </span>
          <span className={Style.hand}>🤚</span>
        </h1>
        <h2 className={Style.position}>{info.position}.</h2>

        <ul className={Style.bio}>
          {info.miniBio.map((bio, index) => (
            <EmojiBullet key={index} emoji={bio.emoji} text={bio.text} linkText={bio.linkText} link={bio.link} />
          ))}
        </ul>

        <div className={Style.actions}>
          <button onClick={openChatAgent}><strong>Let's Chat!</strong></button>
          <div className={Style.socials}>
            {info.socials.map((social, index) => (
              <SocialIcon key={index} link={social.link} icon={social.icon} label={social.label} />
            ))}
          </div>
        </div>
        <p className={Style.botTagline}>
          That opens <strong>A-A-Bot</strong> — an AI assistant I built and fine-tuned
          on my background. Unusually, it runs 100% on your own machine, right in your
          browser — no servers, no API calls, nothing leaves your device.
        </p>
      </div>
    </Box>
  );
}

Home.displayName = 'Home';
