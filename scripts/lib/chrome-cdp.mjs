/**
 * Minimal Chrome DevTools Protocol client over a raw WebSocket.
 *
 * Owner for talking to the shared debug Chrome that
 * `scripts/launch-chrome-debug.ps1` starts on port 9222. Extracted from
 * `capture-seraphic-vault-gate4.mjs` when a third consumer appeared; that file
 * re-exports these names so its own callers keep working.
 * `launchHeadlessChrome` starts a private Chrome for one app recording instead.
 *
 * No puppeteer, by project rule. Everything here is one WebSocket and the
 * handful of CDP domains a capture needs.
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventBuffer } from "./cdp-event-buffer.mjs";

const DEFAULT_PORT = 9222;
const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

/**
 * Open a CDP session against `webSocketDebuggerUrl`. The returned `send`
 * resolves with the command result, or rejects with the protocol error.
 */
export async function connect(
  webSocketDebuggerUrl,
  { bufferEvents = [], eventCapacity } = {}
) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolveConnection, rejectConnection) => {
    socket.addEventListener("open", resolveConnection, { once: true });
    socket.addEventListener("error", rejectConnection, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const buffer = createEventBuffer({ capacity: eventCapacity });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined && message.method !== undefined) {
      if (bufferEvents.includes(message.method))
        buffer.push(message.method, message.params);
      return;
    }
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
  });
  // A closed tab or a browser that quit answers nothing more, so nothing
  // waits on it.
  socket.addEventListener("close", () => {
    for (const { reject } of pending.values())
      reject(new Error("The DevTools connection closed."));
    pending.clear();
  });

  return {
    async send(method, params = {}) {
      const id = nextId++;
      const response = new Promise((resolveResponse, rejectResponse) => {
        pending.set(id, {
          resolve: resolveResponse,
          reject: rejectResponse,
        });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return response;
    },
    /**
     * Events named in `bufferEvents` when this connection opened, as
     * `{ cursor, events, hasMore, truncated }`; see cdp-event-buffer.mjs.
     */
    readEvents(options) {
      return buffer.read(options);
    },
    close() {
      socket.close();
    },
  };
}

/**
 * Full-viewport PNG. Returns the buffer; writes it only when given a path.
 *
 * Prefer this over `captureClip` for anything that fills the viewport: an
 * unclipped capture is exactly the surface Chrome presented, so it is immune to
 * the browser-zoom mismatch that makes a clip rectangle taken from
 * `getBoundingClientRect` land in the wrong coordinate space.
 */
export async function capture(client, path) {
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const buffer = Buffer.from(data, "base64");
  if (path) writeFileSync(path, buffer);
  return buffer;
}

/**
 * PNG of one rectangle of the page, straight from the compositor.
 *
 * `fromSurface` is what makes this work on a WebGL canvas: it takes what Chrome
 * presented rather than reading the drawing buffer back, so a context without
 * `preserveDrawingBuffer` still yields the frame the user saw.
 *
 * `clip.scale` is a capture-time multiplier, so a 1920-wide clip at scale 1
 * writes 1920 device pixels regardless of the page's own zoom.
 *
 * Returns the PNG buffer. Pass `path: null` when the caller is going to
 * re-encode the image and never wants the intermediate on disk.
 */
export async function captureClip(client, path, clip) {
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { scale: 1, ...clip },
  });
  const buffer = Buffer.from(data, "base64");
  if (path) writeFileSync(path, buffer);
  return buffer;
}

/** Evaluate in the page and return the value, awaiting a promise result. */
export async function evaluate(client, expression) {
  const { result, exceptionDetails } = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text
    );
  }
  return result.value;
}

/**
 * Poll `expression` until it returns something truthy. Resolves with that
 * value. Throws on timeout, naming the expression, because a bake that hangs
 * silently is indistinguishable from a slow scene.
 */
export async function waitFor(
  client,
  expression,
  { timeoutMs = 60000, intervalMs = 250, label = expression } = {}
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await evaluate(client, expression).catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await delay(intervalMs);
  }
}

