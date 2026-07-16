import crypto from "node:crypto";

export async function createVoiceFromSample({ name }) {
  return {
    providerVoiceId: "mock-" + crypto.randomBytes(6).toString("hex"),
    provider: "mock"
  };
}

/** Tiny valid silent MP3-ish stub for local UI testing without API keys. */
export async function synthesizeSpeech({ text }) {
  const phrase = String(text || "").slice(0, 80);
  const payload = Buffer.from(
    `MOCK-AUDIO:${phrase.length}:${crypto.createHash("md5").update(phrase).digest("hex")}`,
    "utf8"
  );
  return payload;
}
