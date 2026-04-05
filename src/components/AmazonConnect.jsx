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

    // Only inject the script once
    if (document.getElementById(instanceId)) return;

    const s = document.createElement('script');
    s.src = 'https://d2s9x5slbvr0vu.cloudfront.net/amazon-connect-chat-interface-client.js';
    s.async = true;
    s.id = instanceId;
    document.head.appendChild(s);
  }, []);

  return null;
}
