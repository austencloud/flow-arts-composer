import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { toolPath } from "./media-import.mjs";

/**
 * How loud a finished render is, measured the way the platforms measure it
 * (EBU R128 through ffmpeg's ebur128 filter), and the music level that would
 * bring it to their usual target.
 */

const execFileAsync = promisify(execFile);
/** The integrated loudness most short-video platforms play at. */
export const TARGET_LUFS = -14;
/** Peaks stay under this so the platforms' own encoders do not clip them. */
export const PEAK_CEILING_DBTP = -1;
/** ffmpeg reports this for silence. */
const SILENT_LUFS = -70;

/** The integrated loudness, loudness range and true peak in ebur128's summary. */
export function parseEbur128Summary(text) {
  const at = text.lastIndexOf("Summary:");
  if (at < 0) throw new Error("ffmpeg printed no loudness summary.");
  const summary = text.slice(at).replace(/\r/g, "");
  const read = (pattern, what) => {
    const match = pattern.exec(summary);
    if (!match) throw new Error(`The loudness summary has no ${what}.`);
    return match[1] === "-inf" ? -Infinity : Number(match[1]);
  };
  return {
    integratedLufs: read(/^\s*I:\s+(-?\d+(?:\.\d+)?) LUFS$/m, "loudness"),
    rangeLu: read(/^\s*LRA:\s+(-?\d+(?:\.\d+)?) LU$/m, "loudness range"),
    truePeakDbtp: read(/^\s*Peak:\s+(-inf|-?\d+(?:\.\d+)?) dBFS$/m, "peak"),
  };
}

/**
 * The music level that brings the render to the target loudness without its
 * peaks passing the ceiling, assuming the music is all that plays. Null for
 * silence, which no level fixes.
 */
export function suggestMusicGain(gain, integratedLufs, truePeakDbtp) {
  if (!(integratedLufs > SILENT_LUFS)) return null;
  const toTarget = 10 ** ((TARGET_LUFS - integratedLufs) / 20);
  const toCeiling = 10 ** ((PEAK_CEILING_DBTP - truePeakDbtp) / 20);
  return (
    Math.round(Math.min(2, gain * Math.min(toTarget, toCeiling)) * 1000) / 1000
  );
}

export async function measureLoudness(file) {
  let stderr;
  try {
    ({ stderr } = await execFileAsync(
      toolPath("ffmpeg"),
      [
        "-nostats",
        "-hide_banner",
        "-i",
        file,
        "-vn",
        "-af",
        "ebur128=peak=true:framelog=verbose",
        "-f",
        "null",
        "-",
      ],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }
    ));
  } catch (cause) {
    throw new Error(
      `ffmpeg could not measure ${path.basename(file)}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
  return parseEbur128Summary(stderr);
}
