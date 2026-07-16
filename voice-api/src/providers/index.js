import { config } from "../config.js";
import * as elevenlabs from "./elevenlabs.js";
import * as mock from "./mock.js";
import * as xtts from "./xtts.js";

function pickProvider() {
  if (config.voiceProvider === "mock") return mock;
  if (config.voiceProvider === "xtts") return xtts;
  if (!config.elevenLabsApiKey) {
    throw new Error(
      "Set ELEVENLABS_API_KEY, VOICE_PROVIDER=xtts, or VOICE_PROVIDER=mock."
    );
  }
  return elevenlabs;
}

export function getAudioFormat() {
  const provider = pickProvider();
  return provider.audioFormat || "mp3";
}

export async function createVoiceFromSample(opts) {
  return pickProvider().createVoiceFromSample(opts);
}

export async function synthesizeSpeech(opts) {
  return pickProvider().synthesizeSpeech(opts);
}
