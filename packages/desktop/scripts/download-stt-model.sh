#!/bin/bash
# Download Parakeet TDT ONNX model for speech-to-text
# Model files go to ~/Library/Application Support/com.hands.app/models/parakeet-tdt
#
# Source: https://huggingface.co/altunenes/parakeet-rs/tree/main/tdt
# This is the parakeet-rs author's own conversion, guaranteed compatible with the library.
#
# TDT model (int8 quantized): ~670MB total

set -e

MODEL_DIR="$HOME/Library/Application Support/com.hands.app/models/parakeet-tdt"
HF_REPO="https://huggingface.co/altunenes/parakeet-rs/resolve/main/tdt"

echo "📦 Downloading Parakeet TDT ONNX model..."
echo "   Target: $MODEL_DIR"
echo "   Source: altunenes/parakeet-rs (official parakeet-rs conversion)"

mkdir -p "$MODEL_DIR"
cd "$MODEL_DIR"

# TDT int8 quantized model files (~670 MB total)
FILES=(
  "encoder-model.int8.onnx"
  "decoder_joint-model.int8.onnx"
  "vocab.txt"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✓ $file already exists, skipping"
  else
    echo "⬇ Downloading $file..."
    curl -L --progress-bar -o "$file" "$HF_REPO/$file"
  fi
done

# Generate tokenizer.json from vocab.txt if needed
if [ ! -f "tokenizer.json" ]; then
  echo "🔧 Generating tokenizer.json from vocab.txt..."
  python3 -c "
import json

vocab = []
with open('vocab.txt', 'r') as f:
    for i, line in enumerate(f):
        parts = line.strip().split()
        if parts:
            token = parts[0]
            score = float(parts[1]) if len(parts) > 1 else -i
            vocab.append([token, score])

unk_id = next((i for i, (t, _) in enumerate(vocab) if t == '<unk>'), 0)

tokenizer = {
    'version': '1.0',
    'truncation': None,
    'padding': None,
    'added_tokens': [
        {'id': unk_id, 'content': '<unk>', 'single_word': False, 'lstrip': False, 'rstrip': False, 'normalized': False, 'special': True}
    ],
    'normalizer': {'type': 'Sequence', 'normalizers': []},
    'pre_tokenizer': None,
    'post_processor': None,
    'decoder': {'type': 'Metaspace', 'replacement': '▁', 'add_prefix_space': True},
    'model': {'type': 'Unigram', 'unk_id': unk_id, 'vocab': vocab}
}

with open('tokenizer.json', 'w') as f:
    json.dump(tokenizer, f, indent=2)

print('Generated tokenizer.json with', len(vocab), 'tokens')
"
fi

echo ""
echo "✅ Model downloaded successfully!"
echo "   Location: $MODEL_DIR"
echo ""
echo "   Files:"
ls -lh "$MODEL_DIR"
echo ""
echo "🎤 Ready for speech-to-text!"
