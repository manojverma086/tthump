#!/usr/bin/env node
/**
 * Download prerecorded rhyme/story audio listed in audio/manifest.json.
 * Sources: Internet Archive (mostly public-domain 78rpm).
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "audio/manifest.json");

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) {
    throw new Error(`File too small (${buf.length} bytes): ${url}`);
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of manifest.files) {
    const dest = path.join(root, entry.path);
    try {
      const info = await stat(dest);
      if (info.size > 5000) {
        console.log(`skip (exists): ${entry.path}`);
        skipped += 1;
        continue;
      }
    } catch {
      // missing — download
    }

    process.stdout.write(`fetch: ${entry.path} … `);
    try {
      const bytes = await download(entry.url, dest);
      console.log(`ok (${Math.round(bytes / 1024)} KB)`);
      ok += 1;
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone: ${ok} downloaded, ${skipped} skipped, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
