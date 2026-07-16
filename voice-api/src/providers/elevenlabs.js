import { config } from "../config.js";

const BASE = "https://api.elevenlabs.io/v1";

function requireApiKey() {
  if (!config.elevenLabsApiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set on the server.");
  }
}

export async function createVoiceFromSample({ name, buffer, mimeType, filename }) {
  requireApiKey();

  const form = new FormData();
  form.append("name", name);
  const blob = new Blob([buffer], { type: mimeType || "audio/webm" });
  form.append("files", blob, filename || "sample.webm");
  form.append(
    "description",
    "Tap & Roar family narrator — cloned with parent consent, device-local upload."
  );

  const res = await fetch(`${BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsApiKey },
    body: form
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs voice create failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return {
    providerVoiceId: data.voice_id,
    provider: "elevenlabs"
  };
}

export async function synthesizeSpeech({ providerVoiceId, text }) {
  requireApiKey();
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Story text is empty.");

  const res = await fetch(`${BASE}/text-to-speech/${providerVoiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": config.elevenLabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text: trimmed,
      model_id: config.elevenLabsModelId,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.85,
        style: 0.15,
        use_speaker_boost: true
      }
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
