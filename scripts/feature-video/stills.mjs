import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { probeMedia, toolPath } from "./media-import.mjs";

/**
 * Stills and contact sheets of a render, to look at without playing it. Both
 * go to a stills/ folder beside the render, named after it:
 * `<render>-<t>s.jpg` for a still at t seconds and `<render>-contact.jpg` for
 * a sheet of one frame a second.
 */

const execFileAsync = promisify(execFile);

/** --at's seconds, such as "0,4,6.5". */
export function parseStillTimes(text) {
  const parts = String(text ?? "")
    .split(",")
    .map((part) => part.trim());
  const times = parts.map(Number);
  if (
    parts.some((part) => part === "") ||
    times.some((seconds) => !Number.isFinite(seconds) || seconds < 0)
  )
    throw new Error("--at takes seconds separated by commas, like 0,4,6.5.");
  return times;
}

/**
 * One frame a second, in rows of at most `columns`: ceil(seconds) frames,
 * the count ffmpeg's `fps=1:eof_action=pass` makes.
 */
export function contactSheetLayout(seconds, columns = 10) {
  const frames = Math.max(1, Math.ceil(seconds));
  const across = Math.min(columns, frames);
  return { frames, columns: across, rows: Math.ceil(frames / across) };
}

function stillsFolder(file) {
  return path.join(path.dirname(file), "stills");
}

function stem(file) {
  return path.basename(file, path.extname(file));
}

async function ffmpeg(args, what) {
  try {
    await execFileAsync(
      toolPath("ffmpeg"),
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { windowsHide: true }
    );
  } catch (cause) {
    throw new Error(
      `ffmpeg could not make ${what}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
}

/** Writes a still at each time and returns their paths. */
export async function writeStills(file, times) {
  const { durationSeconds } = await probeMedia(file);
  const late = times.find((seconds) => seconds >= durationSeconds);
  if (late !== undefined)
    throw new Error(
      `${path.basename(file)} is ${durationSeconds.toFixed(2)} s long; --at ${late} is past its end.`
    );
  const folder = stillsFolder(file);
  await fs.mkdir(folder, { recursive: true });
  const written = [];
  for (const seconds of times) {
    const output = path.join(folder, `${stem(file)}-${seconds}s.jpg`);
    // ffmpeg can finish without writing a frame, so an old still must not
    // pass for a new one.
    await fs.rm(output, { force: true });
    await ffmpeg(
      [
        "-ss",
        String(seconds),
        "-i",
        file,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        output,
      ],
      `a still at ${seconds} s`
    );
    const made = await fs.stat(output).then(
      () => true,
      () => false
    );
    if (!made)
      throw new Error(
        `ffmpeg found no frame at ${seconds} s in ${path.basename(file)}.`
      );
    written.push(output);
  }
  return written;
}

/**
 * How long the video stream runs. A render's audio can end a few
 * milliseconds after its last frame, and the file's duration counts that.
 */
async function videoSeconds(file) {
  const { durationSeconds } = await probeMedia(file);
  try {
    const { stdout } = await execFileAsync(
      toolPath("ffprobe"),
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=duration",
        "-of",
        "csv=p=0",
        file,
      ],
      { windowsHide: true }
    );
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : durationSeconds;
  } catch {
    return durationSeconds;
  }
}

/** Writes the render's contact sheet: one frame a second, 240 px wide each. */
export async function writeContactSheet(file, columns = 10) {
  const layout = contactSheetLayout(await videoSeconds(file), columns);
  const folder = stillsFolder(file);
  await fs.mkdir(folder, { recursive: true });
  const output = path.join(folder, `${stem(file)}-contact.jpg`);
  await fs.rm(output, { force: true });
  await ffmpeg(
    [
      "-i",
      file,
      "-vf",
      // pass gives the video's last part second a frame too, so ffmpeg
      // makes exactly the layout's frames and no tile stays empty.
      `fps=1:eof_action=pass,scale=240:-2,tile=${layout.columns}x${layout.rows}:padding=4:margin=4:color=0x202020`,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output,
    ],
    "a contact sheet"
  );
  const made = await fs.stat(output).then(
    () => true,
    () => false
  );
  if (!made)
    throw new Error(`ffmpeg made no contact sheet of ${path.basename(file)}.`);
  return { file: output, ...layout };
}
