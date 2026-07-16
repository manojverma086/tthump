# Coqui XTTS-v2 sidecar

Local, free voice cloning for Tap & Roar. The Node `voice-api` calls this service over HTTP — no ElevenLabs billing.

## Requirements

- Python 3.10–3.14
- ~4 GB RAM (8 GB+ recommended)
- Apple Silicon (MPS) or NVIDIA GPU optional but much faster
- First run downloads the XTTS model (~1.7 GB)

## One-time setup

**FFmpeg is optional** for mic recordings (WebM). The sidecar bundles a small ffmpeg binary via `imageio-ffmpeg` to convert samples. Homebrew FFmpeg is still recommended:

```bash
brew install ffmpeg   # optional but useful
```

Then:

```bash
cd voice-api/xtts-service
./setup.sh
# or manually:
python3 -m venv .venv && source .venv/bin/activate
pip install torch torchaudio
pip install -r requirements.txt
```

On a rented NVIDIA GPU later, install the CUDA build of PyTorch instead:

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
```

## Run

Terminal 1 — XTTS:

```bash
cd voice-api/xtts-service
source .venv/bin/activate
python server.py
# → http://127.0.0.1:5002/health
```

Terminal 2 — Node API:

```bash
cd voice-api
# In .env: VOICE_PROVIDER=xtts
npm run dev
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Model loaded, device (cpu/mps/cuda) |
| POST | `/synthesize` | JSON `{ text, speakerWav, language? }` → WAV |
| POST | `/synthesize/upload` | Multipart with inline speaker file |

`speakerWav` must be an **absolute path** to the saved family sample on disk (the Node API handles this).

## Tips

- Use a **6–20 second** clean mono sample (one speaker, minimal background noise).
- WebM samples from the browser work; XTTS reads them via `soundfile`/ffmpeg.
- Set `PYTORCH_ENABLE_MPS_FALLBACK=1` if MPS kernels fail (already defaulted in `server.py`).
- Story audio is cached after the first generation — repeat plays are instant.

## Deploy to a GPU VPS later

1. Copy `xtts-service/` to the server.
2. Install CUDA PyTorch + requirements.
3. Run `python server.py` bound to an internal port (e.g. 5002).
4. Point `XTTS_SERVICE_URL` on the Node API to that host.
5. Keep samples on the same machine as XTTS (paths must be local to the sidecar).
