/**
 * PerformancePreview camera teardown.
 *
 * The preview acquires the camera in two awaits — `initialize()` then `start()` —
 * and the export panel can close between them. It shares one CameraManager with
 * other surfaces through `getCameraManager()`, so a camera opened after this
 * panel's teardown has nobody left to close it and the camera light stays on.
 * The manager fences this too; these tests cover the component's own guard, with
 * a fake manager and fake tracks rather than a real device.
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
  interface Track {
    kind: string;
    readyState: "live" | "ended";
    stop: () => void;
  }

  const state = {
    initializeCalls: 0,
    resolveInitialize: null as null | (() => void),
    resolveStart: null as null | (() => void),
    start: null as unknown,
    stop: null as unknown,
    tracks: [] as Track[],
  };

  return { state };
});

vi.mock("$lib/shared/train/get-camera-manager", () => {
  const { state } = cameraFake;

  const manager = {
    initialize: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          state.initializeCalls += 1;
          state.resolveInitialize = resolve;
        })
    ),
    start: vi.fn(
      () =>
        new Promise((resolve) => {
          state.resolveStart = () => {
            const track = {
              kind: "video",
              readyState: "live" as "live" | "ended",
              stop: () => {
                track.readyState = "ended";
              },
            };
            state.tracks.push(track);
            resolve({ getTracks: () => [track] });
          };
        })
    ),
    stop: vi.fn(),
    getVideoElement: () => null,
    get isActive() {
      return false;
    },
  };

  state.start = manager.start;
  state.stop = manager.stop;

  return { getCameraManager: () => manager };
});

const { state } = cameraFake;

function startSpy() {
  return state.start as ReturnType<typeof vi.fn>;
}

function stopSpy() {
  return state.stop as ReturnType<typeof vi.fn>;
}

/** Give the component's async mount a turn to continue. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("PerformancePreview camera teardown", () => {
  beforeEach(() => {
    state.initializeCalls = 0;
    state.resolveInitialize = null;
    state.resolveStart = null;
    state.tracks.length = 0;
    startSpy().mockClear();
    stopSpy().mockClear();
  });

  it("does not open the camera when the panel closes during setup", async () => {
    render(PerformancePreviewLifecycleHarness);
    await settle();
    expect(state.initializeCalls).toBe(1);

    await page.getByRole("button", { name: "Close preview" }).click();
    state.resolveInitialize?.();
    await settle();

    expect(startSpy()).not.toHaveBeenCalled();
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

    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]?.readyState).toBe("ended");
    expect(stopSpy()).toHaveBeenCalled();
  });
});
