// Web worker for the A-A-Bot in-browser chat. Uses wllama (llama.cpp
// compiled to WASM) to run LFM2-700M-Q8_0 from a self-hosted GGUF file.
// Same inference engine as Ollama, same file format, running in the
// visitor's browser tab.
//
// The GGUF file contains weights + tokenizer + chat template in one
// binary — no separate config/tokenizer JSON files needed.
//
// wllama handles its own internal threading. If SharedArrayBuffer is
// available (requires COOP/COEP headers on the origin), it uses
// multi-threaded WASM for faster decode. Without those headers, it
// falls back to single-threaded. Either way it works.

import { Wllama } from '@wllama/wllama/esm/index.js';

const WASM_PATHS = {
  'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/src/single-thread/wllama.wasm',
  'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/src/multi-thread/wllama.wasm',
};
import {
  FACT_CHUNKS,
  AARON_CHAT_SYSTEM_PROMPT,
} from '../constants/aaronChatFacts.js';

const MODEL_URL_PATH = '/models/lfm2-700m-gguf/LFM2-700M-Q8_0.gguf';

let wllama = null;

async function loadModel(onProgress) {
  if (wllama) return wllama;

  const origin = self.location.href.startsWith('blob:')
    ? new URL(self.location.href.slice(5)).origin
    : self.location.origin;
  const modelUrl = `${origin}${MODEL_URL_PATH}`;

  console.log('[A-A-Bot] creating wllama instance...');
  wllama = new Wllama(WASM_PATHS);

  console.log('[A-A-Bot] loading model from', modelUrl);
  await wllama.loadModelFromUrl(modelUrl, {
    n_ctx: 4096,
    progressCallback: ({ loaded, total }) => {
      if (total > 0) onProgress(Math.round((loaded / total) * 100));
    },
  });
  console.log('[A-A-Bot] model ready');
  return wllama;
}

// ── Main message handler ────────────────────────────────────────────────────
self.addEventListener('message', async (e) => {
  const { type, messages } = e.data;
  if (type !== 'generate') return;

  try {
    self.postMessage({ type: 'status', status: 'loading', progress: 0 });
    const model = await loadModel((pct) =>
      self.postMessage({ type: 'status', status: 'loading', progress: pct }),
    );

    self.postMessage({ type: 'status', status: 'generating' });

    const currentUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!currentUser) {
      self.postMessage({ type: 'error', message: 'no user message' });
      return;
    }

    const factsBlock = FACT_CHUNKS
      .map((f, i) => `${i + 1}. ${f}`)
      .join('\n');
    const systemPrompt = `${AARON_CHAT_SYSTEM_PROMPT}\n\nFacts block:\n${factsBlock}`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: currentUser.content },
    ];

    let reply = '';
    const stream = await model.createChatCompletion(chatMessages, {
      nPredict: 200,
      sampling: {
        temp: 0,
        top_k: 1,
        penalty_repeat: 1.2,
      },
      stream: true,
      useCache: true,
    });

    const timeout = setTimeout(() => {
      // If we have partial output, ship it rather than erroring.
      if (reply.trim().length > 10) {
        self.postMessage({ type: 'done', reply: reply.trim() });
      } else {
        self.postMessage({ type: 'error', message: 'Generation timed out.' });
      }
    }, 120000);

    for await (const chunk of stream) {
      const piece = new TextDecoder().decode(chunk.piece);
      reply += piece;
      self.postMessage({ type: 'token', token: piece });
    }

    clearTimeout(timeout);
    self.postMessage({ type: 'done', reply: reply.trim() });
  } catch (err) {
    console.error('[A-A-Bot] worker error:', err);
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
});
