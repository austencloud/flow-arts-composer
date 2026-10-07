import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  measureLoudness,
  parseEbur128Summary,
  suggestMusicGain,
} from "../../../scripts/feature-video/loudness.mjs";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const hasFfmpeg = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
})();

/** ffmpeg 8.0.1's summary for a quiet tone, as Windows prints it. */
const TONE = [
  "  ebur128:out0 -> Stream #0:0 (pcm_s16le)",
  "[Parsed_ebur128_0 @ 00000168717ecac0] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -33.8 LUFS",
  "    Threshold: -43.8 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         0.0 LU",
  "    Threshold: -53.8 LUFS",
  "    LRA low:   -33.8 LUFS",
  "    LRA high:  -33.8 LUFS",
  "",
  "  True peak:",
  "    Peak:      -33.1 dBFS",
  "[out#0/null @ 0000016873009bc0] video:0KiB audio:1125KiB subtitle:0KiB",
].join("\r\n");

/** The same for two seconds of silence. */
const SILENCE = [
  "[Parsed_ebur128_0 @ 0000015e67f9cac0] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -70.0 LUFS",
  "    Threshold:   0.0 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         0.0 LU",
  "    Threshold:   0.0 LUFS",
  "    LRA low:     0.0 LUFS",
  "    LRA high:    0.0 LUFS",
  "",
  "  True peak:",
  "    Peak:       -inf dBFS",
].join("\r\n");

describe("reading ffmpeg's loudness summary", () => {
  it("reads loudness, range and peak", () => {
    expect(parseEbur128Summary(TONE)).toEqual({
      integratedLufs: -33.8,
      rangeLu: 0,
      truePeakDbtp: -33.1,
    });
    expect(parseEbur128Summary(SILENCE)).toEqual({
      integratedLufs: -70,
      rangeLu: 0,
      truePeakDbtp: -Infinity,
    });
  });

  it("reads only the last summary", () => {
    const frameLine =
      "[Parsed_ebur128_0 @ 1] t: 5.9  TARGET:-23 LUFS  M: -12.0 S: -12.0  I: -12.0 LUFS  LRA: 0.0 LU";
    expect(parseEbur128Summary(`${frameLine}\r\n${TONE}`).integratedLufs).toBe(
      -33.8
    );
  });

  it("says when there is no summary", () => {
    expect(() => parseEbur128Summary("Error opening input")).toThrow(
      "ffmpeg printed no loudness summary."
    );
  });
});

describe("suggesting a music level", () => {
  it("brings the render to -14 LUFS", () => {
    // 4 dB too loud at level 0.8: 0.8 * 10^(-4/20).
    expect(suggestMusicGain(0.8, -10, -6)).toBe(0.505);
  });

  it("stops the peaks at -1 dBTP", () => {
    // Loudness would allow +6 dB, but the peak is already at -3 dBTP.
    expect(suggestMusicGain(1, -20, -3)).toBe(1.259);
  });

  it("goes no higher than 2, and gives nothing for silence", () => {
    expect(suggestMusicGain(1, -33.8, -33.1)).toBe(2);
    expect(suggestMusicGain(1, -70, -Infinity)).toBeNull();
  });
});

describe("measuring a file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "loudness-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it.skipIf(!hasFfmpeg)(
    "measures a tone's peak where it was made",
    async () => {
      const file = path.join(dir, "tone.wav");
      // ffmpeg's sine source peaks at 1/8 of full scale: -18.06 dB.
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=997:sample_rate=48000",
        "-t",
        "3",
        file,
      ]);
      const measured = await measureLoudness(file);
      expect(measured.truePeakDbtp).toBeCloseTo(-18.06, 0);
      expect(measured.integratedLufs).toBeGreaterThan(-30);
      expect(measured.integratedLufs).toBeLessThan(-15);
    }
  );
});
