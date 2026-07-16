import path from "node:path";
import { config } from "../config.js";

/**
 * Coqui XTTS-v2 — local zero-shot cloning via Python sidecar.
 * Voice "registration" stores the sample path; synthesis sends text + sample each time.
 */
export async function createVoiceFromSample({ samplePath }) {
  if (!samplePath) {
    throw new Error("XTTS provider requires a saved sample path.");
  }
  return {
    providerVoiceId: path.resolve(samplePath),
    provider: "xtts"
  };
}

export async function synthesizeSpeech({ providerVoiceId, text, language, speed, temperature, style }) {
  const base = config.xttsServiceUrl.replace(/\/$/, "");
  const body = {
    text,
    speakerWav: providerVoiceId,
    language: language || config.xttsLanguage
  };
  if (speed != null) body.speed = speed;
  if (temperature != null) body.temperature = temperature;
  if (style) body.style = style;

  const res = await fetch(`${base}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const detail = await res.text();
    let message = detail;
    try {
      const parsed = JSON.parse(detail);
      if (parsed.detail) message = parsed.detail;
      else if (parsed.error) message = parsed.error;
    } catch {
      // keep raw text
    }
    if (message.length > 280) message = message.slice(0, 280) + "…";
    throw new Error(`XTTS synthesis failed (${res.status}): ${message}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const audioFormat = "wav";
