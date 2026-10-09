import fs from "node:fs/promises";
import path from "node:path";

/** Where the pointer rests between shots, as fractions of the viewport: 1145 by 1020 on a 1920 by 1080 window. */
const REST = { x: 1145 / 1920, y: 1020 / 1080 };
const DEFAULT_SIZE = { width: 1920, height: 1080 };

/**
 * Runs in the page: the `index`th element matching `selector` that is on
 * screen and not inert, as the point the pointer aims at. With `hover`, it
 * answers instead whether the page's own hover reached that element.
 */
function onScreenMatch({ selector, index, hover }) {
  const el = [...document.querySelectorAll(selector)].filter((e) => {
    const r = e.getBoundingClientRect();
    return (
      !e.closest("[inert]") &&
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth
    );
  })[index];
  if (hover) return el?.matches(":hover") ?? false;
  if (!el) throw Error(`Missing visible target ${selector} #${index}`);
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width * 0.65, y: r.y + r.height * 0.65 };
}

/**
 * Drives a page the way a person would, with a pointer that moves before it
 * clicks, and records it with Chrome's screencast.
 *
 * - `page`: the page port (evaluate, fillByRole, url, snapshot) from
 *   scripts/feature-video/capture/cdp-page.mjs or codex-page.mjs.
 * - `cdp`: a chrome-cdp client with `send` and `readEvents`, opened with
 *   `Page.screencastFrame` in `bufferEvents`.
 * - `options.framesDir`: where each shot's frames go, one folder per shot id.
 *   Defaults to `<root>/production/frames`.
 * - `options.size`: the largest frame the screencast may deliver, in device
 *   pixels. A windowed Chrome sends frames at the screen's scale, whatever the
 *   emulated one, so phone-sized recordings use a headless Chrome started at
 *   their scale (`launchHeadlessChrome`). Defaults to 1920 by 1080.
 */
