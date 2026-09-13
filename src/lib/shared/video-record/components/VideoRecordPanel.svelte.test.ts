/**
 * Camera acquisition lifecycle for the recording panel, against the real
 * CameraManager.
 *
 * Acquiring a camera is two awaits long: `initialize()` enumerates devices and
 * `start()` sits on `getUserMedia`, which can wait on an unanswered permission
 * prompt for as long as the user ignores it. The panel can be destroyed
 * anywhere inside that window, and the manager is one shared instance —
 * `PerformancePreview` reaches the same one through `getCameraManager()` — so
 * a closing panel must release its own handshake and never the instance.
 *
 * These drive the actual manager rather than a fake, with `navigator.mediaDevices`
 * stubbed so `getUserMedia` can be held open. The streams are real
 * `MediaStream`s from `canvas.captureStream()`, so teardown is read off the
 * tracks' own `readyState` rather than off a spy, and no camera permission is
 * involved. Panel A is the component under test; consumer B stands in for
 * another surface taking the shared instance.
 */

import { render } from "vitest-browser-svelte";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// getCameraManager() refuses to hand out the singleton unless `browser`, and
// the shared test stub reports false.
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

const { getCameraManager } =
  await import("$lib/shared/train/get-camera-manager");
const { default: VideoRecordPanel } = await import("./VideoRecordPanel.svelte");

interface Gate<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function gate<T>(): Gate<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A real MediaStream with a real video track, and no camera permission. */
function canvasStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  canvas.getContext("2d")?.fillRect(0, 0, 32, 32);
  return canvas.captureStream(5);
}

function allLive(stream: MediaStream): boolean {
  const tracks = stream.getTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
}

function allEnded(stream: MediaStream): boolean {
  const tracks = stream.getTracks();
  return tracks.length > 0 && tracks.every((t) => t.readyState === "ended");
}

let userMediaGate = gate<MediaStream>();
let userMediaCalls = 0;
const originalMediaDevices = navigator.mediaDevices;
let enumerateGate: Gate<void> | null = null;

beforeEach(() => {
  userMediaGate = gate<MediaStream>();
  userMediaCalls = 0;
  enumerateGate = null;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      async enumerateDevices() {
        if (enumerateGate) await enumerateGate.promise;
        return [{ kind: "videoinput", deviceId: "fake", label: "fake" }];
      },
      getUserMedia() {
        userMediaCalls += 1;
        return userMediaGate.promise;
      },
    },
  });
});

afterEach(() => {
  // Hand the shared instance back before the next test takes it.
  getCameraManager().stop();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
  vi.restoreAllMocks();
});

async function waitFor(predicate: () => boolean, label: string, ms = 3000) {
  const deadline = performance.now() + ms;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Give the panel's pending awaits several turns to run. */
async function drain() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * Another surface takes the shared instance, the way PerformancePreview would
 * if it mounted while this panel's acquisition was still outstanding.
 */
async function consumerBAcquires(): Promise<MediaStream> {
  const manager = getCameraManager();
  userMediaGate = gate<MediaStream>();
  const acquisition = await manager.initialize({
    facingMode: "user",
    width: 320,
    height: 240,
    frameRate: 15,
  });
  const starting = manager.start(acquisition);
  const stream = canvasStream();
  userMediaGate.resolve(stream);
  await starting;
  return stream;
}

function errorAlert(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="alert"]');
}

describe("VideoRecordPanel camera acquisition", () => {
  it("does not open the camera when the panel is destroyed while enumerating devices", async () => {
    enumerateGate = gate<void>();
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(
      () => getCameraManager().availableCameras !== undefined,
      "panel mounted"
    );

    // The drawer closes while initialize() is still awaiting enumerateDevices.
    await screen.unmount();
    enumerateGate.resolve();
    await drain();

    expect(userMediaCalls).toBe(0);
    expect(getCameraManager().isActive).toBe(false);
  });

  it("releases a stream that arrives after the panel is destroyed", async () => {
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => userMediaCalls > 0, "panel reached getUserMedia");

    // The drawer closes while getUserMedia is still on the permission prompt.
    await screen.unmount();

    const stream = canvasStream();
    userMediaGate.resolve(stream);
    await drain();

    expect(allEnded(stream)).toBe(true);
    expect(getCameraManager().isActive).toBe(false);
  });

  it("leaves consumer B's camera alone when a pending panel A tears down", async () => {
    const manager = getCameraManager();
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => userMediaCalls > 0, "panel A reached getUserMedia");
    const panelAGate = userMediaGate;

    // B takes the instance over while A is still mid-handshake, and is live
    // before A closes. A's teardown is the moment of danger here: no late
    // callback has run yet.
    const streamB = await consumerBAcquires();
    expect(allLive(streamB)).toBe(true);

    await screen.unmount();
    await drain();

    expect(allLive(streamB)).toBe(true);
    expect(manager.isActive).toBe(true);

    // A's abandoned request finally lands, and is still released without
    // touching B.
    const streamA = canvasStream();
    panelAGate.resolve(streamA);
    await drain();

    expect(allEnded(streamA)).toBe(true);
    expect(allLive(streamB)).toBe(true);
    expect(manager.isActive).toBe(true);
  });

  it("leaves consumer B's camera alone when B took the camera over from a live panel A", async () => {
    const manager = getCameraManager();
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => userMediaCalls > 0, "panel A reached getUserMedia");

    const streamA = canvasStream();
    userMediaGate.resolve(streamA);
    await waitFor(() => manager.isActive, "panel A holds the camera");
    expect(allLive(streamA)).toBe(true);

    // B takes over, which releases A's stream the way the manager does.
    const streamB = await consumerBAcquires();
    expect(allEnded(streamA)).toBe(true);
    expect(allLive(streamB)).toBe(true);

    await screen.unmount();
    await drain();

    expect(allLive(streamB)).toBe(true);
    expect(manager.isActive).toBe(true);
  });

  it("does not show a camera error when B cancels a still-mounted panel A", async () => {
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => userMediaCalls > 0, "panel A reached getUserMedia");
    const panelAGate = userMediaGate;

    // B's initialize invalidates A's in-flight start, so A's start rejects with
    // CameraAcquisitionCancelled while A is still on screen.
    const streamB = await consumerBAcquires();
    panelAGate.resolve(canvasStream());
    await drain();

    // Cancellation is this panel losing a race, not a device failure: no alert,
    // and nothing said about the camera the user cannot see.
    expect(errorAlert(screen.container)).toBeNull();
    expect(allLive(streamB)).toBe(true);

    await screen.unmount();
  });

  it("still opens the camera for a panel that stays mounted", async () => {
    const manager = getCameraManager();
    render(VideoRecordPanel, { sequence: null });
    await waitFor(() => userMediaCalls > 0, "panel reached getUserMedia");

    const stream = canvasStream();
    userMediaGate.resolve(stream);
    await waitFor(() => manager.isActive, "camera is live");

    expect(allLive(stream)).toBe(true);
  });
});
