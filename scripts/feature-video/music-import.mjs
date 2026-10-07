import { execFile } from "node:child_process";
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

/**
 * Copies or converts `file` into `musicFolder` under a free, safe name.
 * Returns its path inside media/, its length, and whether it was converted.
 */
export async function importMusic(file, musicFolder) {
  const name = path.basename(file);
  const probe = await probeMusic(file);
  const convert = !playsAsIs(probe, file);
  await fs.mkdir(musicFolder, { recursive: true });
  const target = uniqueMediaPath(
    musicFolder,
    safeMediaName(name, ".wav", "music")
  );
  if (convert) {
    const partial = `${target}.partial.wav`;
    try {
      await runFfmpeg(musicTranscodeArgs(file, partial), name);
      await fs.rename(partial, target);
    } catch (cause) {
      await fs.rm(partial, { force: true });
      throw cause;
    }
  } else await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL);
  const result = convert ? await probeMusic(target) : probe;
  return {
    relativePath: `music/${path.basename(target)}`,
    durationSeconds: result.durationSeconds,
    transcoded: convert,
  };
}
