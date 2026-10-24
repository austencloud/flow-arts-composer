import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import { writeReleaseMedia } from "../../../scripts/feature-video/stills.mjs";

const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

describe.skipIf(!canEncode)("a release clip's GIF and poster", () => {
  let folder: string;
  let render: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "release-media-"));
    render = path.join(folder, "clip.mp4");
    execFileSync(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x320:rate=30:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      render,
    ]);
  });

  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it("writes a looping GIF and a mid-clip poster beside the render", async () => {
    const result = await writeReleaseMedia(render, { gif: { size: 160 } });
    expect(result.gif).toBe(path.join(folder, "clip.gif"));
    expect(result.poster).toBe(path.join(folder, "clip.jpg"));
    expect(result.posterAt).toBe(1);
    expect(result).not.toHaveProperty("warning");

    const gif = await fs.readFile(result.gif);
    expect(gif.subarray(0, 6).toString("latin1")).toBe("GIF89a");
    // The NETSCAPE extension is what makes a GIF loop in a mail client.
    expect(gif.includes(Buffer.from("NETSCAPE2.0", "latin1"))).toBe(true);
    // Logical screen width, little-endian, right after the header.
    expect(gif.readUInt16LE(6)).toBe(160);

    const poster = await fs.readFile(result.poster);
    expect(poster.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("refuses a poster time past the end", async () => {
    await expect(writeReleaseMedia(render, { posterAt: 5 })).rejects.toThrow(
      /outside it/
    );
  });
});
