import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  runFfmpeg,
  safeMediaName,
  toolPath,
  uniqueMediaPath,
} from "./media-import.mjs";

/**
 * Brings a music file into a feature video's media/music folder as a WAV the
 * browser decodes exactly: 16 or 24-bit PCM at 44.1 or 48 kHz is copied as it
 * is, and anything else (MP3, AAC, FLAC, AIFF, other rates) becomes 16-bit
 * 48 kHz stereo PCM. A compressed file decodes with a codec delay that can
 * differ between browsers and ffmpeg, which would move every beat.
 *
 * A file already in the folder with exactly the bytes this import would write
 * is reused instead of written again. The editor keeps a music's place, trims
 * and credits only while its URL stays the same, so the same song added twice
 * must come back as the same file.
 */

const execFileAsync = promisify(execFile);
const PLAIN_PCM = ["pcm_s16le", "pcm_s24le"];
const PLAIN_RATES = [44100, 48000];

/** What ffprobe's JSON says about a music file, or why it cannot be one. */
export function readMusicProbe(data, name) {
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!audio) throw new Error(`${name} has no sound.`);
  const durationSeconds = Number(data?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error(`ffprobe could not tell how long ${name} is.`);
  return {
    durationSeconds,
    codec: audio.codec_name ?? "unknown",
    sampleRate: Number(audio.sample_rate),
    channels: Number(audio.channels),
  };
}

export async function probeMusic(file) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      toolPath("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,sample_rate,channels",
        "-of",
        "json",
        file,
      ],
      { windowsHide: true }
    ));
  } catch (cause) {
    throw new Error(
      `ffprobe could not read ${path.basename(file)}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
  return readMusicProbe(JSON.parse(stdout), path.basename(file));
}

/** True when the file is already a WAV the browser decodes sample for sample. */
export function playsAsIs(probe, file) {
  return (
    path.extname(file).toLowerCase() === ".wav" &&
    PLAIN_PCM.includes(probe.codec) &&
    PLAIN_RATES.includes(probe.sampleRate) &&
    probe.channels >= 1 &&
    probe.channels <= 2
  );
}

/** ffmpeg arguments for the 16-bit 48 kHz stereo WAV copy. */
export function musicTranscodeArgs(input, output) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-stats",
    // The output is this import's own temporary file.
    "-y",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    output,
  ];
}

/** The sha256 of a file, read in chunks so a long song is never held whole. */
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * The path of a file in `folder` with exactly the bytes of `subject`, or null.
 * `prefer`, a file name in the folder, is tried first, then the shortest name,
 * so the first copy ever made wins. Sizes are compared first and only files of
 * the same size are hashed. A `.partial.wav` is some import's unfinished file,
 * never a copy to reuse.
 */
async function findIdentical(folder, subject, prefer) {
  const { size } = await fs.stat(subject);
  const names = (await fs.readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !/\.partial\.wav$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(
      (a, b) =>
        Number(b === prefer) - Number(a === prefer) ||
        a.length - b.length ||
        (a < b ? -1 : 1)
    );
  let wanted;
  for (const name of names) {
    const candidate = path.join(folder, name);
    if ((await fs.stat(candidate)).size !== size) continue;
    wanted ??= await sha256(subject);
    if ((await sha256(candidate)) === wanted) return candidate;
  }
  return null;
}

/**
 * Copies or converts `file` into `musicFolder` under a free, safe name, unless
 * the folder already holds a file with exactly those bytes: that file is used
 * and nothing is written. `options.prefer` is the name of the file the post
 * plays now, which wins over any other identical file.
 * Returns its path inside media/, its length, whether it was converted, and
 * whether a file already in the folder was reused.
 */
export async function importMusic(file, musicFolder, options = {}) {
  const name = path.basename(file);
  const probe = await probeMusic(file);
  const convert = !playsAsIs(probe, file);
  await fs.mkdir(musicFolder, { recursive: true });
  const target = uniqueMediaPath(
    musicFolder,
    safeMediaName(name, ".wav", "music")
  );
  let existing = null;
  if (convert) {
    const partial = `${target}.partial.wav`;
    try {
      await runFfmpeg(musicTranscodeArgs(file, partial), name);
      existing = await findIdentical(musicFolder, partial, options.prefer);
      if (existing) await fs.rm(partial);
      else await fs.rename(partial, target);
    } catch (cause) {
      await fs.rm(partial, { force: true });
      throw cause;
    }
  } else {
    existing = await findIdentical(musicFolder, file, options.prefer);
    if (!existing) await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL);
  }
  const stored = existing ?? target;
  const result = convert ? await probeMusic(stored) : probe;
  return {
    relativePath: `music/${path.basename(stored)}`,
    durationSeconds: result.durationSeconds,
    transcoded: convert,
    reused: existing !== null,
  };
}
