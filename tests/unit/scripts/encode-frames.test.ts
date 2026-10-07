import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const run = promisify(execFile);
const ENCODER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/demo-capture/encode-frames.py"
);
const haveTools = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-version"]);
    execFileSync("python", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

let folder: string;
beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "encode-"));
});
afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});

async function writeShot(id: string, extra: Record<string, unknown> = {}) {
  const dir = path.join(folder, "frames", id);
  await fs.mkdir(dir, { recursive: true });
  for (const n of [0, 1, 2]) {
    await run(toolPath("ffmpeg"), [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x112",
      "-frames:v",
      "1",
      path.join(dir, `0000${n}.jpg`),
    ]);
  }
  await fs.writeFile(
    path.join(dir, "capture.json"),
    JSON.stringify({
      id,
      frames: [
        { file: "00000.jpg", timestamp: 10 },
        { file: "00001.jpg", timestamp: 10.1 },
        { file: "00002.jpg", timestamp: 10.2 },
      ],
      ...extra,
    })
  );
}

describe.skipIf(!haveTools)("encode-frames.py", () => {
  it("writes one file at the size and place it is told", async () => {
    await writeShot("shot");
    const output = path.join(folder, "media", "captures", "shot.1.mp4");
    await run("python", [
      ENCODER,
      folder,
      "shot",
      "--frames-dir",
      path.join(folder, "frames"),
      "--output",
      output,
      "--size",
      "108x192",
      "--ffmpeg",
      toolPath("ffmpeg"),
    ]);
    const size = execFileSync(
      toolPath("ffprobe"),
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        output,
      ],
      { encoding: "utf8" }
    ).trim();
    expect(size).toBe("108,192");
  });

  it("rejects a failed capture and leaves no file", async () => {
    await writeShot("bad", { failure: "Error: button missing" });
    const output = path.join(folder, "bad.mp4");
    await expect(
      run("python", [
        ENCODER,
        folder,
        "bad",
        "--frames-dir",
        path.join(folder, "frames"),
        "--output",
        output,
        "--ffmpeg",
        toolPath("ffmpeg"),
      ])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Rejected capture bad"),
    });
    await expect(fs.access(output)).rejects.toThrow();
  });

  it("asks for an id when --output is given", async () => {
    await expect(
      run("python", [ENCODER, folder, "--output", path.join(folder, "x.mp4")])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("--output needs exactly one capture id"),
    });
  });

  it("still writes <id>.mp4 under raw-desktop with the old arguments", async () => {
    const dir = path.join(folder, "production", "frames", "old");
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await writeShot("old");
    await fs.rename(path.join(folder, "frames", "old"), dir);
    await run("python", [
      ENCODER,
      folder,
      "old",
      "--ffmpeg",
      toolPath("ffmpeg"),
    ]);
    await fs.access(path.join(folder, "raw-desktop", "old.mp4"));
  });
});
