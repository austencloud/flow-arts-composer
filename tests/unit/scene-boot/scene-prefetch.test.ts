// @vitest-environment jsdom
/**
 * The prefetcher spends a viewer's bandwidth on models they have not asked for
 * yet. Every one of its brakes fails silently: a broken Data Saver check just
 * downloads anyway, and a broken dedupe re-downloads the same scene on every
 * mount. Neither shows up as an error, so they are pinned down here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";

vi.mock("$app/env", () => ({ browser: true }));

import {
  DECODER_RUNTIME_URLS,
  sceneAssetUrls,
} from "#lib/shared/3d/scene-boot/scene-asset-manifest.js";
import {
  _resetForTests,
  warmDecoderRuntimes,
  warmSceneAssets,
  warmSceneUrls,
  warmSelectedSceneAssets,
} from "#lib/shared/3d/scene-boot/scene-prefetch.js";

const OCEAN_URLS = sceneAssetUrls(BackgroundType.OCEAN);

function setNavigatorProperty(key: "onLine" | "connection", value: unknown): void {
  Object.defineProperty(navigator, key, {
    value,
    configurable: true,
    writable: true,
  });
}

/** Idle callbacks run inline so a test does not have to wait on the scheduler. */
function runIdleWorkInline(): void {
  Object.defineProperty(globalThis, "requestIdleCallback", {
    value: (callback: () => void) => {
      callback();
      return 1;
    },
    configurable: true,
    writable: true,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _resetForTests();
  runIdleWorkInline();
  setNavigatorProperty("onLine", true);
  setNavigatorProperty("connection", undefined);
  fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "requestIdleCallback");
});

function fetchedUrls(): string[] {
  return fetchMock.mock.calls.map((call) => call[0] as string);
}

describe("warmSceneAssets", () => {
  it("requests the selected environment's models at low priority", async () => {
    warmSceneAssets(BackgroundType.OCEAN);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(OCEAN_URLS.length));
    expect(fetchedUrls()).toEqual([...OCEAN_URLS]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ priority: "low" });
  });

  it("fetches nothing the second time — a remount must not re-download a scene", async () => {
    warmSceneAssets(BackgroundType.OCEAN);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(OCEAN_URLS.length));

    fetchMock.mockClear();
    warmSceneAssets(BackgroundType.OCEAN);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a URL whose warm fetch failed", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline mid-flight"));
    warmSceneAssets(BackgroundType.OCEAN);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(OCEAN_URLS.length));

    fetchMock.mockClear();
    warmSceneAssets(BackgroundType.OCEAN);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchedUrls()).toEqual([OCEAN_URLS[0]]);
  });

  it("spends nothing when the user has asked for Data Saver", async () => {
    setNavigatorProperty("connection", { saveData: true });
    warmSceneAssets(BackgroundType.OCEAN);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("spends nothing while offline", async () => {
    setNavigatorProperty("onLine", false);
    warmSceneAssets(BackgroundType.OCEAN);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for an environment that loads no models", async () => {
    warmSceneAssets(BackgroundType.VOID);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("warmDecoderRuntimes", () => {
  it("warms the shared decoders once, whatever the scene", async () => {
    warmDecoderRuntimes();
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledTimes(DECODER_RUNTIME_URLS.length)
    );
    expect(fetchedUrls()).toEqual([...DECODER_RUNTIME_URLS]);

    fetchMock.mockClear();
    warmDecoderRuntimes();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects Data Saver", async () => {
    setNavigatorProperty("connection", { saveData: true });
    warmDecoderRuntimes();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("warmSceneUrls", () => {
  it("warms only the named models, once, and respects Data Saver", async () => {
    warmSceneUrls(["/models/cosmic/cosmic-reliquary.glb"]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchedUrls()).toEqual(["/models/cosmic/cosmic-reliquary.glb"]);

    fetchMock.mockClear();
    warmSceneUrls(["/models/cosmic/cosmic-reliquary.glb"]);
    setNavigatorProperty("connection", { saveData: true });
    warmSceneUrls(["/models/cosmic/other.glb"]);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** Idle callbacks wait in a queue until the test runs them. */
function queueIdleWork(): () => void {
  const queued: Array<() => void> = [];
  Object.defineProperty(globalThis, "requestIdleCallback", {
    value: (callback: () => void) => {
      queued.push(callback);
      return queued.length;
    },
    configurable: true,
    writable: true,
  });
  return () => {
    for (const callback of queued.splice(0)) callback();
  };
}

describe("cancelling a warm-up", () => {
  // The viewer queues its warm-up for an idle moment. On a busy phone that
  // moment can first come after the visitor has tapped through to another
  // page, which then loses bandwidth to models it never shows.
  it("drops work that was still queued when the caller left", async () => {
    const runIdle = queueIdleWork();
    const leave = new AbortController();
    warmSelectedSceneAssets(leave.signal);

    leave.abort();
    runIdle();
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops a warm-up part way and lets the next one fetch those models", async () => {
    expect(OCEAN_URLS.length).toBeGreaterThan(1);
    const leave = new AbortController();
    // The first model is still downloading when the visitor leaves.
    fetchMock.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    warmSceneAssets(BackgroundType.OCEAN, leave.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: leave.signal });

    leave.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockClear();
    warmSceneAssets(BackgroundType.OCEAN);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(OCEAN_URLS.length));
    expect(fetchedUrls()).toEqual([...OCEAN_URLS]);
  });
});
