"""
Local Coqui XTTS-v2 sidecar for Tap & Roar voice-api.

Run once; the Node API calls this over HTTP for zero-shot voice cloning.
"""

from __future__ import annotations

import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from audio_util import (
    concat_wav_bytes,
    patch_xtts_audio_loader,
    split_text_chunks,
    to_mono_wav,
)
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

MODEL_ID = os.environ.get("XTTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
HOST = os.environ.get("XTTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("XTTS_PORT", "5002"))
DEFAULT_LANGUAGE = os.environ.get("XTTS_LANGUAGE", "en")
# Bedtime-story defaults — slower and a touch warmer for toddlers
STORY_SPEED = float(os.environ.get("XTTS_STORY_SPEED", "0.88"))
STORY_TEMPERATURE = float(os.environ.get("XTTS_STORY_TEMPERATURE", "0.72"))
STORY_LENGTH_PENALTY = float(os.environ.get("XTTS_STORY_LENGTH_PENALTY", "0.92"))

tts = None
device = "cpu"


def pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model():
    global tts, device
    from TTS.api import TTS

    patch_xtts_audio_loader()

    device = pick_device()
    if device == "mps":
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

    print(f"Loading XTTS model: {MODEL_ID} on {device} …")
    tts = TTS(MODEL_ID).to(device)
    print("XTTS ready.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


app = FastAPI(title="Tap & Roar XTTS", lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_ID,
        "device": device,
        "language": DEFAULT_LANGUAGE,
    }


def synthesize_to_wav(
    text: str,
    speaker_wav: str,
    language: str,
    *,
    speed: float | None = None,
    temperature: float | None = None,
    length_penalty: float | None = None,
    style: str | None = None,
) -> bytes:
    if tts is None:
        raise RuntimeError("Model not loaded.")

    trimmed = text.strip()
    if not trimmed:
        raise ValueError("Text is empty.")

    speaker_path = Path(speaker_wav)
    if not speaker_path.is_file():
        raise FileNotFoundError(f"Speaker sample not found: {speaker_wav}")

    wav_path, is_temp = to_mono_wav(speaker_path)

    bedtime = style == "bedtime" or style == "story"
    synth_speed = speed if speed is not None else (STORY_SPEED if bedtime else 1.0)
    synth_temp = temperature if temperature is not None else (STORY_TEMPERATURE if bedtime else 0.65)
    synth_length = length_penalty if length_penalty is not None else (STORY_LENGTH_PENALTY if bedtime else 1.0)
    lang = language or DEFAULT_LANGUAGE
    chunks = split_text_chunks(trimmed, lang)

    try:
        wav_parts: list[bytes] = []
        for chunk in chunks:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                out_path = tmp.name
            try:
                tts.tts_to_file(
                    text=chunk,
                    speaker_wav=wav_path,
                    language=lang,
                    file_path=out_path,
                    speed=synth_speed,
                    temperature=synth_temp,
                    length_penalty=synth_length,
                    split_sentences=False,
                )
                wav_parts.append(Path(out_path).read_bytes())
            finally:
                Path(out_path).unlink(missing_ok=True)

        return concat_wav_bytes(wav_parts)
    finally:
        if is_temp:
            Path(wav_path).unlink(missing_ok=True)


@app.post("/synthesize")
async def synthesize_json(payload: dict):
    """JSON body: { text, speakerWav, language? } — speakerWav is a local file path."""
    text = str(payload.get("text") or "").strip()
    speaker_wav = str(payload.get("speakerWav") or payload.get("speaker_wav") or "").strip()
    language = str(payload.get("language") or DEFAULT_LANGUAGE).strip()
    style = str(payload.get("style") or "").strip() or None
    speed = payload.get("speed")
    temperature = payload.get("temperature")
    length_penalty = payload.get("lengthPenalty") or payload.get("length_penalty")

    if not text:
        raise HTTPException(status_code=400, detail="text is required.")
    if not speaker_wav:
        raise HTTPException(status_code=400, detail="speakerWav is required.")

    try:
        audio = synthesize_to_wav(
            text,
            speaker_wav,
            language,
            speed=float(speed) if speed is not None else None,
            temperature=float(temperature) if temperature is not None else None,
            length_penalty=float(length_penalty) if length_penalty is not None else None,
            style=style,
        )
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err

    return Response(content=audio, media_type="audio/wav")


@app.post("/synthesize/upload")
async def synthesize_upload(
    text: str = Form(...),
    language: str = Form(DEFAULT_LANGUAGE),
    speaker: UploadFile = File(...),
):
    """Multipart upload when the reference clip is sent inline (optional helper)."""
    suffix = Path(speaker.filename or "sample.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as ref:
        ref.write(await speaker.read())
        ref_path = ref.name

    try:
        audio = synthesize_to_wav(text, ref_path, language)
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
    finally:
        Path(ref_path).unlink(missing_ok=True)

    return Response(content=audio, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
