#!/usr/bin/env node
/**
 * Make the release email's hero: an animated GIF of the lead feature's
 * sequence, cut from its baked loop clip (/test/loop-clips). Gmail and Apple
 * Mail play it; Outlook desktop shows the first frame.
 *
 * Usage:
 *   node scripts/release-hero.mjs --sequence <id> --version 0.48.0
 *   node scripts/release-hero.mjs --clip <file.mp4> --version 0.48.0
 *   ... --upload      push to the assets bucket and print the release.js flag
 *   ... --dry-run     with --upload, show the key without uploading
 *
 * Needs ffmpeg on PATH; --upload needs CLOUDFLARE_API_TOKEN (env or .env).
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ASSETS_CDN,
  loadCloudflareToken,
  loopClipBakeDir,
  putAsset,
} from "./lib/assets-bucket.mjs";

// The email panel's content column is 520px; 20 fps and a 96-colour palette
// keep an 8-second loop near 2 MB without visible banding in the trails.
const SIZE = 520;
const FPS = 20;
const COLORS = 96;

function parseArgs(argv) {
  const options = { upload: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--upload") options.upload = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--sequence") options.sequence = argv[++i];
    else if (arg === "--clip") options.clip = argv[++i];
    else if (arg === "--version") options.version = argv[++i];
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
    throw new Error("--version x.y.z is required");
  }
  if (!options.sequence === !options.clip) {
    throw new Error("Pass exactly one of --sequence <id> or --clip <file>");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const clip =
    options.clip ?? join(loopClipBakeDir(), `${options.sequence}.mp4`);
  if (!existsSync(clip)) {
    throw new Error(`No clip at ${clip}; bake it in /test/loop-clips first`);
  }

  const outDir = join(tmpdir(), "tka-release-hero");
  mkdirSync(outDir, { recursive: true });
  const gif = join(outDir, `${options.version}.gif`);
  const filter = [
    `fps=${FPS},scale=${SIZE}:-1:flags=lanczos,split[a][b]`,
    `[a]palettegen=max_colors=${COLORS}:stats_mode=full[p]`,
    `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  ].join(";");
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      clip,
      "-filter_complex",
      filter,
      "-loop",
      "0",
      gif,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  if (result.status !== 0) throw new Error("ffmpeg failed");
  console.log(`${gif}  ${(statSync(gif).size / 1024).toFixed(0)} KB`);

  if (!options.upload) return;
  const token = loadCloudflareToken();
  if (!token && !options.dryRun) {
    throw new Error("CLOUDFLARE_API_TOKEN is not set (env or .env)");
  }
  const key = `email/releases/${options.version}/hero.gif`;
  putAsset(
    token,
    key,
    gif,
    "image/gif",
    "public, max-age=31536000, immutable",
    options.dryRun
  );
  console.log(`\nrelease.js flag: --hero-image ${ASSETS_CDN}/${key}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
