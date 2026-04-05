# AI Agent — Commented Out

Branch: `comment-out-ai`

The in-browser AI chat widget (Transformers.js / Qwen ONNX) is disabled. Amazon
Connect is now the chat. All AI code is preserved (commented, not deleted).
API routes (`/api/ask`, `/api/resume-ai`, `/api/chat-agent`, `/api/chat-log`)
are **untouched and still live**.

## Changes

### Mount point removed
- **`src/app/layout.jsx`** — `<ChatAgentLoader />` mount + its import commented out.

### Amazon Connect config reverted
- **`src/components/AmazonConnect.jsx`** — `customLaunchBehavior` call commented
  out. It had been added only to let ChatAgent open Connect programmatically
  via `window.__connectLaunch`. With that config active the AC widget button
  is hidden on page load, which contradicts the original pre-AI UX. With it
  removed, the AC button is visible immediately (old behavior).

### AI widget files neutralized (code preserved)
- **`src/components/ChatAgentLoader.jsx`** — now `return null;`. Original code
  preserved in trailing block comment.
- **`src/components/ChatAgent.jsx`** — header comment added. File is no longer
  imported, so its code never runs.
- **`src/workers/ai.worker.js`** — header comment added. Worker is only loaded
  by `ChatAgent.jsx`, which is no longer mounted.

### Chat triggers re-pointed at Amazon Connect
Each site that used to dispatch `open-chat-agent` now clicks the Amazon Connect
widget button directly (matches the pre-AI committed pattern from Home.jsx).
The original `window.dispatchEvent(...)` line is preserved as a commented-out
alternative directly beneath the replacement.

- **`src/components/home/Home.jsx`** — `openChatAgent` (the "Let's Chat!" button)
- **`src/components/resume/Resume.jsx`** — `openChat` (the "Open AI Chat" panel)
- **`src/components/contact/ContactPage.jsx`** — `openChat` (the "Open Chat" button)

All three now call:
```js
document.querySelector('#amazon-connect-open-widget-button')?.click();
```

## Known cosmetic mismatches (not fixed — scope was "swap the trigger")

- **Resume page** still shows an "Open AI Chat" button and a Transformers.js
  disclaimer. Button now opens Amazon Connect.
- **Contact page** still has copy about "My AI assistant can answer your
  questions...". Button now opens Amazon Connect.

Fix later if desired.

## Existing Playwright tests that will now fail

These spec files were written against the live AI widget and will fail while
it is commented out. Leave them or skip them — not touched here:

- `tests/chat-agent.spec.mjs`
- `tests/chat-logging.spec.mjs`
- `tests/off-topic-aaron.spec.mjs`
- `tests/streaming.spec.mjs`

New tests verifying the commented-out state live in
`tests/ai-commented-out.spec.mjs` (passing).

## How to re-enable the AI agent

1. `src/app/layout.jsx` — uncomment the `ChatAgentLoader` import and mount.
2. `src/components/ChatAgentLoader.jsx` — delete the no-op export, uncomment
   the block at the bottom (or just revert the file).
3. `src/components/ChatAgent.jsx` and `src/workers/ai.worker.js` — remove the
   header disable-note comments (optional; cosmetic).
4. Trigger sites — swap each `openChat*` back to the dispatch line (both
   versions are in each file, just toggle which is commented).

## Grep

```bash
grep -rn "AI_COMMENTED_OUT" src/ AI_COMMENTED_OUT.md
```
