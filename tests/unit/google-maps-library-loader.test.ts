import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mapsApi = vi.hoisted(() => ({
  importLibrary: vi.fn(),
  setOptions: vi.fn(),
}));

vi.mock("@googlemaps/js-api-loader", () => mapsApi);

import { GoogleMapsLibraryLoader } from "#lib/shared/maps/services/implementations/GoogleMapsLibraryLoader.js";

beforeEach(() => {
  vi.clearAllMocks();
  mapsApi.importLibrary.mockResolvedValue({});
  Reflect.deleteProperty(globalThis, "google");
});

describe("GoogleMapsLibraryLoader", () => {
  it("configures once and shares one in-flight library request", async () => {
    const loader = new GoogleMapsLibraryLoader();

    const first = loader.load("maps-key");
    const second = loader.load("maps-key");

    expect(first).toBe(second);
    await first;
    expect(mapsApi.setOptions).toHaveBeenCalledOnce();
    expect(mapsApi.setOptions).toHaveBeenCalledWith({
      key: "maps-key",
      v: "weekly",
      loading: "async",
    });
    expect(mapsApi.importLibrary.mock.calls).toEqual([["maps"], ["marker"]]);
  });

  it("turns non-Error rejections into an Error and permits a retry", async () => {
    mapsApi.importLibrary
      .mockRejectedValueOnce(undefined)
      .mockResolvedValue({});
    const loader = new GoogleMapsLibraryLoader();

    await expect(loader.load("maps-key")).rejects.toThrow(
      "Google Maps libraries could not load."
    );
    await expect(loader.load("maps-key")).resolves.toBeUndefined();

    expect(mapsApi.setOptions).toHaveBeenCalledOnce();
    expect(mapsApi.importLibrary).toHaveBeenCalledTimes(4);
  });

  it("rejects missing or conflicting API keys", async () => {
    const loader = new GoogleMapsLibraryLoader();

    await expect(loader.load(" ")).rejects.toThrow(
      "Google Maps API key is missing."
    );
    await loader.load("first-key");
    await expect(loader.load("second-key")).rejects.toThrow(
      "Google Maps is already configured with a different API key."
    );
  });

  it("reuses a Maps import function preserved across HMR", async () => {
    Object.defineProperty(globalThis, "google", {
      configurable: true,
      value: { maps: { importLibrary: vi.fn() } },
    });
    const loader = new GoogleMapsLibraryLoader();

    await loader.load("maps-key");

    expect(mapsApi.setOptions).not.toHaveBeenCalled();
    expect(mapsApi.importLibrary.mock.calls).toEqual([["maps"], ["marker"]]);
  });
});

describe("GoogleMapsLibraryLoader Places split", () => {
  it("does not import Places when only the map is requested", async () => {
    const loader = new GoogleMapsLibraryLoader();

    await loader.load("maps-key");

    // The assertion that matters for cost: both existing consumers mount a map
    // without ever opening a picker, so Places must not ride along.
    expect(mapsApi.importLibrary.mock.calls).toEqual([["maps"], ["marker"]]);
  });

  it("does not import the map when only Places is requested", async () => {
    const loader = new GoogleMapsLibraryLoader();

    await loader.loadPlaces("maps-key");

    expect(mapsApi.importLibrary.mock.calls).toEqual([["places"]]);
  });

  it("configures the bootstrap when Places is requested first", async () => {
    const loader = new GoogleMapsLibraryLoader();

    // The picker can be opened before the map has ever intersected the
    // viewport. On this ordering the bootstrap has not run yet, and before it
    // was extracted from load() this call imported Places with no key set.
    await loader.loadPlaces("maps-key");
    await loader.load("maps-key");

    expect(mapsApi.setOptions).toHaveBeenCalledOnce();
    expect(mapsApi.setOptions).toHaveBeenCalledWith({
      key: "maps-key",
      v: "weekly",
      loading: "async",
    });
    expect(mapsApi.importLibrary.mock.calls).toEqual([
      ["places"],
      ["maps"],
      ["marker"],
    ]);
  });

  it("configures the bootstrap once when the map is requested first", async () => {
    const loader = new GoogleMapsLibraryLoader();

    await loader.load("maps-key");
    await loader.loadPlaces("maps-key");

    expect(mapsApi.setOptions).toHaveBeenCalledOnce();
    expect(mapsApi.importLibrary.mock.calls).toEqual([
      ["maps"],
      ["marker"],
      ["places"],
    ]);
  });

  it("shares one in-flight Places request", async () => {
    const loader = new GoogleMapsLibraryLoader();

    const first = loader.loadPlaces("maps-key");
    const second = loader.loadPlaces("maps-key");

    expect(first).toBe(second);
    await first;
    expect(mapsApi.importLibrary).toHaveBeenCalledOnce();
  });

  it("keeps a Places failure out of the map memo", async () => {
    mapsApi.importLibrary.mockImplementation((library: string) =>
      library === "places"
        ? Promise.reject(new Error("places blocked"))
        : Promise.resolve({})
    );
    const loader = new GoogleMapsLibraryLoader();

    await expect(loader.loadPlaces("maps-key")).rejects.toThrow(
      "places blocked"
    );
    // The map is a separate capability with a separate memo; a picker that
    // cannot load must not take the markers down with it.
    await expect(loader.load("maps-key")).resolves.toBeUndefined();
  });

  it("keeps a map failure out of the Places memo", async () => {
    mapsApi.importLibrary.mockImplementation((library: string) =>
      library === "places"
        ? Promise.resolve({})
        : Promise.reject(new Error("maps blocked"))
    );
    const loader = new GoogleMapsLibraryLoader();

    await expect(loader.load("maps-key")).rejects.toThrow("maps blocked");
    await expect(loader.loadPlaces("maps-key")).resolves.toBeUndefined();
  });

  it("rejects rather than throwing synchronously on a bad key", async () => {
    const loader = new GoogleMapsLibraryLoader();

    // The bootstrap is synchronous so two callers cannot interleave through
    // it, but the entry points must still hand back rejections: a consumer
    // written as `loadPlaces(key).catch(...)` would otherwise see an uncaught
    // exception instead of a handled failure.
    const missing = loader.loadPlaces(" ");
    expect(missing).toBeInstanceOf(Promise);
    await expect(missing).rejects.toThrow("Google Maps API key is missing.");

    await loader.load("first-key");
    const conflicting = loader.loadPlaces("second-key");
    expect(conflicting).toBeInstanceOf(Promise);
    await expect(conflicting).rejects.toThrow(
      "Google Maps is already configured with a different API key."
    );
    expect(mapsApi.importLibrary.mock.calls).toEqual([["maps"], ["marker"]]);
  });
});

describe("map component loading contract", () => {
  it("routes both map components through the shared loader", () => {
    const files = [
      "src/lib/features/community/components/GlobalUserMap.svelte",
      "src/lib/features/festivals/components/map/FestivalMap.svelte",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain("getGoogleMapsLibraryLoader");
      expect(source).not.toContain("maps.googleapis.com/maps/api/js");
      expect(source).not.toContain("loadGoogleMapsScript");
      expect(source).not.toContain("onMount(async");
      expect(source).not.toContain("async function createMarkers");
    }
  });
});