/** Pin the CSS viewport and device pixel ratio for the life of the session. */
export async function setViewport(
  client,
  { width, height, dpr = 1, mobile = false }
) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile,
  });
}

/** Navigate and resolve once the load event has fired. */
export async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitFor(client, "document.readyState === 'complete'", {
    label: `load of ${url}`,
  });
}

async function browserEndpoint(port) {
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (response) => response.json()
  );
  return version.webSocketDebuggerUrl;
}

/**
 * Open a task-owned tab and return a page client plus a `close` that disposes
 * only that tab.
 *
 * Task-owned rather than reusing whatever is fronted: the shared debug Chrome
 * belongs to every agent at once, and a bake that navigates someone else's tab
 * destroys their work.
 */
export async function openTab(
  url,
  { port = DEFAULT_PORT, bufferEvents, eventCapacity } = {}
) {
  const browser = await connect(await browserEndpoint(port));
  let targetId;
  try {
    ({ targetId } = await browser.send("Target.createTarget", { url }));
  } catch (error) {
    browser.close();
    throw error;
  }

  const deadline = Date.now() + 10000;
  let target = null;
  while (!target && Date.now() < deadline) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json()
    );
    target = list.find((candidate) => candidate.id === targetId) ?? null;
    if (!target) await delay(150);
  }
  if (!target) {
    await browser.send("Target.closeTarget", { targetId });
    browser.close();
    throw new Error(`Chrome never listed the tab it created for ${url}`);
  }

  const page = await connect(target.webSocketDebuggerUrl, {
    bufferEvents,
    eventCapacity,
  });
  await page.send("Page.enable");
  await page.send("Runtime.enable");

  return {
    ...page,
    targetId,
    async close() {
      page.close();
      await browser.send("Target.closeTarget", { targetId }).catch(() => {});
      browser.close();
    },
  };
}

/**
 * Starts a private headless Chrome for one recording and returns its DevTools
 * `port` and a `close` that ends it and deletes its profile.
 *
 * Headless, at the recording's own scale, because a windowed Chrome's
 * screencast sends frames at the screen's scale whatever the emulated one: a
 * 432 by 768 phone at 2.5 came out 648 by 1152 on a 150% display (measured
 * 2026-10-07). Started this way it sends 1080 by 1920, still draws with the
 * GPU, shows nothing on screen, and starts each run signed out with a fresh
 * profile. The browser rules' "never --force-device-scale-factor" is about the
 * shared verification browser; this one belongs to the recording alone.
 */
export async function launchHeadlessChrome({
  width,
  height,
  deviceScaleFactor = 1,
}) {
  const profile = await mkdtemp(join(tmpdir(), "tka-capture-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      `--force-device-scale-factor=${deviceScaleFactor}`,
      `--window-size=${width},${height}`,
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true }
  );
  let failure = null;
  const exited = new Promise((resolveExit) => {
    chrome.once("exit", resolveExit);
    // A Chrome that never started sends "error" and no "exit".
    chrome.once("error", (cause) => {
      failure = cause;
      resolveExit();
    });
  });
  const running = () =>
    !failure && chrome.exitCode === null && chrome.signalCode === null;
  const close = async () => {
    if (running()) {
      chrome.kill();
      await exited;
    }
    // Chrome's helpers can hold profile files for a moment after it exits.
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  };
  // Chrome writes the port it picked to this file once DevTools listens.
  const portFile = join(profile, "DevToolsActivePort");
  for (const deadline = Date.now() + 15000; ; await delay(100)) {
    const text = await readFile(portFile, "utf8").catch(() => "");
    const port = Number(text.split(/\r?\n/)[0]);
    if (port > 0) return { port, close };
    if (!running() || Date.now() > deadline) {
      await close();
      throw new Error(
        `Headless Chrome did not start (${CHROME}${failure ? `: ${failure.message}` : ""}). Set CHROME_PATH if it lives elsewhere.`
      );
    }
  }
}

/** Whether the debug browser is listening. */
export async function isDebugChromeRunning({ port = DEFAULT_PORT } = {}) {
  try {
    await browserEndpoint(port);
    return true;
  } catch {
    return false;
  }
}
