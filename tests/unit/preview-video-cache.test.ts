import { describe, expect, it, vi } from "vitest";
import {
  PreviewVideoCache,
  type PreviewVideoDependencies,
} from "../../src/lib/shared/media-composition/services/implementations/PreviewVideoCache";
import {
  previewVideoCacheKey,
  previewVideoDimensions,
  type PreviewVideoCopy,
} from "../../src/lib/shared/media-composition/domain/preview-video";

function copy(): PreviewVideoCopy {
  return {
    blob: new Blob(["preview"], { type: "video/mp4" }),
    width: 1280,
    height: 720,
    sourceWidth: 3840,
    sourceHeight: 2160,
    durationSeconds: 24,
  };
}

function fixture(overrides: Partial<PreviewVideoDependencies> = {}) {
  const dependencies: PreviewVideoDependencies = {
    store: {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    render: vi.fn(async () => copy()),
    supported: () => true,
    createUrl: vi.fn(() => "blob:preview"),
    revokeUrl: vi.fn(),
    ...overrides,
  };
  return { cache: new PreviewVideoCache(dependencies), dependencies };
}

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("preview video cache", () => {
  it("shares one conversion and URL across regions until the last region releases it", async () => {
    const { cache, dependencies } = fixture();
    const first = cache.acquire("https://video/original", "take-1");
    const second = cache.acquire("https://video/original", "take-1");
    expect(first.ready).toBe(second.ready);
    expect(await first.ready).toMatchObject({
      status: "ready",
      sourceUrl: "https://video/original",
      url: "blob:preview",
      sourceWidth: 3840,
      durationSeconds: 24,
    });
    expect(dependencies.render).toHaveBeenCalledTimes(1);
    first.release();
    first.release();
    expect(dependencies.revokeUrl).not.toHaveBeenCalled();
    second.release();
    expect(dependencies.revokeUrl).toHaveBeenCalledExactlyOnceWith(
      "blob:preview"
    );
  });

  it("serializes different videos and starts the next after cancellation", async () => {
    const started = deferred<void>();
    const first = deferred<PreviewVideoCopy>();
    const render = vi.fn((url: string, signal: AbortSignal) => {
      if (url === "first") {
        started.resolve();
        return new Promise<PreviewVideoCopy>((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true }
          );
          void first.promise.then(resolve);
        });
      }
      return Promise.resolve(copy());
    });
    const { cache, dependencies } = fixture({ render });
    const a = cache.acquire("first");
    const b = cache.acquire("second");
    await started.promise;
    expect(render).toHaveBeenCalledTimes(1);
    a.release();
    expect(await a.ready).toMatchObject({ status: "fallback", url: "first" });
    expect(await b.ready).toMatchObject({ status: "ready" });
    expect(render).toHaveBeenCalledTimes(2);
    expect(dependencies.createUrl).toHaveBeenCalledTimes(1);
    b.release();
  });

  it("skips queued work when released and allows the same source to be acquired again", async () => {
    const { cache, dependencies } = fixture();
    const removed = cache.acquire("original");
    removed.release();
    const acquired = cache.acquire("original");
    expect(await removed.ready).toMatchObject({ status: "fallback" });
    expect(await acquired.ready).toMatchObject({ status: "ready" });
    expect(dependencies.render).toHaveBeenCalledTimes(1);
    acquired.release();
  });

  it("uses persisted copies without requiring encoder support", async () => {
    const { cache, dependencies } = fixture({
      supported: () => false,
      store: { read: async () => copy(), write: vi.fn(), remove: vi.fn() },
    });
    const handle = cache.acquire("original");
    expect(await handle.ready).toMatchObject({ status: "ready" });
    expect(dependencies.render).not.toHaveBeenCalled();
    handle.release();
  });

  it("invalidates a replaced source even when the asset identity stays the same", async () => {
    const { cache, dependencies } = fixture();
    const first = cache.acquire("old", "take");
    const changed = cache.acquire("new", "take");
    await Promise.all([first.ready, changed.ready]);
    expect(dependencies.render).toHaveBeenCalledTimes(2);
    expect(dependencies.store.read).toHaveBeenCalledWith(
      previewVideoCacheKey("old", "take")
    );
    expect(dependencies.store.read).toHaveBeenCalledWith(
      previewVideoCacheKey("new", "take")
    );
    first.release();
    changed.release();
  });

  it("resolves unsupported browsers and conversion errors to original-source fallback", async () => {
    for (const overrides of [
      { supported: () => false },
      {
        render: async () => {
          throw new Error("Audio encoder unavailable");
        },
      },
    ]) {
      const { cache, dependencies } = fixture(overrides);
      const handle = cache.acquire("original");
      expect(await handle.ready).toMatchObject({
        status: "fallback",
        url: "original",
        sourceUrl: "original",
      });
      expect(dependencies.createUrl).not.toHaveBeenCalled();
      handle.release();
    }
  });

  it("keeps a session proxy when IndexedDB cannot read or persist it", async () => {
    const { cache } = fixture({
      store: {
        read: async () => {
          throw new Error("blocked");
        },
        write: async () => {
          throw new Error("quota");
        },
        remove: vi.fn(),
      },
    });
    const handle = cache.acquire("original");
    expect(await handle.ready).toMatchObject({
      status: "ready",
      reason: expect.stringContaining("device cache is unavailable"),
    });
    handle.release();
  });

  it("does not notify a released region while another region keeps preparing", async () => {
    const result = deferred<PreviewVideoCopy>();
    const { cache } = fixture({ render: () => result.promise });
    const a = cache.acquire("original");
    const b = cache.acquire("original");
    const listener = vi.fn();
    a.subscribe(listener);
    a.release();
    result.resolve(copy());
    await b.ready;
    expect(listener).toHaveBeenCalledTimes(1);
    b.release();
  });

  it("caps active preview memory and recovers capacity when a region releases", async () => {
    const large = { ...copy(), blob: { size: 900 * 1024 * 1024 } as Blob };
    const { cache } = fixture({ render: async () => large });
    const first = cache.acquire("first");
    expect(await first.ready).toMatchObject({ status: "ready" });
    const second = cache.acquire("second");
    expect(await second.ready).toMatchObject({
      status: "fallback",
      reason: expect.stringContaining("memory limit"),
    });
    first.release();
    second.release();
    const retried = cache.acquire("second");
    expect(await retried.ready).toMatchObject({ status: "ready" });
    retried.release();
  });

  it("invalidates a failed proxy and keeps its URL alive until its consumers release", async () => {
    let persisted: PreviewVideoCopy | null = copy();
    const store = {
      read: vi.fn(async () => persisted),
      write: vi.fn(async () => {}),
      remove: vi.fn(async () => {
        persisted = null;
      }),
    };
    const { cache, dependencies } = fixture({ store });
    const first = cache.acquire("original");
    const second = cache.acquire("original");
    await first.ready;
    const listener = vi.fn();
    second.subscribe(listener);
    first.reportPlaybackError("Preview decode failed");
    expect(second.getState()).toMatchObject({
      status: "fallback",
      url: "original",
      reason: "Preview decode failed",
    });
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "fallback" })
    );
    expect(dependencies.revokeUrl).not.toHaveBeenCalled();
    first.release();
    second.release();
    const retry = cache.acquire("original");
    expect(await retry.ready).toMatchObject({ status: "ready" });
    expect(store.remove).toHaveBeenCalledExactlyOnceWith(
      previewVideoCacheKey("original", "original")
    );
    expect(dependencies.render).toHaveBeenCalledTimes(1);
    retry.release();
  });

  it("plays a copy made ahead of time without encoding or storing one", async () => {
    const findPrepared = vi.fn(async () => ({
      url: "/videos/take.edit.mp4",
      width: 720,
      height: 1280,
      sourceWidth: 2160,
      sourceHeight: 3840,
      durationSeconds: 204,
    }));
    const { cache, dependencies } = fixture({ findPrepared });
    const handle = cache.acquire("/videos/take.mp4");
    expect(await handle.ready).toMatchObject({
      status: "ready",
      url: "/videos/take.edit.mp4",
      sourceWidth: 2160,
    });
    expect(dependencies.render).not.toHaveBeenCalled();
    expect(dependencies.store.read).not.toHaveBeenCalled();
    expect(dependencies.createUrl).not.toHaveBeenCalled();
    handle.release();
    expect(dependencies.revokeUrl).not.toHaveBeenCalled();
  });

  it("encodes in the browser when looking for a prepared copy fails", async () => {
    const { cache, dependencies } = fixture({
      findPrepared: async () => {
        throw new Error("offline");
      },
    });
    const handle = cache.acquire("/videos/take.mp4");
    expect(await handle.ready).toMatchObject({ status: "ready" });
    expect(dependencies.render).toHaveBeenCalledTimes(1);
    handle.release();
  });

  it("opens a stored copy while another video is still encoding", async () => {
    const slow = deferred<PreviewVideoCopy>();
    const { cache } = fixture({
      render: () => slow.promise,
      store: {
        read: async (key: string) =>
          key === previewVideoCacheKey("stored", "stored") ? copy() : null,
        write: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    });
    const encoding = cache.acquire("encoding");
    const stored = cache.acquire("stored");
    expect(await stored.ready).toMatchObject({ status: "ready" });
    expect(encoding.getState().status).toBe("preparing");
    slow.resolve(copy());
    expect(await encoding.ready).toMatchObject({ status: "ready" });
    encoding.release();
    stored.release();
  });

  it("keeps landscape and portrait previews inside 720p bounds with even dimensions", () => {
    expect(previewVideoDimensions(3840, 2160)).toEqual({
      width: 1280,
      height: 720,
    });
    // Portrait keeps 720 across, as landscape keeps 720 high.
    expect(previewVideoDimensions(1080, 1920)).toEqual({
      width: 720,
      height: 1280,
    });
    expect(previewVideoDimensions(2160, 3840)).toEqual({
      width: 720,
      height: 1280,
    });
    expect(previewVideoDimensions(640, 480)).toEqual({
      width: 640,
      height: 480,
    });
    expect(() => previewVideoDimensions(0, 720)).toThrow();
  });
});
