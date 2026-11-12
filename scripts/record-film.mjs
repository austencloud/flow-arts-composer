#!/usr/bin/env node
/**
 * Records a Film Director film to an MP4 in a private headless Chrome.
 *
 *   node scripts/record-film.mjs --origin http://127.0.0.1:5296 \
 *     --film tracking-shot [--name film-tracking] [--fps 60] \
 *     [--w 1920 --h 1080] [--from 2 --to 6]
 *
 * `--film` is a capability demo id (the `?film=` key, for example
 * `two-lines-one-circle`) or a path to a film JSON file, the same document the
 * page's JSON editor takes. The page renders every frame at the exact film
 * time `from + index / fps`, so the file plays smoothly however slowly the
 * machine draws. The dev endpoint writes it to
 * %TEMP%/tka-release-media/<name>.mp4, and this prints that path.
 *
 * Options:
 *   --fps   60 (default) or 30
 *   --w/--h output size, 1920 by 1080 by default; 1080 by 1920 for a phone
 *           cut. Both must be even and within the H.264 encoder's frame size
 *           limit (the page refuses others before rendering anything).
 *   --from/--to  film seconds; the first frame shows --from and the last one
 *           is one frame before --to. Default: the whole film.
 *   --name  file name, lowercase letters, digits and dashes. Default
 *           film-<film id>.
 *   --timeout  minutes to wait for the recording, default 120.
 *
 * Needs a dev server rooted in the worktree whose code you want recorded. The
 * shared 5173 server is refused: a long recording would load the machine
 * everyone else's server runs on.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  connect,
  delay,
  evaluate,
  launchHeadlessChrome,
  navigate,
  setViewport,
  waitFor,
} from "./lib/chrome-cdp.mjs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!key?.startsWith("--")) throw new Error(`Unexpected argument ${key}`);
  args.set(key.slice(2), process.argv[i + 1]);
}

const ORIGIN = args.get("origin");
const FILM = args.get("film");
if (!ORIGIN || !FILM) throw new Error("--origin and --film are required");
if (new URL(ORIGIN).port === "5173") {
  throw new Error("Record from a worktree server, not the shared 5173 one");
}

const number = (key) => {
  const raw = args.get(key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${key} must be a number`);
  return value;
};
const WIDTH = number("w") ?? 1920;
const HEIGHT = number("h") ?? 1080;
const TIMEOUT_MS = (number("timeout") ?? 120) * 60_000;
const options = {
  fps: number("fps") ?? 60,
  width: WIDTH,
  height: HEIGHT,
  fromSeconds: number("from") ?? null,
  toSeconds: number("to") ?? null,
  name: args.get("name") ?? null,
};

// A path to a JSON document, or a demo id.
const filmPath = resolve(FILM);
const filmDocument =
  FILM.endsWith(".json") || existsSync(filmPath)
    ? JSON.parse(readFileSync(filmPath, "utf8"))
    : null;
// A JSON film needs a workbench to load into, so the page opens a short demo
// first and the film replaces it. (The empty stage demo would be cheaper, but
// on 2026-11-11 it hung the page before the workbench mounted.)
const filmKey = filmDocument ? "tracking-shot" : FILM;

const started = Date.now();
const chrome = await launchHeadlessChrome({ width: WIDTH, height: HEIGHT });
let exitCode = 0;
try {
  const targets = await fetch(`http://127.0.0.1:${chrome.port}/json`).then(
    (response) => response.json()
  );
  const page = targets.find((target) => target.type === "page");
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Security.setIgnoreCertificateErrors", { ignore: true });
  await setViewport(client, { width: WIDTH, height: HEIGHT });

  const url = `${ORIGIN}/test/film-director?film=${encodeURIComponent(filmKey)}`;
  await navigate(client, url);

  // Starts a recording on whatever page is loaded now. Each page load marks
  // the window, so a reload shows up as a missing mark.
  const startRecording = async () => {
    // First load on a cold dev server compiles the route, which takes a while.
    await waitFor(client, "Boolean(window.__filmRecorder)", {
      timeoutMs: 5 * 60_000,
      intervalMs: 1000,
      label: `the Film Director on ${url} (is ${filmKey} a demo id?)`,
    });
    if (filmDocument) {
      const problem = await evaluate(
        client,
        `window.__filmRecorder.loadFilm(${JSON.stringify(filmDocument)})`
      );
      if (problem) throw new Error(`The film did not load: ${problem}`);
    }
    await evaluate(
      client,
      `(window.__filmRecordingRun = window.__filmRecorder.record(${JSON.stringify(options)})), true`
    );
  };
  await startRecording();

  // A cold dev server reloads the page while it optimizes dependencies, and
  // a reload loses the recording in progress, so start again.
  let reloads = 0;
  let status = null;
  let lastLine = "";
  for (;;) {
    await delay(2000);
    status = await evaluate(
      client,
      "window.__filmRecordingRun ? JSON.parse(JSON.stringify(window.__filmRecorder.status)) : null"
    ).catch(() => null);
    if (!status) {
      reloads += 1;
      if (reloads > 3) throw new Error("The page kept reloading");
      console.log("The page reloaded, so the recording starts again.");
      lastLine = "";
      await delay(3000);
      await startRecording();
      continue;
    }
    if (status.phase === "saved" || status.phase === "failed") break;
    const line = status.message;
    // One line per change of phase or message, but only every tenth of the
    // way through rendering.
    const tenth =
      status.totalFrames > 0
        ? Math.floor((status.frame / status.totalFrames) * 10)
        : 0;
    const key = `${status.phase}:${status.phase === "rendering" ? tenth : line}`;
    if (line && key !== lastLine) {
      console.log(line);
      lastLine = key;
    }
    if (Date.now() - started > TIMEOUT_MS) {
      await evaluate(client, "window.__filmRecorder.cancel(), true");
      throw new Error(
        `Timed out after ${TIMEOUT_MS / 60_000} minutes: ${line}`
      );
    }
  }

  const seconds = (Date.now() - started) / 1000;
  if (status.phase === "failed") {
    console.error(`Failed: ${status.error}`);
    exitCode = 1;
  } else {
    const filmSeconds = status.endSeconds - status.startSeconds;
    console.log(status.path);
    console.log(
      `${status.totalFrames} frames at ${status.fps} fps, ${status.width} by ${status.height}, ${filmSeconds.toFixed(2)} s of film from ${status.startSeconds} s. Took ${seconds.toFixed(0)} s in all (${(status.elapsedMs / 1000).toFixed(0)} s recording, ${(status.elapsedMs / 1000 / filmSeconds).toFixed(1)} s per film second).`
    );
  }
  client.close?.();
} finally {
  await chrome.close();
}
process.exitCode = exitCode;
