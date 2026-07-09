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
  const speechBubble = document.getElementById("speechBubble");
  const fallingLetter = document.getElementById("fallingLetter");
  const muteBtn = document.getElementById("muteBtn");

  let muted = false;
  let audioCtx = null;
  let masterGain = null;
  const soundBuffers = {};
  let soundsReady = false;

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

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);

    const unlock = () => {
      if (audioCtx.state === "suspended") audioCtx.resume();
      preloadSounds().then(() => playAnimalSound("C"));
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

  // ---- Physical keyboard support. Attached to both window and document
  //      as a redundancy — if focus ever lands somewhere unusual, one of
  //      the two still catches the bubbled event. ----
  function handleKeydown(e) {
    if (e.repeat) return; // a toddler holding a key shouldn't machine-gun the sound
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

    playAnimalSound(letter);
    showAnimal(animal);
    dropLetter(letter);

    if (btnEl) {
      btnEl.classList.remove("pressed");
      void btnEl.offsetWidth; // restart the press animation on key-mash
      btnEl.classList.add("pressed");
      setTimeout(() => btnEl.classList.remove("pressed"), 160);
    }
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
    animalCard.classList.remove("hop");
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
})();
