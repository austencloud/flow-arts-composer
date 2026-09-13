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
 * The shape the camera manager rejects an invalidated start with. The guard
 * under test deliberately does not key off this: it decides from its own
 * teardown, so it is correct both before and after the named cancellation type
 * lands on main. This only stands in for what the panel will actually catch.
 */
function cancellationError(): Error {
  const error = new Error("Camera was released while it was starting.");
  error.name = "CameraAcquisitionCancelled";
  (error as Error & { code?: string }).code = "CAMERA_ACQUISITION_CANCELLED";
  return error;
}

/**
 * Stands in for CameraManager on its public contract: initialize, then start
 * returns the stream, and stop ends the stream the manager currently holds.
 *
 * One instance is shared by every consumer, as `getCameraManager()` is a
 * singleton, and each start takes a ticket. A start that only settles after a
 * newer one has taken over never becomes the held stream, which is how the
 * ticketed manager behaves and what makes a stray global `stop()` from a stale
 * consumer visible: it would end somebody else's tracks.
 */
function createFakeCameraManager() {
  const calls = { initialize: 0, start: 0, stop: 0 };
  let initializeGate = gate<void>();
  let startGate = gate<MediaStream>();
  let ticketCounter = 0;
  let held: MediaStream | null = null;

  const manager = {
    calls,
    get initializeGate() {
      return initializeGate;
    },
    get startGate() {
      return startGate;
    },
    get heldStream() {
      return held;
    },
    /** Arm a fresh pair of gates for the next consumer's acquisition. */
    rearm(): void {
      initializeGate = gate<void>();
      startGate = gate<MediaStream>();
    },
    isActive: false,
    async initialize(): Promise<void> {
      calls.initialize += 1;
      await initializeGate.promise;
    },
    async start(): Promise<MediaStream> {
      calls.start += 1;
      const ticket = (ticketCounter += 1);
      const stream = await startGate.promise;
      if (ticket === ticketCounter) {
        held = stream;
        manager.isActive = true;
      }
      return stream;
    },
    stop(): void {
      calls.stop += 1;
      held?.getTracks().forEach((track) => track.stop());
      held = null;
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

/**
 * A different panel takes the shared manager. `PerformancePreview` reaches the
 * same singleton through `getCameraManager()`, so this is what mounting one
 * while a stale acquisition is still outstanding looks like.
 */
async function anotherConsumerAcquires(): Promise<MediaStream> {
  camera.rearm();
  const initializing = camera.initialize();
  camera.initializeGate.resolve();
  await initializing;

  const starting = camera.start();
  camera.startGate.resolve(canvasStream());
  return starting;
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

  it("leaves a newer consumer's camera alone when this panel's start is rejected", async () => {
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => camera.calls.initialize > 0, "initialize was called");
    camera.initializeGate.resolve();
    await waitFor(() => camera.calls.start > 0, "start was called");
    const stalePanelStart = camera.startGate;

    // Teardown cancels this panel's acquisition. That stop is legitimate: the
    // panel still owns the attempt at this instant.
    await screen.unmount();
    const stopsAtTeardown = camera.calls.stop;

    const newStream = await anotherConsumerAcquires();

    // Now the manager rejects the start it invalidated, having already released
    // whatever that attempt had opened. The panel owns nothing here, so it must
    // not reach for the shared manager's stop().
    stalePanelStart.reject(cancellationError());
    await drain();

    expect(
      newStream.getTracks().every((track) => track.readyState === "live")
    ).toBe(true);
    expect(camera.calls.stop).toBe(stopsAtTeardown);
    expect(camera.heldStream).toBe(newStream);
  });

  it("leaves a newer consumer's camera alone when this panel's stream arrives late", async () => {
    const screen = render(VideoRecordPanel, { sequence: null });
    await waitFor(() => camera.calls.initialize > 0, "initialize was called");
    camera.initializeGate.resolve();
    await waitFor(() => camera.calls.start > 0, "start was called");
    const stalePanelStart = camera.startGate;

    await screen.unmount();
    const stopsAtTeardown = camera.calls.stop;

    const newStream = await anotherConsumerAcquires();

    // A manager without ticketing still hands the late stream over. The panel
    // owns exactly that stream, so it ends those tracks and nothing else.
    const staleStream = canvasStream();
    stalePanelStart.resolve(staleStream);
    await drain();

    expect(
      staleStream.getTracks().every((track) => track.readyState === "ended")
    ).toBe(true);
    expect(
      newStream.getTracks().every((track) => track.readyState === "live")
    ).toBe(true);
    expect(camera.calls.stop).toBe(stopsAtTeardown);
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
