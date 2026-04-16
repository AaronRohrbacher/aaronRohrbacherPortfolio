// Model-load sanity check. Loads LFM2-1.2B-ONNX from
// public/models/lfm2-1.2b/ via transformers.js in Node and runs one short
// generation grounded in FACT_CHUNKS. OPT-IN — set A_A_BOT_NODE_LOAD=1.
//
// Why this test exists: the browser Playwright model test runs on
// single-threaded WASM under headless Chrome, which is slow even for a
// ~730 MB model. Running the same files via the multi-threaded native
// ONNX runtime in Node validates that the files are structurally sound
// and the model produces grounded output — without the browser overhead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FACT_CHUNKS, AARON_CHAT_SYSTEM_PROMPT } from '../../src/constants/aaronChatFacts.js';

test('A-A-Bot model loads and generates (Node ONNX runtime)', async (t) => {
  if (!process.env.A_A_BOT_NODE_LOAD) {
    t.skip('Set A_A_BOT_NODE_LOAD=1 to exercise the ~730 MB LFM2-1.2B model in Node.');
    return;
  }

  const { pipeline, env } = await import('@huggingface/transformers');

  // Load from local filesystem.
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = path.resolve('public/models');

  const generator = await pipeline('text-generation', 'lfm2-1.2b', {
    dtype: 'q4f16',
  });

  const factsBlock = FACT_CHUNKS.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const systemPrompt = `${AARON_CHAT_SYSTEM_PROMPT}\n\nFacts block:\n${factsBlock}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'What programming languages does Aaron know?' },
  ];

  const out = await generator(messages, {
    max_new_tokens: 140,
    do_sample: false,
    repetition_penalty: 1.2,
  });

  // transformers.js returns [{ generated_text: [...messages, {role:'assistant', content:'...'}]}]
  const last = out[0]?.generated_text;
  const assistantContent = Array.isArray(last)
    ? last.at(-1)?.content
    : typeof last === 'string'
      ? last
      : '';

  console.log('\n--- MODEL REPLY ---\n', assistantContent, '\n-------------------\n');

  assert.ok(typeof assistantContent === 'string' && assistantContent.length > 0, 'empty reply');
  // Any real language from the facts block should appear
  assert.match(
    assistantContent,
    /JavaScript|TypeScript|Python|Ruby|Kotlin|Swift|Rust|PHP|SQL|Bash/i,
  );
});
