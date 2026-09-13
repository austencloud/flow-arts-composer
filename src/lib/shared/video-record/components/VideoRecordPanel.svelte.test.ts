/**
 * Camera acquisition lifecycle for the recording panel.
 *
 * `initializeCamera` awaits `CameraManager.initialize()` (which itself awaits
 * `enumerateDevices`) and then `start()` (which awaits `getUserMedia`, and can
 * sit on an unanswered permission prompt for as long as the user ignores it).
 * The panel can be destroyed anywhere inside that window: the drawer closes,
 * the module unmounts. `onDestroy` then runs before the camera is open, so
 * nothing is left to close it and the capture indicator stays lit.
 *
 * These tests stand in a contract-faithful fake for the camera manager, owned
 * by another agent, and hand back a real canvas-derived MediaStream so track
 * teardown is observed through `readyState` rather than through a spy.
 */

import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const ctx = canvas.getContext("2d");
  ctx?.fillRect(0, 0, 32, 32);
  return canvas.captureStream(5);
}

/**
 * Stands in for CameraManager on its public contract: initialize, then start
 * returns the stream, and stop ends the tracks it handed out.
 */
function createFakeCameraManager() {
  const calls = { initialize: 0, start: 0, stop: 0 };
  const initializeGate = gate<void>();
  const startGate = gate<MediaStream>();
  let handedOut: MediaStream | null = null;

  const manager = {
    calls,
    initializeGate,
    startGate,
    get handedOutStream() {
      return handedOut;
    },
    isActive: false,
    async initialize(): Promise<void> {
      calls.initialize += 1;
      return initializeGate.promise;
    },
    async start(): Promise<MediaStream> {
      calls.start += 1;
      const stream = await startGate.promise;
      handedOut = stream;
      manager.isActive = true;
      return stream;
    },
    stop(): void {
      calls.stop += 1;
      handedOut?.getTracks().forEach((track) => track.stop());
      manager.isActive = false;
    },
  };

  return manager;
}

let camera = createFakeCameraManager();

vi.mock("$lib/shared/train/get-camera-manager", () => ({
  getCameraManager: () => camera,
}));

const { default: VideoRecordPanel } = await import("./VideoRecordPanel.svelte");

async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 2000
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Give the panel's pending awaits several turns to run. */
async function drain(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(() => {
  camera = createFakeCameraManager();
});

describe("VideoRecordPanel camera acquisition", () => {
  it("does not open the camera when the panel is destroyed while enumerating devices", async () => {
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => camera.calls.initialize > 0, "initialize was called");

    // The drawer closes while initialize() is still awaiting enumerateDevices.
    await screen.unmount();
    camera.initializeGate.resolve();
    await drain();

    expect(camera.calls.start).toBe(0);
  });

  it("ends a stream that arrives after the panel is destroyed", async () => {
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => camera.calls.initialize > 0, "initialize was called");
    camera.initializeGate.resolve();
    await waitFor(() => camera.calls.start > 0, "start was called");

    // The drawer closes while getUserMedia is still on the permission prompt.
    await screen.unmount();

    const stream = canvasStream();
    camera.startGate.resolve(stream);
    await drain();

    const states = stream.getTracks().map((track) => track.readyState);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((state) => state === "ended")).toBe(true);
  });

  it("still opens the camera for a panel that stays mounted", async () => {
    render(VideoRecordPanel, { sequence: null });
    await waitFor(() => camera.calls.initialize > 0, "initialize was called");
    camera.initializeGate.resolve();
    await waitFor(() => camera.calls.start > 0, "start was called");

    const stream = canvasStream();
    camera.startGate.resolve(stream);
    await drain();

    expect(
      stream.getTracks().every((track) => track.readyState === "live")
    ).toBe(true);
  });
});
