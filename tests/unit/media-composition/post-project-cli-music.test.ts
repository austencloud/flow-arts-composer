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
import {
  createFeatureVideoStore,
  type FeatureVideoStore,
} from "$lib/server/feature-video-store";
import { cameraTake, clickTrack, wav } from "./feature-video-audio-fixtures";
import { suggestMusicGain } from "../../../scripts/feature-video/loudness.mjs";
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

const MUSIC_URL = "/api/dev/feature-videos/promo/media/music/song.wav";
const TAKE_URL = "/api/dev/feature-videos/promo/media/footage/take.wav";
const NO_MUSIC = "This post has no music. Add it with: add-music <file>.";

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
/** When set, the stand-in applies posted edits with this, as the dev server does. */
let applyEdits: ((ops: unknown) => Promise<unknown>) | undefined;
/** When set, the stand-in refuses every posted edit with this status and message. */
let refuseOps: { status: number; message: string } | undefined;

/** A dev server stand-in: no editor is open, so edits go to the file. */
beforeEach(async () => {
  calls = [];
  applyEdits = undefined;
  refuseOps = undefined;
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
        case "POST /api/dev/feature-videos/promo/ops": {
          if (refuseOps)
            return send(refuseOps.status, { message: refuseOps.message });
          if (!applyEdits) return send(200, { status: "applied", revision: 2 });
          const { ops } = calls[calls.length - 1]!.body as { ops: unknown };
          // A refusal is a 400 carrying the edit's own message, as the route sends.
          applyEdits(ops).then(
            (result) => send(200, result),
            (cause: { status?: number; message?: string }) =>
              send(cause.status ?? 500, { message: cause.message })
          );
          return;
        }
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

/** A 2 s plain 16-bit WAV, which add-music copies as it is. */
function songFile(name = "Derail Theme.wav"): string {
  const file = path.join(root, name);
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
    file,
  ]);
  return file;
}

/** The folder add-music copies music into, in the feature video's folder. */
const songs = () => path.join(folder, "media", "music");
/** The url the editor plays a file in that folder from. */
const urlOf = (file: string, slug = "promo") =>
  `/api/dev/feature-videos/${slug}/media/music/${file}`;

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
      const source = songFile();
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
        reused: false,
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

describe("adding music the post may already have", () => {
  const urls = () => (sent() as { url: string }[]).map((op) => op.url);

  it.skipIf(!hasFfmpeg)(
    "adds the same song again as the same file, so the editor keeps its settings",
    async () => {
      const source = songFile();
      const first = await cli("add-music", source, "--feature", "promo");
      expect(first.code).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({
        media: "music/derail-theme.wav",
        reused: false,
      });
      // The post now plays what the first run added.
      project.music = { url: urlOf("derail-theme.wav"), gain: 1 };
      const again = await cli("add-music", source, "--feature", "promo");
      expect(again.code).toBe(0);
      expect(JSON.parse(again.stdout)).toMatchObject({
        media: "music/derail-theme.wav",
        converted: false,
        reused: true,
      });
      // Exactly the url the music has, so the editor keeps its place and trims.
      expect(urls()).toEqual([
        urlOf("derail-theme.wav"),
        urlOf("derail-theme.wav"),
      ]);
      expect(await fs.readdir(songs())).toEqual(["derail-theme.wav"]);
    }
  );

  it.skipIf(!hasFfmpeg)(
    "goes back to the copy the post plays when two copies are identical",
    async () => {
      const source = songFile();
      await cli("add-music", source, "--feature", "promo");
      // An older run left a second, identical copy, and the post plays that one.
      await fs.copyFile(
        path.join(songs(), "derail-theme.wav"),
        path.join(songs(), "derail-theme-2.wav")
      );
      project.music = { url: urlOf("derail-theme-2.wav"), gain: 1 };
      const again = await cli("add-music", source, "--feature", "promo");
      expect(JSON.parse(again.stdout)).toMatchObject({
        media: "music/derail-theme-2.wav",
        reused: true,
      });
      expect(urls().at(-1)).toBe(urlOf("derail-theme-2.wav"));
      expect((await fs.readdir(songs())).sort()).toEqual([
        "derail-theme-2.wav",
        "derail-theme.wav",
      ]);
    }
  );

  it.skipIf(!hasFfmpeg)(
    "ignores the music of another feature video when it picks a copy",
    async () => {
      const source = songFile();
      await cli("add-music", source, "--feature", "promo");
      await fs.copyFile(
        path.join(songs(), "derail-theme.wav"),
        path.join(songs(), "derail-theme-2.wav")
      );
      // The same file name, in another feature video's folder.
      project.music = { url: urlOf("derail-theme-2.wav", "other"), gain: 1 };
      const again = await cli("add-music", source, "--feature", "promo");
      expect(JSON.parse(again.stdout)).toMatchObject({
        media: "music/derail-theme.wav",
        reused: true,
      });
      expect(urls().at(-1)).toBe(urlOf("derail-theme.wav"));
    }
  );

  it.skipIf(!hasFfmpeg)(
    "still adds the music when the post's music url is not a readable path",
    async () => {
      // A hand edit left a broken escape in the url; adding the file is the repair.
      project.music = { url: urlOf("%zz.wav"), gain: 1 };
      const result = await cli("add-music", songFile(), "--feature", "promo");
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        media: "music/derail-theme.wav",
        reused: false,
      });
    }
  );
});

