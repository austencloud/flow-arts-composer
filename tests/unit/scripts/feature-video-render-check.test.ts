import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import {
  clickTrack,
  firstBrightSeconds,
  firstLoudSeconds,
  flashClipArgs,
  parseCheckArgs,
} from "../../../scripts/feature-video/render-check.mjs";

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

describe("parseCheckArgs", () => {
  it("takes a task server's address", () => {
    expect(parseCheckArgs(["--url", "http://localhost:5193/"])).toEqual({
      url: "http://localhost:5193",
    });
  });

  it("needs an address", () => {
    expect(() => parseCheckArgs([])).toThrow(
      "render-check needs --url, a task server such as http://localhost:5193."
    );
  });

  it("runs only on this computer", () => {
    expect(() => parseCheckArgs(["--url", "https://example.com"])).toThrow(
      "--url must be a loopback HTTP(S) address."
    );
  });

  it("never runs against 5173", () => {
    expect(() => parseCheckArgs(["--url", "https://localhost:5173"])).toThrow(
      "never 5173"
    );
  });
});

describe("clickTrack", () => {
  it("is a 48 kHz mono 16-bit WAV with a burst at each click", () => {
    const wav = clickTrack(1, [0.5]);
    expect(wav.length).toBe(44 + 48000 * 2);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt16LE(34)).toBe(16);
    const sample = (index: number) => wav.readInt16LE(44 + index * 2);
    expect(sample(23999)).toBe(0);
    expect(Math.abs(sample(24006))).toBeGreaterThan(20000);
  });
});

describe.skipIf(!canEncode)("measuring", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "render-check-"));
  });

  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it("finds the flash at 0.5 s", async () => {
    const clip = path.join(folder, "flash.mp4");
    await run(toolPath("ffmpeg"), flashClipArgs(clip));
    const seconds = await firstBrightSeconds(clip);
    expect(seconds).not.toBeNull();
    expect(Math.abs(seconds! - 0.5)).toBeLessThanOrEqual(1 / 60);
  });

  it("finds the first click at 0.5 s", async () => {
    const wav = path.join(folder, "clicks.wav");
    await fs.writeFile(wav, clickTrack());
    const seconds = await firstLoudSeconds(wav);
    expect(seconds).not.toBeNull();
    expect(Math.abs(seconds! - 0.5)).toBeLessThan(0.001);
  });

  it("finds nothing loud in a quiet file", async () => {
    const wav = path.join(folder, "quiet.wav");
    await fs.writeFile(wav, clickTrack(1, []));
    expect(await firstLoudSeconds(wav)).toBeNull();
  });
});
