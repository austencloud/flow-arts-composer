import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));

import { ThumbnailLocalCache } from "#lib/shared/browse/services/thumbnail-local-cache.js";

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  // jsdom's Blob does not survive fake-indexeddb's structuredClone.
  vi.stubGlobal("Blob", NodeBlob);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open("thumbnail-local-cache", version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe("thumbnail local cache availability", () => {
  it("returns hits and misses without waiting for the fallback deadline", async () => {
    const cache = new ThumbnailLocalCache();
    const blob = new Blob(["cached card"], { type: "image/webp" });
    await cache.set("card", blob);

    expect(await (await cache.get("card"))?.text()).toBe("cached card");
    expect(await cache.get("missing")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back within 500ms when an old tab blocks the schema upgrade, then recovers", async () => {
    const oldTab = await open(4);
    const openSpy = vi.spyOn(factory, "open");
    const cache = new ThumbnailLocalCache();
    const lookup = cache.get("card");
    const request = openSpy.mock.results[0]!.value as IDBOpenDBRequest;
    await new Promise<void>((resolve) => {
      request.addEventListener("blocked", () => resolve(), { once: true });
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(await lookup).toBeNull();

    // No clearing browser data: closing the old connection lets this same
    // cache recover, and the expired read must not start a transaction.
    const connected = new Promise<IDBDatabase>((resolve) => {
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
    });
    oldTab.close();
    const db = await connected;
    const transactions = vi.spyOn(db, "transaction");
    await Promise.resolve();
    expect(transactions).not.toHaveBeenCalled();
    await cache.set("card", new Blob(["recovered"]));
    expect(await (await cache.get("card"))?.text()).toBe("recovered");
  });

  it("releases an open connection when another tab upgrades", async () => {
    const cache = new ThumbnailLocalCache();
    await cache.get("missing");
    const newerTab = await open(6);
    expect(newerTab.version).toBe(6);
    newerTab.close();
    // An old build cannot open version 5 anymore, but it can still fall back.
    expect(await cache.get("missing")).toBeNull();
  });

  it("retries after a failed database open rather than caching its rejection", async () => {
    const openSpy = vi.spyOn(factory, "open");
    openSpy.mockImplementationOnce(() => {
      const request = new EventTarget() as IDBOpenDBRequest;
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request;
    });
    const cache = new ThumbnailLocalCache();
    expect(await cache.get("card")).toBeNull();
    await cache.set("card", new Blob(["retried"]));
    expect(await (await cache.get("card"))?.text()).toBe("retried");
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it("aborts a stalled read transaction and ignores its late result", async () => {
    const cache = new ThumbnailLocalCache();
    const openSpy = vi.spyOn(factory, "open");
    await cache.get("missing");
    const db = (openSpy.mock.results[0]!.value as IDBOpenDBRequest).result;
    const request = { onsuccess: null, result: { blob: new Blob(["late"]) } };
    const put = vi.fn();
    const abort = vi.fn();
    vi.spyOn(db, "transaction").mockReturnValueOnce({
      objectStore: () => ({ get: () => request, put }),
      abort,
    } as unknown as IDBTransaction);
    const lookup = cache.get("stalled");
    await vi.advanceTimersByTimeAsync(500);
    expect(await lookup).toBeNull();
    expect(abort).toHaveBeenCalledOnce();
    (request.onsuccess as unknown as () => void)();
    expect(put).not.toHaveBeenCalled();
  });
});
