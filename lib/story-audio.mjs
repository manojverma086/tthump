/**
 * Shared audio path resolution (Node tests + scripts).
 * Browser copy: js/story-audio.js
 */

/**
 * @param {{ audio?: string | Record<string, string> } | null | undefined} story
 * @param {string} [locale]
 * @returns {string | null}
 */
export function resolveStoryAudio(story, locale = "en") {
  if (!story || !story.audio) return null;
  if (typeof story.audio === "string") {
    const trimmed = story.audio.trim();
    return trimmed || null;
  }
  if (typeof story.audio === "object") {
    const loc = locale.split("-")[0].toLowerCase();
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
export function isPrerecordedSrc(src) {
  return typeof src === "string" && /\.(mp3|wav|ogg|m4a)(\?|#|$)/i.test(src.trim());
}

/**
 * @param {object} pack
 * @returns {Array<{ id: string, audio?: string | Record<string, string>, type?: string }>}
 */
export function allStoryEntries(pack) {
  const stories = pack.stories || [];
  const rhymes = pack.rhymes || [];
  return [...stories, ...rhymes].filter((s) => s.type !== "name-parade");
}

/**
 * @param {object} pack
 * @returns {string[]}
 */
export function collectAudioPaths(pack) {
  const paths = [];
  for (const entry of allStoryEntries(pack)) {
    const src = resolveStoryAudio(entry, "en");
    if (src) paths.push(src);
    const hi = resolveStoryAudio(entry, "hi");
    if (hi && hi !== src) paths.push(hi);
  }
  return paths;
}
