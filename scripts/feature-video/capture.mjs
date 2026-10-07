import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  delay,
  isDebugChromeRunning,
  navigate,
  openTab,
  setViewport,
  waitFor,
} from "../lib/chrome-cdp.mjs";
import { createDirector } from "../demo-capture/browser-director.mjs";
import { createCdpPage } from "./capture/cdp-page.mjs";
import { assertCaptureId, nextCaptureFile } from "./capture-files.mjs";
import { toolPath } from "./media-import.mjs";

/**
 * Records a scripted pass through the app and puts it in a feature video.
 *
 *   node scripts/feature-video/capture.mjs --feature SLUG --capture ID [--origin URL] [--port 9223]
 *
 * The script is `<project folder>/captures/<ID>.capture.mjs`. It default-exports
 * `{ id, url, viewport, ready?, settleMs?, run(director) }`; see
 * docs/development/post-studio-manifest-bridge.md. The recording is made in the
 * dedicated capture Chrome (port 9223, its own profile, signed out), never in
 * your browser and never in the shared 9222 browser.
 *
 * A capture that fails part way exits with an error, keeps its frames in
 * `<folder>/captures/frames/<ID>/`, and leaves the project untouched.
 */

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, "../post-project.mjs");
const ENCODER = path.resolve(here, "../demo-capture/encode-frames.py");
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
const CAPTURE_PROFILE = "C:\\Users\\Austen\\.claude\\chrome-profile-capture";

export function parseCaptureArgs(argv) {
  const option = (name) => {
    const at = argv.indexOf(`--${name}`);
    return at < 0 ? undefined : argv[at + 1];
  };
  const feature = option("feature");
  const capture = option("capture");
  if (!feature) throw new Error("capture needs --feature SLUG.");
  if (!capture) throw new Error("capture needs --capture ID.");
  const origin = option("origin");
  const base = new URL(origin ?? "https://localhost:5173");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    !LOOPBACK.includes(base.hostname)
  )
    throw new Error("--origin must be a loopback HTTP(S) address.");
  const port = Number(option("port") ?? 9223);
  if (port === 9222)
    throw new Error(
      "Port 9222 is the shared agent browser. Captures use their own Chrome on 9223."
    );
  return {
    feature,
    capture: assertCaptureId(capture),
    origin: base.origin,
    port,
    cliUrl: origin ? base.origin : undefined,
  };
}

/** The pixels the recording ends up with: Chrome's screencast delivers the viewport times the scale. */
export function outputSize({ width, height, deviceScaleFactor }) {
  return {
    width: Math.round(width * deviceScaleFactor),
    height: Math.round(height * deviceScaleFactor),
  };
}

export function validateCaptureScript(script, id) {
  if (!script || typeof script !== "object")
    throw new Error(`${id}.capture.mjs needs a default export.`);
  if (script.id !== id)
    throw new Error(
      `${id}.capture.mjs has id "${script.id}"; it must be "${id}".`
    );
  if (typeof script.url !== "string" || !script.url.startsWith("/"))
    throw new Error(
      `${id}.capture.mjs needs a url that starts with /, like /create/construct.`
    );
  const { viewport } = script;
  if (
    !viewport ||
    !(viewport.width > 0) ||
    !(viewport.height > 0) ||
    !(viewport.deviceScaleFactor > 0)
  )
    throw new Error(
      `${id}.capture.mjs needs a viewport with width, height and deviceScaleFactor.`
    );
  if (viewport.deviceScaleFactor > 1.5)
    throw new Error(
      `${id}.capture.mjs asks for device scale ${viewport.deviceScaleFactor}. Chrome's screencast stops at 1.5 times the CSS viewport, so frames would come out smaller than you plan for. Use a bigger viewport at 1.5: 720 by 1280 gives 1080 by 1920.`
    );
  const exact = {
    width: viewport.width * viewport.deviceScaleFactor,
    height: viewport.height * viewport.deviceScaleFactor,
  };
  if (
    !Number.isInteger(exact.width) ||
    !Number.isInteger(exact.height) ||
    exact.width % 2 ||
    exact.height % 2
  )
    throw new Error(
      `${id}.capture.mjs would record ${exact.width} by ${exact.height}; the video size must be whole and even.`
    );
  if (typeof script.run !== "function")
    throw new Error(`${id}.capture.mjs needs a run(director) function.`);
  return script;
}

async function cli(cliUrl, ...args) {
  const { stdout } = await run(process.execPath, [
    CLI,
    ...args,
    ...(cliUrl ? ["--url", cliUrl] : []),
  ]);
  return stdout.trim() ? JSON.parse(stdout) : undefined;
}

export async function runCapture({ feature, capture, origin, port, cliUrl }) {
  const info = await cli(cliUrl, "capture-info", "--feature", feature);
  const scriptFile = path.join(
    info.folder,
    "captures",
    `${capture}.capture.mjs`
  );
  const script = validateCaptureScript(
    (await import(pathToFileURL(scriptFile).href)).default,
    capture
  );
  if (!(await isDebugChromeRunning({ port })))
    throw new Error(
      `No capture Chrome on port ${port}. Start it with: powershell -File scripts/launch-chrome-debug.ps1 -Port ${port} -UserDataDir ${CAPTURE_PROFILE} -ProfileDirectory Default -Url about:blank`
    );

  const media = nextCaptureFile(capture, info.existing);
  const output = path.join(info.folder, "media", ...media.split("/"));
  const framesDir = path.join(info.folder, "captures", "frames");
  const size = outputSize(script.viewport);
  await fs.rm(path.join(framesDir, capture), { recursive: true, force: true });
  await fs.mkdir(path.dirname(output), { recursive: true });

  const tab = await openTab("about:blank", {
    port,
    bufferEvents: ["Page.screencastFrame"],
  });
  try {
    await setViewport(tab, {
      width: script.viewport.width,
      height: script.viewport.height,
      dpr: script.viewport.deviceScaleFactor,
      mobile: script.viewport.mobile ?? true,
    });
    await navigate(tab, new URL(script.url, origin).href);
    if (script.ready)
      await waitFor(tab, script.ready, {
        timeoutMs: 60000,
        label: `${capture} ready`,
      });
    await delay(script.settleMs ?? 1500);
    const director = createDirector(createCdpPage(tab), tab, info.folder, {
      framesDir,
      size,
    });
    await director.mountPointer();
    await script.run(director);
  } finally {
    await tab.close();
  }

  await fs.access(path.join(framesDir, capture, "capture.json")).catch(() => {
    throw new Error(
      `${capture}.capture.mjs never recorded a shot named "${capture}". Call director.shot("${capture}", seconds, action).`
    );
  });
  await run(process.env.PYTHON ?? "python", [
    ENCODER,
    info.folder,
    capture,
    "--frames-dir",
    framesDir,
    "--output",
    output,
    "--size",
    `${size.width}x${size.height}`,
    "--ffmpeg",
    toolPath("ffmpeg"),
  ]);
  const linked = await cli(
    cliUrl,
    "link-capture",
    "--feature",
    feature,
    "--capture",
    capture,
    "--media",
    media
  );
  return { media, size, ...linked };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await runCapture(parseCaptureArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  }
}
