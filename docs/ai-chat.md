# AI chat in this portfolio

## Flow (what runs when someone types)

1. **Intent routing** (`detectIntent` in `src/components/ChatAgent.jsx`) — short-circuits to Amazon Connect flows for “call me,” “live chat,” “leave a message,” etc., when the text clearly means that.
2. **Knowledge base** (`KNOWLEDGE_BASE` + `answerFromKB`) — **only** a few fixed replies for edge cases (see below). Everything else skips this.
3. **Web Worker** (`src/workers/ai.worker.js`) — Transformers.js loads an ONNX instruct model, runs a short relevance check, then generates a streamed reply. No network, no API key.
4. **UI polish** — if the worker says “off-topic,” `getRhymingRedirect` sends a playful redirect instead of a boring “no.”

## Where to change behavior

| Goal | File |
|------|------|
| Grounded facts (bio, roles, skills) | `src/constants/aaronChatFacts.js` — keep in sync with `src/info/Info.jsx` |
| Model id, quant, device, token limits | `src/workers/ai.worker.js` |
| Fewer/more canned **answers** | `KNOWLEDGE_BASE` in `src/components/ChatAgent.jsx` |
| Off-topic redirects | `getRhymingRedirect`, `RHYME_WORDS`, `RHYME_TEMPLATES` in `ChatAgent.jsx` |
| Resume tab copy | `AskAI` in `src/components/resume/Resume.jsx` |

## Optional server routes (not used by the floating chat)

- `src/app/api/ask/route.js` — OpenAI streaming (needs `OPENAI_API_KEY`).
- `src/app/api/resume-ai/route.js` — same pattern, different system prompt.

## Training your own ONNX model

See `training/README.md` and `training/finetune.py`. After export, point the worker at your Hugging Face model id in `ai.worker.js`.