export function createDirector(page, cdp, root, options = {}) {
  const framesDir =
    options.framesDir ?? path.join(root, "production", "frames");
  const size = options.size ?? DEFAULT_SIZE;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let recording = null;
  async function pump() {
    if (!recording) return;
    const batch = await cdp.readEvents({
      methods: ["Page.screencastFrame"],
      afterSequence: recording.cursor,
      limit: 100,
      timeoutMs: 0,
    });
    recording.cursor = batch.cursor;
    if (batch.truncated) throw Error("Screencast event buffer truncated");
    for (const event of batch.events) {
      await cdp.send("Page.screencastFrameAck", {
        sessionId: event.params.sessionId,
      });
      const file = String(recording.frames.length).padStart(5, "0") + ".jpg";
      await fs.writeFile(
        path.join(recording.dir, file),
        Buffer.from(event.params.data, "base64")
      );
      recording.frames.push({
        file,
        timestamp: event.params.metadata.timestamp,
      });
    }
  }
  async function wait(ms) {
    const until = Date.now() + ms;
    do {
      await pump();
      await sleep(10);
    } while (Date.now() < until);
  }
  let pointer = null;
  let events = [];
  let started = 0;

  async function restPoint() {
    const view = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    return {
      x: Math.round(view.width * REST.x),
      y: Math.round(view.height * REST.y),
    };
  }

  async function move(x, y) {
    pointer ??= await restPoint();
    const from = { ...pointer };
    const start = Date.now();
    do {
      const t = Math.min(1, (Date.now() - start) / 540);
      const amount = t * t * (3 - 2 * t);
      pointer = {
        x: from.x + (x - from.x) * amount,
        y: from.y + (y - from.y) * amount,
      };
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...pointer,
      });
      if (t >= 1) break;
      await wait(16);
    } while (true);
  }

  async function target(label) {
    const rect = await page.evaluate((label) => {
      const el = [
        ...document.querySelectorAll('button,a,input,[role="radio"]'),
      ].find(
        (e) =>
          !e.closest("[inert]") &&
          e.getBoundingClientRect().width &&
          (e.getAttribute("aria-label") === label ||
            e.textContent?.trim() === label ||
            e.querySelector(".chip-label")?.textContent?.trim() === label)
      );
      if (!el) throw Error("Missing visible target " + label);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest("[inert]"))
        throw Error("Target is not visible");
      return { x: r.x + r.width * 0.65, y: r.y + r.height * 0.65 };
    }, label);
    await move(rect.x, rect.y);
    await wait(240);
    const hovered = await page.evaluate(
      (label) =>
        [...document.querySelectorAll(":hover")].some(
          (e) =>
            e.getAttribute("aria-label") === label ||
            e.textContent?.trim() === label ||
            e.querySelector(".chip-label")?.textContent?.trim() === label
        ),
      label
    );
    if (!hovered) throw Error("Native hover did not reach " + label);
  }

  async function press() {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...pointer,
    });
    await wait(140);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...pointer,
    });
    await wait(200);
  }

  async function click(label) {
    await target(label);
    events.push({
      label,
      action: "click",
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
    await press();
  }

  async function fill(label, value) {
    await target(label);
    await page.fillByRole({
      role: "spinbutton",
      name: label,
      value,
      commitKey: "Tab",
    });
    events.push({
      label,
      action: "fill",
      value,
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
  }

  async function cell(index = 3) {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((e) => !e.closest("[inert]") && e.getBoundingClientRect().width)
        .map((e) => e.getAttribute("aria-label") || e.textContent?.trim() || "")
        .filter((label) => / over /.test(label))
    );
    if (index >= labels.length) throw Error("Missing matrix crossing");
    await click(labels[index]);
  }

  /**
   * Clicks the `index`th on-screen element that matches a CSS selector, for a
   * target no label singles out: one of several buttons with the same label,
   * such as the builder's option buttons, or a tile with role="button".
   */
  async function pick(selector, index = 0) {
    const label = `${selector} #${index}`;
    const rect = await page.evaluate(onScreenMatch, { selector, index });
    await move(rect.x, rect.y);
    await wait(240);
    const hovered = await page.evaluate(onScreenMatch, {
      selector,
      index,
      hover: true,
    });
    if (!hovered) throw Error("Native hover did not reach " + label);
    events.push({
      label,
      action: "click",
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
    await press();
  }

  async function mountPointer() {
    await cdp.send("Runtime.evaluate", {
      expression:
        "window.removeCapturePointer?.(); import('/scripts/demo-capture/mount-pointer.ts').then(m=>{window.removeCapturePointer=m.mountCapturePointer()})",
      awaitPromise: true,
    });
    pointer ??= await restPoint();
    await move(pointer.x, pointer.y);
  }

  async function canvas() {
    const point = await page.evaluate(() => {
      const el = [...document.querySelectorAll("canvas")].find(
        (e) => !e.closest("[inert]") && e.getBoundingClientRect().width
      );
      if (!el) throw Error("No visible animation canvas");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await move(point.x, point.y);
    await wait(240);
    const hovered = await page.evaluate(
      () => !!document.querySelector(".canvas-wrapper:hover")
    );
    if (!hovered) throw Error("Native hover missed animation canvas");
    events.push({
      label: "Animation canvas",
      action: "click",
      time: (Date.now() - started) / 1000,
      ...pointer,
      hover: true,
    });
    await press();
  }

  async function shot(id, seconds, action) {
    const dir = path.join(framesDir, id);
    await fs.mkdir(dir, { recursive: true });
    const rest = await restPoint();
    await move(rest.x, rest.y);
    events = [];
    const initial = await cdp.readEvents({ methods: ["Page.screencastFrame"] });
    const frames = [];
    recording = { dir, frames, cursor: initial.cursor };
    started = Date.now();
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 90,
      maxWidth: size.width,
      maxHeight: size.height,
      everyNthFrame: 1,
    });
    let failure;
    try {
      if (action) await action();
      await wait(
        Math.max(action ? 2500 : 0, seconds * 1000 - (Date.now() - started))
      );
    } catch (error) {
      failure = String(error);
    } finally {
      // A crashed or closed page answers nothing more. The shot then fails
      // with the first reason, and its frames and capture.json are kept.
      await pump().catch((error) => (failure ??= String(error)));
      await cdp
        .send("Page.stopScreencast")
        .catch((error) => (failure ??= String(error)));
      recording = null;
    }
    const proof = {
      id,
      requestedDuration: seconds,
      elapsed: (Date.now() - started) / 1000,
      events,
      frames,
      failure,
      url: await Promise.resolve()
        .then(() => page.url())
        .catch(() => null),
      snapshot: await Promise.resolve()
        .then(() => page.snapshot())
        .catch(() => null),
    };
    await fs.writeFile(
      path.join(dir, "capture.json"),
      JSON.stringify(proof, null, 2)
    );
    if (failure) throw Error(failure);
    return {
      id,
      frames: frames.length,
      events: events.map(({ label, time, hover }) => ({ label, time, hover })),
    };
  }
  return { wait, move, click, fill, cell, pick, canvas, mountPointer, shot };
}
