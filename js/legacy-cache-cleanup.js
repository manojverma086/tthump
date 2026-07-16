/* One-time cleanup of the old in-browser Chatterbox model (~400 MB in Cache Storage). */
(function (global) {
  "use strict";

  const FLAG = "tapRoarChatterboxCacheCleared";

  async function clearLegacyChatterboxCache() {
    if (localStorage.getItem(FLAG)) return;
    try {
      if ("caches" in global) {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter(
              (name) =>
                /transformers|chatterbox|onnx-community|huggingface/i.test(name)
            )
            .map((name) => caches.delete(name))
        );
      }
      if ("indexedDB" in global) {
        const dbs = ["transformers-cache", "onnx-cache", "chatterbox-cache"];
        await Promise.all(
          dbs.map(
            (name) =>
              new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
              })
          )
        );
      }
    } catch (err) {
      console.warn("Legacy voice model cache cleanup skipped:", err);
    }
    localStorage.setItem(FLAG, "1");
  }

  clearLegacyChatterboxCache();
})(window);