describe("an add-music edit that fails after the file was written", () => {
  // 400 is the edit's own refusal. 409 says an editor has the post open, and
  // the command finds none, so the edit goes nowhere.
  for (const status of [400, 409])
    it.skipIf(!hasFfmpeg)(
      `removes the copy it just made when the edit gets a ${status}, exits 1 with the reason, and a retry uses the same name`,
      async () => {
        const source = songFile();
        refuseOps = { status, message: "Refused." };
        const failed = await cli("add-music", source, "--feature", "promo");
        expect(failed.code).toBe(1);
        expect(failed.stderr).toContain("Refused.");
        expect(await fs.readdir(songs())).toEqual([]);

        refuseOps = undefined;
        const retry = await cli("add-music", source, "--feature", "promo");
        expect(retry.code).toBe(0);
        expect(JSON.parse(retry.stdout)).toMatchObject({
          media: "music/derail-theme.wav",
          reused: false,
        });
        expect(await fs.readdir(songs())).toEqual(["derail-theme.wav"]);
      }
    );

  it.skipIf(!hasFfmpeg)(
    "keeps a file it reused, since the post may already play it",
    async () => {
      const source = songFile();
      await cli("add-music", source, "--feature", "promo");
      project.music = { url: urlOf("derail-theme.wav"), gain: 1 };
      refuseOps = { status: 400, message: "Refused." };
      const failed = await cli("add-music", source, "--feature", "promo");
      expect(failed.code).toBe(1);
      expect(failed.stderr).toContain("Refused.");
      expect(await fs.readdir(songs())).toEqual(["derail-theme.wav"]);
    }
  );
});

describe("music values out of range", () => {
  const SEQUENCE = "DCKΨ-";
  let store: FeatureVideoStore;
  const saved = () =>
    fs.readFile(path.join(root, "store", "promo", "project.json"), "utf8");

  /** A real feature video behind the stand-in: 60 s of music at 120 BPM. */
  beforeEach(async () => {
    store = createFeatureVideoStore(path.join(root, "store"));
    await store.create({ slug: "promo", title: "Promo", sequenceId: SEQUENCE });
    await store.applyOps("promo", [
      { op: "add-music", url: MUSIC_URL, durationSeconds: 60 },
      { op: "music", bpm: 120 },
    ]);
    applyEdits = (ops) => store.applyOps("promo", ops);
  });

  it("refuses a played part that ends before it starts: exit 1, the message printed, the file as it was", async () => {
    const before = await saved();
    const result = await cli(
      "music",
      "--feature",
      "promo",
      "--from",
      "30",
      "--to",
      "20"
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The music's end (20 s) must come at least 0.1 s after its start (30 s)."
    );
    // The command sent what it was given; the edit itself said no.
    expect(sent()).toEqual([
      { op: "music", sourceInSeconds: 30, sourceOutSeconds: 20 },
    ]);
    expect(await saved()).toBe(before);
  });

  it("refuses a mistyped tempo, level and beat count, and a bar beyond the file, instead of fitting them", async () => {
    const before = await saved();
    const refusals: [string[], string][] = [
      [["--bpm", "1280"], "bpm must be from 20 to 300."],
      [["--gain", "5"], "gain must be from 0 to 2."],
      [
        ["--beats-per-bar", "3.5"],
        "beatsPerBar must be a whole number from 1 to 12.",
      ],
      [
        ["--to", "@1000"],
        "The music's end (1998 s) cannot come after the end of its file (60 s).",
      ],
    ];
    for (const [flags, message] of refusals) {
      const result = await cli("music", "--feature", "promo", ...flags);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    }
    expect(await saved()).toBe(before);
  });

  it("still writes a played part that is in range", async () => {
    const result = await cli(
      "music",
      "--feature",
      "promo",
      "--from",
      "10",
      "--to",
      "20"
    );
    expect(result.code).toBe(0);
    const file = JSON.parse(await saved()) as {
      project: { music: { sourceInSeconds: number; sourceOutSeconds: number } };
    };
    expect(file.project.music).toMatchObject({
      sourceInSeconds: 10,
      sourceOutSeconds: 20,
    });
  });
});

