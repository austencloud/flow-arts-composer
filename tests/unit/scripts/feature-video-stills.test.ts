import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import {
  contactSheetLayout,
  parseStillTimes,
  writeContactSheet,
  writeStills,
} from "../../../scripts/feature-video/stills.mjs";

const run = promisify(execFile);
const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

describe("parseStillTimes", () => {
  it("reads seconds separated by commas", () => {
    expect(parseStillTimes("0, 4,6.5")).toEqual([0, 4, 6.5]);
  });

  it.each(["soon", "", "1,,2", "-1"])("refuses %j", (text) => {
    expect(() => parseStillTimes(text)).toThrow(
      "--at takes seconds separated by commas, like 0,4,6.5."
    );
  });
});

describe("contactSheetLayout", () => {
  it("is one frame a second, ten across", () => {
    expect(contactSheetLayout(7)).toEqual({ frames: 7, columns: 7, rows: 1 });
    expect(contactSheetLayout(60.2)).toEqual({
      frames: 61,
      columns: 10,
      rows: 7,
    });
    expect(contactSheetLayout(0.4)).toEqual({ frames: 1, columns: 1, rows: 1 });
    expect(contactSheetLayout(25, 4)).toEqual({
      frames: 25,
      columns: 4,
      rows: 7,
    });
  });
});

describe.skipIf(!canEncode)("with ffmpeg", () => {
  let folder: string;
  let clip: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "stills-"));
    clip = path.join(folder, "clip.mp4");
    await run(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=180x320:r=30:d=2.5",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      clip,
    ]);
  });

  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  /** A test clip `seconds` long, with a tone `audioSeconds` long if given. */
  async function makeClip(
    name: string,
    seconds: number,
    audioSeconds?: number
  ): Promise<string> {
    const file = path.join(folder, name);
    await run(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=s=180x320:r=30:d=${seconds}`,
      ...(audioSeconds === undefined
        ? []
        : ["-f", "lavfi", "-i", `sine=d=${audioSeconds}`, "-c:a", "aac"]),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
    return file;
  }

  /** Mean brightness of the middle of a first-row tile; the padding is 32. */
  async function tileBrightness(sheet: string, index: number): Promise<number> {
    const { stdout } = await run(
      toolPath("ffmpeg"),
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sheet,
        "-vf",
        `crop=200:200:${24 + index * 244}:24,format=gray,scale=1:1:flags=area`,
        "-f",
        "rawvideo",
        "-",
      ],
      { encoding: "buffer" }
    );
    return stdout[0];
  }

  it("writes a still at each time in stills/", async () => {
    const written = await writeStills(clip, [0, 1.5]);
    expect(written).toEqual([
      path.join(folder, "stills", "clip-0s.jpg"),
      path.join(folder, "stills", "clip-1.5s.jpg"),
    ]);
    for (const file of written)
      expect((await fs.stat(file)).size).toBeGreaterThan(0);
  });

  it("refuses a time past the end", async () => {
    await expect(writeStills(clip, [1, 2.5])).rejects.toThrow(
      "clip.mp4 is 2.50 s long; --at 2.5 is past its end."
    );
  });

  it("writes a contact sheet of one frame a second", async () => {
    const sheet = await writeContactSheet(clip);
    expect(sheet).toEqual({
      file: path.join(folder, "stills", "clip-contact.jpg"),
      frames: 3,
      columns: 3,
      rows: 1,
    });
    const { stdout } = await run(toolPath("ffprobe"), [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width",
      "-of",
      "csv=p=0",
      sheet.file,
    ]);
    // Three frames 240 wide, 4 px between them and 4 px around them.
    expect(Number(stdout.trim())).toBe(736);
  });

  it("sizes the sheet from the video, not audio that runs past it", async () => {
    const sheet = await writeContactSheet(await makeClip("padded.mp4", 2, 2.4));
    expect(sheet).toMatchObject({ frames: 2, columns: 2, rows: 1 });
    expect(await tileBrightness(sheet.file, 1)).toBeGreaterThan(60);
  });

  it("fills the last tile when the video ends early in a second", async () => {
    const sheet = await writeContactSheet(await makeClip("short.mp4", 2.2));
    expect(sheet).toMatchObject({ frames: 3, columns: 3, rows: 1 });
    expect(await tileBrightness(sheet.file, 2)).toBeGreaterThan(60);
  });

  it("makes a sheet of a video under half a second", async () => {
    const sheet = await writeContactSheet(await makeClip("blink.mp4", 0.4));
    expect(sheet).toMatchObject({ frames: 1, columns: 1, rows: 1 });
    expect(await tileBrightness(sheet.file, 0)).toBeGreaterThan(60);
  });
});
