import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importTake,
  needsTranscode,
  probeMedia,
  readProbe,
  safeMediaName,
  toolPath,
  transcodeArgs,
  uniqueMediaPath,
} from "../../../scripts/feature-video/media-import.mjs";

/** Whether this computer's ffmpeg lists `name` (CI may have no ffmpeg). */
function ffmpegHas(list: "-encoders" | "-filters", name: string): boolean {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", list], {
      encoding: "utf8",
    }).includes(` ${name} `);
  } catch {
    return false;
  }
}
const canEncode =
  ffmpegHas("-encoders", "libx264") && ffmpegHas("-encoders", "libx265");
const canToneMap =
  canEncode &&
  ffmpegHas("-filters", "zscale") &&
  ffmpegHas("-filters", "tonemap");

// Each take below is a one-second clip that ffmpeg encodes with libx264 or
// libx265 and the import then transcodes again: 0.5 to 1.4 s per test with
// the cores free (ten-file run, 2026-10-09). ffmpeg spreads an encode across
// every core, so under the full suite's 31 forks it gets none to itself, and
// on 2026-10-08 one full run blew the 30 s default. The budget is the 120 s
// tests/unit/3d-animation gives a loaded machine.
const ENCODE_TIMEOUT_MS = 120_000;

const SDR = {
  durationSeconds: 1,
  videoCodec: "h264",
  pixelFormat: "yuv420p",
  transfer: "bt709",
  hdr: false,
  audioStream: 0,
};

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-media-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** A one-second test clip with a tone, encoded with `video`. */
function makeClip(name: string, video: string[]): string {
  const file = path.join(dir, name);
  execFileSync(toolPath("ffmpeg"), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "1",
    ...video,
    "-c:a",
    "aac",
    file,
  ]);
  return file;
}

