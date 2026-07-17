/* Resolve prerecorded audio paths for stories and rhymes */
(function (global) {
  "use strict";

  /**
   * @param {{ audio?: string | Record<string, string> } | null | undefined} story
   * @param {string} [locale]
   * @returns {string | null}
   */
  function resolveStoryAudio(story, locale) {
    if (!story || !story.audio) return null;
    if (typeof story.audio === "string") {
      const trimmed = story.audio.trim();
      return trimmed || null;
    }
    if (typeof story.audio === "object") {
      const loc = (locale || "en").split("-")[0].toLowerCase();
      return (
        story.audio[loc] ||
        story.audio[locale] ||
        story.audio.default ||
        story.audio.en ||
        null
      );
    }
    return null;
  }

  /** @param {string} src */
  function isPrerecordedSrc(src) {
    return typeof src === "string" && /\.(mp3|wav|ogg|m4a)(\?|#|$)/i.test(src.trim());
  }

  global.TapRoarStoryAudio = {
    resolveStoryAudio,
    isPrerecordedSrc
  };
})(window);
