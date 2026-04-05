// AI agent disabled — see AI_COMMENTED_OUT.md at repo root.
// This worker is only loaded by src/components/ChatAgent.jsx, which is no
// longer mounted. Code preserved intact below.

import { pipeline, TextStreamer, env } from '@huggingface/transformers';
import { FACT_CHUNKS, AARON_CHAT_SYSTEM_PROMPT } from '../constants/aaronChatFacts.js';

env.backends.onnx.wasm.numThreads = 1;

// Serve the fine-tuned model from our own origin instead of HuggingFace
const origin = self.location.href.startsWith('blob:')
  ? new URL(self.location.href.slice(5)).origin
  : self.location.origin;
env.remoteHost = `${origin}/`;
env.remotePathTemplate = 'models/{model}/';
env.allowLocalModels = false;

let generator = null;

// ── Model loader ─────────────────────────────────────────────────────────────
async function loadGenerator(onProgress) {
  if (generator) return generator;

  let device = 'wasm';
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) device = 'webgpu';
    } catch (_) { /* fall back */ }
  }

  generator = await pipeline(
    'text-generation',
    'aaron-chat',
    {
      dtype: 'q8',
      device,
      progress_callback: (p) => {
        if (p.status === 'progress' && p.progress != null)
          onProgress(Math.round(p.progress));
      },
    },
  );
  return generator;
}

// ── Main message handler ──────────────────────────────────────────────────────
// ChatAgent handles off-topic detection and fact retrieval before sending here.
// This worker's only job: load model, generate a paraphrase, stream it back.
self.addEventListener('message', async (e) => {
  const { type, messages, relevantFacts } = e.data;
  if (type !== 'generate') return;

  try {
    self.postMessage({ type: 'status', status: 'loading', progress: 0 });
    const gen = await loadGenerator((pct) =>
      self.postMessage({ type: 'status', status: 'loading', progress: pct }),
    );

    self.postMessage({ type: 'status', status: 'generating' });

    // Use only the retrieved facts when provided, otherwise all facts
    const factsBlock = relevantFacts
      ? relevantFacts.join('\n')
      : FACT_CHUNKS.join('\n');

    const systemPrompt = `${AARON_CHAT_SYSTEM_PROMPT}\n\nFacts about Aaron:\n${factsBlock}`;

    // When paraphrasing specific facts, only send the current question
    // to minimize confusion. For all-facts mode, keep recent history.
    const userMessages = relevantFacts
      ? [messages.at(-1)]
      : messages.slice(-4).filter((m) => m.role === 'user' || m.role === 'assistant');

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...userMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let reply = '';
    const streamer = new TextStreamer(gen.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text) => {
        reply += text;
        self.postMessage({ type: 'token', token: text });
      },
    });

    // Fewer tokens when paraphrasing specific facts (simpler task)
    const maxTokens = relevantFacts ? 60 : 100;

    const generation = gen(chatMessages, {
      max_new_tokens: maxTokens,
      do_sample: false,
      repetition_penalty: 1.3,
      streamer,
    });

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('__timeout__')), 90000),
    );

    try {
      await Promise.race([generation, timeout]);
    } catch (err) {
      if (err.message === '__timeout__' && reply.trim().length > 10) {
        self.postMessage({ type: 'done', reply: reply.trim() });
        return;
      }
      throw err;
    }

    self.postMessage({ type: 'done', reply: reply.trim() });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
});
