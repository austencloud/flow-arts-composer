import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importMusic,
  musicTranscodeArgs,
  playsAsIs,
  probeMusic,
  readMusicProbe,
} from "../../../scripts/feature-video/music-import.mjs";
import {
  safeMediaName,
  toolPath,
} from "../../../scripts/feature-video/media-import.mjs";
import { parseTimeArg } from "../../../scripts/feature-video/time-args.mjs";

const hasFfmpeg = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
})();

describe("times on the command line", () => {
  it("reads seconds, clocks and bars", () => {
    expect(parseTimeArg("12.5", "at")).toBe(12.5);
    expect(parseTimeArg(".5", "at")).toBe(0.5);
    expect(parseTimeArg("1:02.5", "at")).toBe(62.5);
    expect(parseTimeArg("0:12.5", "at")).toBe(12.5);
    expect(parseTimeArg("@9", "at")).toEqual({ bar: 9 });
    expect(parseTimeArg("@9.3", "at")).toEqual({ bar: 9, beat: 3 });
    expect(parseTimeArg(" @0 ", "at")).toEqual({ bar: 0 });
  });

  it.each(["", "soon", "1:75", "-2", "@", "@9.", "@x", "1e3"])(
    "refuses %j",
    (text) => {
      expect(() => parseTimeArg(text, "at")).toThrow(
        "--at must be seconds (12.5), a clock (1:02.5), or a bar like @9 or @9.3."
      );
    }
  );
});

describe("reading a music file", () => {
  it("keeps its sound's codec, rate and channels", () => {
    expect(
      readMusicProbe(
        {
          format: { duration: "96.5" },
          streams: [
            { codec_type: "video", codec_name: "mjpeg" },
            {
              codec_type: "audio",
              codec_name: "mp3",
              sample_rate: "44100",
              channels: 2,
            },
          ],
        },
        "Derail.mp3"
      )
    ).toEqual({
      durationSeconds: 96.5,
      codec: "mp3",
      sampleRate: 44100,
      channels: 2,
    });
    expect(() =>
      readMusicProbe(
        { format: { duration: "3" }, streams: [{ codec_type: "video" }] },
        "clip.mp4"
      )
    ).toThrow("clip.mp4 has no sound.");
  });

  it("copies plain 44.1 or 48 kHz PCM WAV and converts the rest", () => {
    const pcm = {
      durationSeconds: 1,
      codec: "pcm_s16le",
      sampleRate: 48000,
      channels: 2,
    };
    expect(playsAsIs(pcm, "a.wav")).toBe(true);
    expect(playsAsIs({ ...pcm, codec: "pcm_s24le" }, "a.WAV")).toBe(true);
    expect(playsAsIs({ ...pcm, sampleRate: 44100 }, "a.wav")).toBe(true);
    expect(playsAsIs({ ...pcm, sampleRate: 96000 }, "a.wav")).toBe(false);
    expect(playsAsIs({ ...pcm, codec: "pcm_f32le" }, "a.wav")).toBe(false);
    expect(playsAsIs({ ...pcm, channels: 6 }, "a.wav")).toBe(false);
    expect(playsAsIs(pcm, "a.aiff")).toBe(false);
    expect(musicTranscodeArgs("in.mp3", "out.wav")).toEqual([
      "-hide_banner",
      "-loglevel",
      "error",
      "-stats",
      "-y",
      "-i",
      "in.mp3",
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      "out.wav",
    ]);
  });

  it("names music files like takes, as .wav", () => {
    expect(safeMediaName("Derail - Yellowbase.mp3", ".wav", "music")).toBe(
      "derail-yellowbase.wav"
    );
    expect(safeMediaName("!!!.flac", ".wav", "music")).toBe("music.wav");
    expect(safeMediaName("IMG_1.MOV")).toBe("img_1.mp4");
  });
});

describe("importing music", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-music-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function tone(name: string, codec: string[]): string {
    const file = path.join(dir, name);
    execFileSync(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "1",
      ...codec,
      file,
    ]);
    return file;
  }

  it.skipIf(!hasFfmpeg)("copies a 44.1 kHz WAV byte for byte", async () => {
    const source = tone("Derail.wav", ["-c:a", "pcm_s16le"]);
    const folder = path.join(dir, "media", "music");
    const music = await importMusic(source, folder);
    expect(music).toMatchObject({
      relativePath: "music/derail.wav",
      transcoded: false,
    });
    expect(music.durationSeconds).toBeCloseTo(1, 2);
    expect(await fs.readFile(path.join(folder, "derail.wav"))).toEqual(
      await fs.readFile(source)
    );
  });

  it.skipIf(!hasFfmpeg)(
    "converts compressed music to 48 kHz stereo WAV under a free name",
    async () => {
      const source = tone("Fly Away.m4a", ["-c:a", "aac"]);
      const folder = path.join(dir, "media", "music");
      const first = await importMusic(source, folder);
      const second = await importMusic(source, folder);
      expect(first).toMatchObject({
        relativePath: "music/fly-away.wav",
        transcoded: true,
      });
      expect(second.relativePath).toBe("music/fly-away-2.wav");
      expect(await probeMusic(path.join(folder, "fly-away.wav"))).toMatchObject(
        {
          codec: "pcm_s16le",
          sampleRate: 48000,
          channels: 2,
        }
      );
      expect((await fs.readdir(folder)).sort()).toEqual([
        "fly-away-2.wav",
        "fly-away.wav",
      ]);
    }
  );
});
