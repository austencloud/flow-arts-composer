#!/usr/bin/env node
/**
 * Push a loop-clip bake to the public assets bucket.
 *
 * The /test/loop-clips harness renders clips in the browser and the dev
 * endpoint writes them to <tmp>/tka-loop-clips/r<version>/ with an
 * index.json beside them. This uploads every clip the index lists, then the
 * index itself, to R2 `tka-assets` (served at https://assets.tkaflowarts.com)
 * through wrangler. Clips are immutable per renderer version; the index is
 * cached briefly so a re-bake shows up within minutes.
 *
 * Usage:
 *   node scripts/upload-loop-clips.mjs            # upload clips + index
 *   node scripts/upload-loop-clips.mjs --dry-run  # list what would upload
 *   node scripts/upload-loop-clips.mjs --only <sequenceId> [--only ...]
 *
 * Needs CLOUDFLARE_API_TOKEN (read from .env when not already set).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSETS_CDN as CDN,
  loadCloudflareToken,
  loopClipBakeDir,
  putAsset as put,
} from "./lib/assets-bucket.mjs";

function parseArgs(argv) {
  const options = { dryRun: false, only: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--only") {
      const id = argv[++i];
      if (!id) throw new Error("--only requires a sequence id");
      options.only.add(id);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = loadCloudflareToken();
  if (!token && !options.dryRun) {
    throw new Error("CLOUDFLARE_API_TOKEN is not set (env or .env)");
  }

  const bakeDir = loopClipBakeDir();
  const indexPath = join(bakeDir, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(
      `No bake found at ${indexPath}; run /test/loop-clips first`
    );
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const ids = Object.keys(index.clips).filter(
    (id) => options.only.size === 0 || options.only.has(id)
  );
  if (ids.length === 0) throw new Error("Nothing to upload");

  let bytes = 0;
  for (const id of ids) {
    const entry = index.clips[id];
    const file = join(bakeDir, `${id}.mp4`);
    if (!existsSync(file)) throw new Error(`Missing clip file: ${file}`);
    put(
      token,
      entry.key,
      file,
      "video/mp4",
      "public, max-age=31536000, immutable",
      options.dryRun
    );
    bytes += entry.bytes;
    console.log(
      `${id}  ${(entry.bytes / 1024).toFixed(0)} KB  ${CDN}/${entry.key}`
    );
  }

  const indexKey = `clips/r${index.rendererVersion}/index.json`;
  put(
    token,
    indexKey,
    indexPath,
    "application/json",
    "public, max-age=300",
    options.dryRun
  );
  console.log(
    `\n${ids.length} clips, ${(bytes / 1024 / 1024).toFixed(1)} MB total; index at ${CDN}/${indexKey}`
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
