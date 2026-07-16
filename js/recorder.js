/* Shared MediaRecorder session — one mic stream, reliable chunks on Chrome/Safari */
(function (global) {
  "use strict";

  const TIMESLICE_MS = 250;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let mime = "";

  function attachHandlers(rec) {
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
  }

  async function start() {
    stopTracks();
    chunks = [];
    stream = await global.TapRoarMic.openMicStream();
    mime = global.TapRoarMic.pickMimeType();
    recorder = global.TapRoarMic.createRecorder(stream);
    recorder._tapRoarMime = mime;
    attachHandlers(recorder);
    recorder.start(TIMESLICE_MS);
  }

  function stopTracks() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    recorder = null;
    chunks = [];
  }

  function isActive() {
    return recorder && recorder.state === "recording";
  }

  async function stopAndGetBlob() {
    return new Promise((resolve, reject) => {
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("No active recording"));
        return;
      }
      const activeRecorder = recorder;
      const activeMime = activeRecorder._tapRoarMime || mime || global.TapRoarMic.pickMimeType();

      activeRecorder.onstop = () => {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
        }
        recorder = null;
        const blob = new Blob(chunks, { type: global.TapRoarMic.blobTypeFromMime(activeMime) });
        chunks = [];
        if (!blob.size) {
          reject(new Error("Recording was empty. Hold Stop after speaking for at least 2 seconds."));
          return;
        }
        resolve(blob);
      };

      try {
        if (typeof activeRecorder.requestData === "function") {
          activeRecorder.requestData();
        }
      } catch (e) {
        /* ignore */
      }
      activeRecorder.stop();
    });
  }

  global.TapRoarRecorder = {
    start,
    stopAndGetBlob,
    isActive,
    stopTracks
  };
})(window);
