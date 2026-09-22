import { describe, expect, it, vi } from "vitest";
import { WorkerSceneAssetPreloader } from "$lib/shared/3d/worker-renderer/services/worker-scene-assets";

function response(bytes: number, declared = bytes): Response {
  let sent = false;
  return {
    ok: true,
    headers: new Headers({ "content-length": String(declared) }),
    body: {
      cancel: vi.fn(),
      getReader: () => ({
        read: async () =>
          sent
            ? { done: true }
            : ((sent = true), { done: false, value: new Uint8Array(bytes) }),
        cancel: vi.fn(),
        releaseLock: vi.fn(),
      }),
    },
  } as unknown as Response;
}

function fixture(budget = 10) {
  let id = 0;
  const transport = {
    fetch: vi.fn(async (_url: string, _signal: AbortSignal) => response(4)),
    createObjectURL: vi.fn((_blob: Blob) => `blob:prepared-${++id}`),
    revokeObjectURL: vi.fn(),
  };
  return { transport, cache: new WorkerSceneAssetPreloader(transport, budget) };
}

describe("worker scene asset preparation", () => {
  it("hands prepared bytes to the loader without downloading them again", async () => {
    const { cache, transport } = fixture();
    await cache.prepare("ocean", ["reef.glb"]);
    const prepared = cache.resolve("reef.glb");
    await cache.prepare("ocean", ["reef.glb"]);
    expect(prepared).toBe("blob:prepared-1");
    expect(cache.resolve("reef.glb")).toBe(prepared);
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    expect(cache.resolve("reef.glb?v=2")).toBe("reef.glb?v=2");
  });

  it("shares a pending hover download with a subsequent selection", async () => {
    const { cache, transport } = fixture();
    let finish!: (value: Response) => void;
    transport.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const hover = cache.prepare("ocean", ["reef.glb"]);
    const selection = cache.prepare("ocean", ["reef.glb"]);
    expect(selection).toBe(hover);
    finish(response(4));
    await selection;
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used bytes and revokes their object URLs", async () => {
    const { cache, transport } = fixture();
    await cache.prepare("a", ["a.glb", "b.glb"]);
    cache.resolve("a.glb");
    await cache.prepare("c", ["c.glb"]);
    expect(cache.snapshot).toEqual({ bytes: 8, count: 2 });
    expect(cache.resolve("b.glb")).toBe("b.glb");
    expect(cache.resolve("a.glb")).toBe("blob:prepared-1");
    expect(transport.revokeObjectURL).toHaveBeenCalledWith("blob:prepared-2");
  });

  it("does not publish an obsolete download even if transport ignores abort", async () => {
    const { cache, transport } = fixture();
    let finish!: (value: Response) => void;
    transport.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const obsolete = cache.prepare("old", ["old.glb"]);
    const oldSignal = transport.fetch.mock.calls[0][1];
    await cache.prepare("latest", ["latest.glb"]);
    finish(response(4));
    await obsolete;
    expect(oldSignal.aborted).toBe(true);
    expect(cache.resolve("old.glb")).toBe("old.glb");
    expect(cache.snapshot).toEqual({ bytes: 4, count: 1 });
  });

  it("retries a failed warm-up and never stores an oversized response", async () => {
    const { cache, transport } = fixture();
    transport.fetch.mockRejectedValueOnce(new Error("offline"));
    await cache.prepare("a", ["a.glb"]);
    expect(cache.resolve("a.glb")).toBe("a.glb");
    await cache.prepare("a", ["a.glb"]);
    expect(cache.resolve("a.glb")).toBe("blob:prepared-1");
    transport.fetch.mockResolvedValueOnce(response(11, 0));
    await cache.prepare("large", ["large.glb"]);
    expect(cache.resolve("large.glb")).toBe("large.glb");
    expect(cache.snapshot.bytes).toBeLessThanOrEqual(10);
  });

  it("clears pending work and all retained bytes on worker disposal", async () => {
    const { cache, transport } = fixture();
    await cache.prepare("a", ["a.glb"]);
    let finish!: (value: Response) => void;
    transport.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = cache.prepare("b", ["b.glb"]);
    cache.clear();
    finish(response(4));
    await pending;
    expect(cache.snapshot).toEqual({ bytes: 0, count: 0 });
    expect(cache.resolve("b.glb")).toBe("b.glb");
    expect(transport.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
