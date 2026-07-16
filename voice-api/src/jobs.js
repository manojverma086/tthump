import crypto from "node:crypto";
import { config } from "./config.js";
import { getAudioFormat, synthesizeSpeech } from "./providers/index.js";
import { getJob, getVoice, saveJob, saveStoryAudio, storyCacheKey } from "./storage.js";

const active = new Set();

/** Map app locale codes to XTTS language codes. */
const LOCALE_TO_XTTS = {
  en: "en",
  hi: "hi",
  es: "es",
  fr: "fr",
  de: "de",
  ja: "ja",
  pt: "pt"
};

function toXttsLanguage(locale) {
  const code = String(locale || "en").trim().toLowerCase();
  return LOCALE_TO_XTTS[code] || code || "en";
}

export { toXttsLanguage };

export function newJobId() {
  return "job-" + crypto.randomBytes(8).toString("hex");
}

export async function createStoryJob({ voiceId, storyId, locale, text }) {
  const jobId = newJobId();
  const cacheKey = storyCacheKey(
    voiceId,
    storyId,
    locale,
    text,
    config.storyAudioStyle
  );
  const job = {
    id: jobId,
    type: "story",
    status: "queued",
    progress: 0,
    voiceId,
    storyId,
    locale: locale || "en",
    cacheKey,
    text,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await saveJob(job);
  queueMicrotask(() => runStoryJob(jobId));
  return job;
}

async function runStoryJob(jobId) {
  if (active.has(jobId)) return;
  active.add(jobId);

  let job = await getJob(jobId);
  if (!job) {
    active.delete(jobId);
    return;
  }

  try {
    job.status = "processing";
    job.progress = 10;
    job.updatedAt = Date.now();
    await saveJob(job);

    const voice = await getVoice(job.voiceId);
    if (!voice) throw new Error("Voice not found.");

    job.progress = 35;
    job.updatedAt = Date.now();
    await saveJob(job);

    const audio = await synthesizeSpeech({
      providerVoiceId: voice.providerVoiceId,
      text: job.text,
      language: toXttsLanguage(job.locale),
      speed: config.xttsStorySpeed,
      temperature: config.xttsStoryTemperature,
      style: "bedtime"
    });

    job.progress = 85;
    job.updatedAt = Date.now();
    await saveJob(job);

    await saveStoryAudio(job.cacheKey, audio, getAudioFormat());

    job.status = "ready";
    job.progress = 100;
    job.updatedAt = Date.now();
    await saveJob(job);
  } catch (err) {
    job.status = "failed";
    const message = err.message || String(err);
    job.error = message.length > 500 ? message.slice(0, 500) + "…" : message;
    job.updatedAt = Date.now();
    await saveJob(job);
  } finally {
    active.delete(jobId);
  }
}

export async function getJobStatus(jobId) {
  return getJob(jobId);
}
