import { describe, expect, it, vi } from "vitest";
import {
  createEnvironmentModuleLoader,
  failedModuleUrl,
} from "./environment-module-load";

const CHUNK_URL = "http://localhost:5310/src/scenes/EmberScene.svelte";
const chunkError = () =>
  new TypeError(`Failed to fetch dynamically imported module: ${CHUNK_URL}`);

describe("createEnvironmentModuleLoader", () => {
  it("reports a rejected chunk for a world still being loaded", async () => {
    const reportFailed = vi.fn();
    const loader = createEnvironmentModuleLoader<string>(reportFailed);
    const error = chunkError();

    await expect(
      loader.load(
        "ember",
        async () => {
          throw error;
        },
        () => true
      )
    ).rejects.toBe(error);
    expect(reportFailed).toHaveBeenCalledWith(
      "This scene couldn't load. Try again."
    );
  });

  it("stays quiet when the viewer already moved on from that world", async () => {
    const reportFailed = vi.fn();
    const loader = createEnvironmentModuleLoader<string>(reportFailed);

    await expect(
      loader.load(
        "ember",
        async () => {
          throw chunkError();
        },
        () => false
      )
    ).rejects.toThrow("Failed to fetch");
    expect(reportFailed).not.toHaveBeenCalled();
  });

  // The browser caches the failed specifier, so the retry must refetch the
  // URL with a fresh query rather than call the same import again.
  it("retries a failed world by refetching its URL past the browser cache", async () => {
    const importUrl = vi.fn(async (_url: string) => ({ default: "Ember" }));
    const loader = createEnvironmentModuleLoader<string>(vi.fn(), importUrl);
    const importer = vi.fn(async () => {
      throw chunkError();
    });

    await expect(loader.load("ember", importer, () => true)).rejects.toThrow();
    await expect(loader.load("ember", importer, () => true)).resolves.toEqual({
      default: "Ember",
    });
    expect(importer).toHaveBeenCalledTimes(1);
    const retriedUrl = String(importUrl.mock.calls[0]![0]);
    expect(retriedUrl.startsWith(`${CHUNK_URL}?t=`)).toBe(true);

    // Once it loaded, the world goes back to its ordinary import.
    const fresh = vi.fn(async () => ({ default: "Ember" }));
    await loader.load("ember", fresh, () => true);
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("keeps other worlds on their ordinary import", async () => {
    const importUrl = vi.fn();
    const loader = createEnvironmentModuleLoader<string>(vi.fn(), importUrl);
    await expect(
      loader.load(
        "ember",
        async () => {
          throw chunkError();
        },
        () => true
      )
    ).rejects.toThrow();

    const winter = vi.fn(async () => ({ default: "Winter" }));
    await expect(loader.load("winter", winter, () => true)).resolves.toEqual({
      default: "Winter",
    });
    expect(importUrl).not.toHaveBeenCalled();
  });
});

describe("failedModuleUrl", () => {
  it("reads the URL from Chrome's and Firefox's rejection messages", () => {
    expect(failedModuleUrl(chunkError())).toBe(CHUNK_URL);
    expect(
      failedModuleUrl(
        new TypeError(`error loading dynamically imported module: ${CHUNK_URL}`)
      )
    ).toBe(CHUNK_URL);
    expect(failedModuleUrl(new Error("offline"))).toBeUndefined();
  });
});
