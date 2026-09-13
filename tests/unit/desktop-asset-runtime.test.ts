/**
 * Boot contract for the desktop offline asset runtime.
 *
 * `+layout.svelte` AWAITS `installDesktopAssetRuntime()` during desktop boot,
 * and every later boot step — including `DesktopInitializer`, which is what
 * moves the window off the marketing landing into `/create` — queues behind
 * it. So the documented "resolves `true` when the bundle is live, `false` …
 * when the desktop build carries no bundle" is a boot-blocking promise: it has
 * to settle, and it has to settle in bounded time, whatever the custom scheme
 * does.
 *
 * The Tauri scheme, three.js and `fetch` are mocked (no native desktop runtime
 * in CI), so these prove the installer's own failure handling against the
 * documented `fetch`/`AbortSignal` contracts, not the scheme handler.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  desktop: true,
  setURLModifier: vi.fn(),
  convertFileSrc: vi.fn(
    (path: string, scheme: string) => `https://${scheme}.localhost/${path}`
  ),
}));

vi.mock("$lib/shared/desktop/is-desktop", () => ({
  isDesktop: () => h.desktop,
}));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: h.convertFileSrc }));
vi.mock("three", () => ({
  DefaultLoadingManager: { setURLModifier: h.setURLModifier },
}));

const MANIFEST = {
  generatedAt: "2026-09-01T00:00:00.000Z",
  fileCount: 2,
  totalBytes: 2048,
  files: [
    { path: "models/forest/forest-environment.glb", bytes: 1024 },
    { path: "r2/models/ocean/reef.glb", bytes: 1024 },
  ],
};

function manifestResponse(body: unknown = MANIFEST): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

let realFetch: typeof fetch;
let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;

async function loadRuntime() {
  return await import("$lib/shared/desktop/desktop-asset-runtime");
}

const STALLED = Symbol("never settled");

/**
 * The install's own result, or `STALLED` if it is still pending long after the
 * deadline should have fired. Requires fake `setTimeout`; real microtask turns
 * are interleaved so anything the install awaits gets a chance to run.
 */
async function settleOrStall(
  install: Promise<boolean>
): Promise<boolean | typeof STALLED> {
  return await Promise.race([
    install,
    (async () => {
      for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        await vi.advanceTimersByTimeAsync(1_000);
      }
      return STALLED;
    })(),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.desktop = true;
  realFetch = window.fetch;
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  log = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  const { _resetDesktopAssetRuntimeForTests } = await loadRuntime();
  _resetDesktopAssetRuntimeForTests();
  window.fetch = realFetch;
  warn.mockRestore();
  log.mockRestore();
  vi.useRealTimers();
});

