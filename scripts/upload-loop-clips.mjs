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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUCKET = "tka-assets";
const CDN = "https://assets.tkaflowarts.com";
const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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

function loadToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^CLOUDFLARE_API_TOKEN=(.*)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function findBakeDir() {
  // The renderer version lives in the TypeScript spec; read it rather than
  // duplicating the number here.
  const spec = readFileSync(
    join(REPO_ROOT, "src/lib/shared/sequence-clips/loop-clip-spec.ts"),
    "utf8"
  );
  const match = spec.match(/LOOP_CLIP_RENDERER_VERSION = (\d+)/);
  if (!match) throw new Error("Could not read LOOP_CLIP_RENDERER_VERSION");
  return join(tmpdir(), "tka-loop-clips", `r${match[1]}`);
}

function put(token, key, file, contentType, cacheControl, dryRun) {
  const args = [
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--file",
    file,
    "--content-type",
    contentType,
    "--cache-control",
    cacheControl,
    "--remote",
  ];
  if (dryRun) {
    console.log(`[dry-run] ${key} <- ${file}`);
    return;
  }
  const result = spawnSync("pnpm", args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `wrangler put failed for ${key}:\n${result.stdout}\n${result.stderr}`
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = loadToken();
  if (!token && !options.dryRun) {
    throw new Error("CLOUDFLARE_API_TOKEN is not set (env or .env)");
  }

  const bakeDir = findBakeDir();
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
