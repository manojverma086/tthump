/* Story player: Friendly voice (browser TTS) or family voice via voice-api + XTTS */
(function (global) {
  "use strict";

  /** Toddler bedtime reading — slower, softer, with breathing room. */
  const BEDTIME = {
    rate: { hi: 0.74, en: 0.76, default: 0.76 },
    pitch: { hi: 1.08, en: 1.1, default: 1.1 },
    volume: 0.92,
    introPauseMs: 700,
    segmentPauseExtraMs: 450,
    pauseMultiplier: 1.45,
    clonedPlaybackRate: 0.92,
    segmentJoiner: " ... ",
    bufferAhead: 2
  };

  let playing = false;
  let stopRequested = false;
  let audioEl = null;
  let audioObjectUrl = null;
  let syncTimers = [];
  let voicesPromise = null;
  let prefetchGeneration = 0;
  /** @type {Map<string, Promise<Blob>>} */
  const segmentBlobCache = new Map();

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function loadSpeechVoices() {
    if (!window.speechSynthesis) return Promise.resolve([]);
    if (voicesPromise) return voicesPromise;
    voicesPromise = new Promise((resolve) => {
      const finish = () => resolve(speechSynthesis.getVoices());
      const list = speechSynthesis.getVoices();
      if (list.length) return resolve(list);
      speechSynthesis.addEventListener("voiceschanged", () => finish(), { once: true });
      setTimeout(finish, 400);
    });
    return voicesPromise;
  }

  function bedtimeRate(lang) {
    const base = (lang || "en").split("-")[0].toLowerCase();
    return BEDTIME.rate[base] ?? BEDTIME.rate.default;
  }

  function bedtimePitch(lang) {
    const base = (lang || "en").split("-")[0].toLowerCase();
    return BEDTIME.pitch[base] ?? BEDTIME.pitch.default;
  }

  function scoreSpeechVoice(voice, lang) {
    const base = lang.split("-")[0].toLowerCase();
    const tag = (voice.lang || "").toLowerCase();
    const name = (voice.name || "").toLowerCase();
    let score = 0;
    if (tag === lang.toLowerCase()) score += 12;
    else if (tag.startsWith(base)) score += 8;
    if (base === "hi") {
      if (/lekha|heera|neel|hindi|india|google.*hi|microsoft.*hi/.test(name)) score += 24;
      if (/english|en-us|en-gb|uk|us|australia|siri.*english/.test(name)) score -= 20;
    }
    if (base === "en") {
      if (/samantha|karen|moira|tessa|serena|fiona|martha|victoria|allison|ava|susan|zira/.test(name)) {
        score += 20;
      }
      if (/daniel|alex|fred|tom|lee|ralph|news|compact|enhanced|premium|nathan|aaron/.test(name)) {
        score -= 18;
      }
    }
    if (/child|kids|gentle|warm|soft|friendly/.test(name)) score += 8;
    if (voice.localService) score += 2;
    return score;
  }

  async function pickSpeechVoice(lang) {
    const voices = await loadSpeechVoices();
    if (!voices.length) return null;
    let best = null;
    let bestScore = -999;
    voices.forEach((voice) => {
      const score = scoreSpeechVoice(voice, lang);
      if (score > bestScore) {
        bestScore = score;
        best = voice;
      }
    });
    return best;
  }

  function clearSyncTimers() {
    syncTimers.forEach(clearTimeout);
    syncTimers = [];
  }

  async function speak(text, lang) {
    if (stopRequested || !text) return;
    if (!window.speechSynthesis) return;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = bedtimeRate(lang);
    u.pitch = bedtimePitch(lang);
    u.volume = BEDTIME.volume;
    const voice = await pickSpeechVoice(lang);
    if (voice) u.voice = voice;

    await new Promise((resolve) => {
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }

  function softenLine(text) {
    return String(text || "")
      .trim()
      .replace(/!+$/g, ".")
      .replace(/\?+$/g, "?");
  }

  function segmentPauseMs(seg, isRhyme) {
    const mult = isRhyme ? 1.08 : BEDTIME.pauseMultiplier;
    const extra = isRhyme ? 300 : BEDTIME.segmentPauseExtraMs;
    const base = seg.pauseAfter || extra;
    return Math.round(base * mult) + extra;
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
      const animalLabel =
        (pack.animalNames && pack.animalNames[letter]) || animal.name;
      segments.push({
        text: fill(np.letterLine, { letter, animal: animalLabel }),
        letter,
        pauseAfter: 1000
      });
    });
    segments.push({ text: fill(np.outro, { name }), pauseAfter: 400 });
    return segments;
  }

  function combineSegmentText(segments) {
    return segments
      .map((s) => softenLine(s.text))
      .filter(Boolean)
      .join(BEDTIME.segmentJoiner);
  }

  function scheduleSegmentSync(segments, durationSec, opts) {
    clearSyncTimers();
    const weights = segments.map((s) => Math.max(8, String(s.text || "").length));
    const total = weights.reduce((a, b) => a + b, 0);
    let offset = 0;

    segments.forEach((seg, i) => {
      const startMs = Math.floor(offset * 1000);
      syncTimers.push(
        setTimeout(() => {
          if (stopRequested) return;
          if (opts.onSegment) opts.onSegment(seg);
          if (seg.letter && opts.onLetter) opts.onLetter(seg.letter);
        }, startMs)
      );
      offset += (weights[i] / total) * durationSec;
    });
  }

  function releaseAudioUrl() {
    if (audioObjectUrl) {
      URL.revokeObjectURL(audioObjectUrl);
      audioObjectUrl = null;
    }
  }

  function resolvePrerecordedSrc(story, opts) {
    if (!global.TapRoarStoryAudio) return null;
    const locale =
      (global.TapRoarLocale && global.TapRoarLocale.activeLocale) || "en";
    const src = global.TapRoarStoryAudio.resolveStoryAudio(story, locale);
    if (!src || !global.TapRoarStoryAudio.isPrerecordedSrc(src)) return null;
    return src;
  }

  async function playFileUrl(url, segments, opts) {
    if (stopRequested) return;

    return new Promise((resolve, reject) => {
      releaseAudioUrl();
      audioEl = new Audio(url);
      audioEl.preservesPitch = true;
      audioEl.volume = BEDTIME.volume;
      audioEl.playbackRate = 1;

      const startSync = () => {
        if (stopRequested) return;
        if (segments.length && audioEl.duration && isFinite(audioEl.duration)) {
          scheduleSegmentSync(segments, audioEl.duration, opts);
        }
        if (opts.onPlaybackStart) opts.onPlaybackStart();
      };

      audioEl.onloadedmetadata = startSync;
      if (audioEl.readyState >= 1) startSync();

      audioEl.onended = () => {
        audioEl = null;
        clearSyncTimers();
        resolve();
      };
      audioEl.onerror = () => {
        audioEl = null;
        clearSyncTimers();
        reject(new Error("Could not play story audio."));
      };
      audioEl.play().catch((err) => {
        audioEl = null;
        clearSyncTimers();
        reject(err);
      });
    });
  }

  async function playPrerecorded(story, segments, opts) {
    const src = resolvePrerecordedSrc(story, opts);
    if (!src) return false;

    playing = true;
    stopRequested = false;

    try {
      await wait(BEDTIME.introPauseMs);
      await playFileUrl(src, segments, opts);
    } catch (err) {
      playing = false;
      clearSyncTimers();
      console.warn("Prerecorded audio failed, using TTS:", err.message || err);
      return false;
    }

    playing = false;
    clearSyncTimers();
    if (opts.onDone) opts.onDone();
    return true;
  }

  async function playBlobAndWait(blob) {
    return new Promise((resolve, reject) => {
      if (stopRequested) {
        resolve();
        return;
      }
      releaseAudioUrl();
      audioObjectUrl = URL.createObjectURL(blob);
      audioEl = new Audio(audioObjectUrl);
      audioEl.preservesPitch = true;
      audioEl.playbackRate = BEDTIME.clonedPlaybackRate;
      audioEl.volume = BEDTIME.volume;
      audioEl.onended = () => {
        audioEl = null;
        releaseAudioUrl();
        clearSyncTimers();
        resolve();
      };
      audioEl.onerror = () => {
        audioEl = null;
        releaseAudioUrl();
        clearSyncTimers();
        reject(new Error("Could not play story audio."));
      };
      audioEl.play().catch((err) => {
        audioEl = null;
        releaseAudioUrl();
        clearSyncTimers();
        reject(err);
      });
    });
  }

  async function playSegments(segments, opts) {
    const lang = opts.speechLang;
    const isRhyme = opts.contentType === "rhyme";
    playing = true;
    stopRequested = false;

    await wait(BEDTIME.introPauseMs);

    for (const seg of segments) {
      if (stopRequested) break;
      if (opts.onSegment) opts.onSegment(seg);
      if (seg.letter && opts.onLetter) opts.onLetter(seg.letter);
      await speak(softenLine(seg.text), lang);
      await wait(segmentPauseMs(seg, isRhyme));
    }

    playing = false;
    if (opts.onDone) opts.onDone();
  }

  function segmentCacheKey(apiVoiceId, storyId, locale, index) {
    return [apiVoiceId, storyId, locale, index].join("::");
  }

  function clearSegmentCache() {
    segmentBlobCache.clear();
    prefetchGeneration += 1;
  }

  function reportProgress(opts, info) {
    if (opts.onProgress) opts.onProgress(info);
  }

  function lineProgressDetail(n, total, buffering) {
    const t = global.TapRoarLocale.t;
    const key = buffering ? "voiceSynthBuffer" : "voiceSynthLine";
    const template = t(key);
    return global.TapRoarLocale.fill(template, { n: String(n), total: String(total) });
  }

  async function fetchSegmentBlob(apiVoiceId, storyId, locale, segments, index, opts, generation) {
    const key = segmentCacheKey(apiVoiceId, storyId, locale, index);
    if (segmentBlobCache.has(key)) {
      return segmentBlobCache.get(key);
    }

    const text = softenLine(segments[index].text);
    if (!text) return Promise.resolve(null);

    const promise = (async () => {
      const { audioUrl: url } = await global.TapRoarVoiceApi.ensureStoryAudio({
        voiceId: apiVoiceId,
        storyId,
        locale,
        text,
        segmentIndex: index,
        onProgress: (job) => {
          if (generation !== prefetchGeneration || stopRequested) return;
          reportProgress(opts, {
            phase: index === 0 ? "synth" : "buffer",
            title: global.TapRoarLocale.t("voiceSynthTitle"),
            detail: lineProgressDetail(index + 1, segments.length, index > 0),
            percent: typeof job.progress === "number" ? job.progress : null,
            busy: job.status !== "ready",
            indeterminate: job.progress == null
          });
        }
      });
      if (generation !== prefetchGeneration || stopRequested) {
        throw new Error("cancelled");
      }
      return global.TapRoarVoiceApi.fetchAudioBlob(url);
    })();

    segmentBlobCache.set(key, promise);
    promise.catch(() => segmentBlobCache.delete(key));
    return promise;
  }

  function warmSegmentBuffer(apiVoiceId, storyId, locale, segments, fromIndex, opts, generation) {
    const ahead = BEDTIME.bufferAhead;
    for (let i = fromIndex; i < Math.min(fromIndex + ahead, segments.length); i++) {
      const text = softenLine(segments[i].text);
      if (!text) continue;
      const key = segmentCacheKey(apiVoiceId, storyId, locale, i);
      if (!segmentBlobCache.has(key)) {
        fetchSegmentBlob(apiVoiceId, storyId, locale, segments, i, opts, generation).catch(() => {});
      }
    }
  }

  async function playClonedSegments(voiceId, storyId, segments, opts) {
    if (!global.TapRoarVoiceApi || !global.TapRoarVoiceApi.enabled()) {
      if (opts.onError) {
        opts.onError(global.TapRoarLocale.t("voiceApiRequired"));
      }
      if (opts.onDone) opts.onDone();
      return;
    }

    playing = true;
    stopRequested = false;
    const generation = prefetchGeneration;

    try {
      const apiVoiceId = await global.TapRoarVoices.ensureApiVoice(voiceId);
      const locale =
        (global.TapRoarLocale && global.TapRoarLocale.activeLocale) || "en";
      const total = segments.length;

      reportProgress(opts, {
        phase: "synth",
        title: global.TapRoarLocale.t("voiceSynthTitle"),
        detail: global.TapRoarLocale.t("voiceSynthStart"),
        percent: null,
        busy: true,
        indeterminate: true
      });

      warmSegmentBuffer(apiVoiceId, storyId, locale, segments, 0, opts, generation);
      await wait(BEDTIME.introPauseMs);

      for (let i = 0; i < total; i++) {
        if (stopRequested || generation !== prefetchGeneration) break;

        warmSegmentBuffer(apiVoiceId, storyId, locale, segments, i + 1, opts, generation);

        reportProgress(opts, {
          phase: i === 0 ? "synth" : "buffer",
          title: global.TapRoarLocale.t("voiceSynthTitle"),
          detail: lineProgressDetail(i + 1, total, i > 0),
          percent: null,
          busy: true,
          indeterminate: true
        });

        let blob;
        try {
          blob = await fetchSegmentBlob(
            apiVoiceId,
            storyId,
            locale,
            segments,
            i,
            opts,
            generation
          );
        } catch (err) {
          if (String(err.message) === "cancelled") break;
          throw err;
        }

        if (stopRequested || generation !== prefetchGeneration || !blob) break;

        if (i === 0) {
          reportProgress(opts, {
            phase: "play",
            title: global.TapRoarLocale.t("voiceSynthPlay"),
            detail: "",
            percent: 100,
            busy: false,
            indeterminate: false
          });
          if (opts.onPlaybackStart) opts.onPlaybackStart();
        }

        const seg = segments[i];
        if (opts.onSegment) opts.onSegment(seg);
        if (seg.letter && opts.onLetter) opts.onLetter(seg.letter);

        await playBlobAndWait(blob);

        segmentBlobCache.delete(segmentCacheKey(apiVoiceId, storyId, locale, i));

        if (i < total - 1 && !stopRequested) {
          await wait(segmentPauseMs(seg, opts.contentType === "rhyme"));
        }
      }
    } catch (err) {
      if (String(err.message) !== "cancelled" && opts.onError) {
        opts.onError(err.message || String(err));
      }
    }

    playing = false;
    clearSyncTimers();
    if (opts.onDone) opts.onDone();
  }

  async function prefetchStory(voiceId, storyId, segments, opts) {
    if (!global.TapRoarVoiceApi || !global.TapRoarVoiceApi.enabled()) return;
    if (!voiceId || voiceId === "default" || !segments || !segments.length) return;

    clearSegmentCache();
    const generation = prefetchGeneration;

    try {
      const apiVoiceId = await global.TapRoarVoices.ensureApiVoice(voiceId);
      if (generation !== prefetchGeneration) return;
      const locale =
        (opts && opts.locale) ||
        (global.TapRoarLocale && global.TapRoarLocale.activeLocale) ||
        "en";
      warmSegmentBuffer(apiVoiceId, storyId, locale, segments, 0, opts || {}, generation);
    } catch {
      // Prefetch is best-effort
    }
  }

  async function playStory(story, opts) {
    stopPlayback();
    stopRequested = false;

    const storyOpts = { ...opts, contentType: story.type || "story" };
    const useFamilyVoice = opts.voiceId && opts.voiceId !== "default";

    if (story.type === "name-parade") {
      const name = (opts.childName || "").trim();
      if (!name) {
        if (opts.onError) opts.onError(global.TapRoarLocale.t("lettersOnly"));
        return;
      }
      const segments = buildNameParadeSegments(name, global.TapRoarLocale.pack, opts.animalByLetter);

      if (useFamilyVoice) {
        const paradeId = "name-parade:" + name.toUpperCase();
        return playClonedSegments(opts.voiceId, paradeId, segments, storyOpts);
      }
      return playSegments(segments, storyOpts);
    }

    const segments = story.segments || [];

    if (!useFamilyVoice) {
      const played = await playPrerecorded(story, segments, storyOpts);
      if (played) return;
    }

    if (useFamilyVoice) {
      if (!segments.length) {
        if (opts.onError) opts.onError(global.TapRoarLocale.t("noStories"));
        return;
      }
      return playClonedSegments(opts.voiceId, story.id, segments, storyOpts);
    }

    return playSegments(segments, storyOpts);
  }

  function stopPlayback() {
    stopRequested = true;
    playing = false;
    clearSyncTimers();
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (audioEl) {
      audioEl.pause();
      audioEl = null;
    }
    releaseAudioUrl();
    if (global.TapRoarRecorder && global.TapRoarRecorder.isActive()) {
      global.TapRoarRecorder.stopTracks();
    }
  }

  function stop() {
    stopPlayback();
    clearSegmentCache();
  }

  function isPlaying() {
    return playing;
  }

  async function prepareStoryInVoice(voiceId, story, opts) {
    if (!global.TapRoarVoiceApi || !global.TapRoarVoiceApi.enabled()) {
      throw new Error(global.TapRoarLocale.t("voiceApiRequired"));
    }
    const segments = story.segments || [];
    await prefetchStory(voiceId, story.id, segments, opts);
  }

  global.TapRoarStories = {
    playStory,
    stop,
    isPlaying,
    prepareStoryInVoice,
    prefetchStory,
    buildNameParadeSegments,
    preloadSpeechVoices: loadSpeechVoices
  };
})(window);
