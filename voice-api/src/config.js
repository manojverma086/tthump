import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8765,http://127.0.0.1:8765")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  dataDir: path.resolve(rootDir, process.env.DATA_DIR || "./data"),
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
  voiceProvider: (process.env.VOICE_PROVIDER || "elevenlabs").toLowerCase(),
  xttsServiceUrl: process.env.XTTS_SERVICE_URL || "http://127.0.0.1:5002",
  xttsLanguage: process.env.XTTS_LANGUAGE || "en",
  /** Slower, warmer synth for toddler bedtime stories (XTTS). */
  xttsStorySpeed: Number(process.env.XTTS_STORY_SPEED || 0.88),
  xttsStoryTemperature: Number(process.env.XTTS_STORY_TEMPERATURE || 0.72),
  storyAudioStyle: process.env.STORY_AUDIO_STYLE || "bedtime-v2"
};
