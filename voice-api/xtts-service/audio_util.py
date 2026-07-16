"""Convert voice samples and patch XTTS to avoid torchcodec/FFmpeg."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


def _ffmpeg_bin() -> str:
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    raise RuntimeError(
        "Could not find ffmpeg to read webm/mp4 samples. "
        "Install with: brew install ffmpeg"
    )


def to_mono_wav(source_path: str | Path, sample_rate: int = 22050) -> tuple[str, bool]:
    """Return (wav_path, is_temp). Non-WAV inputs are converted to a temp file."""
    source = Path(source_path)
    if not source.is_file():
        raise FileNotFoundError(f"Speaker sample not found: {source}")

    if source.suffix.lower() == ".wav":
        return str(source), False

    ffmpeg = _ffmpeg_bin()
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    out_path = tmp.name

    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(source),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        out_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as err:
        Path(out_path).unlink(missing_ok=True)
        detail = (err.stderr or err.stdout or str(err)).strip().splitlines()[-1]
        raise RuntimeError(f"Could not read voice sample ({source.suffix}): {detail}") from err

    return out_path, True


def patch_xtts_audio_loader() -> None:
    """
    torchaudio.load() on PyTorch 2.9+ requires torchcodec + FFmpeg dylibs.
    XTTS only needs load_audio() for speaker clips — soundfile is enough.
    """
    import torch
    import soundfile as sf
    import torchaudio
    import TTS.tts.models.xtts as xtts_module

    def load_audio(audiopath, sampling_rate):
        data, lsr = sf.read(str(audiopath), dtype="float32", always_2d=True)
        audio = torch.from_numpy(data.T)
        if audio.size(0) != 1:
            audio = torch.mean(audio, dim=0, keepdim=True)
        if lsr != sampling_rate:
            audio = torchaudio.functional.resample(audio, lsr, sampling_rate)
        audio.clip_(-1, 1)
        return audio

    xtts_module.load_audio = load_audio


# Coqui XTTS per-language limits (leave headroom below model max).
LANG_CHAR_LIMIT: dict[str, int] = {
    "hi": 140,
    "en": 230,
    "es": 230,
    "fr": 230,
    "de": 230,
    "ja": 140,
    "pt": 230,
}


def char_limit_for_language(language: str) -> int:
    code = (language or "en").split("-")[0].lower()
    return LANG_CHAR_LIMIT.get(code, 200)


def split_text_chunks(text: str, language: str) -> list[str]:
    """Split long narration into XTTS-safe chunks (segment / sentence aware)."""
    import re

    trimmed = text.strip()
    if not trimmed:
        return []
    limit = char_limit_for_language(language)
    if len(trimmed) <= limit:
        return [trimmed]

    raw_parts = [p.strip() for p in re.split(r"\s*\.\.\.\s*", trimmed) if p.strip()]
    if len(raw_parts) == 1:
        raw_parts = [p.strip() for p in re.split(r"(?<=[.。!?])\s+", trimmed) if p.strip()]
    if not raw_parts:
        raw_parts = [trimmed]

    chunks: list[str] = []

    def flush(buf: str) -> None:
        if buf.strip():
            chunks.append(buf.strip())

    for part in raw_parts:
        if len(part) <= limit:
            flush(part)
            continue
        sentences = [s.strip() for s in re.split(r"(?<=[.。!?])\s+", part) if s.strip()]
        if not sentences:
            sentences = [part]
        buf = ""
        for sentence in sentences:
            if len(sentence) > limit:
                flush(buf)
                buf = ""
                start = 0
                while start < len(sentence):
                    chunks.append(sentence[start : start + limit].strip())
                    start += limit
                continue
            candidate = f"{buf} {sentence}".strip() if buf else sentence
            if len(candidate) <= limit:
                buf = candidate
            else:
                flush(buf)
                buf = sentence
        flush(buf)

    return [c for c in chunks if c]


def concat_wav_bytes(parts: list[bytes], pause_sec: float = 0.42) -> bytes:
    """Join WAV byte blobs with a short silent gap between chunks."""
    import io

    import numpy as np
    import soundfile as sf

    if not parts:
        return b""
    if len(parts) == 1:
        return parts[0]

    arrays: list[np.ndarray] = []
    sample_rate = 22050

    for i, data in enumerate(parts):
        audio, file_sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
        sample_rate = file_sr
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        arrays.append(np.asarray(audio, dtype=np.float32))
        if i < len(parts) - 1 and pause_sec > 0:
            arrays.append(np.zeros(int(sample_rate * pause_sec), dtype=np.float32))

    merged = np.concatenate(arrays)
    buf = io.BytesIO()
    sf.write(buf, merged, sample_rate, format="WAV")
    return buf.getvalue()
