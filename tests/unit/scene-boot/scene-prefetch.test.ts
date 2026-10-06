/**
 * The prefetcher spends a viewer's bandwidth on models they have not asked for
 * yet. Every one of its brakes fails silently: a broken Data Saver check just
 * downloads anyway, and a broken dedupe re-downloads the same scene on every
 * mount. Neither shows up as an error, so they are pinned down here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";

vi.mock("$app/environment", () => ({ browser: true }));

import {
  DECODER_RUNTIME_URLS,
  sceneAssetUrls,
} from "$lib/shared/3d/scene-boot/scene-asset-manifest";
import {
  _resetForTests,
  warmDecoderRuntimes,
  warmSceneAssets,
  warmSceneUrls,
} from "$lib/shared/3d/scene-boot/scene-prefetch";

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
