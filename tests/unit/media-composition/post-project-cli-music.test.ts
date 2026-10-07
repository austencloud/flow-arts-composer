/**
 * The command line's music commands, run against a stand-in for the dev
 * server: what each sends, what each refuses before sending anything, and
 * the files each reads or writes in the feature video's folder.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const run = promisify(execFile);
const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/post-project.mjs"
);
const hasFfmpeg = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
})();

/** The parts of a post these commands read. */
interface StandInProject {
  tracks: { items: { id: string; kind: string; takeId?: string }[] }[];
  takes: {
    id: string;
    ref: { kind: "linked"; url: string } | { kind: "catalog"; videoId: string };
  }[];
  music?: { url: string; gain: number };
}

let server: http.Server;
let url: string;
/** Holds every feature video's folder, as the dev server's does. */
let root: string;
let folder: string;
let project: StandInProject;
let calls: { method: string; path: string; body: unknown }[];

/** A dev server stand-in: no editor is open, so edits go to the file. */
beforeEach(async () => {
  calls = [];
  project = { tracks: [{ items: [] }], takes: [] };
  root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-cli-music-"));
  folder = path.join(root, "promo");
  await fs.mkdir(folder);
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      calls.push({
        method: request.method ?? "GET",
        path: target.pathname,
        body: text ? JSON.parse(text) : undefined,
      });
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          return send(200, { sessions: [] });
        case "GET /api/dev/feature-videos/promo":
          return send(200, { file: { project }, fingerprint: "f", folder });
        case "POST /api/dev/feature-videos/promo/ops":
          return send(200, { status: "applied", revision: 2 });
        default:
          return send(404, { message: "No such route." });
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
});

/** Runs the CLI against the stand-in; reports failures instead of throwing. */
async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [
      CLI,
      ...args,
      "--url",
      url,
    ]);
    return { code: 0, stdout, stderr };
  } catch (cause) {
    const failed = cause as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

const posts = () =>
  calls
    .filter((call) => call.method === "POST")
    .map((call) => [call.path, call.body]);

/** Every edit sent to the feature video's file, in order. */
const sent = () =>
  posts().flatMap(([, body]) => (body as { ops: unknown[] }).ops);

describe("music settings from the command line", () => {
  it("sends the music's settings, with times as bars, clocks or seconds", async () => {
    const result = await cli(
      "music",
      "--feature",
      "promo",
      "--start",
      "@3",
      "--from",
      "0:05.5",
      "--to",
      "@10.3",
      "--gain",
      "0.8",
      "--fade-in",
      "1",
      "--fade-out",
      "2.5",
      "--bpm",
      "85",
      "--downbeat",
      "0.42",
      "--beats-per-bar",
      "3",
      "--label",
      "Derail",
      "--artist",
      "",
      "--license",
      "Epidemic Sound, trial, 2026-10-07"
    );
    expect(result.code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/feature-videos/promo/ops",
        {
          ops: [
            {
              op: "music",
              startSeconds: { bar: 3 },
              sourceInSeconds: 5.5,
              sourceOutSeconds: { bar: 10, beat: 3 },
              gain: 0.8,
              fadeInSeconds: 1,
              fadeOutSeconds: 2.5,
              bpm: 85,
              downbeatSeconds: 0.42,
              beatsPerBar: 3,
              label: "Derail",
              artist: "",
              license: "Epidemic Sound, trial, 2026-10-07",
            },
          ],
        },
      ],
    ]);
  });

  it("removes the beat grid with --bpm none", async () => {
    const result = await cli("music", "--feature", "promo", "--bpm", "none");
    expect(result.code).toBe(0);
    expect(sent()).toEqual([{ op: "music", bpm: null }]);
  });

  it("refuses a setting that is not a number or a time, before sending anything", async () => {
    const refusals: [string[], string][] = [
      [
        ["--bpm", "fast"],
        "--bpm must be a number, or none to remove the beat grid.",
      ],
      [["--gain", "loud"], "--gain must be a number."],
      [["--fade-in", ""], "--fade-in must be a number."],
      [
        ["--start", "soon"],
        "--start must be seconds (12.5), a clock (1:02.5), or a bar like @9 or @9.3.",
      ],
      [[], "music needs a setting to change, such as --gain 0.8 or --bpm 85."],
    ];
    for (const [flags, message] of refusals) {
      const result = await cli("music", "--feature", "promo", ...flags);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    }
    expect(posts()).toEqual([]);
  });

  it("places titles and trims clips at bars and clocks", async () => {
    await cli("add-titles", "--feature", "promo", "--at", "@5");
    await cli(
      "trim",
      "--feature",
      "promo",
      "--item",
      "v1",
      "--edge",
      "end",
      "--seconds",
      "@3.3"
    );
    await cli(
      "trim",
      "--feature",
      "promo",
      "--item",
      "v1",
      "--edge",
      "start",
      "--seconds",
      "1:02.5"
    );
    expect(sent()).toEqual([
      { op: "add-titles", at: { bar: 5 } },
      { op: "trim", item: "v1", edge: "end", seconds: { bar: 3, beat: 3 } },
      { op: "trim", item: "v1", edge: "start", seconds: 62.5 },
    ]);
  });

  it("removes the music, and puts a clip in time with it at a given offset", async () => {
    await cli("remove-music", "--feature", "promo");
    await cli(
      "sync-to-music",
      "--feature",
      "promo",
      "--item",
      "v1",
      "--offset",
      "-1.25"
    );
    const missing = await cli(
      "sync-to-music",
      "--feature",
      "promo",
      "--item",
      "v1"
    );
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("--offset is required.");
    expect(sent()).toEqual([
      { op: "remove-music" },
      { op: "sync-to-music", item: "v1", offsetSeconds: -1.25 },
    ]);
  });

  it.skipIf(!hasFfmpeg)(
    "copies a music file into the project and adds it",
    async () => {
      const source = path.join(root, "Derail Theme.wav");
      // ffmpeg writes a plain 16-bit WAV, which add-music copies as it is.
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        "2",
        source,
      ]);
      const result = await cli(
        "add-music",
        source,
        "--feature",
        "promo",
        "--label",
        "Derail",
        "--artist",
        "Yellowbase"
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        media: "music/derail-theme.wav",
        converted: false,
      });
      const [op] = sent() as { durationSeconds: number }[];
      expect(op).toMatchObject({
        op: "add-music",
        url: "/api/dev/feature-videos/promo/media/music/derail-theme.wav",
        label: "Derail",
        artist: "Yellowbase",
      });
      expect(op?.durationSeconds).toBeCloseTo(2, 2);
      await fs.access(path.join(folder, "media", "music", "derail-theme.wav"));
    }
  );
});
