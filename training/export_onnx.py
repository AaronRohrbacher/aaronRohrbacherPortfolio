"""
Convert the merged fine-tuned model to ONNX format for use with Transformers.js.
Run this after finetune.py completes.

Usage:
    python export_onnx.py
"""

import subprocess
import sys

MERGED_DIR = "./merged"
ONNX_DIR = "./onnx_export"

def main():
    print("Converting merged model to ONNX for Transformers.js...")
    print("This may take 10-20 minutes depending on hardware.\n")

    cmd = [
        sys.executable, "-m", "optimum.exporters.onnx",
        "--model", MERGED_DIR,
        "--task", "text-generation-with-past",
        "--device", "cpu",
        "--dtype", "fp32",
        ONNX_DIR,
    ]

    result = subprocess.run(cmd, check=True)

    if result.returncode == 0:
        print(f"\nONNX export complete. Files saved to {ONNX_DIR}/")
        print("\nNext steps:")
        print("1. Quantize to q4 to reduce size:")
        print(f"   optimum-cli onnxruntime quantize --avx512 --onnx_model {ONNX_DIR} -o ./onnx_q4")
        print("2. Upload the q4 output folder to a Hugging Face repo")
        print("3. Update the model ID in src/workers/ai.worker.js to point to your repo")

if __name__ == "__main__":
    main()
