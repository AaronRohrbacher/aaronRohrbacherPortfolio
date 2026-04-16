# A-A-Bot (AI chat) — Re-enabled

Status: **LIVE**. The in-browser Transformers.js chat (A-A-Bot) is mounted
again on every page. This file is preserved only as a historical record of
the temporary revert and how the re-enablement was wired up.

## Current state

- `src/app/layout.jsx` mounts `<ChatAgentLoader />` alongside the Amazon
  Connect snippet. Both coexist: A-A-Bot is the only *visible* chat UI; the
  AC widget button is CSS-hidden but still click-invokable programmatically
  from A-A-Bot when the user wants live chat / voice / video.
- `src/components/ChatAgent.jsx` — the orchestrator. Pure logic extracted
  to `src/lib/chatAgent.mjs` and unit-tested under
  `tests/unit/chatAgent.test.mjs`.
- `src/workers/ai.worker.js` — loads the fine-tuned Qwen2 model from
  `public/models/aaron-chat/onnx/model_quantized.onnx` via Transformers.js
  (`dtype: 'q8'`, `device: 'webgpu' || 'wasm'`). All cookie-cutter
  validation, rhyming-redirect engines, and KB regex shortcuts were
  stripped — we trust the fine-tuned model end-to-end.
- `public/amazonConnect.js` — **do not modify**. This is the AC widget
  snippet from AWS; A-A-Bot only interacts with the widget via the public
  API (clicking `#amazon-connect-open-widget-button`).

## Ways A-A-Bot hands off to the Amazon Connect widget

| Intent                   | A-A-Bot does                                                   |
|--------------------------|----------------------------------------------------------------|
| Live chat / Voice / Video| Clicks the hidden `#amazon-connect-open-widget-button`         |
| Leave a message          | Collecting flow → POST `/api/chat-agent` (Resend email)        |
| Request contact info     | Collecting flow → POST `/api/chat-agent` (Resend email)        |
| Anything else            | Sends to the worker model with system prompt + FACT_CHUNKS     |

Online/offline is gated via `/api/connect-status` (queried once on A-A-Bot
open). If AC is offline, Live chat / Voice / Video buttons are hidden;
Leave-a-message + Request-contact-info stay available because they
email Aaron directly and do not depend on AC.

## Tests

- Unit tests: `tests/unit/chatAgent.test.mjs` (67 tests, <100 ms)
- Playwright wiring smoke: `tests/ai-commented-out.spec.mjs`
- Playwright UI + collecting flows: `tests/a-a-bot.spec.mjs`
- Playwright end-to-end model generation (opt-in, 500 MB download):
  `A_A_BOT_GENERATE=1 npx playwright test tests/a-a-bot-generate.spec.mjs`

## Historical: how the revert was structured

(Preserved for reference — this is the state the branch was in before
A-A-Bot was re-enabled.)

- `src/app/layout.jsx` — `<ChatAgentLoader />` mount + its import commented out
- `src/components/ChatAgentLoader.jsx` — returned `null`; original code in
  a block comment at the bottom
- Trigger sites clicked the AC widget button directly instead of dispatching
  `open-chat-agent`
