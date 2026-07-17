/* =========================================================
   Tap & Roar — logic
   Animals are emoji; sounds are short MP3 clips from Pixabay
   (royalty-free via Pixabay — https://pixabay.com/sound-effects/)
   Web Audio API so key-mashing can overlap cleanly.
   ========================================================= */

(function () {
  "use strict";

  const MAX_SOUND_SEC = 4;

  // ---- Letter -> animal + Pixabay sound clip (bundled in sounds/) ----
  const ANIMALS = [
    { letter: "A", name: "Alligator",   emoji: "🐊", sound: "sounds/a-alligator.mp3" },
    { letter: "B", name: "Bear",        emoji: "🐻", sound: "sounds/b-bear.mp3" },
    { letter: "C", name: "Cat",         emoji: "🐱", sound: "sounds/c-cat.mp3" },
    { letter: "D", name: "Dog",         emoji: "🐶", sound: "sounds/d-dog.mp3" },
    { letter: "E", name: "Elephant",    emoji: "🐘", sound: "sounds/e-elephant.mp3" },
    { letter: "F", name: "Fox",         emoji: "🦊", sound: "sounds/f-fox.mp3" },
    { letter: "G", name: "Giraffe",     emoji: "🦒", sound: "sounds/g-giraffe.mp3" },
    { letter: "H", name: "Horse",       emoji: "🐴", sound: "sounds/h-horse.mp3" },
    { letter: "I", name: "Iguana",      emoji: "🦎", sound: "sounds/i-iguana.mp3" },
    { letter: "J", name: "Jellyfish",   emoji: "🪼", sound: "sounds/j-jellyfish.mp3" },
    { letter: "K", name: "Koala",       emoji: "🐨", sound: "sounds/k-koala.mp3" },
    { letter: "L", name: "Lion",        emoji: "🦁", sound: "sounds/l-lion.mp3" },
    { letter: "M", name: "Monkey",      emoji: "🐵", sound: "sounds/m-monkey.mp3" },
    { letter: "N", name: "Narwhal",     emoji: "🐋", sound: "sounds/n-narwhal.mp3" },
    { letter: "O", name: "Owl",         emoji: "🦉", sound: "sounds/o-owl.mp3" },
    { letter: "P", name: "Penguin",     emoji: "🐧", sound: "sounds/p-penguin.mp3" },
    { letter: "Q", name: "Quokka",      emoji: "🐹", sound: "sounds/q-quokka.mp3" },
    { letter: "R", name: "Rabbit",      emoji: "🐰", sound: "sounds/r-rabbit.mp3" },
    { letter: "S", name: "Snake",       emoji: "🐍", sound: "sounds/s-snake.mp3" },
    { letter: "T", name: "Tiger",       emoji: "🐯", sound: "sounds/t-tiger.mp3" },
    { letter: "U", name: "Unicorn",     emoji: "🦄", sound: "sounds/u-unicorn.mp3" },
    { letter: "V", name: "Vampire Bat", emoji: "🦇", sound: "sounds/v-bat.mp3" },
    { letter: "W", name: "Walrus",      emoji: "🦭", sound: "sounds/w-walrus.mp3" },
    { letter: "X", name: "X-ray Fish",  emoji: "🐠", sound: "sounds/x-fish.mp3" },
    { letter: "Y", name: "Yak",         emoji: "🐃", sound: "sounds/y-yak.mp3" },
    { letter: "Z", name: "Zebra",       emoji: "🦓", sound: "sounds/z-zebra.mp3" }
  ];

  const KEY_COLORS = ["var(--key-1)", "var(--key-2)", "var(--key-3)", "var(--key-4)", "var(--key-5)", "var(--key-6)"];

  const animalByLetter = {};
  ANIMALS.forEach((a) => (animalByLetter[a.letter] = a));

  // ---- DOM refs ----
  const splash = document.getElementById("splash");
  const startBtn = document.getElementById("startBtn");
  const stage = document.getElementById("stage");
  const keyboard = document.getElementById("keyboard");
  const animalCard = document.getElementById("animalCard");
  const animalEmoji = document.getElementById("animalEmoji");
  const animalName = document.getElementById("animalName");
  const idlePrompt = document.getElementById("idlePrompt");
  const speechBubble = document.getElementById("speechBubble");
  const fallingLetter = document.getElementById("fallingLetter");
  const muteBtn = document.getElementById("muteBtn");

  let muted = false;
  let audioCtx = null;
  let masterGain = null;
  const soundBuffers = {};
  let soundsReady = false;
  let lastPressedKey = null;
  let idleTimer = null;

  // ---- Build the on-screen keyboard (also serves touch/tablet users) ----
  ANIMALS.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.className = "key";
    btn.textContent = a.letter;
    btn.style.background = KEY_COLORS[i % KEY_COLORS.length];
    btn.setAttribute("aria-label", a.letter + " for " + a.name);
    btn.dataset.letter = a.letter;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!started) startExperience();
      playLetter(a.letter, btn);
    });
    keyboard.appendChild(btn);
  });

  // ---- Unlock audio + reveal the stage on the first tap (required by
  //      browser autoplay policies). Some browsers (notably Safari/iOS)
  //      create the AudioContext in a "suspended" state even inside a
  //      real user gesture, so we explicitly resume() it — that's the
  //      #1 cause of "the page loads fine but I hear nothing."
  //
  //      Visibility uses an .is-active class (not the [hidden] attribute)
  //      so layout CSS always matches JS state — attribute selectors can
  //      lag or fail to match even after hidden=false. ----
  let started = false;

  function showStage() {
    stage.classList.add("is-active");
    stage.removeAttribute("hidden");
  }

  function startExperience() {
    if (started) return;
    started = true;

    splash.remove();
    showStage();
    document.body.focus({ preventScroll: true });
    showIdleState();

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);

    const unlock = () => {
      if (audioCtx.state === "suspended") audioCtx.resume();
      preloadSounds();
    };
    // resume() is a promise; some browsers need the gesture-triggered
    // call itself, others are fine a tick later — cover both.
    audioCtx.resume().then(unlock).catch(unlock);
  }
  startBtn.addEventListener("pointerdown", startExperience);
  startBtn.addEventListener("click", startExperience);

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-pressed", String(muted));
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.35;
  });

  // ---- Physical keyboard support. Ignore keys while typing in forms/modals. ----
  function shouldIgnoreKeyboardPlay(e) {
    if (feedbackModal.classList.contains("is-open")) return true;
    if (storiesModal.classList.contains("is-open")) return true;
    const el = e.target;
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function handleKeydown(e) {
    if (e.repeat) return;
    if (shouldIgnoreKeyboardPlay(e)) return;
    const letter = e.key.toUpperCase();
    if (!animalByLetter[letter]) return;
    if (!started) startExperience();
    const btn = keyboard.querySelector('[data-letter="' + letter + '"]');
    playLetter(letter, btn);
  }
  window.addEventListener("keydown", handleKeydown);
  document.addEventListener("keydown", handleKeydown);

  // ---- Core "press a letter" action ----
  function playLetter(letter, btnEl) {
    const animal = animalByLetter[letter];
    if (!animal) return;

    hideIdlePrompt();
    playAnimalSound(letter);
    showAnimal(animal);
    dropLetter(letter);

    if (lastPressedKey) lastPressedKey.classList.remove("last-pressed");
    if (btnEl) {
      btnEl.classList.add("last-pressed");
      lastPressedKey = btnEl;
      btnEl.classList.remove("pressed");
      void btnEl.offsetWidth;
      btnEl.classList.add("pressed");
      setTimeout(() => btnEl.classList.remove("pressed"), 160);
    }

    scheduleIdlePrompt();
  }

  function showIdleState() {
    animalEmoji.textContent = "🌻";
    animalName.textContent = "";
    animalName.classList.remove("visible");
    animalCard.classList.remove("hop");
    animalCard.classList.add("idle");
    idlePrompt.classList.remove("hidden");
    scheduleIdlePrompt();
  }

  function hideIdlePrompt() {
    idlePrompt.classList.add("hidden");
    animalCard.classList.remove("idle");
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function scheduleIdlePrompt() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!animalCard.classList.contains("hop")) {
        idlePrompt.classList.remove("hidden");
        animalCard.classList.add("idle");
      }
    }, 4000);
  }

  // ---- Animal sounds: fetch MP3s once, replay from AudioBuffers ----
  async function preloadSounds() {
    if (soundsReady || !audioCtx) return;
    await Promise.all(
      ANIMALS.map(async (animal) => {
        if (soundBuffers[animal.letter]) return;
        const res = await fetch(animal.sound);
        if (!res.ok) throw new Error("Could not load " + animal.sound);
        const data = await res.arrayBuffer();
        soundBuffers[animal.letter] = await audioCtx.decodeAudioData(data);
      })
    );
    soundsReady = true;
  }

  function playAnimalSound(letter) {
    if (!audioCtx || muted) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const buffer = soundBuffers[letter];
    if (!buffer) {
      preloadSounds().then(() => playAnimalSound(letter));
      return;
    }

    const playSec = Math.min(MAX_SOUND_SEC, buffer.duration);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(masterGain);
    src.start(0, 0, playSec);
  }

  // ---- Visuals: animal hops onto the grass stage + speech bubble ----
  function showAnimal(animal) {
    animalEmoji.textContent = animal.emoji;
    animalName.textContent = animal.name;
    animalName.classList.add("visible");
    animalCard.classList.remove("hop", "idle");
    void animalCard.offsetWidth;
    animalCard.classList.add("hop");

    speechBubble.textContent = animal.letter + " is for " + animal.name + "!";
    speechBubble.classList.remove("pop");
    void speechBubble.offsetWidth;
    speechBubble.classList.add("pop");
  }

  function dropLetter(letter) {
    fallingLetter.textContent = letter;
    fallingLetter.classList.remove("streak");
    void fallingLetter.offsetWidth;
    fallingLetter.classList.add("streak");
  }

  // ---- Feedback modal ----
  const feedbackBtn = document.getElementById("feedbackBtn");
  const feedbackModal = document.getElementById("feedbackModal");
  const feedbackClose = document.getElementById("feedbackClose");
  const feedbackForm = document.getElementById("feedbackForm");
  const feedbackThanks = document.getElementById("feedbackThanks");
  const ratingInput = document.getElementById("ratingInput");
  const stars = document.querySelectorAll(".star");

  function openFeedbackModal() {
    feedbackModal.classList.add("is-open");
    feedbackModal.removeAttribute("hidden");
  }

  function closeFeedbackModal() {
    feedbackModal.classList.remove("is-open");
    feedbackModal.setAttribute("hidden", "");
  }

  feedbackBtn.addEventListener("click", openFeedbackModal);

  feedbackClose.addEventListener("click", closeFeedbackModal);

  feedbackModal.addEventListener("click", (e) => {
    if (e.target === feedbackModal) closeFeedbackModal();
  });

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      const value = Number(star.dataset.value);
      ratingInput.value = String(value);
      stars.forEach((s) => {
        const filled = Number(s.dataset.value) <= value;
        s.classList.toggle("filled", filled);
        s.setAttribute("aria-checked", String(filled && Number(s.dataset.value) === value));
      });
    });
  });

  feedbackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = feedbackForm.querySelector(".feedback-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const res = await fetch(feedbackForm.action, {
        method: "POST",
        body: new FormData(feedbackForm),
        headers: { Accept: "application/json" }
      });
      if (res.ok) {
        feedbackForm.hidden = true;
        feedbackThanks.hidden = false;
        setTimeout(() => {
          closeFeedbackModal();
          feedbackForm.hidden = false;
          feedbackThanks.hidden = true;
          feedbackForm.reset();
          stars.forEach((s) => s.classList.remove("filled"));
        }, 1800);
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send feedback";
        alert("Something went wrong sending that — mind trying again?");
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send feedback";
      alert("Couldn't reach the server — check your connection and try again.");
    }
  });

  // ---- Stories: locale pack, family voices, name parade ----
  /** Re-enable when voice-api + XTTS hosting is deployed. */
  const FAMILY_VOICE_ENABLED = false;
  /** Full bedtime stories (TTS / story audio). Off until narration quality is ready. */
  const STORIES_ENABLED = false;

  const storiesBtn = document.getElementById("storiesBtn");
  const storiesModal = document.getElementById("storiesModal");
  const storiesClose = document.getElementById("storiesClose");
  const storiesLocale = document.getElementById("storiesLocale");
  const childNameInput = document.getElementById("childName");
  const voiceList = document.getElementById("voiceList");
  const addVoiceBtn = document.getElementById("addVoiceBtn");
  const storyListEl = document.getElementById("storyList");
  const storyCaption = document.getElementById("storyCaption");
  const storyPlayBtn = document.getElementById("storyPlayBtn");
  const storyStopBtn = document.getElementById("storyStopBtn");
  const storiesSplashBtn = document.getElementById("storiesSplashBtn");
  const voiceCloneStatus = document.getElementById("voiceCloneStatus");
  const voiceCloneTitle = document.getElementById("voiceCloneTitle");
  const voiceCloneDetail = document.getElementById("voiceCloneDetail");
  const voiceCloneBar = document.getElementById("voiceCloneBar");
  const voiceCloneBarFill = document.getElementById("voiceCloneBarFill");
  let storyBusy = false;
  const playLabelDefault = () => TapRoarLocale.t("play");

  function setStoryBusy(busy) {
    storyBusy = busy;
    storyPlayBtn.disabled = busy;
    storyPlayBtn.classList.toggle("is-busy", busy);
    storyPlayBtn.textContent = busy ? TapRoarLocale.t("voicePreparing") || "Preparing…" : playLabelDefault();
    syncStoryMiniPlayer();
  }

  function hideVoiceCloneStatus() {
    voiceCloneStatus.hidden = true;
    voiceCloneBar.classList.remove("is-indeterminate");
    voiceCloneBarFill.style.width = "0%";
  }

  function showVoiceCloneStatus(status) {
    if (!status) {
      hideVoiceCloneStatus();
      return;
    }
    voiceCloneStatus.hidden = false;
    voiceCloneTitle.textContent = status.title || "";
    voiceCloneDetail.textContent = status.detail || "";
    if (status.indeterminate) {
      voiceCloneBar.classList.add("is-indeterminate");
      voiceCloneBarFill.style.width = "";
      voiceCloneBar.setAttribute("aria-valuenow", "0");
    } else {
      voiceCloneBar.classList.remove("is-indeterminate");
      const pct = Math.max(0, Math.min(100, status.percent || 0));
      voiceCloneBarFill.style.width = pct + "%";
      voiceCloneBar.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
    if (status.busy) setStoryBusy(true);
    else setStoryBusy(false);
  }

  function applyVoiceCloneProgress(status) {
    if (!status) return;
    if (typeof status === "string") {
      showVoiceCloneStatus({
        title: status,
        detail: "",
        busy: true,
        indeterminate: true
      });
      return;
    }
    showVoiceCloneStatus(status);
  }
  const voiceSetup = document.getElementById("voiceSetup");
  const voiceSection = document.getElementById("voiceSection");
  const storiesMain = document.getElementById("storiesMain");
  const newVoiceName = document.getElementById("newVoiceName");
  const voiceSampleRecordBtn = document.getElementById("voiceSampleRecordBtn");
  const voiceSampleStopBtn = document.getElementById("voiceSampleStopBtn");
  const voiceSamplePlayBtn = document.getElementById("voiceSamplePlayBtn");
  const voiceSampleCloneBtn = document.getElementById("voiceSampleCloneBtn");
  const voiceSampleSaveBtn = document.getElementById("voiceSampleSaveBtn");
  const voiceSampleCancelBtn = document.getElementById("voiceSampleCancelBtn");
  const voiceSampleFile = document.getElementById("voiceSampleFile");
  const voiceSampleUploadText = document.getElementById("voiceSampleUploadText");
  const voiceUploadHint = document.getElementById("voiceUploadHint");
  const voiceSetupHint = document.getElementById("voiceSetupHint");
  const voicePreviewExplain = document.getElementById("voicePreviewExplain");
  const recordHint = document.getElementById("recordHint");
  const storyEditor = document.getElementById("storyEditor");
  const customStoryTitle = document.getElementById("customStoryTitle");
  const customStoryBody = document.getElementById("customStoryBody");
  const customStorySaveBtn = document.getElementById("customStorySaveBtn");
  const customStoryDeleteBtn = document.getElementById("customStoryDeleteBtn");
  const customStoryCancelBtn = document.getElementById("customStoryCancelBtn");
  const writeStoryBtn = document.getElementById("writeStoryBtn");
  const storyEditBtn = document.getElementById("storyEditBtn");
  const storyMinimizeHint = document.getElementById("storyMinimizeHint");
  const storyMiniPlayer = document.getElementById("storyMiniPlayer");
  const storyMiniExpand = document.getElementById("storyMiniExpand");
  const storyMiniCaption = document.getElementById("storyMiniCaption");
  const storyMiniLabel = document.getElementById("storyMiniLabel");
  const storyMiniStop = document.getElementById("storyMiniStop");
  let editingStoryId = null;
  let mergedStories = [];
  let storiesModalMinimized = false;

  let selectedVoiceId = "default";
  let selectedStoryId = null;
  let pendingSampleBlob = null;
  let pendingApiVoiceId = null;
  let profileSession = null;
  let profilePreviewAudio = null;
  const CHILD_NAME_KEY = "tapRoarChildName";

  function isStorySessionActive() {
    return TapRoarStories.isPlaying() || storyBusy;
  }

  function isStoriesRecording() {
    return !!profileSession;
  }

  function applyFamilyVoiceUi() {
    addVoiceBtn.hidden = !FAMILY_VOICE_ENABLED;
    recordHint.hidden = !FAMILY_VOICE_ENABLED;
    voiceList.hidden = !FAMILY_VOICE_ENABLED;
    if (!FAMILY_VOICE_ENABLED) {
      selectedVoiceId = "default";
      voiceSetup.hidden = true;
    }
  }

  function applyRhymesOnlyUi() {
    const nameField = childNameInput.closest(".stories-field");
    if (nameField) nameField.hidden = !STORIES_ENABLED;
    writeStoryBtn.hidden = !STORIES_ENABLED;
    if (!STORIES_ENABLED) {
      storyEditBtn.hidden = true;
      const miniLabel = document.getElementById("storyMiniLabel");
      if (miniLabel) miniLabel.textContent = TapRoarLocale.t("rhymeMiniPlaying");
    }
  }

  function effectiveVoiceId() {
    return FAMILY_VOICE_ENABLED ? selectedVoiceId : "default";
  }

  function updateStoryChrome() {
    const active = isStorySessionActive();
    storyMinimizeHint.hidden = !active || storiesModalMinimized;
    if (storyMinimizeHint.hidden === false) {
      storyMinimizeHint.textContent = TapRoarLocale.t("storyMinimizeHint");
    }
    storiesClose.setAttribute(
      "aria-label",
      active ? TapRoarLocale.t("storiesCloseHide") : TapRoarLocale.t("storiesClose")
    );
    storyMiniLabel.textContent = TapRoarLocale.t("storyMiniPlaying");
    storyMiniExpand.setAttribute("aria-label", TapRoarLocale.t("storyMiniExpand"));
    storyMiniStop.textContent = TapRoarLocale.t("storyMiniStop");
    syncStoryMiniPlayer();
  }

  /** Mini bar only when modal is minimized AND audio is actually playing/preparing. */
  function syncStoryMiniPlayer() {
    const shouldShow = storiesModalMinimized && isStorySessionActive();
    storyMiniPlayer.hidden = !shouldShow;
    if (!shouldShow) {
      storyMiniCaption.textContent = "";
      if (!isStorySessionActive()) {
        storiesModalMinimized = false;
      }
    } else {
      storyMiniCaption.textContent = storyCaption.textContent || "";
    }
  }

  function syncStoryCaption(text) {
    storyCaption.textContent = text;
    if (storiesModalMinimized && text) {
      storyMiniCaption.textContent = text.length > 72 ? text.slice(0, 69) + "…" : text;
    }
  }

  function showStoryMiniPlayer() {
    if (!isStorySessionActive()) return;
    storiesModalMinimized = true;
    syncStoryMiniPlayer();
  }

  function hideStoryMiniPlayer() {
    storiesModalMinimized = false;
    syncStoryMiniPlayer();
  }

  function hideStoriesModalShell() {
    storiesModal.classList.remove("is-open");
    storiesModal.setAttribute("hidden", "");
  }

  function showStoriesModalShell() {
    storiesModal.classList.add("is-open");
    storiesModal.removeAttribute("hidden");
    hideStoryMiniPlayer();
    updateStoryChrome();
  }

  function minimizeStoriesModal() {
    if (!isStorySessionActive()) return;
    hideStoriesModalShell();
    showStoryMiniPlayer();
  }

  function requestCloseStoriesModal() {
    if (isStoriesRecording()) {
      storiesModal.querySelector(".stories-card").classList.add("stories-card--nudge");
      setTimeout(() => {
        storiesModal.querySelector(".stories-card").classList.remove("stories-card--nudge");
      }, 400);
      return;
    }
    if (isStorySessionActive()) {
      minimizeStoriesModal();
      return;
    }
    closeStoriesModal();
  }

  function openStoriesModal() {
    showStoriesModalShell();
    refreshStoriesUI();
  }

  function closeStoriesModal() {
    TapRoarStories.stop();
    if (profileSession) {
      profileSession.cancel();
      profileSession = null;
    }
    if (window.TapRoarRecorder && window.TapRoarRecorder.isActive()) {
      window.TapRoarRecorder.stopTracks();
    }
    showVoiceSetup(false);
    showStoryEditor(false);
    hideStoryMiniPlayer();
    hideStoriesModalShell();
    storyStopBtn.hidden = true;
    hideVoiceCloneStatus();
    setStoryBusy(false);
    storyCaption.textContent = "";
  }

  function applyUiStrings() {
    const t = TapRoarLocale.t;
    document.getElementById("storiesTitle").textContent = STORIES_ENABLED
      ? t("storiesTitle")
      : t("rhymesTitle");
    document.getElementById("storiesLangLabel").textContent = t("languageLabel");
    document.getElementById("storiesNameLabel").textContent = t("childName");
    childNameInput.placeholder = t("childNamePlaceholder");
    document.getElementById("storiesVoiceLabel").textContent = FAMILY_VOICE_ENABLED
      ? t("voiceLabel")
      : t("voiceDefault");
    if (FAMILY_VOICE_ENABLED) {
      addVoiceBtn.textContent = t("voiceAdd");
      recordHint.textContent = t("voiceRecordHint");
    }
    storyPlayBtn.textContent = STORIES_ENABLED ? t("play") : t("playRhyme");
    storyStopBtn.textContent = t("stop");
    document.getElementById("voiceSetupTitle").textContent = t("voiceSetupTitle");
    document.getElementById("voiceSetupHint").textContent = t("voiceSetupHint");
    document.getElementById("voiceSetupNameLabel").textContent = t("voiceSetupName");
    voiceSampleRecordBtn.textContent = "🎙 " + t("voiceSampleRecord");
    voiceSampleStopBtn.textContent = t("voiceSampleStop");
    voiceSamplePlayBtn.textContent = "▶ " + t("voiceSamplePreview");
    voiceSampleCloneBtn.textContent = "✨ " + t("voiceSampleClone");
    voiceSampleSaveBtn.textContent = t("voiceSampleSave");
    voiceSampleCancelBtn.textContent = t("voiceSampleCancel");
    voiceSampleUploadText.textContent = "📁 " + t("voiceSampleUpload");
    voiceUploadHint.textContent = t("voiceUploadHint");
    if (voicePreviewExplain) voicePreviewExplain.textContent = t("voicePreviewExplain");
    document.getElementById("storyEditorTitle").textContent = t("storyEditorTitle");
    document.getElementById("storyEditorHint").textContent = t("storyEditorHint");
    document.getElementById("storyEditorNameLabel").textContent = t("storyTitleLabel");
    document.getElementById("storyEditorBodyLabel").textContent = t("storyBodyLabel");
    customStoryTitle.placeholder = t("storyTitlePlaceholder");
    customStoryBody.placeholder = t("storyBodyPlaceholder");
    customStorySaveBtn.textContent = t("storySave");
    customStoryDeleteBtn.textContent = t("storyDelete");
    customStoryCancelBtn.textContent = t("storyCancel");
    writeStoryBtn.textContent = t("writeStory");
    storyEditBtn.textContent = t("storyEdit");
    document.querySelectorAll(".stories-launch-text").forEach((el) => {
      const label = STORIES_ENABLED ? t("storiesLaunch") : t("rhymesLaunch");
      el.textContent =
        label === "storiesLaunch" || label === "rhymesLaunch"
          ? STORIES_ENABLED
            ? "Stories & voices"
            : "Rhymes & songs"
          : label;
    });
    updateStoryChrome();
    applyFamilyVoiceUi();
    applyRhymesOnlyUi();
  }

  function showVoiceSetup(show) {
    if (!FAMILY_VOICE_ENABLED) return;
    voiceSetup.hidden = !show;
    storiesMain.hidden = show;
    if (show) storyEditor.hidden = true;
    if (show) {
      newVoiceName.value = "";
      pendingSampleBlob = null;
      pendingApiVoiceId = null;
      voiceSampleSaveBtn.disabled = true;
      voiceSamplePlayBtn.hidden = true;
      voiceSampleCloneBtn.hidden = true;
      voiceSampleStopBtn.hidden = true;
      voiceSampleRecordBtn.hidden = false;
      voiceSetupHint.textContent = TapRoarLocale.t("voiceSetupHint");
      if (voicePreviewExplain) voicePreviewExplain.textContent = TapRoarLocale.t("voicePreviewExplain");
      newVoiceName.focus();
    }
  }

  async function startProfileRecording() {
    const blocked = TapRoarMic.checkMicSupport();
    if (blocked) {
      voiceSetupHint.textContent = blocked;
      return;
    }
    profileSession = await TapRoarMic.beginSession();
    voiceSampleRecordBtn.hidden = true;
    voiceSampleStopBtn.hidden = false;
    voiceSetupHint.textContent = TapRoarLocale.t("voiceRecording");
  }

  async function stopProfileRecording() {
    if (!profileSession) return null;
    try {
      pendingSampleBlob = await profileSession.stop();
    } catch (err) {
      voiceSetupHint.textContent = TapRoarMic.micErrorMessage(err);
      pendingSampleBlob = null;
    }
    profileSession = null;
    voiceSampleStopBtn.hidden = true;
    voiceSamplePlayBtn.hidden = !pendingSampleBlob;
    voiceSampleCloneBtn.hidden = !pendingSampleBlob;
    voiceSampleRecordBtn.hidden = false;
    voiceSampleSaveBtn.disabled = !pendingSampleBlob;
    return pendingSampleBlob;
  }

  function playProfilePreview(blob) {
    if (profilePreviewAudio) {
      profilePreviewAudio.pause();
      profilePreviewAudio = null;
    }
    profilePreviewAudio = new Audio(URL.createObjectURL(blob));
    profilePreviewAudio.preservesPitch = true;
    profilePreviewAudio.playbackRate = 0.92;
    profilePreviewAudio.volume = 0.92;
    profilePreviewAudio.play();
  }

  function populateLocaleSelect() {
    const current = TapRoarLocale.activeLocale;
    storiesLocale.innerHTML = "";
    TapRoarLocale.listLocales().forEach(({ code, label }) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = label;
      if (code === current) opt.selected = true;
      storiesLocale.appendChild(opt);
    });
  }

  async function renderVoiceList() {
    if (!FAMILY_VOICE_ENABLED) return;
    voiceList.innerHTML = "";
    const defaultChip = document.createElement("button");
    defaultChip.type = "button";
    defaultChip.className = "voice-chip" + (selectedVoiceId === "default" ? " selected" : "");
    defaultChip.textContent = TapRoarLocale.t("voiceDefault");
    defaultChip.addEventListener("click", async () => {
      selectedVoiceId = "default";
      TapRoarStories.stop();
      await renderVoiceList();
      await updateRecordHint();
    });
    voiceList.appendChild(defaultChip);

    const voices = await TapRoarVoices.listVoices();
    for (const v of voices) {
      const hasSample = await TapRoarVoices.hasProfileSample(v.id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        "voice-chip" +
        (selectedVoiceId === v.id ? " selected" : "") +
        (hasSample ? " has-sample" : "");
      chip.textContent = v.label;
      chip.title = hasSample ? "Recorded voice" : "No sample yet — tap + Add family voice";
      chip.addEventListener("click", async () => {
        selectedVoiceId = v.id;
        await renderVoiceList();
        await updateRecordHint();
        await maybePrefetchSelectedStory();
      });
      voiceList.appendChild(chip);
    }
  }

  function getSegmentsForStory(story) {
    if (!story) return [];
    if (story.type === "name-parade") {
      const name = childNameInput.value.trim();
      if (!name) return [];
      return TapRoarStories.buildNameParadeSegments(name, TapRoarLocale.pack, animalByLetter);
    }
    return story.segments || [];
  }

  async function maybePrefetchSelectedStory() {
    if (!FAMILY_VOICE_ENABLED) return;
    if (selectedVoiceId === "default" || !TapRoarVoiceApi.enabled()) return;
    const story = mergedStories.find((s) => s.id === selectedStoryId);
    if (!story) return;
    const segments = getSegmentsForStory(story);
    if (!segments.length) return;
    let storyId = story.id;
    if (story.type === "name-parade") {
      storyId = "name-parade:" + childNameInput.value.trim().toUpperCase();
    }
    TapRoarStories.prefetchStory(selectedVoiceId, storyId, segments, {
      locale: TapRoarLocale.activeLocale
    });
  }

  function showStoryEditor(show, storyId) {
    storyEditor.hidden = !show;
    storiesMain.hidden = show;
    voiceSetup.hidden = true;
    if (show) {
      editingStoryId = storyId || null;
      customStoryDeleteBtn.hidden = !editingStoryId;
      if (editingStoryId) {
        TapRoarCustomStories.get(editingStoryId).then((rec) => {
          if (!rec) return;
          customStoryTitle.value = rec.title || "";
          customStoryBody.value = rec.body || "";
        });
      } else {
        customStoryTitle.value = "";
        customStoryBody.value = "";
      }
      customStoryTitle.focus();
    } else {
      editingStoryId = null;
    }
  }

  async function buildStoryList() {
    const pack = TapRoarLocale.pack;
    if (!pack) return [];
    const rhymeLabel = TapRoarLocale.t("rhymeSource");
    const rhymes = (pack.rhymes || []).map((r) => ({
      ...r,
      type: "rhyme",
      source: r.source || rhymeLabel
    }));
    if (!STORIES_ENABLED) return rhymes;

    if (!pack.stories) return rhymes;
    const stories = pack.stories.filter((s) => s.type !== "name-parade");
    const nameParade = pack.stories.find((s) => s.type === "name-parade");
    const custom = await TapRoarCustomStories.listAsStories();
    const all = [...stories, ...rhymes, ...custom];
    return nameParade ? [...all, nameParade] : all;
  }

  function updateStoryEditBtn() {
    if (!STORIES_ENABLED) {
      storyEditBtn.hidden = true;
      return;
    }
    const story = mergedStories.find((s) => s.id === selectedStoryId);
    storyEditBtn.hidden = !(story && story.custom);
  }

  function renderStoryList() {
    storyListEl.innerHTML = "";
    if (!mergedStories.length) return;
    mergedStories.forEach((story) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "story-item" +
        (selectedStoryId === story.id ? " selected" : "") +
        (story.custom ? " story-item--custom" : "") +
        (story.type === "rhyme" ? " story-item--rhyme" : "");
      const hasAudio =
        story.audio &&
        (typeof story.audio === "string" ||
          Object.values(story.audio).some(Boolean));
      const titlePrefix = story.type === "rhyme" ? "🎵 " : hasAudio ? "🔊 " : "";
      btn.innerHTML =
        '<span class="story-item-title">' +
        titlePrefix +
        story.title +
        '</span><span class="story-item-source">' +
        (story.source || "") +
        "</span>";
      btn.addEventListener("click", async () => {
        selectedStoryId = story.id;
        renderStoryList();
        updateStoryEditBtn();
        await updateRecordHint();
        await maybePrefetchSelectedStory();
      });
      storyListEl.appendChild(btn);
    });
    if (!selectedStoryId && mergedStories.length) {
      selectedStoryId = mergedStories[0].id;
      renderStoryList();
      updateStoryEditBtn();
      return;
    }
    updateStoryEditBtn();
  }

  async function loadMergedStories() {
    mergedStories = await buildStoryList();
    if (selectedStoryId && !mergedStories.some((s) => s.id === selectedStoryId)) {
      selectedStoryId = mergedStories.length ? mergedStories[0].id : null;
    }
  }

  async function updateRecordHint() {
    if (!FAMILY_VOICE_ENABLED || effectiveVoiceId() === "default") {
      storyCaption.textContent = "";
      return;
    }
    const hasSample = await TapRoarVoices.hasProfileSample(selectedVoiceId);
    if (!hasSample) {
      storyCaption.textContent = TapRoarLocale.t("voiceNeedsSetup");
      return;
    }
    if (!TapRoarVoiceApi.enabled()) {
      storyCaption.textContent = TapRoarLocale.t("voiceApiRequired");
      return;
    }
    storyCaption.textContent = TapRoarLocale.t("voiceCloneReady");
  }

  async function refreshStoriesUI() {
    applyUiStrings();
    populateLocaleSelect();
    await renderVoiceList();
    await loadMergedStories();
    renderStoryList();
    await updateRecordHint();
    await maybePrefetchSelectedStory();
  }

  async function initStories() {
    const savedName = localStorage.getItem(CHILD_NAME_KEY);
    if (savedName) childNameInput.value = savedName;
    hideStoryMiniPlayer();
    try {
      if (window.TapRoarStories && TapRoarStories.preloadSpeechVoices) {
        TapRoarStories.preloadSpeechVoices();
      }
      await TapRoarLocale.init();
      await refreshStoriesUI();
    } catch (err) {
      storyCaption.textContent = "Could not load stories.";
    }
  }

  function openStoriesFromGesture() {
    if (!started) startExperience();
    openStoriesModal();
  }

  storiesBtn.addEventListener("click", openStoriesFromGesture);
  if (storiesSplashBtn) storiesSplashBtn.addEventListener("click", openStoriesFromGesture);
  storiesClose.addEventListener("click", requestCloseStoriesModal);
  storiesModal.addEventListener("click", (e) => {
    if (e.target === storiesModal) requestCloseStoriesModal();
  });

  storyMiniExpand.addEventListener("click", openStoriesModal);
  storyMiniStop.addEventListener("click", () => {
    TapRoarStories.stop();
    storyStopBtn.hidden = true;
    storyCaption.textContent = "";
    hideVoiceCloneStatus();
    setStoryBusy(false);
    hideStoryMiniPlayer();
    updateStoryChrome();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!storiesModal.classList.contains("is-open")) return;
    e.preventDefault();
    requestCloseStoriesModal();
  });

  storiesLocale.addEventListener("change", async () => {
    await TapRoarLocale.setLocale(storiesLocale.value);
    selectedStoryId = null;
    await refreshStoriesUI();
  });

  addVoiceBtn.addEventListener("click", () => {
    showVoiceSetup(true);
  });

  voiceSampleRecordBtn.addEventListener("click", () => {
    startProfileRecording().catch((err) => {
      voiceSetupHint.textContent = TapRoarMic.micErrorMessage(err);
    });
  });

  voiceSampleStopBtn.addEventListener("click", async () => {
    await stopProfileRecording();
    voiceSetupHint.textContent = TapRoarLocale.t("voiceSamplePreview") + "?";
  });

  voiceSamplePlayBtn.addEventListener("click", () => {
    if (pendingSampleBlob) playProfilePreview(pendingSampleBlob);
  });

  voiceSampleCloneBtn.addEventListener("click", async () => {
    if (!pendingSampleBlob) return;
    if (!TapRoarVoiceApi.enabled()) {
      voiceSetupHint.textContent = TapRoarLocale.t("voiceApiRequired");
      return;
    }
    voiceSetupHint.textContent = TapRoarLocale.t("voiceCloneTesting");
    voiceSampleCloneBtn.disabled = true;
    try {
      const label = newVoiceName.value.trim() || "Preview";
      const reg = await TapRoarVoiceApi.registerVoice(label, pendingSampleBlob);
      pendingApiVoiceId = reg.voiceId;
      const preview = await TapRoarVoiceApi.previewVoice(reg.voiceId, {
        text: TapRoarLocale.t("voicePreviewPhrase"),
        locale: TapRoarLocale.activeLocale
      });
      const blob = await TapRoarVoiceApi.fetchAudioBlob(preview.audioUrl);
      playProfilePreview(blob);
      voiceSetupHint.textContent = TapRoarLocale.t("voicePreviewExplain");
    } catch (err) {
      voiceSetupHint.textContent = TapRoarMic.micErrorMessage(err);
    }
    voiceSampleCloneBtn.disabled = false;
  });

  voiceSampleSaveBtn.addEventListener("click", async () => {
    const label = newVoiceName.value.trim();
    if (!label) {
      voiceSetupHint.textContent = TapRoarLocale.t("voiceSetupName");
      return;
    }
    if (!pendingSampleBlob) {
      voiceSetupHint.textContent = TapRoarLocale.t("voiceRecordFirst");
      return;
    }
    voiceSampleSaveBtn.disabled = true;
    try {
      const voice = await TapRoarVoices.createVoice(label);
      await TapRoarVoices.saveProfileSample(voice.id, pendingSampleBlob);
      if (!TapRoarVoiceApi.enabled()) {
        voiceSetupHint.textContent = TapRoarLocale.t("voiceApiRequired");
        return;
      }
      if (pendingApiVoiceId) {
        await TapRoarVoices.attachApiVoice(voice.id, pendingApiVoiceId);
      } else {
        await TapRoarVoices.ensureApiVoice(voice.id);
      }
      pendingApiVoiceId = null;
      selectedVoiceId = voice.id;
      showVoiceSetup(false);
      await renderVoiceList();
      storyCaption.textContent = TapRoarLocale.t("voiceSampleSaved");
      await updateRecordHint();
    } catch (err) {
      voiceSetupHint.textContent = err.message || String(err);
    } finally {
      voiceSampleSaveBtn.disabled = false;
    }
  });

  function setPendingSample(blob) {
    pendingSampleBlob = blob;
    voiceSamplePlayBtn.hidden = !pendingSampleBlob;
    voiceSampleCloneBtn.hidden = !pendingSampleBlob;
    voiceSampleSaveBtn.disabled = !pendingSampleBlob;
  }

  voiceSampleFile.addEventListener("change", async () => {
    const file = voiceSampleFile.files && voiceSampleFile.files[0];
    if (!file) return;
    try {
      const blob = await TapRoarMic.blobFromFile(file);
      setPendingSample(blob);
      voiceSetupHint.textContent = TapRoarLocale.t("voiceSamplePreview") + "?";
    } catch (err) {
      setPendingSample(null);
      voiceSetupHint.textContent = TapRoarMic.micErrorMessage(err);
    }
    voiceSampleFile.value = "";
  });

  voiceSampleCancelBtn.addEventListener("click", () => {
    if (profileSession) {
      profileSession.cancel();
      profileSession = null;
    }
    pendingSampleBlob = null;
    pendingApiVoiceId = null;
    voiceSampleFile.value = "";
    showVoiceSetup(false);
  });

  childNameInput.addEventListener("keydown", (e) => e.stopPropagation());
  newVoiceName.addEventListener("keydown", (e) => e.stopPropagation());
  customStoryTitle.addEventListener("keydown", (e) => e.stopPropagation());
  customStoryBody.addEventListener("keydown", (e) => e.stopPropagation());

  writeStoryBtn.addEventListener("click", () => showStoryEditor(true));

  storyEditBtn.addEventListener("click", () => {
    if (selectedStoryId) showStoryEditor(true, selectedStoryId);
  });

  customStoryCancelBtn.addEventListener("click", () => showStoryEditor(false));

  customStorySaveBtn.addEventListener("click", async () => {
    try {
      const record = await TapRoarCustomStories.save({
        id: editingStoryId || undefined,
        title: customStoryTitle.value,
        body: customStoryBody.value,
        source: TapRoarLocale.t("yourStory")
      });
      selectedStoryId = record.id;
      showStoryEditor(false);
      await loadMergedStories();
      renderStoryList();
      storyCaption.textContent = TapRoarLocale.t("storySaved");
    } catch (err) {
      if (err.message === "title_required") {
        storyCaption.textContent = TapRoarLocale.t("storyTitleRequired");
      } else if (err.message === "body_required") {
        storyCaption.textContent = TapRoarLocale.t("storyBodyRequired");
      } else {
        storyCaption.textContent = String(err.message || err);
      }
    }
  });

  customStoryDeleteBtn.addEventListener("click", async () => {
    if (!editingStoryId) return;
    if (!confirm(TapRoarLocale.t("storyDeleteConfirm"))) return;
    await TapRoarCustomStories.remove(editingStoryId);
    if (selectedStoryId === editingStoryId) selectedStoryId = null;
    showStoryEditor(false);
    await loadMergedStories();
    renderStoryList();
    storyCaption.textContent = TapRoarLocale.t("storyDeleted");
  });

  childNameInput.addEventListener("change", () => {
    localStorage.setItem(CHILD_NAME_KEY, childNameInput.value.trim());
    maybePrefetchSelectedStory();
  });

  storyPlayBtn.addEventListener("click", async () => {
    if (storyBusy) return;
    const story = mergedStories.find((s) => s.id === selectedStoryId);
    if (!story) return;

    localStorage.setItem(CHILD_NAME_KEY, childNameInput.value.trim());
    storyStopBtn.hidden = false;
    storyCaption.textContent = "";
    updateStoryChrome();

    if (effectiveVoiceId() !== "default") {
      showVoiceCloneStatus({
        title: TapRoarLocale.t("voiceSynthTitle"),
        detail: TapRoarLocale.t("voiceSynthOnce"),
        busy: true,
        indeterminate: true
      });
    }

    await TapRoarStories.playStory(story, {
      childName: childNameInput.value.trim(),
      voiceId: effectiveVoiceId(),
      speechLang: TapRoarLocale.getSpeechLang(),
      animalByLetter,
      onLetter: (letter) => {
        const animal = animalByLetter[letter];
        if (animal) {
          showAnimal(animal);
          dropLetter(letter);
        }
      },
      onPlaybackStart: () => {
        hideVoiceCloneStatus();
      },
      onSegment: (seg) => {
        syncStoryCaption(seg.text);
      },
      onProgress: applyVoiceCloneProgress,
      onDone: () => {
        storyStopBtn.hidden = true;
        hideVoiceCloneStatus();
        setStoryBusy(false);
        hideStoryMiniPlayer();
        updateStoryChrome();
        updateRecordHint();
      },
      onError: (msg) => {
        hideVoiceCloneStatus();
        setStoryBusy(false);
        syncStoryCaption(msg);
        hideStoryMiniPlayer();
        updateStoryChrome();
      }
    });
  });

  storyStopBtn.addEventListener("click", () => {
    TapRoarStories.stop();
    storyStopBtn.hidden = true;
    storyCaption.textContent = "";
    hideVoiceCloneStatus();
    setStoryBusy(false);
    hideStoryMiniPlayer();
    updateStoryChrome();
  });

  initStories();
})();
