/* Tap & Roar ↔ voice-api backend (fast narration, optional). */
(function (global) {
  "use strict";

  const STORAGE_KEY = "tapRoarVoiceApi";
  const DEFAULT_LOCAL = "http://127.0.0.1:8787";

  function inferDefaultUrl() {
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return DEFAULT_LOCAL;
    return "";
  }

  function baseUrl() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored != null ? stored : inferDefaultUrl()).replace(/\/$/, "");
  }

  function enabled() {
    return !!baseUrl();
  }

  function setBaseUrl(url) {
    if (!url) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, url.replace(/\/$/, ""));
  }

  async function request(path, options) {
    const url = baseUrl() + path;
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      const hint =
        "Could not reach the voice server at " +
        baseUrl() +
        ". Start voice-api (port 8787) and XTTS (port 5002), then refresh.";
      throw new Error(hint);
    }
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const body = isJson ? await res.json() : null;
    if (!res.ok) {
      throw new Error((body && body.error) || res.statusText || "Voice API request failed.");
    }
    return { res, body };
  }

  async function health() {
    const { body } = await request("/api/health");
    return body;
  }

  async function registerVoice(label, blob) {
    const form = new FormData();
    form.append("label", label);
    form.append("file", blob, "sample.webm");
    const { body } = await request("/api/voices", { method: "POST", body: form });
    return body;
  }

  async function prepareStory({ voiceId, storyId, locale, text, segmentIndex }) {
    const sid =
      segmentIndex != null && segmentIndex >= 0
        ? storyId + "::seg-" + segmentIndex
        : storyId;
    const { res, body } = await request("/api/stories/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, storyId: sid, locale, text })
    });
    return { status: res.status, ...body };
  }

  /** Start synthesis job on the server (does not wait for audio). */
  async function kickSegmentPrepare(opts) {
    return prepareStory(opts);
  }

  async function pollJob(jobId, onProgress, intervalMs) {
    const wait = intervalMs || 1200;
    while (true) {
      const { body } = await request("/api/jobs/" + encodeURIComponent(jobId));
      if (onProgress) onProgress(body);
      if (body.status === "ready") return body;
      if (body.status === "failed") throw new Error(body.error || "Story generation failed.");
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  function audioUrl(cacheKeyOrPath) {
    if (!cacheKeyOrPath) return "";
    if (cacheKeyOrPath.startsWith("http")) return cacheKeyOrPath;
    if (cacheKeyOrPath.startsWith("/api/")) return baseUrl() + cacheKeyOrPath;
    return baseUrl() + "/api/stories/audio/" + cacheKeyOrPath;
  }

  async function ensureStoryAudio(opts) {
    const prep = await prepareStory({
      voiceId: opts.voiceId,
      storyId: opts.storyId,
      locale: opts.locale,
      text: opts.text,
      segmentIndex: opts.segmentIndex
    });
    if (prep.status === "ready" && prep.audioUrl) {
      return { audioUrl: audioUrl(prep.audioUrl), cacheKey: prep.cacheKey };
    }
    if (prep.jobId) {
      const done = await pollJob(prep.jobId, opts.onProgress);
      return { audioUrl: audioUrl(done.audioUrl), cacheKey: done.cacheKey };
    }
    throw new Error("Unexpected prepare response.");
  }

  async function previewVoice(voiceId, opts) {
    const text = (opts && opts.text) || undefined;
    const locale = (opts && opts.locale) || undefined;
    const { body } = await request("/api/voices/" + encodeURIComponent(voiceId) + "/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text || undefined, language: locale })
    });
    return { audioUrl: audioUrl(body.audioUrl), text: body.text };
  }

  async function fetchAudioBlob(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load story audio.");
    return res.blob();
  }

  global.TapRoarVoiceApi = {
    enabled,
    setBaseUrl,
    baseUrl,
    health,
    registerVoice,
    prepareStory,
    pollJob,
    kickSegmentPrepare,
    ensureStoryAudio,
    previewVoice,
    fetchAudioBlob,
    audioUrl
  };
})(window);