describe("lining takes up with the music", () => {
  const RATE = 8000;
  const song = clickTrack(20, RATE);

  /** The post's music, and clip v1 of a take whose camera heard `heard`. */
  async function filmed(heard: Float32Array): Promise<void> {
    const media = path.join(folder, "media");
    await fs.mkdir(path.join(media, "music"), { recursive: true });
    await fs.mkdir(path.join(media, "footage"), { recursive: true });
    await fs.writeFile(path.join(media, "music", "song.wav"), wav(song, RATE));
    await fs.writeFile(
      path.join(media, "footage", "take.wav"),
      wav(heard, RATE)
    );
    project = {
      tracks: [{ items: [{ id: "v1", kind: "video", takeId: "take-1" }] }],
      takes: [{ id: "take-1", ref: { kind: "linked", url: TAKE_URL } }],
      music: { url: MUSIC_URL, gain: 1 },
    };
  }

  it.skipIf(!hasFfmpeg)(
    "finds where a clip's take sits in the music and puts it in time",
    async () => {
      await filmed(cameraTake(song, RATE, 3.2, 10));
      const result = await cli(
        "align-take",
        "--feature",
        "promo",
        "--place",
        "v1"
      );
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(Math.abs(report.offsetSeconds - 3.2)).toBeLessThanOrEqual(0.005);
      expect(report.placed).toBe(true);
      expect(sent()).toEqual([
        {
          op: "sync-to-music",
          item: "v1",
          offsetSeconds: report.offsetSeconds,
        },
      ]);
    }
  );

  it.skipIf(!hasFfmpeg)(
    "measures a take named by its id without moving anything",
    async () => {
      await filmed(cameraTake(song, RATE, 3.2, 10));
      const result = await cli(
        "align-take",
        "--feature",
        "promo",
        "--take",
        "take-1"
      );
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(Math.abs(report.offsetSeconds - 3.2)).toBeLessThanOrEqual(0.005);
      expect(report).not.toHaveProperty("placed");
      expect(posts()).toEqual([]);
    }
  );

  it.skipIf(!hasFfmpeg)(
    "leaves the clip where it is when the match is doubtful, and exits 1",
    async () => {
      await filmed(cameraTake(clickTrack(12, RATE, 31337), RATE, 0, 10));
      const result = await cli(
        "align-take",
        "--feature",
        "promo",
        "--place",
        "v1"
      );
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.placed).toBe(false);
      expect(report.warning).toEqual(expect.any(String));
      expect(report.candidates.length).toBeGreaterThan(0);
      expect(posts()).toEqual([]);
    }
  );

  it("says what align-take needs", async () => {
    project = {
      tracks: [{ items: [{ id: "t1", kind: "titles" }] }],
      takes: [{ id: "take-2", ref: { kind: "catalog", videoId: "abc123" } }],
      music: { url: MUSIC_URL, gain: 1 },
    };
    const refusals: [string[], string][] = [
      [
        [],
        "align-take needs --place ITEM to line up a clip, or --take ID to measure a take.",
      ],
      [["--place", "t1"], '"t1" is not a video clip.'],
      [["--place", "v9"], 'No item "v9" in this post.'],
      [["--take", "take-9"], 'No take "take-9" in this post.'],
      [
        ["--take", "take-2"],
        'Take "take-2" is not a file in a feature video folder.',
      ],
    ];
    for (const [flags, message] of refusals) {
      const result = await cli("align-take", "--feature", "promo", ...flags);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    }
    delete project.music;
    const silent = await cli(
      "align-take",
      "--feature",
      "promo",
      "--take",
      "take-1"
    );
    expect(silent.stderr).toContain(NO_MUSIC);
    expect(posts()).toEqual([]);
  });
});

describe("measuring a render's loudness", () => {
  it.skipIf(!hasFfmpeg)(
    "reports loudness and peak, and with --feature the music level to try",
    async () => {
      const render = path.join(root, "render.wav");
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
        render,
      ]);
      const alone = await cli("loudness", render);
      expect(alone.code).toBe(0);
      const measured = JSON.parse(alone.stdout);
      expect(measured).toMatchObject({ targetLufs: -14, peakCeilingDbtp: -1 });
      expect(measured.truePeakDbtp).toBeCloseTo(-18.06, 0);
      expect(measured).not.toHaveProperty("suggestedGain");

      const none = await cli("loudness", render, "--feature", "promo");
      expect(none.code).toBe(1);
      expect(none.stderr).toContain(NO_MUSIC);

      project.music = { url: MUSIC_URL, gain: 0.8 };
      const suggested = JSON.parse(
        (await cli("loudness", render, "--feature", "promo")).stdout
      );
      expect(suggested.musicGain).toBe(0.8);
      expect(suggested.suggestedGain).toBe(
        suggestMusicGain(0.8, suggested.integratedLufs, suggested.truePeakDbtp)
      );
      expect(suggested.suggestedGain).toBeGreaterThan(0.8);
      expect(posts()).toEqual([]);
    }
  );
});
