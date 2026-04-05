"""
Fine-tune Qwen2.5-0.5B-Instruct on Aaron Rohrbacher Q&A data using QLoRA.
Exports a merged model compatible with Transformers.js (ONNX conversion handled separately).

Requirements: see requirements.txt
Recommended: Any GPU with 8GB+ VRAM. Free Google Colab T4 works fine (~5 min).
"""

import json
import torch
from datasets import Dataset, concatenate_datasets
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer, SFTConfig

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
OUTPUT_DIR = "./output"
MERGED_DIR = "./merged"
DATASET_FILE = "./dataset_v2.jsonl"
MAX_SEQ_LENGTH = 512

# ─── Load dataset ─────────────────────────────────────────────────────────────

def load_dataset():
    records = []
    with open(DATASET_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return Dataset.from_list(records)

# ─── Format into chat template ─────────────────────────────────────────────────

def format_example(example, tokenizer):
    """Apply the model's native chat template to each example."""
    system = (
        "You are a helpful assistant on Aaron Rohrbacher's portfolio site. "
        "Answer the question using ONLY the provided facts. One to two sentences. "
        "Do not add information not in the facts. "
        "If the facts don't cover the question, say: "
        "\"I don't have that info — just say 'connect me' and I'll open a live chat with Aaron!\""
    )
    messages = [{"role": "system", "content": system}] + example["messages"]
    return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)

# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Loading tokenizer from {BASE_MODEL}...")
    # fix_mistral_regex=True repairs a tokenizer regex issue transformers warns
    # about even on Qwen-family tokenizers; without it, the tokenizer saved into
    # MERGED_DIR emits warnings at ONNX export time.
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, fix_mistral_regex=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    print(f"Loading model from {BASE_MODEL}...")
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    model.config.use_cache = False

    # QLoRA config — targets attention and MLP projection layers
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Load and format dataset
    raw_dataset = load_dataset()
    formatted_texts = [format_example(ex, tokenizer) for ex in raw_dataset]
    train_dataset = Dataset.from_dict({"text": formatted_texts})

    # Augment with shuffled copies for more robust training
    augmented = train_dataset.shuffle(seed=42)
    train_dataset = concatenate_datasets([train_dataset, augmented])

    print(f"Training on {len(train_dataset)} examples...")

    training_args = SFTConfig(
        output_dir=OUTPUT_DIR,
        num_train_epochs=4,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        logging_steps=10,
        save_strategy="epoch",
        max_seq_length=MAX_SEQ_LENGTH,
        dataset_text_field="text",
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        tokenizer=tokenizer,
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving LoRA adapter to {OUTPUT_DIR}...")
    trainer.save_model(OUTPUT_DIR)

    # Merge LoRA weights into base model for export
    print(f"Merging LoRA into base model and saving to {MERGED_DIR}...")
    from peft import PeftModel
    base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, torch_dtype=torch.bfloat16, device_map="cpu")
    merged = PeftModel.from_pretrained(base, OUTPUT_DIR)
    merged = merged.merge_and_unload()
    merged.save_pretrained(MERGED_DIR)
    tokenizer.save_pretrained(MERGED_DIR)

    print(f"\nDone. Merged model saved to {MERGED_DIR}/")
    print("Next step: run export_onnx.py to convert for Transformers.js")

if __name__ == "__main__":
    main()
