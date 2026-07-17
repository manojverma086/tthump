/* Family voice profiles + per-story recordings (IndexedDB, device-local) */
(function (global) {
  "use strict";

  const DB_NAME = "tapRoarVoices";
  const DB_VERSION = 2;
  const PROFILE_SAMPLE = "__profile__";
  const FULL_STORY = "__full__";
  let db = null;

  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const database = ev.target.result;
        if (!database.objectStoreNames.contains("voices")) {
          database.createObjectStore("voices", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("recordings")) {
          database.createObjectStore("recordings", { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return openDb().then((database) => database.transaction(store, mode).objectStore(store));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function recordingKey(voiceId, storyId) {
    return voiceId + "::" + storyId;
  }

  function segmentKey(voiceId, storyId, index) {
    return voiceId + "::" + storyId + "::seg-" + index;
  }

  function isSegmentKey(storyId) {
    return String(storyId).indexOf("::seg-") !== -1;
  }

  async function blobToStored(blob) {
    return {
      data: await blob.arrayBuffer(),
      mimeType: blob.type || "audio/webm"
    };
  }

  function storedToBlob(rec) {
    if (!rec) return null;
    if (rec.blob instanceof Blob) return rec.blob;
    if (rec.data) {
      return new Blob([rec.data], { type: rec.mimeType || "audio/webm" });
    }
    return null;
  }

  async function normalizeRecording(rec) {
    if (!rec) return null;
    const blob = storedToBlob(rec);
    if (!blob || !blob.size) return null;
    return { voiceId: rec.voiceId, storyId: rec.storyId, blob, updatedAt: rec.updatedAt };
  }

  async function listVoices() {
    const store = await tx("voices", "readonly");
    return reqToPromise(store.getAll());
  }

  async function saveVoice(voice) {
    const store = await tx("voices", "readwrite");
    return reqToPromise(store.put(voice));
  }

  async function deleteVoice(id) {
    const store = await tx("voices", "readwrite");
    await reqToPromise(store.delete(id));
    const recStore = await tx("recordings", "readwrite");
    const all = await reqToPromise(recStore.getAll());
    await Promise.all(
      all.filter((r) => r.voiceId === id).map((r) => reqToPromise(recStore.delete(r.key)))
    );
  }

  async function getRecording(voiceId, storyId) {
    const store = await tx("recordings", "readonly");
    const rec = await reqToPromise(store.get(recordingKey(voiceId, storyId)));
    return normalizeRecording(rec);
  }

  async function saveRecording(voiceId, storyId, blob) {
    if (!blob || !blob.size) throw new Error("Recording is empty");
    const stored = await blobToStored(blob);
    const store = await tx("recordings", "readwrite");
    return reqToPromise(
      store.put({
        key: recordingKey(voiceId, storyId),
        voiceId,
        storyId,
        data: stored.data,
        mimeType: stored.mimeType,
        updatedAt: Date.now()
      })
    );
  }

  async function saveProfileSample(voiceId, blob) {
    return saveRecording(voiceId, PROFILE_SAMPLE, blob);
  }

  async function getProfileSample(voiceId) {
    return getRecording(voiceId, PROFILE_SAMPLE);
  }

  async function getFullStoryRecording(voiceId, storyId) {
    return getRecording(voiceId, FULL_STORY + "::" + storyId);
  }

  async function saveFullStoryRecording(voiceId, storyId, blob) {
    return saveRecording(voiceId, FULL_STORY + "::" + storyId, blob);
  }

  async function hasFullStory(voiceId, storyId) {
    const rec = await getFullStoryRecording(voiceId, storyId);
    return !!(rec && rec.blob && rec.blob.size);
  }

  async function getSegmentRecording(voiceId, storyId, index) {
    return getRecording(voiceId, storyId + "::seg-" + index);
  }

  async function saveSegmentRecording(voiceId, storyId, index, blob) {
    return saveRecording(voiceId, storyId + "::seg-" + index, blob);
  }

  async function hasAllSegments(voiceId, storyId, segmentCount) {
    for (let i = 0; i < segmentCount; i++) {
      const rec = await getSegmentRecording(voiceId, storyId, i);
      if (!rec || !rec.blob) return false;
    }
    return segmentCount > 0;
  }

  async function deleteStorySynth(voiceId, storyId, segmentCount) {
    const recStore = await tx("recordings", "readwrite");
    const keys = [recordingKey(voiceId, storyId)];
    for (let i = 0; i < segmentCount; i++) keys.push(segmentKey(voiceId, storyId, i));
    await Promise.all(keys.map((key) => reqToPromise(recStore.delete(key))));
  }

  async function hasProfileSample(voiceId) {
    const rec = await getProfileSample(voiceId);
    return !!(rec && rec.blob && rec.blob.size);
  }

  async function createVoice(label) {
    const voice = {
      id: "voice-" + Date.now(),
      label: label.trim() || "Family",
      createdAt: Date.now(),
      apiVoiceId: null
    };
    await saveVoice(voice);
    return voice;
  }

  async function ensureApiVoice(voiceId) {
    const voices = await listVoices();
    const voice = voices.find((v) => v.id === voiceId);
    if (!voice) throw new Error("Voice not found.");
    if (voice.apiVoiceId) return voice.apiVoiceId;
    if (!global.TapRoarVoiceApi || !global.TapRoarVoiceApi.enabled()) {
      throw new Error("Voice API is not configured.");
    }
    const sample = await getProfileSample(voiceId);
    if (!sample || !sample.blob) {
      throw new Error("Record a family voice sample first.");
    }
    const reg = await global.TapRoarVoiceApi.registerVoice(voice.label, sample.blob);
    voice.apiVoiceId = reg.voiceId;
    await saveVoice(voice);
    return voice.apiVoiceId;
  }

  async function attachApiVoice(localVoiceId, apiVoiceId) {
    const voices = await listVoices();
    const voice = voices.find((v) => v.id === localVoiceId);
    if (!voice) return;
    voice.apiVoiceId = apiVoiceId;
    await saveVoice(voice);
  }

  global.TapRoarVoices = {
    listVoices,
    saveVoice,
    deleteVoice,
    createVoice,
    getRecording,
    saveRecording,
    saveProfileSample,
    getProfileSample,
    hasProfileSample,
    getFullStoryRecording,
    saveFullStoryRecording,
    hasFullStory,
    getSegmentRecording,
    saveSegmentRecording,
    hasAllSegments,
    deleteStorySynth,
    ensureApiVoice,
    attachApiVoice,
    segmentKey,
    FULL_STORY,
    PROFILE_SAMPLE
  };
})(window);
