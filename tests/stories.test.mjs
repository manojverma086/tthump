import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveStoryAudio,
  isPrerecordedSrc,
  collectAudioPaths,
  allStoryEntries
} from "../lib/story-audio.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("resolveStoryAudio", () => {
  it("returns string audio path", () => {
    assert.equal(
      resolveStoryAudio({ audio: "audio/rhymes/en/twinkle-star.mp3" }),
      "audio/rhymes/en/twinkle-star.mp3"
    );
  });

  it("resolves locale map", () => {
    assert.equal(
      resolveStoryAudio({ audio: { en: "a.mp3", hi: "b.mp3" } }, "hi"),
      "b.mp3"
    );
  });

  it("returns null when missing", () => {
    assert.equal(resolveStoryAudio({}), null);
    assert.equal(resolveStoryAudio(null), null);
  });
});

describe("isPrerecordedSrc", () => {
  it("accepts common audio extensions", () => {
    assert.equal(isPrerecordedSrc("audio/foo.mp3"), true);
    assert.equal(isPrerecordedSrc("audio/foo.wav"), true);
  });

  it("rejects non-audio", () => {
    assert.equal(isPrerecordedSrc("stories/en.json"), false);
    assert.equal(isPrerecordedSrc(""), false);
  });
});

describe("story locale JSON", () => {
  for (const file of ["stories/en.json", "stories/hi.json"]) {
    it(`${file} parses and has stories`, async () => {
      const raw = await readFile(path.join(root, file), "utf8");
      const pack = JSON.parse(raw);
      assert.ok(Array.isArray(pack.stories));
      assert.ok(Array.isArray(pack.rhymes));
      assert.ok(pack.stories.length >= 10);
    });
  }

  it("en rhymes with audio cover the main set", async () => {
    const pack = JSON.parse(await readFile(path.join(root, "stories/en.json"), "utf8"));
    const withAudio = (pack.rhymes || []).filter((r) => resolveStoryAudio(r));
    assert.ok(withAudio.length >= 5, "expected at least 5 English rhymes with audio");
  });

  it("every referenced audio file exists on disk", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "audio/manifest.json"), "utf8"));
    const manifestPaths = new Set(manifest.files.map((f) => f.path));

    for (const file of ["stories/en.json", "stories/hi.json"]) {
      const pack = JSON.parse(await readFile(path.join(root, file), "utf8"));
      for (const src of collectAudioPaths(pack)) {
        const abs = path.join(root, src);
        await assert.doesNotReject(readFile(abs), `missing audio: ${src}`);
        assert.ok(manifestPaths.has(src), `audio not in manifest: ${src}`);
      }
    }
  });

  it("manifest storyIds match locale entries", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "audio/manifest.json"), "utf8"));
    const en = JSON.parse(await readFile(path.join(root, "stories/en.json"), "utf8"));
    const hi = JSON.parse(await readFile(path.join(root, "stories/hi.json"), "utf8"));
    const ids = new Set([
      ...allStoryEntries(en).map((s) => s.id),
      ...allStoryEntries(hi).map((s) => s.id)
    ]);

    for (const entry of manifest.files) {
      assert.ok(ids.has(entry.storyId), `manifest storyId not in JSON: ${entry.storyId}`);
    }
  });
});

describe("catalog.json", () => {
  it("lists en and hi locales", async () => {
    const catalog = JSON.parse(await readFile(path.join(root, "stories/catalog.json"), "utf8"));
    assert.ok(catalog.locales.en);
    assert.ok(catalog.locales.hi);
  });
});
