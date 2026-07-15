/* Story player: TTS + family recordings + name parade */
(function (global) {
  "use strict";

  let playing = false;
  let stopRequested = false;
  let mediaRecorder = null;
  let recordChunks = [];
  let audioEl = null;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function speak(text, lang) {
    return new Promise((resolve) => {
      if (stopRequested || !text) {
        resolve();
        return;
      }
      if (!window.speechSynthesis) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.92;
      u.pitch = 1.05;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }

  function buildNameParadeSegments(name, pack, animalByLetter) {
    const letters = name
      .toUpperCase()
      .split("")
      .filter((ch) => animalByLetter[ch]);
    const np = pack.nameParade;
    const fill = global.TapRoarLocale.fill;
    const segments = [{ text: fill(np.intro, { name }) }];
    letters.forEach((letter) => {
      const animal = animalByLetter[letter];
      segments.push({
        text: fill(np.letterLine, { letter, animal: animal.name }),
        letter,
        pauseAfter: 1000
      });
    });
    segments.push({ text: fill(np.outro, { name }), pauseAfter: 400 });
    return segments;
  }

  async function playSegments(segments, opts) {
    const lang = opts.speechLang;
    playing = true;
    stopRequested = false;

    for (const seg of segments) {
      if (stopRequested) break;
      if (opts.onSegment) opts.onSegment(seg);
      if (seg.letter && opts.onLetter) opts.onLetter(seg.letter);
      await speak(seg.text, lang);
      if (seg.pauseAfter) await wait(seg.pauseAfter);
    }

    playing = false;
    if (opts.onDone) opts.onDone();
  }

  async function playStory(story, opts) {
    stop();

    if (story.type === "name-parade") {
      const name = (opts.childName || "").trim();
      if (!name) {
        if (opts.onError) opts.onError(global.TapRoarLocale.t("lettersOnly"));
        return;
      }
      const segments = buildNameParadeSegments(name, global.TapRoarLocale.pack, opts.animalByLetter);
      return playSegments(segments, opts);
    }

    if (opts.voiceId && opts.voiceId !== "default") {
      const rec = await global.TapRoarVoices.getRecording(opts.voiceId, story.id);
      if (rec && rec.blob) {
        return playRecordingBlob(rec.blob, opts);
      }
    }

    return playSegments(story.segments || [], opts);
  }

  function playRecordingBlob(blob, opts) {
    return new Promise((resolve) => {
      stop();
      playing = true;
      stopRequested = false;
      audioEl = new Audio(URL.createObjectURL(blob));
      audioEl.onended = () => {
        playing = false;
        if (opts.onDone) opts.onDone();
        resolve();
      };
      audioEl.onerror = () => {
        playing = false;
        if (opts.onDone) opts.onDone();
        resolve();
      };
      audioEl.play().catch(() => {
        playing = false;
        if (opts.onDone) opts.onDone();
        resolve();
      });
    });
  }

  function stop() {
    stopRequested = true;
    playing = false;
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (audioEl) {
      audioEl.pause();
      audioEl = null;
    }
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }

  function isPlaying() {
    return playing;
  }

  async function startRecording(onStatus) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) recordChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorder.start();
    if (onStatus) onStatus("recording");
  }

  async function stopRecordingAndSave(voiceId, storyId) {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder) {
        reject(new Error("No recording"));
        return;
      }
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordChunks, { type: "audio/webm" });
        recordChunks = [];
        mediaRecorder = null;
        try {
          await global.TapRoarVoices.saveRecording(voiceId, storyId, blob);
          resolve(blob);
        } catch (e) {
          reject(e);
        }
      };
      mediaRecorder.stop();
    });
  }

  global.TapRoarStories = {
    playStory,
    stop,
    isPlaying,
    startRecording,
    stopRecordingAndSave,
    buildNameParadeSegments
  };
})(window);
