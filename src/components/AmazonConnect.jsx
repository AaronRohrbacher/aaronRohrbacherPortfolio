'use client';

import { useEffect } from 'react';

export default function AmazonConnect() {
  useEffect(() => {
    const instanceId = process.env.NEXT_PUBLIC_CONNECT_INSTANCE_ID;
    const snippetId = process.env.NEXT_PUBLIC_CONNECT_SNIPPET_ID;

    if (!instanceId || !snippetId) return;

    // Must define the queue function before the script loads so calls
    // made in onload (and by the script itself) are captured correctly.
    window.amazon_connect = window.amazon_connect || function () {
      (window.amazon_connect.ac = window.amazon_connect.ac || []).push(arguments);
    };

    const accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-2').trim() || '#8D53FF';

    window.amazon_connect('styles', {
      iconType: 'CHAT_VOICE',
      openChat:  { color: '#ffffff', backgroundColor: accentColor },
      closeChat: { color: '#ffffff', backgroundColor: accentColor },
    });
    window.amazon_connect('snippetId', snippetId);
    window.amazon_connect('supportedMessagingContentTypes', [
      'text/plain',
      'text/markdown',
      'application/vnd.amazonaws.connect.message.interactive',
      'application/vnd.amazonaws.connect.message.interactive.response',
    ]);

    // Store the launch callback globally so ChatAgent can trigger it programmatically
    window.amazon_connect('customLaunchBehavior', {
      skipIconButtonAndAutoLaunch: false,
      alwaysHideWidgetButton: false,
      programmaticLaunch: function (launchCallback) {
        window.__connectLaunch = launchCallback;
      },
    });

    // Only inject the script once (but keep priming + icon swap running below
    // regardless, since React strict mode re-runs effects and the second
    // mount must still force AC's button to render).
    if (!document.getElementById(instanceId)) {
      const s = document.createElement('script');
      s.src = 'https://d2s9x5slbvr0vu.cloudfront.net/amazon-connect-chat-interface-client.js';
      s.async = true;
      s.id = instanceId;
      document.head.appendChild(s);
    }

    // AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
    // programmaticLaunch gates AC's widget button render until __connectLaunch
    // fires ONCE. Every subsequent call toggles/opens the chat, so we must
    // call it exactly once per page load — window.__acPrimed guards against
    // React strict-mode double invocation and SPA navigation re-mounts.
    const prime = setInterval(() => {
      if (window.__acPrimed) { clearInterval(prime); return; }
      if (document.getElementById('amazon-connect-open-widget-button')) {
        window.__acPrimed = true;
        clearInterval(prime);
        return;
      }
      if (typeof window.__connectLaunch === 'function') {
        window.__acPrimed = true;
        window.__connectLaunch();
        clearInterval(prime);
      }
    }, 100);
    const primeTimeout = setTimeout(() => clearInterval(prime), 30000);

    // Replace AC's built-in icons (phone / chat-bubble / arrow — switched by
    // AC across open/notify/close states) with a single consistent headset
    // icon. Reads as "talk to a human" and covers chat, voice, and video.
    // We re-swap whenever AC re-renders the SVG, not just once.
    const HEADSET_SVG =
      '<svg data-ac-custom="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<title>Open Chat</title>' +
        '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/>' +
        '<path d="M4 14h3v5H5a1 1 0 0 1-1-1v-4z" fill="#fff"/>' +
        '<path d="M20 14h-3v5h2a1 1 0 0 0 1-1v-4z" fill="#fff"/>' +
        '<path d="M17 19v1a3 3 0 0 1-3 3h-2"/>' +
      '</svg>';
    const swapIcon = () => {
      const btn = document.getElementById('amazon-connect-open-widget-button');
      if (!btn) return;
      // Remove EVERY non-custom icon (AC re-renders multiple SVGs/imgs across
      // open/notify/close states — headset + arrow, phone, etc.). Leave only
      // our headset. Images (phone) and stray SVGs both go.
      const foreign = btn.querySelectorAll('svg:not([data-ac-custom="1"]), img');
      foreign.forEach((el) => el.remove());
      // Ensure our headset exists exactly once.
      if (!btn.querySelector('svg[data-ac-custom="1"]')) {
        btn.insertAdjacentHTML('afterbegin', HEADSET_SVG);
      }
    };
    const iconObserver = new MutationObserver(swapIcon);
    iconObserver.observe(document.body, { childList: true, subtree: true });
    swapIcon();

    return () => {
      clearInterval(prime);
      clearTimeout(primeTimeout);
      iconObserver.disconnect();
    };
  }, []);

  return null;
}
