'use client';

import React from 'react';
import Style from './ContactPage.module.scss';

export default function ContactPage() {
  // AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
  // Opens the Amazon Connect chat via the programmaticLaunch callback
  // registered in AmazonConnect.jsx (window.__connectLaunch).
  const openChat = () => {
    if (typeof window.__connectLaunch === 'function') window.__connectLaunch();
  };
  // const openChat = () => {
  //   window.dispatchEvent(new CustomEvent('open-chat-agent'));
  // };

  return (
    <div className={Style.page}>
      <div className={Style.hero}>
        <h1 className={Style.title}>Let's talk.</h1>
        <p className={Style.sub}>
          My AI assistant can answer your questions, connect you by chat, voice, or video,
          take a message, or send you my contact details — all right from the chat.
        </p>
      </div>

      <button className={Style.actionBtn} onClick={openChat}>
        <i className="fa-solid fa-comments" /> Open Chat
      </button>

      <p className={Style.hint}>
        Or click the <i className="fa-solid fa-comments" /> button in the bottom-right corner from any page.
      </p>
    </div>
  );
}
