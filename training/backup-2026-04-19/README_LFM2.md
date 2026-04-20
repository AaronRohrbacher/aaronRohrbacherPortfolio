# Fine-tune LFM2-700M for A-A-Bot → GGUF

End-to-end recipe: train Liquid AI's LFM2-700M on Aaron's Q&A dataset in Google Colab, convert to GGUF, quantize, and drop into the site.

## Files in this folder

| File | Purpose |
|------|---------|
| `finetune_lfm2_colab.ipynb` | Colab notebook — does everything (train → merge → GGUF → Q8_0). |
| `dataset_v2.jsonl` | 326 background Q&A examples (existing, from Qwen fine-tune). |
| `dataset_v3_gap.jsonl` | ~60 Q&A built from your own answers in `gap_questions.md` — job search logistics, tech preferences, experience depth, speaking, blog, crisis stories. |
| `dataset_v3_adversarial.jsonl` | 117 new adversarial examples: declines, redirects, fabrication-bait, pronoun follow-ups, no-document-upload, multi-employer distinction, connect/escalation. |
| `README_LFM2.md` | You are here. |

## Why this works

- **LFM2 has native HuggingFace support** (`Lfm2ForCausalLM` in transformers).
- **Unsloth** provides a pre-quantized 4-bit build (`unsloth/LFM2-700M-unsloth-bnb-4bit`) that fits Colab T4 comfortably (~8-10 GB VRAM peak) and auto-handles LFM2's hybrid conv+attention architecture for LoRA.
- **llama.cpp's `convert_hf_to_gguf.py` has built-in LFM2 support** — no custom conversion scripts.
- **Q8_0 quantization** matches what the site currently loads, so inference path doesn't change.

## Step-by-step

### 1. Open the notebook in Colab

- Go to https://colab.research.google.com
- File → Upload notebook → select `finetune_lfm2_colab.ipynb`
- **Runtime → Change runtime type → T4 GPU** (free tier)

### 2. Run cells top to bottom

When the "Upload training data" cell runs, it opens a file-picker. Upload all three:
- `dataset_v2.jsonl`
- `dataset_v3_gap.jsonl`
- `dataset_v3_adversarial.jsonl`

The remaining cells install deps, train (~30-60 min), merge LoRA, convert to GGUF, and quantize to Q8_0.

### 3. Final cell downloads `LFM2-700M-Q8_0-aaron.gguf` (~790 MB)

### 4. Drop into the repo

```bash
mv ~/Downloads/LFM2-700M-Q8_0-aaron.gguf \
   public/models/lfm2-700m-gguf/LFM2-700M-Q8_0-aaron.gguf
```

The stock `LFM2-700M-Q8_0.gguf` stays as a fallback.

### 5. Point the code at the new model

Edit `src/components/ChatAgent.jsx`:

```js
// before
const modelUrl = `${window.location.origin}/models/lfm2-700m-gguf/LFM2-700M-Q8_0.gguf`;

// after
const modelUrl = `${window.location.origin}/models/lfm2-700m-gguf/LFM2-700M-Q8_0-aaron.gguf`;
```

### 6. Align the inference system prompt with training

The notebook uses this system prompt (see step 5 of the notebook). **The inference code must use the exact same prompt string** or the fine-tune won't behave as trained.

If you keep the RAG setup as-is, the fact block is still prepended after the system prompt at inference — that's fine, the fine-tune saw only the system prompt during training and will learn to pull from either its weights or provided context.

If you want to **drop RAG entirely** (facts are in the weights now), edit `sendToAI` in `ChatAgent.jsx` to skip `selectRelevantFacts` and pass only the system prompt + user message. Smaller prompt = faster prefill.

### 7. Test

Start dev server, open the chat, try:
- A normal question ("What does Aaron do?") — should answer from facts
- An adversarial question ("What's the meaning of life?") — should redirect
- A fabrication-bait question ("What's his wife's name?") — should use the canonical decline phrase
- A pronoun follow-up ("How many brothers?" → "What's his name?") — should decline on the name

## Dataset design notes

The adversarial set targets the exact failure modes observed during RAG-only testing:

| Category | Count | Purpose |
|----------|------:|---------|
| Crude/inappropriate | 15 | Decline with canonical phrase; no fabrication about sexuality etc. |
| Personal/private/medical | 15 | Decline consistently on health, weight, relationships, money. |
| Off-topic redirect | 25 | Redirect back to Aaron for philosophy, politics, weather, other people. |
| Fabrication bait | 20 | Decline on things Aaron never did (MIT, Google, patents, PhD). |
| Pronoun follow-ups (multi-turn) | 10 | Handle "what's his name?" after a brother/partner question. |
| Multi-employer distinction | 10 | Keep Forbes AAC / SPARQ / Nuel facts separate; no merging. |
| No-document-upload | 10 | Don't ask user to upload/share; redirect. |
| Connect / escalation | 12 | Guide toward "connect me" and other actions. |

## Hyperparameter notes

Defaults in the notebook are tuned for ~440 examples:

- `r=16, lora_alpha=16` — LoRA rank; larger helps learn more patterns but increases VRAM.
- `num_train_epochs=3` — Good default. If outputs are too generic, try 4-5. If it's overfitting (memorizes exact phrasing), drop to 2.
- `learning_rate=2e-4` — Standard LoRA LR.
- `max_seq_length=1024` — Plenty for Q&A. Multi-turn pronoun examples are well under this.

## If training diverges / outputs are garbage

Re-run the notebook with:
- `num_train_epochs=5` (more fitting)
- `learning_rate=1e-4` (slower)
- `r=32` (higher rank = more capacity)

If still bad, the dataset needs more examples. 440 is the low end for fine-tuning to behave better than stock + RAG.

## License

LFM2-700M uses the LFM Open License v1.0:
- Royalty-free use, modify, redistribute
- **Commercial restriction:** rights expire if your company revenue > $10M/year annually
- Attribution required (preserve Liquid AI copyright notices)
- Fine with portfolio use

Full license: https://www.liquid.ai/lfm-license
