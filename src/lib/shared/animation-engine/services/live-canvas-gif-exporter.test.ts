import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * gifenc is stubbed so the encoder becomes observable: which frames were
 * written, with what delay, and whether the GIF was ever finished. The real
 * encoder would only give us opaque bytes, and the questions worth asking here
 * are about the capture lifecycle — frame count, timing, and what an abort
 * leaves behind — not about LZW output.
 */
const writeFrame = vi.fn();
const finish = vi.fn();
const bytes = vi.fn(() => new Uint8Array([0x47, 0x49, 0x46]));
const quantize = vi.fn(() => [[0, 0, 0]]);
const applyPalette = vi.fn(() => new Uint8Array(4));

vi.mock("gifenc", () => ({
  GIFEncoder: () => ({ writeFrame, finish, bytes }),
  quantize: (...args: unknown[]) => quantize(...args),
  applyPalette: (...args: unknown[]) => applyPalette(...args),
}));

const { waitForAnimationFrame, exportLiveCanvasAsGif, downloadGif } =
  await import("./live-canvas-gif-exporter");

/**
 * A hand-driven rAF clock. The capture loop's whole contract is "sample the
 * live canvas on real animation frames until the timeline is covered", so the
 * test has to own the frames rather than race a real display.
 */
let clockMs = 0;
let pending: Array<{ id: number; callback: FrameRequestCallback }> = [];
let nextFrameId = 1;

function installFrameClock() {
  clockMs = 0;
  pending = [];
  nextFrameId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    pending.push({ id, callback });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const index = pending.findIndex((entry) => entry.id === id);
    if (index >= 0) pending.splice(index, 1);
  });
}

async function flushMicrotasks(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Fire every waiting rAF callback once, `stepMs` later. */
async function tick(stepMs = 25) {
  clockMs += stepMs;
  const due = pending;
  pending = [];
  for (const entry of due) entry.callback(clockMs);
  await flushMicrotasks();
}

/** Run frames until the loop stops asking for them, or the budget runs out. */
async function runFrames(maxTicks = 400, stepMs = 25) {
  for (let i = 0; i < maxTicks && pending.length > 0; i++) {
    await tick(stepMs);
  }
}

/**
 * A real jsdom canvas, not the setup file's plain-object stub: the exporter
 * reads its layer stack through getComputedStyle, which only accepts a genuine
 * Element. The scratch canvas the exporter creates internally still comes from
 * the stub, which is what supplies getImageData.
 */
function liveCanvas(width = 200, height = 200): HTMLCanvasElement {
  // One live canvas at a time: the exporter composites every canvas under the
  // same parent, so a leftover from an earlier call in the same test would
  // quietly become a second layer.
  document.body.innerHTML = "";
  const canvas = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "canvas"
  ) as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  return canvas;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  installFrameClock();
  setVisibility("visible");
  writeFrame.mockClear();
  finish.mockClear();
  bytes.mockClear();
  quantize.mockClear();
  applyPalette.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  // Hand visibilityState back to jsdom's own prototype getter.
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("waitForAnimationFrame", () => {
  it("cancels a pending frame when GIF capture is aborted", async () => {
    let frameCallback: FrameRequestCallback | undefined;
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 41;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    const controller = new AbortController();
    const waiting = waitForAnimationFrame(controller.signal);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);

    // A delayed browser callback must not revive an export after cancellation.
    frameCallback?.(100);
  });
});

describe("exportLiveCanvasAsGif frame count and timing", () => {
  it("covers the requested duration at 10fps, one frame per 100ms", async () => {
    const exporting = exportLiveCanvasAsGif(liveCanvas(), { durationMs: 500 });
    await flushMicrotasks();
    await runFrames();

    const blob = await exporting;

    // 500ms / 100ms per frame. The delay stamped on each frame is what makes
    // the played-back GIF last as long as the animation it came from.
    expect(writeFrame).toHaveBeenCalledTimes(5);
    for (const call of writeFrame.mock.calls) {
      expect(call[3]).toMatchObject({ delay: 100, repeat: 0 });
    }
    expect(finish).toHaveBeenCalledTimes(1);
    expect(blob.type).toBe("image/gif");
  });

  it("rounds a partial frame up rather than truncating the animation", async () => {
    const exporting = exportLiveCanvasAsGif(liveCanvas(), { durationMs: 250 });
    await flushMicrotasks();
    await runFrames();
    await exporting;

    expect(writeFrame).toHaveBeenCalledTimes(3);
  });

  it("never emits a single-frame GIF, however short the sequence", async () => {
    const exporting = exportLiveCanvasAsGif(liveCanvas(), { durationMs: 10 });
    await flushMicrotasks();
    await runFrames();
    await exporting;

    // A one-frame GIF is a still image. Two is the floor that still animates.
    expect(writeFrame).toHaveBeenCalledTimes(2);
  });

  it("captures at the output size, downscaled to the GIF dimension cap", async () => {
    const exporting = exportLiveCanvasAsGif(liveCanvas(768, 768), {
      durationMs: 200,
    });
    await flushMicrotasks();
    await runFrames();
    await exporting;

    // 768 halves to the 384 cap; every frame must agree with the header the
    // encoder was given, or the GIF decodes as garbage.
    for (const call of writeFrame.mock.calls) {
      expect([call[1], call[2]]).toEqual([384, 384]);
    }
  });

  it("refuses to keep going when frames arrive too late to be in time", async () => {
    const exporting = exportLiveCanvasAsGif(liveCanvas(), { durationMs: 500 });
    await flushMicrotasks();

    // The first frame only establishes the clock's origin, so the stall has to
    // land after it to be a stall at all.
    await tick();
    expect(writeFrame).toHaveBeenCalledTimes(1);

    // One 400ms hitch: frame 1 arrives 300ms past its 100ms slot, so carrying
    // on would silently produce a GIF whose timing does not match the
    // animation it claims to be.
    await tick(400);
    await runFrames();

    await expect(exporting).rejects.toThrow(/could not keep up/i);
    expect(writeFrame).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
  });
});

