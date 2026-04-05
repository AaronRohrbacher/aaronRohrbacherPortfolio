'use client';

// AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
// Original loader preserved below. Restored by deleting this no-op export
// and uncommenting the block.

export default function ChatAgentLoader() {
  return null;
}

/* ORIGINAL IMPLEMENTATION — PRESERVED
import dynamic from 'next/dynamic';

const ChatAgent = dynamic(() => import('./ChatAgent'), { ssr: false });

export default function ChatAgentLoader() {
  return <ChatAgent />;
}
*/