describe("installDesktopAssetRuntime", () => {
  it("installs the resolver and the fetch wrapper when the bundle is live", async () => {
    const baseFetch = vi.fn(async () => manifestResponse());
    window.fetch = baseFetch as unknown as typeof fetch;

    const {
      installDesktopAssetRuntime,
      resolveDesktopAssetUrl,
      desktopAssetBundleSize,
    } = await loadRuntime();

    await expect(installDesktopAssetRuntime()).resolves.toBe(true);

    expect(desktopAssetBundleSize()).toBe(2);
    expect(h.setURLModifier).toHaveBeenCalledTimes(1);
    expect(
      resolveDesktopAssetUrl("/models/forest/forest-environment.glb")
    ).toBe("https://tka-assets.localhost/models/forest/forest-environment.glb");
    expect(window.fetch).not.toBe(baseFetch);
  });

  it("resolves false without touching fetch off desktop", async () => {
    h.desktop = false;
    const baseFetch = vi.fn();
    window.fetch = baseFetch as unknown as typeof fetch;

    const { installDesktopAssetRuntime } = await loadRuntime();

    await expect(installDesktopAssetRuntime()).resolves.toBe(false);
    expect(baseFetch).not.toHaveBeenCalled();
    expect(window.fetch).toBe(baseFetch);
  });

  it("resolves false when the manifest request fails outright", async () => {
    // What an unregistered or refused custom scheme actually produces: fetch
    // rejects, it does not answer with a status.
    const baseFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    window.fetch = baseFetch as unknown as typeof fetch;

    const { installDesktopAssetRuntime, resolveDesktopAssetUrl } =
      await loadRuntime();

    await expect(installDesktopAssetRuntime()).resolves.toBe(false);
    expect(window.fetch).toBe(baseFetch);
    expect(
      resolveDesktopAssetUrl("/models/forest/forest-environment.glb")
    ).toBe("/models/forest/forest-environment.glb");
  });

  it("resolves false when the manifest body is not the expected shape", async () => {
    window.fetch = (async () =>
      manifestResponse({ generatedAt: "x" })) as unknown as typeof fetch;

    const { installDesktopAssetRuntime } = await loadRuntime();

    await expect(installDesktopAssetRuntime()).resolves.toBe(false);
    expect(h.setURLModifier).not.toHaveBeenCalled();
  });

  it("resolves false instead of stalling boot when the manifest never answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // A fetch that honours its AbortSignal and otherwise never settles.
    window.fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError"))
        );
      })) as unknown as typeof fetch;

    const { installDesktopAssetRuntime } = await loadRuntime();

    await expect(settleOrStall(installDesktopAssetRuntime())).resolves.toBe(
      false
    );
  });

  it("resolves false when the headers arrive but the body never does", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // `fetch` settles on HEADERS. A bound that stops there leaves the body read
    // unbounded, which is the shape that held boot forever. This stub ignores
    // the signal entirely, so only the deadline race can rescue it.
    window.fetch = (async () => ({
      ok: true,
      status: 200,
      json: () => new Promise(() => undefined),
    })) as unknown as typeof fetch;

    const { installDesktopAssetRuntime } = await loadRuntime();

    await expect(settleOrStall(installDesktopAssetRuntime())).resolves.toBe(
      false
    );
    expect(h.setURLModifier).not.toHaveBeenCalled();
  });

  it("discards a bundle that finishes reading after the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    let releaseBody: (() => void) | null = null;
    const stubFetch = (async () => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          releaseBody = () => resolve(MANIFEST);
        }),
    })) as unknown as typeof fetch;
    window.fetch = stubFetch;

    const { installDesktopAssetRuntime, resolveDesktopAssetUrl } =
      await loadRuntime();

    await expect(settleOrStall(installDesktopAssetRuntime())).resolves.toBe(
      false
    );

    // Boot has already continued with network asset loading. A bundle landing
    // now must not swap the resolver under surfaces that already mounted.
    releaseBody!();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(h.setURLModifier).not.toHaveBeenCalled();
    expect(window.fetch).toBe(stubFetch);
    expect(
      resolveDesktopAssetUrl("/models/forest/forest-environment.glb")
    ).toBe("/models/forest/forest-environment.glb");
  });

  it("caches the outcome so a second call does not re-read the manifest", async () => {
    const baseFetch = vi.fn(async () => manifestResponse());
    window.fetch = baseFetch as unknown as typeof fetch;

    const { installDesktopAssetRuntime } = await loadRuntime();

    await expect(installDesktopAssetRuntime()).resolves.toBe(true);
    await expect(installDesktopAssetRuntime()).resolves.toBe(true);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("stops rewriting fetch once the runtime is torn down", async () => {
    const baseFetch = vi.fn(async () => manifestResponse());
    window.fetch = baseFetch as unknown as typeof fetch;

    const { installDesktopAssetRuntime, _resetDesktopAssetRuntimeForTests } =
      await loadRuntime();

    await installDesktopAssetRuntime();

    const bundled = "/models/forest/forest-environment.glb";
    await window.fetch(bundled);
    expect(baseFetch).toHaveBeenLastCalledWith(
      "https://tka-assets.localhost/models/forest/forest-environment.glb",
      undefined
    );

    _resetDesktopAssetRuntimeForTests();

    await window.fetch(bundled);
    expect(baseFetch).toHaveBeenLastCalledWith(bundled);
  });
});
