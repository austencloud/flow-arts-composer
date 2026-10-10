import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionDispatcher } from "#lib/shared/render/services/composition-dispatcher.js";
import type { CompositionProgressCallback } from "#lib/shared/render/services/types.js";

type WorkerMessage = {
  type: string;
  id: number;
};

function setWorkerSupport(supported: boolean | null): void {
  (
    CompositionDispatcher as unknown as {
      workerSupport: boolean | null;
    }
  ).workerSupport = supported;
}

function makeWorkerDispatcher(posted: WorkerMessage[]) {
  const workerEntry = {
    worker: {
      postMessage(message: WorkerMessage) {
        posted.push(message);
      },
    },
    ready: true,
    pendingCount: 0,
  };
  const dispatcher = new CompositionDispatcher({} as never, {} as never);
  const internals = dispatcher as unknown as {
    ensureInitialized: () => Promise<void>;
    handleWorkerMessage: (message: unknown) => void;
    initialized: boolean;
    pickWorker: () => typeof workerEntry;
  };
  internals.initialized = true;
  internals.ensureInitialized = async () => {};
  internals.pickWorker = () => workerEntry;
  return { dispatcher, internals };
}

function installOffscreenCanvas(
  events: string[],
  blob: Blob
): typeof OffscreenCanvas {
  class FakeOffscreenCanvas {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return {
        drawImage() {
          events.push("draw-bitmap");
        },
      };
    }

    convertToBlob() {
      events.push("convert-to-blob");
      return Promise.resolve(blob);
    }
  }

  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  return FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

afterEach(() => {
  setWorkerSupport(null);
  vi.unstubAllGlobals();
});

describe("CompositionDispatcher finalizing progress", () => {
  it("reports finalizing before main-thread OffscreenCanvas encoding", async () => {
    const events: string[] = [];
    const blob = new Blob(["offscreen"], { type: "image/webp" });
    const FakeOffscreenCanvas = installOffscreenCanvas(events, blob);
    const canvas = new FakeOffscreenCanvas(40, 20);
    const imageComposer = {
      composeSequenceImage: vi.fn(
        async (
          _sequence: unknown,
          _options: unknown,
          onProgress?: CompositionProgressCallback
        ) => {
          onProgress?.({ current: 2, total: 2, stage: "rendering" });
          events.push("composition-complete");
          return canvas;
        }
      ),
    };
    const dispatcher = new CompositionDispatcher(
      imageComposer as never,
      {} as never
    );
    setWorkerSupport(false);

    const result = await dispatcher.compose(
      { steps: [] } as never,
      {},
      (progress) => events.push(progress.stage)
    );

    expect(result).toBe(blob);
    expect(events).toEqual([
      "rendering",
      "composition-complete",
      "finalizing",
      "convert-to-blob",
    ]);
  });

  it("reports finalizing before main-thread HTML canvas encoding", async () => {
    const events: string[] = [];
    const blob = new Blob(["html"], { type: "image/webp" });
    installOffscreenCanvas(events, blob);
    const canvas = {
      toBlob(callback: BlobCallback) {
        events.push("to-blob");
        callback(blob);
      },
    };
    const imageComposer = {
      composeSequenceImage: vi.fn(
        async (
          _sequence: unknown,
          _options: unknown,
          onProgress?: CompositionProgressCallback
        ) => {
          onProgress?.({ current: 1, total: 1, stage: "rendering" });
          events.push("composition-complete");
          return canvas;
        }
      ),
    };
    const dispatcher = new CompositionDispatcher(
      imageComposer as never,
      {} as never
    );
    setWorkerSupport(false);

    const result = await dispatcher.compose(
      { steps: [] } as never,
      {},
      (progress) => events.push(progress.stage)
    );

    expect(result).toBe(blob);
    expect(events).toEqual([
      "rendering",
      "composition-complete",
      "finalizing",
      "to-blob",
    ]);
  });

  it("reports finalizing before converting a worker bitmap to a blob", async () => {
    const events: string[] = [];
    const blob = new Blob(["worker"], { type: "image/webp" });
    installOffscreenCanvas(events, blob);
    setWorkerSupport(true);
    const posted: WorkerMessage[] = [];
    const { dispatcher, internals } = makeWorkerDispatcher(posted);
    const bitmap = {
      width: 40,
      height: 20,
      close: () => events.push("close-bitmap"),
    };

    const resultPromise = dispatcher.compose(
      { steps: [] } as never,
      {},
      (progress) => events.push(progress.stage)
    );
    await Promise.resolve();
    const requestId = posted[0]!.id;

    internals.handleWorkerMessage({
      type: "progress",
      id: requestId,
      current: 2,
      total: 2,
      stage: "rendering",
    });
    internals.handleWorkerMessage({
      type: "result",
      id: requestId,
      bitmap,
    });

    await expect(resultPromise).resolves.toBe(blob);
    expect(events).toEqual([
      "rendering",
      "finalizing",
      "draw-bitmap",
      "close-bitmap",
      "convert-to-blob",
    ]);
  });

  it("returns composeFrontBitmap without blob encoding or finalizing progress", async () => {
    const events: string[] = [];
    const blob = new Blob(["unused"], { type: "image/webp" });
    installOffscreenCanvas(events, blob);
    const posted: WorkerMessage[] = [];
    const { dispatcher, internals } = makeWorkerDispatcher(posted);
    const bitmap = {
      width: 40,
      height: 20,
      close: vi.fn(),
    };

    const resultPromise = dispatcher.composeFrontBitmap(
      { steps: [] } as never,
      {},
      null,
      undefined,
      (progress) => events.push(progress.stage)
    );
    await Promise.resolve();
    const requestId = posted[0]!.id;

    internals.handleWorkerMessage({
      type: "progress",
      id: requestId,
      current: 2,
      total: 2,
      stage: "rendering",
    });
    internals.handleWorkerMessage({
      type: "result",
      id: requestId,
      bitmap,
    });

    await expect(resultPromise).resolves.toBe(bitmap);
    expect(events).toEqual(["rendering"]);
    expect(bitmap.close).not.toHaveBeenCalled();
  });
});
