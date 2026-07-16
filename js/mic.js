/* Microphone helpers — secure context, Safari mime types, reliable recording */
(function (global) {
  "use strict";

  const SLICE_MS = 500;

  function checkMicSupport() {
    if (!window.isSecureContext) {
      return "Microphone needs HTTPS or http://localhost — not file:// or a LAN IP like http://192.168.x.x.";
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      return "This browser does not support microphone recording.";
    }
    if (typeof MediaRecorder === "undefined") {
      return "Recording not supported here. Try Chrome, Edge, or Safari 14+.";
    }
    return null;
  }

  function pickMimeType() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac",
      "audio/ogg;codecs=opus"
    ];
    for (let i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function micErrorMessage(err) {
    if (!err) return "Could not access microphone.";
    if (typeof err === "string") return err;
    const name = err.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Microphone blocked. Use the lock icon in the address bar → Allow microphone → refresh.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No microphone found. Mac Mini and many desktops need a USB mic or headset — or upload a voice sample below.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Microphone busy in another app. Close it and try again.";
    }
    return err.message || "Could not access microphone.";
  }

  function blobTypeFromMime(mime) {
    if (!mime) return "audio/webm";
    if (mime.indexOf("mp4") !== -1 || mime.indexOf("aac") !== -1) return "audio/mp4";
    if (mime.indexOf("ogg") !== -1) return "audio/ogg";
    return "audio/webm";
  }

  async function openMicStream() {
    const blocked = checkMicSupport();
    if (blocked) throw new Error(blocked);
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
  }

  function createRecorder(stream) {
    const mime = pickMimeType();
    try {
      return mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      return new MediaRecorder(stream);
    }
  }

  /** Start recording; returns { stop, cancel } — call stop() from the same button click flow. */
  async function beginSession() {
    const stream = await openMicStream();
    const chunks = [];
    const mime = pickMimeType();
    const recorder = createRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    try {
      recorder.start(SLICE_MS);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }

    function cleanupStream() {
      stream.getTracks().forEach((t) => t.stop());
    }

    function stopTracksAndBlob() {
      return new Promise((resolve, reject) => {
        if (recorder.state === "inactive") {
          cleanupStream();
          reject(new Error("Recorder already stopped."));
          return;
        }

        recorder.onstop = () => {
          cleanupStream();
          const type = blobTypeFromMime(mime);
          const blob = new Blob(chunks, { type: type });
          if (blob.size < 200) {
            reject(
              new Error(
                "Recording was empty. Speak for at least 3 seconds, then tap Stop."
              )
            );
            return;
          }
          resolve(blob);
        };

        try {
          if (typeof recorder.requestData === "function") recorder.requestData();
        } catch (ignore) {}
        recorder.stop();
      });
    }

    return {
      stop: stopTracksAndBlob,
      cancel: () => {
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch (ignore) {}
        cleanupStream();
      }
    };
  }

  async function blobFromFile(file) {
    if (!file) throw new Error("No file selected.");
    const type = (file.type || "").toLowerCase();
    if (type && !type.startsWith("audio/")) {
      throw new Error("Please choose an audio file (M4A, MP3, WAV, or WebM).");
    }
    if (file.size < 1000) {
      throw new Error("That file looks too short. Use at least 5 seconds of speech.");
    }
    return file;
  }

  global.TapRoarMic = {
    checkMicSupport,
    micErrorMessage,
    openMicStream,
    createRecorder,
    blobTypeFromMime,
    pickMimeType,
    beginSession,
    blobFromFile
  };
})(window);
