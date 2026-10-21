#!/usr/bin/env node
/**
 * Compose a release note's example clip: a 2x2 grid, one effect per cell.
 * Each cell opens on the 2D animation, then fades one after another into
 * the 3D performer doing the same beats with the same props on top, and
 * fades back before the loop restarts.
 *
 * The takes come from the dev bake pages, which save them through
 * /api/dev/release-media into the OS temp folder:
 *   2D: /test/release-media?effects=silk,goo,ink,smoke&autorun=1
 *   3D: /test/viewer-3d?scene=void&effect=<e>&take=<e>-3d
 *         &cam=0,0.45,4.5&look=0,0.45,0&fov=40  (720x720 viewport)
 *
 * Usage:
 *   node scripts/release-media-grid.mjs --version 0.49.0
 *   ... --effects silk,goo,ink,smoke --name effects
 *   ... --upload      push to the assets bucket and print the manifest media
 *   ... --dry-run     with --upload, show the keys without uploading
 *
 * Writes <name>.mp4 (the app plays it), <name>.gif (the email shows it) and
 * <name>.jpg (the clip's poster). Needs ffmpeg on PATH; --upload needs
 * CLOUDFLARE_API_TOKEN (env or .env).
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ASSETS_CDN,
  loadCloudflareToken,
  putAsset,
} from "./lib/assets-bucket.mjs";

const TAKE_DIR = join(tmpdir(), "tka-release-media");

// Takes are 720px squares at 30 fps, one beat per second.
const TAKE = 720;
const SECONDS = 8;
// The 2D loop clip starts at beat 9 and the 3D export opens on a one-beat
// hold, so these trims put both on beat 1 of the same pass.
const START_2D = 8;
const START_3D = 1;
// Measured registration of the 2D grid onto the 3D wall plane at the camera
// above (staff centroids across a whole pass, after mirroring the 3D, which
// faces the camera while the 2D grid is drawn from behind the performer).
const SCALE_2D = 0.962;
const SHIFT_2D = { x: 29, y: -17 };

const CELL = 516;
const GAP = 8;
const GRID = CELL * 2 + GAP;
const BACKGROUND = "0x0a0a14";

// Fade timing: hold the 2D, fade the cells in one after another, hold the
// 3D, then fade every cell back so the loop restarts on the 2D view.
const FADE_FIRST = 1.6;
const FADE_STAGGER = 0.7;
const FADE_SECONDS = 1.2;
const FADE_BACK = SECONDS - 1.3;

// The email list column is 500px wide. Four cells of moving trails cost far
// more than one: 12 fps and 96 colours hold an 8-second grid near 3.5 MB,
// where 20 fps passed 5 MB. Dithering changes the size very little.
const GIF_SIZE = 500;
const GIF_FPS = 12;
const GIF_COLORS = 96;

const LABEL_FONT =
  process.env.RELEASE_MEDIA_FONT ?? "C:/Windows/Fonts/segoeuib.ttf";

function parseArgs(argv) {
  const options = {
    effects: ["silk", "goo", "ink", "smoke"],
    name: "effects",
    upload: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--upload") options.upload = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--version") options.version = argv[++i];
    else if (arg === "--name") options.name = argv[++i];
    else if (arg === "--effects") options.effects = argv[++i].split(",");
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
    throw new Error("--version x.y.z is required");
  }
  if (options.effects.length !== 4) {
    throw new Error("--effects needs exactly four effects, one per cell");
  }
  if (!/^[a-z0-9-]{1,64}$/.test(options.name)) {
    throw new Error("--name must be lowercase letters, digits and dashes");
  }
  return options;
}

function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error("ffmpeg failed");
}

function label(effect) {
  return effect.charAt(0).toUpperCase() + effect.slice(1);
}

function cellFilter(i, effect) {
  const flat = `[${i * 2}:v]`;
  const solid = `[${i * 2 + 1}:v]`;
  const size = Math.round(TAKE * SCALE_2D);
  const fadeIn = (FADE_FIRST + i * FADE_STAGGER).toFixed(2);
  const font = LABEL_FONT.replace(/:/g, "\\:");
  return [
    `color=c=${BACKGROUND}:s=${TAKE}x${TAKE}:r=30:d=${SECONDS}[bg${i}]`,
    `${flat}trim=start=${START_2D}:duration=${SECONDS},setpts=PTS-STARTPTS,scale=${size}:${size}[f${i}]`,
    `[bg${i}][f${i}]overlay=x=${SHIFT_2D.x}:y=${SHIFT_2D.y}[flat${i}]`,
    `${solid}trim=start=${START_3D}:duration=${SECONDS},setpts=PTS-STARTPTS,` +
      `crop=ih:ih,scale=${TAKE}:${TAKE},hflip,format=yuva420p,` +
      `fade=t=in:st=${fadeIn}:d=${FADE_SECONDS}:alpha=1,` +
      `fade=t=out:st=${FADE_BACK}:d=${FADE_SECONDS}:alpha=1[s${i}]`,
    `[flat${i}][s${i}]overlay=format=auto,` +
      `drawtext=fontfile='${font}':text='${label(effect)}':fontsize=40:` +
      `fontcolor=white:shadowcolor=black@0.6:shadowx=0:shadowy=2:x=28:y=22,` +
      `scale=${CELL}:${CELL}:flags=lanczos,format=yuv420p[c${i}]`,
  ].join(";");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputs = [];
  for (const effect of options.effects) {
    for (const half of ["2d", "3d"]) {
      const take = join(TAKE_DIR, `${effect}-${half}.mp4`);
      if (!existsSync(take)) throw new Error(`Missing take ${take}`);
      inputs.push("-i", take);
    }
  }

  const outDir = join(tmpdir(), "tka-release-media", "out");
  mkdirSync(outDir, { recursive: true });
  const mp4 = join(outDir, `${options.name}.mp4`);
  const gif = join(outDir, `${options.name}.gif`);
  const jpg = join(outDir, `${options.name}.jpg`);

  const p = CELL + GAP;
  const graph = [
    ...options.effects.map((effect, i) => cellFilter(i, effect)),
    `[c0][c1][c2][c3]xstack=inputs=4:layout=0_0|${p}_0|0_${p}|${p}_${p}:fill=${BACKGROUND}[grid]`,
  ].join(";");
  ffmpeg([
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[grid]",
    "-c:v",
    "libx264",
    "-crf",
    "22",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4,
  ]);

  ffmpeg([
    "-i",
    mp4,
    "-filter_complex",
    [
      `fps=${GIF_FPS},scale=${GIF_SIZE}:-1:flags=lanczos,split[a][b]`,
      `[a]palettegen=max_colors=${GIF_COLORS}:stats_mode=full[p]`,
      `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    ].join(";"),
    "-loop",
    "0",
    gif,
  ]);

  // The poster is the moment every cell has turned 3D.
  const allSolid = FADE_FIRST + 3 * FADE_STAGGER + FADE_SECONDS + 0.2;
  ffmpeg(["-ss", allSolid.toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg]);

  for (const file of [mp4, gif, jpg]) {
    console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }

  const alt = `${options.effects.map(label).join(", ")}: each starts in 2D, then the 3D performer does the same beats`;
  const prefix = `email/releases/${options.version}/${options.name}`;
  if (options.upload) {
    const token = loadCloudflareToken();
    if (!token && !options.dryRun) {
      throw new Error("CLOUDFLARE_API_TOKEN is not set (env or .env)");
    }
    const cache = "public, max-age=31536000, immutable";
    putAsset(token, `${prefix}.gif`, gif, "image/gif", cache, options.dryRun);
    putAsset(token, `${prefix}.mp4`, mp4, "video/mp4", cache, options.dryRun);
    putAsset(token, `${prefix}.jpg`, jpg, "image/jpeg", cache, options.dryRun);
  }
  // The email shows the GIF; the app plays the MP4 over the JPG poster.
  console.log(
    "\nmanifest media:\n" +
      JSON.stringify(
        {
          image: `${ASSETS_CDN}/${prefix}.gif`,
          video: `${ASSETS_CDN}/${prefix}.mp4`,
          poster: `${ASSETS_CDN}/${prefix}.jpg`,
          alt,
          width: GIF_SIZE,
          height: GIF_SIZE,
        },
        null,
        2
      )
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
