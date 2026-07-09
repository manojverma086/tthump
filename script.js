/* =========================================================
   Tap & Roar — logic
   No external audio/image files: animals are emoji, sounds
   are synthesized live with the Web Audio API. That sidesteps
   licensing, load time, and the "does the file exist" problem
   entirely — and it means every animal can share one tiny,
   consistent sound design instead of 26 mismatched clips.
   ========================================================= */

(function () {
  "use strict";

  // ---- Letter -> animal + a short, spam-safe sound recipe ----
  // freq: base pitch (a C-major-pentatonic ladder, so any two
  // notes played together still sound pleasant, not clashing).
  // wave: oscillator color, grouped loosely by animal "size".
  const ANIMALS = [
    { letter: "A", name: "Alligator",   emoji: "🐊", freq: 196.0, wave: "sawtooth" },
    { letter: "B", name: "Bear",        emoji: "🐻", freq: 220.0, wave: "triangle" },
    { letter: "C", name: "Cat",         emoji: "🐱", freq: 392.0, wave: "sine"     },
    { letter: "D", name: "Dog",         emoji: "🐶", freq: 261.6, wave: "square"   },
    { letter: "E", name: "Elephant",    emoji: "🐘", freq: 130.8, wave: "sawtooth" },
    { letter: "F", name: "Fox",         emoji: "🦊", freq: 349.2, wave: "triangle" },
    { letter: "G", name: "Giraffe",     emoji: "🦒", freq: 293.7, wave: "sine"     },
    { letter: "H", name: "Horse",       emoji: "🐴", freq: 246.9, wave: "square"   },
    { letter: "I", name: "Iguana",      emoji: "🦎", freq: 329.6, wave: "triangle" },
    { letter: "J", name: "Jellyfish",   emoji: "🪼", freq: 440.0, wave: "sine"     },
    { letter: "K", name: "Koala",       emoji: "🐨", freq: 261.6, wave: "triangle" },
    { letter: "L", name: "Lion",        emoji: "🦁", freq: 174.6, wave: "sawtooth" },
    { letter: "M", name: "Monkey",      emoji: "🐵", freq: 392.0, wave: "square"   },
    { letter: "N", name: "Narwhal",     emoji: "🐋", freq: 196.0, wave: "sine"     },
    { letter: "O", name: "Owl",         emoji: "🦉", freq: 293.7, wave: "sine"     },
    { letter: "P", name: "Penguin",     emoji: "🐧", freq: 349.2, wave: "square"   },
    { letter: "Q", name: "Quokka",      emoji: "🐹", freq: 440.0, wave: "triangle" },
    { letter: "R", name: "Rabbit",      emoji: "🐰", freq: 523.3, wave: "sine"     },
    { letter: "S", name: "Snake",       emoji: "🐍", freq: 220.0, wave: "sawtooth" },
    { letter: "T", name: "Tiger",       emoji: "🐯", freq: 174.6, wave: "square"   },
    { letter: "U", name: "Unicorn",     emoji: "🦄", freq: 523.3, wave: "sine"     },
    { letter: "V", name: "Vampire Bat", emoji: "🦇", freq: 293.7, wave: "sawtooth" },
    { letter: "W", name: "Walrus",      emoji: "🦭", freq: 155.6, wave: "triangle" },
    { letter: "X", name: "X-ray Fish",  emoji: "🐠", freq: 392.0, wave: "triangle" },
    { letter: "Y", name: "Yak",         emoji: "🐃", freq: 196.0, wave: "square"   },
    { letter: "Z", name: "Zebra",       emoji: "🦓", freq: 246.9, wave: "sawtooth" }
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
  //      #1 cause of "the page loads fine but I hear nothing." ----
  let started = false;
  function startExperience() {
    if (started) return;
    started = true;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);

    const unlock = () => {
      if (audioCtx.state === "suspended") audioCtx.resume();
      chime(523.3, "sine");
    };
    // resume() is a promise; some browsers need the gesture-triggered
    // call itself, others are fine a tick later — cover both.
    audioCtx.resume().then(unlock).catch(unlock);

    splash.remove();
    stage.hidden = false;
    document.body.focus({ preventScroll: true });
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

    chime(animal.freq, animal.wave);
    showAnimal(animal);
    dropLetter(letter);

    if (btnEl) {
      btnEl.classList.remove("pressed");
      void btnEl.offsetWidth; // restart the press animation on key-mash
      btnEl.classList.add("pressed");
      setTimeout(() => btnEl.classList.remove("pressed"), 160);
    }
  }

  // ---- Synth: a short cheerful "boop" with a tiny upward pitch bend,
  //      so every animal shares one friendly voice instead of 26
  //      inconsistent recordings. Stopping/replacing fast on key-mash
  //      is handled by simply letting notes be short + gain-limited,
  //      the audio equivalent of resetting currentTime on an <audio> tag. ----
  function chime(freq, wave) {
    if (!audioCtx || muted) return;
    if (audioCtx.state === "suspended") audioCtx.resume(); // defensive: some browsers re-suspend an idle context
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.12);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.34);
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

  feedbackBtn.addEventListener("click", () => {
    feedbackModal.hidden = false;
  });

  feedbackClose.addEventListener("click", () => {
    feedbackModal.hidden = true;
  });

  feedbackModal.addEventListener("click", (e) => {
    if (e.target === feedbackModal) feedbackModal.hidden = true;
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
          feedbackModal.hidden = true;
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
