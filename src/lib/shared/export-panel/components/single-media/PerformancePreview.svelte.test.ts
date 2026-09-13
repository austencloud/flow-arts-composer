/**
 * PerformancePreview camera teardown.
 *
 * The preview acquires the camera in two awaits — `initialize()` then `start()` —
 * and the export panel can close between them. It shares one CameraManager with
 * other surfaces through `getCameraManager()`, so a camera opened after this
 * panel's teardown has nobody left to close it and the camera light stays on.
 * The manager fences this too; these tests cover the component's own guard. The
 * manager is faked, but the streams are real (canvas capture), because the
 * component hands them to a real video element's srcObject — a stand-in object
 * throws there and leaves an unhandled error in the page even when every
 * assertion passes. No real camera is involved.
 */

import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PerformancePreviewLifecycleHarness from "./PerformancePreviewLifecycleHarness.svelte";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

const cameraFake = vi.hoisted(() => {
  const state = {
    initializeCalls: 0,
    acquisitions: 0,
    resolveInitialize: null as null | (() => void),
    resolveStart: null as null | (() => void),
    start: null as unknown,
    stop: null as unknown,
    abandonAcquisition: null as unknown,
    releaseStream: null as unknown,
    streams: [] as MediaStream[],
  };

  return { state };
});

vi.mock("$lib/shared/train/get-camera-manager", () => {
  const { state } = cameraFake;

  const manager = {
    initialize: vi.fn(
      () =>
        new Promise<{ id: number }>((resolve) => {
          state.initializeCalls += 1;
          const acquisition = { id: ++state.acquisitions };
          state.resolveInitialize = () => resolve(acquisition);
        })
    ),
    start: vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          state.resolveStart = () => {
            // A real MediaStream, because the component assigns it to a real
            // video element's srcObject — a plain stand-in object throws a
            // TypeError there, which is an unhandled error in the page even
            // when every assertion passes.
            const canvas = document.createElement("canvas");
            canvas.width = 16;
            canvas.height = 16;
            canvas.getContext("2d")?.fillRect(0, 0, 16, 16);
            const stream = canvas.captureStream();
            state.streams.push(stream);
            resolve(stream);
          };
        })
    ),
    // The instance-wide release. A panel closing late must never reach for this
    // one: the CameraManager is shared, so it would switch off whatever surface
    // owns the camera now.
    stop: vi.fn(),
    abandonAcquisition: vi.fn(),
    releaseStream: vi.fn((stream: MediaStream) => {
      stream.getTracks().forEach((track) => track.stop());
    }),
    getVideoElement: () => null,
    get isActive() {
      return false;
    },
  };

  state.start = manager.start;
  state.stop = manager.stop;
  state.abandonAcquisition = manager.abandonAcquisition;
  state.releaseStream = manager.releaseStream;

  return { getCameraManager: () => manager };
});

const { state } = cameraFake;

function startSpy() {
  return state.start as ReturnType<typeof vi.fn>;
}

function stopSpy() {
  return state.stop as ReturnType<typeof vi.fn>;
}

function abandonSpy() {
  return state.abandonAcquisition as ReturnType<typeof vi.fn>;
}

function releaseStreamSpy() {
  return state.releaseStream as ReturnType<typeof vi.fn>;
}

/** readyState of the first track of the nth stream the fake handed out. */
function trackState(index: number): string | undefined {
  return state.streams[index]?.getTracks()[0]?.readyState;
}

/** Give the component's async mount a turn to continue. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("PerformancePreview camera teardown", () => {
  beforeEach(() => {
    state.initializeCalls = 0;
    state.acquisitions = 0;
    state.resolveInitialize = null;
    state.resolveStart = null;
    state.streams.length = 0;
    startSpy().mockClear();
    stopSpy().mockClear();
    abandonSpy().mockClear();
    releaseStreamSpy().mockClear();
  });

  it("does not open the camera when the panel closes during setup", async () => {
    render(PerformancePreviewLifecycleHarness);
    await settle();
    expect(state.initializeCalls).toBe(1);

    await page.getByRole("button", { name: "Close preview" }).click();
    state.resolveInitialize?.();
    await settle();

    expect(startSpy()).not.toHaveBeenCalled();
    // Gives up its own handshake, never the shared instance.
    expect(stopSpy()).not.toHaveBeenCalled();
    expect(abandonSpy()).toHaveBeenCalledTimes(1);
  });

  it("releases a stream that arrives after the panel closed", async () => {
    render(PerformancePreviewLifecycleHarness);
    await settle();

    state.resolveInitialize?.();
    await settle();
    expect(startSpy()).toHaveBeenCalledTimes(1);

    await page.getByRole("button", { name: "Close preview" }).click();
    state.resolveStart?.();
    await settle();

    expect(state.streams).toHaveLength(1);
    expect(trackState(0)).toBe("ended");
    // The late stream is handed back by identity; another surface may own the
    // camera by now, and the instance-wide stop would take it away.
    expect(stopSpy()).not.toHaveBeenCalled();
    expect(releaseStreamSpy()).toHaveBeenCalledTimes(1);
  });

  it("releases its own stream on close without stopping the shared instance", async () => {
    render(PerformancePreviewLifecycleHarness);
    await settle();

    state.resolveInitialize?.();
    await settle();
    state.resolveStart?.();
    await settle();
    expect(trackState(0)).toBe("live");

    await page.getByRole("button", { name: "Close preview" }).click();
    await settle();

    expect(trackState(0)).toBe("ended");
    expect(stopSpy()).not.toHaveBeenCalled();
    expect(releaseStreamSpy()).toHaveBeenCalledTimes(1);
  });
});
