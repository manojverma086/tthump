import { Hono } from "hono";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { createStoryJob, getJobStatus, toXttsLanguage } from "../jobs.js";
import { getAudioFormat, createVoiceFromSample, synthesizeSpeech } from "../providers/index.js";
import {
  getStoryAudioPath,
  getVoice,
  saveSampleFile,
  saveStoryAudio,
  saveVoice,
  storyCacheKey
} from "../storage.js";

const api = new Hono();

function newVoiceId() {
  return "voice-" + crypto.randomBytes(8).toString("hex");
}

api.get("/health", (c) =>
  c.json({
    ok: true,
    service: "tap-roar-voice-api",
    version: "0.1.0"
  })
);

/** Register a family voice from uploaded audio sample. */
api.post("/voices", async (c) => {
  const body = await c.req.parseBody();
  const label = String(body.label || body.name || "Family").trim();
  const file = body.file || body.sample;

  if (!file || typeof file === "string") {
    return c.json({ error: "Missing audio file (field: file)." }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 1000) {
    return c.json({ error: "Sample too short. Use at least 5 seconds of speech." }, 400);
  }

  const voiceId = newVoiceId();
  const mimeType = file.type || "audio/webm";
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a")
    ? "m4a"
    : mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mpeg")
        ? "mp3"
        : "webm";

  const samplePath = await saveSampleFile(voiceId, buffer, ext);

  const provider = await createVoiceFromSample({
    name: label,
    buffer,
    mimeType,
    filename: `sample.${ext}`,
    samplePath
  });

  const voice = {
    id: voiceId,
    label,
    provider: provider.provider,
    providerVoiceId: provider.providerVoiceId,
    createdAt: Date.now()
  };
  await saveVoice(voice);

  return c.json({
    voiceId: voice.id,
    label: voice.label,
    provider: voice.provider
  });
});

api.get("/voices/:voiceId", async (c) => {
  const voice = await getVoice(c.req.param("voiceId"));
  if (!voice) return c.json({ error: "Voice not found." }, 404);
  return c.json({
    voiceId: voice.id,
    label: voice.label,
    provider: voice.provider,
    createdAt: voice.createdAt
  });
});

/**
 * Prepare story audio (async). Returns cached audio immediately when ready,
 * otherwise returns a job id to poll.
 */
api.post("/stories/prepare", async (c) => {
  const payload = await c.req.json();
  const voiceId = String(payload.voiceId || "").trim();
  const storyId = String(payload.storyId || "").trim();
  const locale = String(payload.locale || "en").trim();
  const text = String(payload.text || "").trim();

  if (!voiceId || !storyId || !text) {
    return c.json({ error: "voiceId, storyId, and text are required." }, 400);
  }

  const voice = await getVoice(voiceId);
  if (!voice) return c.json({ error: "Voice not found." }, 404);

  const cacheKey = storyCacheKey(
    voiceId,
    storyId,
    locale,
    text,
    config.storyAudioStyle
  );
  const existing = await getStoryAudioPath(cacheKey);
  if (existing) {
    return c.json({
      status: "ready",
      cacheKey,
      audioUrl: `/api/stories/audio/${cacheKey}`
    });
  }

  const job = await createStoryJob({ voiceId, storyId, locale, text });
  return c.json(
    {
      status: "processing",
      jobId: job.id,
      cacheKey,
      audioUrl: `/api/stories/audio/${cacheKey}`
    },
    202
  );
});

api.get("/jobs/:jobId", async (c) => {
  try {
    const job = await getJobStatus(c.req.param("jobId"));
    if (!job) return c.json({ error: "Job not found." }, 404);
    return c.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      cacheKey: job.cacheKey,
      audioUrl: job.status === "ready" ? `/api/stories/audio/${job.cacheKey}` : null
    });
  } catch (err) {
    console.error("Job status read failed:", err);
    return c.json({ error: "Could not read job status." }, 500);
  }
});

api.get("/stories/audio/:cacheKey", async (c) => {
  const filePath = await getStoryAudioPath(c.req.param("cacheKey"));
  if (!filePath) return c.json({ error: "Audio not ready yet." }, 404);
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const contentType = ext === "wav" ? "audio/wav" : "audio/mpeg";
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
});

/** Quick TTS preview (short phrase) — optional before save on client. */
api.post("/voices/:voiceId/preview", async (c) => {
  try {
    const voice = await getVoice(c.req.param("voiceId"));
    if (!voice) return c.json({ error: "Voice not found." }, 404);

    const payload = await c.req.json().catch(() => ({}));
    const text = String(
      payload.text ||
        "Hello, my little one… once upon a time, there was a cosy story just for you."
    ).trim();

    const audio = await synthesizeSpeech({
      providerVoiceId: voice.providerVoiceId,
      text,
      language: toXttsLanguage(payload.language),
      speed: config.xttsStorySpeed,
      temperature: config.xttsStoryTemperature,
      style: "bedtime"
    });

    const previewKey = "preview-" + crypto.randomBytes(6).toString("hex");
    await saveStoryAudio(previewKey, audio, getAudioFormat());

    return c.json({
      audioUrl: `/api/stories/audio/${previewKey}`,
      text
    });
  } catch (err) {
    const message = err.message || String(err);
    const hint = message.includes("FFmpeg") || message.includes("torchcodec")
      ? message
      : message.slice(0, 500);
    console.error("Preview failed:", err);
    return c.json({ error: hint }, 500);
  }
});

export default api;
