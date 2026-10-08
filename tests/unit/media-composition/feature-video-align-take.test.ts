import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  alignSignals,
  alignTake,
  loudnessEnvelope,
  mediaPathFromUrl,
  onsetStrength,
} from "../../../scripts/feature-video/align-take.mjs";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import { cameraTake, clickTrack, wav } from "./feature-video-audio-fixtures";

const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

describe("loudness envelopes", () => {
  it("measures 1/200 s frames in dB and keeps only the rises", () => {
    const samples = new Float32Array(160);
    samples.fill(0.5, 40, 80);
    const envelope = loudnessEnvelope(samples, 8000);
    expect(envelope).toHaveLength(4);
    expect(envelope[0]).toBeCloseTo(-100, 3);
    expect(envelope[1]).toBeCloseTo(10 * Math.log10(0.25), 3);
    expect(Array.from(onsetStrength(envelope), (v) => Math.round(v))).toEqual([
      0, 94, 0, 0,
    ]);
  });
});

describe("lining a take up with the music", () => {
  const rate = 8000;
  const music = clickTrack(20, rate);

  it("finds a take that starts inside the music", () => {
    const result = alignSignals(
      music,
      cameraTake(music, rate, 3.2037, 10),
      rate
    );
    expect(Math.abs(result.offsetSeconds - 3.2037)).toBeLessThanOrEqual(0.005);
    expect(result.confidence).toBeGreaterThan(1.5);
    expect(result.candidates[0]).toEqual({
      offsetSeconds: result.offsetSeconds,
      score: result.score,
    });
    expect(result).not.toHaveProperty("warning");
  });

  it("finds a take that started before the music", () => {
    const result = alignSignals(music, cameraTake(music, rate, -1, 9), rate);
    expect(Math.abs(result.offsetSeconds + 1)).toBeLessThanOrEqual(0.005);
  });

  it("warns when the take's sound is not the music", () => {
    const other = cameraTake(clickTrack(12, rate, 31337), rate, 0, 10);
    expect(alignSignals(music, other, rate).warning).toBeDefined();
  });

  it("lists the bars that fit when the music repeats", () => {
    // A 2 s intro, then one 2 s bar played six times.
    const bar = clickTrack(2, rate, 11);
    const looped = new Float32Array(14 * rate);
    looped.set(clickTrack(2, rate, 12));
    for (let copy = 1; copy <= 6; copy += 1) looped.set(bar, copy * 2 * rate);
    const result = alignSignals(looped, cameraTake(looped, rate, 6, 5), rate);
    expect(result.warning).toMatch(/^Several offsets fit about as well/);
    expect(result.candidates).toHaveLength(3);
    for (const { offsetSeconds } of result.candidates) {
      expect([2, 4, 6, 8]).toContain(Math.round(offsetSeconds));
      expect(
        Math.abs(offsetSeconds - Math.round(offsetSeconds))
      ).toBeLessThanOrEqual(0.005);
    }
  });
});

describe("media files from their URLs", () => {
  it("finds the file in the folder the URL names", () => {
    expect(
      mediaPathFromUrl(
        "/api/dev/feature-videos/promo/media/music/derail.wav",
        "E:/features"
      )
    ).toBe(path.join("E:/features", "promo", "media", "music", "derail.wav"));
    for (const url of [
      "/api/dev/feature-videos/promo/media/../secret.wav",
      "/api/dev/feature-videos/promo/media/a%2F..%2Fb.wav",
      "https://example.test/x.wav",
    ])
      expect(() => mediaPathFromUrl(url, "E:/features")).toThrow(
        "is not a feature video media URL."
      );
  });
});

describe("aligning real files", () => {
  let dir: string;
  let musicFile: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "align-take-"));
    musicFile = path.join(dir, "music.wav");
    await fs.writeFile(musicFile, wav(clickTrack(12, 48000), 48000));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  /**
   * A 6 s clip filmed while the music played from its 2.5 s, the sound
   * starting `soundLateSeconds` after the picture, as some cameras record it.
   */
  function filmTake(soundLateSeconds: number): string {
    const takeFile = path.join(dir, `take-${soundLateSeconds}.mp4`);
    execFileSync(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x120:rate=30",
      "-itsoffset",
      String(soundLateSeconds),
      "-ss",
      "2.5",
      "-i",
      musicFile,
      "-t",
      "6",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-af",
      "volume=0.4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      takeFile,
    ]);
    return takeFile;
  }

  it.skipIf(!canEncode)(
    "lines up a camera clip's sound with the music file",
    async () => {
      const result = await alignTake(filmTake(0), musicFile);
      expect(Math.abs(result.offsetSeconds - 2.5)).toBeLessThan(1 / 60);
      expect(result).not.toHaveProperty("warning");
    }
  );

  it.skipIf(!canEncode)(
    "counts from the picture's start when the sound starts later",
    async () => {
      // The music's 2.5 s plays at the clip's 0.1 s, so its 2.4 s at the clip's 0 s.
      const result = await alignTake(filmTake(0.1), musicFile);
      expect(Math.abs(result.offsetSeconds - 2.4)).toBeLessThan(1 / 60);
    }
  );
});
