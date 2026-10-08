import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { toolPath } from "./media-import.mjs";

/**
 * The render's end-to-end check. On a task server, never 5173, it makes a
 * scratch feature video from a 2 s black clip that flashes white at 0.5 s,
 * under music that clicks at 0.5 s, renders it with `render --open`, and
 * measures where the flash and the click land in the MP4. Each must be within
 * a frame of 0.5 s and of the other. It also writes stills and a contact sheet
 * to look at, and leaves the project in the server's TKA_FEATURE_VIDEO_ROOT.
 *
 *   node scripts/feature-video/render-check.mjs --url http://localhost:5193
 */

const execFileAsync = promisify(execFile);
// Not `new URL("../post-project.mjs", import.meta.url)`: Vitest rewrites
// that pattern to an http URL, which fileURLToPath refuses.
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "../post-project.mjs");
const FRAME_SECONDS = 1 / 30;
const SAMPLE_RATE = 48000;
/** White from frame 15 to frame 17: 0.5 s to 0.6 s at 30 fps. */
const FLASH_FILTER =
  "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(n,15,17)'";

export function parseCheckArgs(argv) {
  const index = argv.indexOf("--url");
  const value = index < 0 ? undefined : argv[index + 1];
  if (!value)
    throw new Error(
      "render-check needs --url, a task server such as http://localhost:5193."
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("--url must be a loopback HTTP(S) address.");
  if (url.port === "5173")
    throw new Error(
      "render-check makes and renders a scratch project, so run it against a task server with a scratch TKA_FEATURE_VIDEO_ROOT, never 5173."
    );
  return { url: url.origin };
}

/** ffmpeg arguments for the 2 s, 540 by 960 black clip with its flash. */
export function flashClipArgs(output) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=540x960:r=30:d=2",
    "-vf",
    FLASH_FILTER,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    output,
  ];
}

/**
 * A 48 kHz mono 16-bit WAV, silent but for a 5 ms burst of 1 kHz at each
 * click.
 */
export function clickTrack(seconds = 2, clicks = [0.5, 1, 1.5]) {
  const samples = Math.round(seconds * SAMPLE_RATE);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // one channel
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples * 2, 40);
  // 240 samples of 1 kHz at 0.9 of full scale.
  const burst = Array.from({ length: 240 }, (_, i) =>
    Math.round(0.9 * 32767 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE))
  );
  for (const click of clicks) {
    const start = Math.round(click * SAMPLE_RATE);
    burst.forEach((level, i) => {
      if (start + i < samples) wav.writeInt16LE(level, 44 + (start + i) * 2);
    });
  }
  return wav;
}

/** Seconds into the file of its first bright frame, to 1/60 s, or null. */
export async function firstBrightSeconds(file) {
  const { stdout } = await execFileAsync(
    toolPath("ffmpeg"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      "fps=60,scale=16:16,format=gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 1 << 28, windowsHide: true }
  );
  const size = 16 * 16;
  for (let frame = 0; (frame + 1) * size <= stdout.length; frame += 1) {
    let sum = 0;
    for (let i = frame * size; i < (frame + 1) * size; i += 1) sum += stdout[i];
    if (sum / size > 128) return frame / 60;
  }
  return null;
}

/** Seconds into the file of its first sample louder than 0.3, or null. */
export async function firstLoudSeconds(file) {
  const { stdout } = await execFileAsync(
    toolPath("ffmpeg"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "f32le",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 1 << 28, windowsHide: true }
  );
  // readFloatLE, since a Float32Array view needs an aligned offset.
  for (let i = 0; i + 4 <= stdout.length; i += 4)
    if (Math.abs(stdout.readFloatLE(i)) > 0.3) return i / 4 / SAMPLE_RATE;
  return null;
}

/** Runs post-project.mjs on the task server; its messages show as it goes. */
function postProject(url, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args, "--url", url], {
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim() ? JSON.parse(stdout) : undefined);
      else
        reject(
          new Error(
            `post-project.mjs ${args[0]} failed${stdout.trim() ? `: ${stdout.trim()}` : "; its reason is above"}.`
          )
        );
    });
  });
}

export async function runRenderCheck({
  url,
  log = (line) => console.error(line),
}) {
  const feature = `render-check-${Date.now().toString(36)}`;
  const cli = (...args) => postProject(url, args);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "render-check-"));
  try {
    const clip = path.join(work, "flash.mp4");
    const music = path.join(work, "clicks.wav");
    await execFileAsync(toolPath("ffmpeg"), flashClipArgs(clip), {
      windowsHide: true,
    });
    await fs.writeFile(music, clickTrack());

    log(`Making ${feature}.`);
    await cli(
      "create",
      feature,
      "--sequence",
      "DCKΨ-",
      "--canvas",
      "9:16",
      "--title",
      "Render check"
    );
    await cli("add-take", clip, "--feature", feature, "--append");
    await cli("add-music", music, "--feature", feature);
    const project = await cli("show", "--feature", feature, "--json");
    const flashClip = project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "video");
    if (!flashClip) throw new Error(`${feature} has no clip after add-take.`);
    // The music starts with the clip, so the click lands on the flash.
    await cli(
      "music",
      "--feature",
      feature,
      "--start",
      String(flashClip.start)
    );
    await cli("sound", "silent", "--feature", feature);
    await cli(
      "add-card",
      "--feature",
      feature,
      "--label",
      "Render check",
      "--qr-url",
      "https://example.com/render-check"
    );

    log("Rendering in a headless editor.");
    const render = await cli(
      "render",
      "--feature",
      feature,
      "--open",
      "--name",
      "check"
    );
    const { stills } = await cli("stills", render.path, "--at", "0.4,0.5,4.5");
    const sheet = await cli("contact-sheet", render.path);

    const expectedSeconds = flashClip.start + 0.5;
    const flashSeconds = await firstBrightSeconds(render.path);
    const clickSeconds = await firstLoudSeconds(render.path);
    const near = (a, b) =>
      a !== null && b !== null && Math.abs(a - b) <= FRAME_SECONDS;
    return {
      ok:
        near(flashSeconds, expectedSeconds) &&
        near(clickSeconds, expectedSeconds) &&
        near(flashSeconds, clickSeconds),
      feature,
      render,
      expectedSeconds,
      flashSeconds,
      clickSeconds,
      stills,
      contactSheet: sheet.file,
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await runRenderCheck(parseCheckArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  }
}