describe("reading a clip", () => {
  it("keeps the first sound ffmpeg can read and spots HDR", () => {
    expect(
      readProbe(
        {
          format: { duration: "12.5" },
          streams: [
            {
              codec_type: "video",
              codec_name: "hevc",
              pix_fmt: "yuv420p10le",
              color_transfer: "arib-std-b67",
            },
            // Spatial audio: ffprobe cannot name its codec.
            { codec_type: "audio" },
            { codec_type: "audio", codec_name: "aac" },
          ],
        },
        "IMG_0412.MOV"
      )
    ).toEqual({
      durationSeconds: 12.5,
      videoCodec: "hevc",
      pixelFormat: "yuv420p10le",
      transfer: "arib-std-b67",
      hdr: true,
      audioStream: 1,
    });
    expect(() =>
      readProbe(
        {
          format: { duration: "3" },
          streams: [{ codec_type: "audio", codec_name: "aac" }],
        },
        "voice.mov"
      )
    ).toThrow("voice.mov has no video.");
    expect(() =>
      readProbe(
        { format: {}, streams: [{ codec_type: "video", codec_name: "h264" }] },
        "x.mp4"
      )
    ).toThrow("how long x.mp4 is");
  });

  it("converts everything but 8-bit SDR H.264 in an MP4", () => {
    expect(needsTranscode(SDR, "a.mp4")).toBe(false);
    expect(needsTranscode(SDR, "a.MOV")).toBe(true);
    expect(needsTranscode({ ...SDR, videoCodec: "hevc" }, "a.mp4")).toBe(true);
    expect(
      needsTranscode({ ...SDR, pixelFormat: "yuv420p10le" }, "a.mp4")
    ).toBe(true);
    expect(needsTranscode({ ...SDR, hdr: true }, "a.mp4")).toBe(true);
  });

  it("builds the H.264 copy's arguments and tone-maps HDR", () => {
    expect(
      transcodeArgs("in.mov", "out.mp4", { ...SDR, videoCodec: "hevc" })
    ).toEqual([
      "-hide_banner",
      "-loglevel",
      "error",
      "-stats",
      "-y",
      "-i",
      "in.mov",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
    const hdr = transcodeArgs("in.mov", "out.mp4", {
      ...SDR,
      videoCodec: "hevc",
      transfer: "arib-std-b67",
      hdr: true,
      audioStream: null,
    });
    const filter = hdr[hdr.indexOf("-vf") + 1];
    expect(filter).toMatch(
      /^setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc,zscale=t=linear/
    );
    expect(filter).toMatch(/zscale=t=bt709:m=bt709:r=tv,format=yuv420p$/);
    expect(hdr).toContain("-an");
    expect(hdr).not.toContain("-c:a");
  });
});

describe("naming a take's file", () => {
  it("makes a safe .mp4 name and never reuses one", async () => {
    expect(safeMediaName("IMG_0412.MOV")).toBe("img_0412.mp4");
    expect(safeMediaName("Café take 1.mov")).toBe("cafe-take-1.mp4");
    expect(safeMediaName("!!!.mp4")).toBe("take.mp4");
    expect(uniqueMediaPath(dir, "a.mp4")).toBe(path.join(dir, "a.mp4"));
    await fs.writeFile(path.join(dir, "a.mp4"), "");
    expect(uniqueMediaPath(dir, "a.mp4")).toBe(path.join(dir, "a-2.mp4"));
    await fs.writeFile(path.join(dir, "a-2.mp4"), "");
    expect(uniqueMediaPath(dir, "a.mp4")).toBe(path.join(dir, "a-3.mp4"));
  });
});

describe("importing a take", () => {
  it.skipIf(!canEncode)("copies an H.264 MP4 byte for byte", async () => {
    const source = makeClip("Opening.mp4", [
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ]);
    const footage = path.join(dir, "media", "footage");
    const take = await importTake(source, footage);
    expect(take).toMatchObject({
      relativePath: "footage/opening.mp4",
      transcoded: false,
    });
    expect(take.durationSeconds).toBeCloseTo(1, 1);
    expect(await fs.readFile(path.join(footage, "opening.mp4"))).toEqual(
      await fs.readFile(source)
    );
  }, ENCODE_TIMEOUT_MS);

  it.skipIf(!canEncode)(
    "converts an HEVC .mov to H.264 MP4 with its sound, under a free name",
    async () => {
      const source = makeClip("My Take 1.MOV", [
        "-c:v",
        "libx265",
        "-x265-params",
        "log-level=error",
        "-pix_fmt",
        "yuv420p",
        "-tag:v",
        "hvc1",
      ]);
      const footage = path.join(dir, "media", "footage");
      const first = await importTake(source, footage);
      const second = await importTake(source, footage);
      expect(first).toMatchObject({
        relativePath: "footage/my-take-1.mp4",
        transcoded: true,
      });
      expect(second.relativePath).toBe("footage/my-take-1-2.mp4");
      const copy = await probeMedia(path.join(footage, "my-take-1.mp4"));
      expect(copy).toMatchObject({
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        audioStream: 0,
      });
      expect(copy.durationSeconds).toBeCloseTo(1, 1);
      // No half-written file is left behind.
      expect((await fs.readdir(footage)).sort()).toEqual([
        "my-take-1-2.mp4",
        "my-take-1.mp4",
      ]);
    },
    ENCODE_TIMEOUT_MS
  );

  it.skipIf(!canToneMap)("tone-maps HDR footage to SDR", async () => {
    // ffmpeg 8 tags a file from its frames, so setparams marks it as HLG.
    const source = makeClip("hlg.mov", [
      "-vf",
      "setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc",
      "-c:v",
      "libx265",
      "-x265-params",
      "log-level=error",
      "-pix_fmt",
      "yuv420p10le",
    ]);
    expect((await probeMedia(source)).hdr).toBe(true);
    const take = await importTake(source, path.join(dir, "media", "footage"));
    const copy = await probeMedia(path.join(dir, "media", take.relativePath));
    expect(copy).toMatchObject({
      videoCodec: "h264",
      pixelFormat: "yuv420p",
      transfer: "bt709",
      hdr: false,
    });
  }, ENCODE_TIMEOUT_MS);
});
