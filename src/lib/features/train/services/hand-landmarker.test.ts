/**
 * HandLandmarker load lifecycle.
 *
 * One MediaPipe hand landmarker owns a WASM runtime and a GPU delegate, and the
 * only way to give those back is `close()`. The load is slow (CDN WASM bundle
 * plus model file), so the interesting cases happen *during* it: a second caller
 * asking for detection, and the owner disposing because the user left Train.
 * MediaPipe itself is stubbed — what is under test is which landmarkers this
 * wrapper keeps and which ones it closes.
 *
 * The stub is registered with `vi.doMock` in `beforeEach`, not with a hoisted
 * `vi.mock`: under Vitest 4 a hoisted factory only serves the first dynamic
 * `import()` of an external dependency, and a later one gets the real vision
 * bundle, which then fails inside jsdom. `doMock` keeps every load in the stub.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import { HandLandmarker } from "./hand-landmarker";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FakeNativeLandmarker {
  close: ReturnType<typeof vi.fn>;
}

describe("HandLandmarker load lifecycle", () => {
  let pendingCreations: Array<Deferred<FakeNativeLandmarker>>;
  let created: FakeNativeLandmarker[];
  let createFromOptions: Mock<
    (...args: unknown[]) => Promise<FakeNativeLandmarker>
  >;

  /** Let the dynamic import, fileset resolution and promise chains settle. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function waitForPendingCreation(): Promise<void> {
    for (let i = 0; i < 40 && pendingCreations.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Hand every outstanding create call its native landmarker, including any
   * created in reaction to the ones already resolved.
   */
  async function completeAllCreations(): Promise<void> {
    for (let round = 0; round < 4; round++) {
      await waitForPendingCreation();
      if (pendingCreations.length === 0) break;
      for (const creation of pendingCreations.splice(0)) {
        const landmarker: FakeNativeLandmarker = { close: vi.fn() };
        created.push(landmarker);
        creation.resolve(landmarker);
      }
      await settle();
    }
  }

  beforeEach(async () => {
    pendingCreations = [];
    created = [];
    createFromOptions = vi.fn(() => {
      const creation = deferred<FakeNativeLandmarker>();
      pendingCreations.push(creation);
      return creation.promise;
    });

    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: {
        forVisionTasks: async () => ({ wasmLoaderPath: "stub" }),
      },
      HandLandmarker: {
        createFromOptions: (...args: unknown[]) => createFromOptions(...args),
      },
    }));

    // Load the stub once through the subject so later loads come out of the
    // module registry. Without this warm-up a second `import()` from inside
    // the subject reaches for the real vision bundle, which cannot run in
    // jsdom, and the mock silently stops applying for the rest of the file.
    const warmup = new HandLandmarker();
    const warming = warmup.initialize();
    await completeAllCreations();
    await warming;
    warmup.dispose();
    pendingCreations.length = 0;
    created.length = 0;
    createFromOptions.mockClear();
  });

  it("builds one landmarker when two callers race for the first detection", async () => {
    const landmarker = new HandLandmarker();

    const first = landmarker.initialize();
    const second = landmarker.initialize();
    await completeAllCreations();
    await Promise.all([first, second]);

    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(landmarker.isInitialized).toBe(true);
  });

  it("closes a landmarker that finishes loading after dispose", async () => {
    const landmarker = new HandLandmarker();

    const loading = landmarker.initialize();

    // The user left Train while the model was still downloading.
    landmarker.dispose();

    await completeAllCreations();
    await loading;

    expect(created).toHaveLength(1);
    expect(created[0]?.close).toHaveBeenCalledTimes(1);
    expect(landmarker.isInitialized).toBe(false);
  });

  it("can load again after dispose interrupted the first load", async () => {
    const landmarker = new HandLandmarker();

    const interrupted = landmarker.initialize();
    landmarker.dispose();
    await completeAllCreations();
    await interrupted;

    const retry = landmarker.initialize();
    await completeAllCreations();
    await retry;

    expect(landmarker.isInitialized).toBe(true);
    expect(created).toHaveLength(2);
    expect(created[1]?.close).not.toHaveBeenCalled();
  });

  it("can retry after a failed load", async () => {
    const landmarker = new HandLandmarker();

    const failing = landmarker.initialize();
    await waitForPendingCreation();
    pendingCreations.splice(0)[0]?.reject(new Error("wasm fetch failed"));
    await expect(failing).rejects.toThrow(/MediaPipe initialization failed/);
    expect(landmarker.isInitialized).toBe(false);

    const retry = landmarker.initialize();
    await completeAllCreations();
    await retry;

    expect(landmarker.isInitialized).toBe(true);
  });
});
