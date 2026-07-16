#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg not found — XTTS needs it for audio I/O."
  if command -v brew >/dev/null 2>&1; then
    echo "Installing FFmpeg via Homebrew…"
    brew install ffmpeg
  else
    echo "Install Homebrew from https://brew.sh then run: brew install ffmpeg"
    exit 1
  fi
fi

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

pip install --upgrade pip
pip install torch torchaudio
pip install -r requirements.txt

echo ""
echo "Setup complete. Start the sidecar with:"
echo "  source .venv/bin/activate && python server.py"
