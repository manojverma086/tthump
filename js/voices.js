/* Family voice profiles + per-story recordings (IndexedDB, device-local) */
(function (global) {
  "use strict";

  const DB_NAME = "tapRoarVoices";
  const DB_VERSION = 1;
  let db = null;

  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
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

  function recordingKey(voiceId, storyId) {
    return voiceId + "::" + storyId;
  }

  async function getRecording(voiceId, storyId) {
    const store = await tx("recordings", "readonly");
    return reqToPromise(store.get(recordingKey(voiceId, storyId)));
  }

  async function saveRecording(voiceId, storyId, blob) {
    const store = await tx("recordings", "readwrite");
    return reqToPromise(
      store.put({
        key: recordingKey(voiceId, storyId),
        voiceId,
        storyId,
        blob,
        updatedAt: Date.now()
      })
    );
  }

  async function createVoice(label) {
    const voice = {
      id: "voice-" + Date.now(),
      label: label.trim() || "Family",
      createdAt: Date.now()
    };
    await saveVoice(voice);
    return voice;
  }

  global.TapRoarVoices = {
    listVoices,
    saveVoice,
    deleteVoice,
    createVoice,
    getRecording,
    saveRecording
  };
})(window);
