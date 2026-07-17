/* User-written stories — saved on this device (IndexedDB) */
(function (global) {
  "use strict";

  const DB_NAME = "tapRoarStories";
  const DB_VERSION = 1;
  const MAX_TITLE = 60;
  const MAX_BODY = 4000;
  let db = null;

  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const database = ev.target.result;
        if (!database.objectStoreNames.contains("stories")) {
          database.createObjectStore("stories", { keyPath: "id" });
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

  function newId() {
    return "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Split body into narration segments (paragraphs). */
  function bodyToSegments(body) {
    const chunks = String(body || "")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!chunks.length) return [];

    return chunks.map((text, i) => {
      const seg = { text };
      const letterMatch = text.match(/^([A-Za-z])\s+is\s+for\b/i);
      if (letterMatch) seg.letter = letterMatch[1].toUpperCase();
      if (i < chunks.length - 1) seg.pauseAfter = 700;
      return seg;
    });
  }

  function toStory(record) {
    if (!record) return null;
    return {
      id: record.id,
      title: record.title,
      source: record.source || "Your story",
      custom: true,
      segments: record.segments || bodyToSegments(record.body)
    };
  }

  async function list() {
    const store = await tx("stories", "readonly");
    const rows = await reqToPromise(store.getAll());
    rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return rows;
  }

  async function listAsStories() {
    const rows = await list();
    return rows.map(toStory).filter((s) => s && s.segments && s.segments.length);
  }

  async function get(id) {
    const store = await tx("stories", "readonly");
    return reqToPromise(store.get(id));
  }

  async function save({ id, title, body, source }) {
    const trimmedTitle = String(title || "").trim().slice(0, MAX_TITLE);
    const trimmedBody = String(body || "").trim().slice(0, MAX_BODY);
    if (!trimmedTitle) throw new Error("title_required");
    const segments = bodyToSegments(trimmedBody);
    if (!segments.length) throw new Error("body_required");

    const now = Date.now();
    const record = {
      id: id || newId(),
      title: trimmedTitle,
      body: trimmedBody,
      segments,
      source: source || "Your story",
      updatedAt: now,
      createdAt: id ? (await get(id))?.createdAt || now : now
    };

    const store = await tx("stories", "readwrite");
    await reqToPromise(store.put(record));
    return record;
  }

  async function remove(id) {
    const store = await tx("stories", "readwrite");
    await reqToPromise(store.delete(id));
  }

  global.TapRoarCustomStories = {
    list,
    listAsStories,
    get,
    save,
    remove,
    toStory,
    bodyToSegments,
    MAX_TITLE,
    MAX_BODY
  };
})(window);
