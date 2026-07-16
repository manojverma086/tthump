import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

const VOICES_FILE = "voices.json";
const JOBS_FILE = "jobs.json";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    if (err instanceof SyntaxError) {
      console.warn(`Resetting corrupt JSON store: ${filePath} (${err.message})`);
      await writeJson(filePath, fallback);
      return fallback;
    }
    throw err;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function initStorage() {
  await ensureDir(config.dataDir);
  await ensureDir(path.join(config.dataDir, "samples"));
  await ensureDir(path.join(config.dataDir, "audio"));
  await ensureDir(path.join(config.dataDir, "jobs"));
}

function voicesPath() {
  return path.join(config.dataDir, VOICES_FILE);
}

function jobsPath() {
  return path.join(config.dataDir, JOBS_FILE);
}

export function storyCacheKey(voiceId, storyId, locale, text, styleTag) {
  const parts = [voiceId, storyId, locale || "en", styleTag || "v1"];
  if (text) {
    parts.push(
      crypto.createHash("sha256").update(text).digest("hex").slice(0, 16)
    );
  }
  return crypto.createHash("sha256").update(parts.join("::")).digest("hex").slice(0, 24);
}

export async function listVoices() {
  const db = await readJson(voicesPath(), { voices: [] });
  return db.voices;
}

export async function getVoice(voiceId) {
  const voices = await listVoices();
  return voices.find((v) => v.id === voiceId) || null;
}

export async function saveVoice(voice) {
  const db = await readJson(voicesPath(), { voices: [] });
  const idx = db.voices.findIndex((v) => v.id === voice.id);
  if (idx >= 0) db.voices[idx] = voice;
  else db.voices.push(voice);
  await writeJson(voicesPath(), db);
  return voice;
}

export async function saveSampleFile(voiceId, buffer, ext) {
  const filePath = path.join(config.dataDir, "samples", `${voiceId}.${ext || "webm"}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function saveStoryAudio(cacheKey, buffer, ext = "mp3") {
  const filePath = path.join(config.dataDir, "audio", `${cacheKey}.${ext}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function getStoryAudioPath(cacheKey) {
  for (const ext of ["mp3", "wav"]) {
    const filePath = path.join(config.dataDir, "audio", `${cacheKey}.${ext}`);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // try next extension
    }
  }
  return null;
}

export async function getJob(jobId) {
  const db = await readJson(jobsPath(), { jobs: {} });
  return db.jobs[jobId] || null;
}

export async function saveJob(job) {
  const db = await readJson(jobsPath(), { jobs: {} });
  db.jobs[job.id] = job;
  await writeJson(jobsPath(), db);
  return job;
}

export async function deleteJob(jobId) {
  const db = await readJson(jobsPath(), { jobs: {} });
  delete db.jobs[jobId];
  await writeJson(jobsPath(), db);
}
