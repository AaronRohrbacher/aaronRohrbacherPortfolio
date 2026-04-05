# Fine-tuning Qwen2.5-0.5B-Instruct

QLoRA fine-tune → ONNX export → quantize → Transformers.js in-browser inference.

## Quickstart (Google Colab — recommended)

1. Open `finetune_colab.ipynb` in Google Colab (Runtime → Change runtime type → T4 GPU)
2. Run all cells — upload `dataset.jsonl` when prompted
3. Set your HuggingFace username and upload
4. Update the model ID in `src/workers/ai.worker.js`

Training takes ~5 minutes on a free T4.

## Manual (any GPU with 8GB+ VRAM)

```bash
# 1. Install deps (CUDA must already be available)
pip install -r requirements.txt

# 2. Fine-tune (~5 min on T4, ~2 min on A100)
python finetune.py

# 3. Export to ONNX
python export_onnx.py

# 4. Quantize to q4 (reduces size ~4×)
optimum-cli onnxruntime quantize --avx512 --onnx_model ./onnx_export -o ./onnx_q4
```

## Upload to HuggingFace

```bash
pip install huggingface_hub
huggingface-cli login
huggingface-cli upload YOUR_USERNAME/qwen-aaron-portfolio ./onnx_q4 .
```

## Wire it into the portfolio

In `src/workers/ai.worker.js`, change the model ID:

```js
'onnx-community/Qwen2.5-0.5B-Instruct'
// →
'YOUR_USERNAME/qwen-aaron-portfolio'
```

## Dataset

`dataset.jsonl` contains Q&A pairs in chat format. Add new examples and re-run the fine-tune to improve responses.

## Files

- `finetune.py` — QLoRA training script
- `finetune_colab.ipynb` — Self-contained Colab notebook (recommended)
- `export_onnx.py` — ONNX conversion script
- `dataset.jsonl` — Training data (47 examples)
- `requirements.txt` — Python dependencies