describe("exportLiveCanvasAsGif cancellation", () => {
  it("aborts before the first frame without writing or finishing anything", async () => {
    const controller = new AbortController();
    const exporting = exportLiveCanvasAsGif(liveCanvas(), {
      durationMs: 500,
      signal: controller.signal,
    });
    await flushMicrotasks();

    controller.abort();
    await flushMicrotasks();

    await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
    expect(writeFrame).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("stops mid-capture and never finishes a partial GIF", async () => {
    const controller = new AbortController();
    const exporting = exportLiveCanvasAsGif(liveCanvas(), {
      durationMs: 1000,
      signal: controller.signal,
    });
    await flushMicrotasks();

    await tick();
    await tick();
    await tick();
    await tick();
    await tick();
    const writtenBeforeAbort = writeFrame.mock.calls.length;
    expect(writtenBeforeAbort).toBeGreaterThan(0);

    controller.abort();
    await runFrames();

    await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
    // A cancelled export hands back nothing: no further frames, and no
    // finish() that would produce a truncated file the caller might download.
    expect(writeFrame).toHaveBeenCalledTimes(writtenBeforeAbort);
    expect(finish).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("drops a frame already quantised when the abort lands mid-encode", async () => {
    const controller = new AbortController();
    // applyPalette is the last step before writeFrame; aborting from inside it
    // reproduces a cancel that arrives while a frame is being encoded.
    applyPalette.mockImplementationOnce(() => {
      controller.abort();
      return new Uint8Array(4);
    });

    const exporting = exportLiveCanvasAsGif(liveCanvas(), {
      durationMs: 500,
      signal: controller.signal,
    });
    await flushMicrotasks();
    await runFrames();

    await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
    expect(quantize).toHaveBeenCalledTimes(1);
    expect(writeFrame).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("is idempotent under repeated aborts", async () => {
    const controller = new AbortController();
    const exporting = exportLiveCanvasAsGif(liveCanvas(), {
      durationMs: 500,
      signal: controller.signal,
    });
    await flushMicrotasks();

    controller.abort();
    controller.abort();
    controller.abort();
    await runFrames();

    await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
    expect(finish).not.toHaveBeenCalled();
  });

  it("leaves no shared state behind — a retry after a cancel is a whole GIF", async () => {
    const controller = new AbortController();
    const cancelled = exportLiveCanvasAsGif(liveCanvas(), {
      durationMs: 500,
      signal: controller.signal,
    });
    await flushMicrotasks();
    await tick();
    controller.abort();
    await runFrames();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });

    writeFrame.mockClear();
    finish.mockClear();

    const retried = exportLiveCanvasAsGif(liveCanvas(), { durationMs: 500 });
    await flushMicrotasks();
    await runFrames();
    await retried;

    // The retry must not inherit the cancelled attempt's encoder or frames.
    expect(writeFrame).toHaveBeenCalledTimes(5);
    expect(finish).toHaveBeenCalledTimes(1);
  });
});

describe("exportLiveCanvasAsGif refusals", () => {
  it("explains that the animation is still loading instead of exporting nothing", async () => {
    await expect(
      exportLiveCanvasAsGif(liveCanvas(0, 0), { durationMs: 500 })
    ).rejects.toThrow(/still loading/i);
    expect(writeFrame).not.toHaveBeenCalled();
  });

  it("refuses to start while the tab is hidden", async () => {
    setVisibility("hidden");

    await expect(
      exportLiveCanvasAsGif(liveCanvas(), { durationMs: 500 })
    ).rejects.toThrow(/keep this tab visible/i);
    expect(writeFrame).not.toHaveBeenCalled();
  });

  it("stops when the tab is hidden part-way through the capture", async () => {
    const exporting = exportLiveCanvasAsGif(liveCanvas(), { durationMs: 1000 });
    await flushMicrotasks();
    await tick();
    await tick();
    await tick();
    await tick();

    setVisibility("hidden");
    await runFrames();

    await expect(exporting).rejects.toThrow(/keep this tab visible/i);
    expect(finish).not.toHaveBeenCalled();
  });
});

describe("downloadGif", () => {
  it("releases the object URL it created for the download", async () => {
    const createObjectURL = vi.fn(() => "blob:gif-under-test");
    const revokeObjectURL = vi.fn();
    // Only the two blob-URL statics are needed here; jsdom's URL has neither.
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadGif(new Blob(["gif"], { type: "image/gif" }), "ABC.gif");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // Revoked on a timer so the click is allowed to start the download first —
    // but it must actually happen, or every GIF export leaks its blob for the
    // lifetime of the document.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:gif-under-test");
  });
});
