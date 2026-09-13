/**
 * Offline regression suite for static/sw.js (offline audit 2026-06-30).
 *
 * The service worker is a classic script with no exports; the harness
 * (tests/helpers/sw-harness.ts) evaluates the real file inside a controlled
 * scope with a fake CacheStorage and a routed fetch mock. Each test pins a
 * shipped offline fix — exactly the silent-bug class eyes can't catch:
 * everything looks fine online, and only a cold-offline reload (festival
 * field, no console open) reveals the regression.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createSwHarness, respondWith } from "../helpers/sw-harness";

const ORIGIN = "https://tkaflowarts.com";
const SHELL_HTML = "<html><body>app shell</body></html>";

/** Drain the SW's fire-and-forget cache writes (put chains are microtask +
 * setTimeout(0)-free, but arrayBuffer streams need a couple of turns). */
async function settleBackgroundWork(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function harnessWithShellRoute() {
  const h = createSwHarness();
  h.route("/app", respondWith(SHELL_HTML, { contentType: "text/html" }));
  return h;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("sw.js install precache", () => {
  // Fix: install-time SVG precache (audit fix #1 companion) — pictographs must
  // render cold-offline without ever having been viewed online.
  it("precaches the SVG manifest set alongside the /app shell", async () => {
    const h = harnessWithShellRoute();
    h.route(
      "/svg-precache-manifest.json",
      respondWith({
        count: 2,
        assets: ["/images/grid/diamond_grid.svg", "/images/arrow.svg"],
      })
    );
    h.route("/images/grid/diamond_grid.svg", respondWith("<svg>grid</svg>"));
    h.route("/images/arrow.svg", respondWith("<svg>arrow</svg>"));

    await h.dispatchInstall();

    expect(await h.cacheHas(h.constants.cacheName, "/app")).toBe(true);
    expect(
      await h.cacheHas(h.constants.cacheName, "/images/grid/diamond_grid.svg")
    ).toBe(true);
    expect(await h.cacheHas(h.constants.cacheName, "/images/arrow.svg")).toBe(
      true
    );
    // install no longer force-activates: it must NOT skipWaiting, so an open
    // tab keeps running old code until the user opts into the update.
    expect(h.self.skipWaiting).not.toHaveBeenCalled();
  });

  // Fix: precacheSvgAssets is failure-tolerant — an older deploy without the
  // manifest (404) must NEVER fail install and brick SW updates.
  it("survives a missing manifest (404) — install resolves, /app still cached", async () => {
    const h = harnessWithShellRoute();
    h.route(
      "/svg-precache-manifest.json",
      respondWith("not found", { status: 404 })
    );

    await expect(h.dispatchInstall()).resolves.toBeUndefined();
    expect(await h.cacheHas(h.constants.cacheName, "/app")).toBe(true);

    // Same guarantee when the manifest fetch rejects outright (network error).
    const h2 = harnessWithShellRoute();
    await expect(h2.dispatchInstall()).resolves.toBeUndefined();
    expect(await h2.cacheHas(h2.constants.cacheName, "/app")).toBe(true);
  });

  // Fix: a stray asset 404 (mid-deploy race) must not fail install nor block
  // the sibling assets — Promise.allSettled + per-response ok check.
  it("survives one asset 404 — other assets still cached, install resolves", async () => {
    const h = harnessWithShellRoute();
    h.route(
      "/svg-precache-manifest.json",
      respondWith({
        count: 2,
        assets: ["/images/good.svg", "/images/gone.svg"],
      })
    );
    h.route("/images/good.svg", respondWith("<svg>good</svg>"));
    h.route("/images/gone.svg", respondWith("nope", { status: 404 }));

    await expect(h.dispatchInstall()).resolves.toBeUndefined();
    expect(await h.cacheHas(h.constants.cacheName, "/images/good.svg")).toBe(
      true
    );
    expect(await h.cacheHas(h.constants.cacheName, "/images/gone.svg")).toBe(
      false
    );
  });

  // Fix: white-screen — /app was cached but its boot chunks were only ever
  // runtime-cached, so install → go offline → reload died before hydration.
  // precacheBootChunks scrapes /_app/immutable/ URLs out of the cached shell.
  it("precaches boot-critical chunks scraped from the /app shell HTML", async () => {
    const h = createSwHarness();
    const entry = "/_app/immutable/entry/start.abc.js";
    const chunk = "/_app/immutable/chunks/x.js";
    h.route(
      "/app",
      respondWith(
        `<html><head>` +
          `<script src="${entry}"></script>` +
          `<link rel="modulepreload" href="${chunk}">` +
          `</head><body></body></html>`,
        { contentType: "text/html" }
      )
    );
    h.route(entry, respondWith("// entry"));
    h.route(chunk, respondWith("// chunk"));

    await h.dispatchInstall();

    expect(await h.cacheHas(h.constants.cacheName, entry)).toBe(true);
    expect(await h.cacheHas(h.constants.cacheName, chunk)).toBe(true);
  });
});

describe("sw.js activate", () => {
  // Fix: stale version caches (tka-v2) must be swept, but the dedicated 3D
  // asset cache survives version bumps — re-downloading GLB/KTX2 binaries on
  // every SW update would be a silent multi-MB regression.
  it("deletes stale version caches, keeps current + 3D asset cache", async () => {
    const h = createSwHarness();
    await h.seedCache("tka-v2", "/old", "stale entry");
    await h.seedCache(h.constants.cacheName, "/app", SHELL_HTML);
    await h.seedCache(
      h.constants.assets3dCacheName,
      "/models/scene.glb",
      "glb bytes"
    );

    await h.dispatchActivate();

    expect(h.cacheNames()).not.toContain("tka-v2");
    expect(h.cacheNames()).toContain(h.constants.cacheName);
    expect(h.cacheNames()).toContain(h.constants.assets3dCacheName);
    expect(h.self.clients.claim).toHaveBeenCalled();
  });
});

describe("sw.js 3D asset freshness", () => {
  it("replaces a cached model online and uses that model offline", async () => {
    const h = createSwHarness();
    const modelUrl = "/models/forest/forest-environment.glb";
    await h.seedCache(
      h.constants.assets3dCacheName,
      modelUrl,
      "old forest"
    );
    h.route(modelUrl, respondWith("current forest"));

    const online = await h.dispatchFetch(`${ORIGIN}${modelUrl}`);
    expect(await online!.text()).toBe("current forest");
    expect(
      await h.cacheBody(h.constants.assets3dCacheName, modelUrl)
    ).toBe("current forest");

    h.routes.delete(modelUrl);
    const offline = await h.dispatchFetch(`${ORIGIN}${modelUrl}`);
    expect(await offline!.text()).toBe("current forest");
  });

  // Fix: a FAILED cache write must never decide the response. The 3D rule used
  // to `await cache.put(...)` inside the same try that wraps the network fetch,
  // so a rejecting write — Cache.put rejects with QuotaExceededError on a
  // device at its storage limit, and with a TypeError for a 206 partial —
  // threw the good 200 away and fell into the offline branch. The user got the
  // OLD scene back (or a bare 503 with nothing cached) while the network was
  // perfectly healthy and the bytes were already in hand.
  it("still serves the fresh model when the cache write fails (quota)", async () => {
    const h = createSwHarness();
    const modelUrl = "/models/forest/forest-environment.glb";
    await h.seedCache(h.constants.assets3dCacheName, modelUrl, "old forest");
    h.route(modelUrl, respondWith("current forest"));

    // Storage is full: every write into the 3D cache rejects.
    const cache = await h.caches.open(h.constants.assets3dCacheName);
    vi.spyOn(cache, "put").mockRejectedValue(
      new Error("Quota exceeded.")
    );

    const res = await h.dispatchFetch(`${ORIGIN}${modelUrl}`);
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe("current forest");
  });

  it("returns the fetched decoder when the cache write fails and nothing is cached", async () => {
    const h = createSwHarness();
    const decoderUrl = "/draco/draco_decoder.wasm";
    h.route(decoderUrl, respondWith("wasm bytes"));

    const cache = await h.caches.open(h.constants.assets3dCacheName);
    vi.spyOn(cache, "put").mockRejectedValue(new Error("Quota exceeded."));

    const res = await h.dispatchFetch(`${ORIGIN}${decoderUrl}`);
    expect(res!.status).toBe(200); // was 503 "Offline" on a healthy network
    expect(await res!.text()).toBe("wasm bytes");
  });

  // Fix: /basis/ (the Basis Universal / KTX2 transcoder) is the other half of
  // the decoder runtime that every optimized GLB needs — see
  // src/lib/shared/3d/scene-boot/scene-asset-manifest.ts DECODER_RUNTIME_URLS,
  // which warms /draco/ and /basis/ as one pair. Only /draco/ was routed into
  // the 3D asset cache, so offline the geometry decoder was there and the
  // texture transcoder was network-only: every KTX2-textured scene failed to
  // decode with a full model cache sitting right next to it.
  it("keeps the KTX2/Basis transcoder offline alongside the Draco decoder", async () => {
    const h = createSwHarness();
    const draco = "/draco/draco_decoder.wasm";
    const basis = "/basis/basis_transcoder.wasm";
    h.route(draco, respondWith("draco bytes"));
    h.route(basis, respondWith("basis bytes"));

    expect(await (await h.dispatchFetch(`${ORIGIN}${draco}`))!.text()).toBe(
      "draco bytes"
    );
    expect(await (await h.dispatchFetch(`${ORIGIN}${basis}`))!.text()).toBe(
      "basis bytes"
    );

    // Network down: both decoders must still come out of the 3D asset cache.
    h.routes.delete(draco);
    h.routes.delete(basis);

    const dracoOffline = await h.dispatchFetch(`${ORIGIN}${draco}`);
    expect(await dracoOffline!.text()).toBe("draco bytes");

    const basisOffline = await h.dispatchFetch(`${ORIGIN}${basis}`);
    expect(basisOffline).not.toBeNull(); // was null: the SW never handled it
    expect(await basisOffline!.text()).toBe("basis bytes");
  });
});

describe("sw.js /images/* stale-while-revalidate", () => {
  // Fix: audit 2026-06-30 BLOCKER — /images was network-only before the rule
  // existed, so pictographs rendered blank offline. SWR must serve the cache
  // when the network is down.
  it("serves the cached copy when the network is down", async () => {
    const h = createSwHarness();
    await h.seedCache(
      h.constants.cacheName,
      "/images/props/staff.svg",
      "<svg>cached</svg>"
    );

    const res = await h.dispatchFetch(`${ORIGIN}/images/props/staff.svg`);

    expect(res).not.toBeNull();
    expect(await res!.text()).toBe("<svg>cached</svg>");
  });

  // Fix: SWR contract — serve stale instantly, revalidate in the background,
  // and never let an error response clobber a good cached copy. A 404
  // overwrite would silently blank a pictograph asset until the next deploy.
  it("serves stale, updates the cache in the background, and never caches a 404", async () => {
    const h = createSwHarness();
    await h.seedCache(h.constants.cacheName, "/images/a.svg", "stale-body");
    h.route("/images/a.svg", respondWith("fresh-body"));

    const res = await h.dispatchFetch(`${ORIGIN}/images/a.svg`);
    expect(await res!.text()).toBe("stale-body"); // stale served, not fresh

    await settleBackgroundWork();
    expect(await h.cacheBody(h.constants.cacheName, "/images/a.svg")).toBe(
      "fresh-body"
    );

    // Network turns sour: a 404 must NOT overwrite the good cached copy.
    h.route("/images/a.svg", respondWith("error page", { status: 404 }));
    const res2 = await h.dispatchFetch(`${ORIGIN}/images/a.svg`);
    expect(await res2!.text()).toBe("fresh-body");

    await settleBackgroundWork();
    expect(await h.cacheBody(h.constants.cacheName, "/images/a.svg")).toBe(
      "fresh-body"
    );
  });
});

describe("sw.js Firebase thumbnail manifest freshness", () => {
  it("serves the current manifest online and falls back to its cache offline", async () => {
    const h = createSwHarness();
    const manifestUrl =
      "https://firebasestorage.googleapis.com/v0/b/the-kinetic-alphabet.firebasestorage.app/o/thumbnails%2Fmanifest.json?alt=media&v=2";
    await h.seedCache(
      h.constants.cacheName,
      manifestUrl,
      JSON.stringify({ keys: ["stale"] })
    );
    h.route(
      manifestUrl,
      respondWith({ keys: ["current"], generated: "2026-07-24T17:49:18Z" })
    );

    const online = await h.dispatchFetch(manifestUrl);
    expect(await online!.json()).toEqual({
      keys: ["current"],
      generated: "2026-07-24T17:49:18Z",
    });

    await settleBackgroundWork();
    h.routes.delete(manifestUrl);

    const offline = await h.dispatchFetch(manifestUrl);
    expect(await offline!.json()).toEqual({
      keys: ["current"],
      generated: "2026-07-24T17:49:18Z",
    });
  });
});

describe("sw.js offline navigation fallbacks", () => {
  // Fix: offline QR — scanning a printed card at a festival with no signal
  // must serve the cached /app shell so the client router's local-decode path
  // (/q/[code]) can resolve the sequence, instead of a raw 503.
  it("serves the cached /app shell for a /q/* navigation when the network is down", async () => {
    const h = createSwHarness();
    await h.seedCache(h.constants.cacheName, "/app", SHELL_HTML);

    const res = await h.dispatchFetch(`${ORIGIN}/q/ABC123`, {
      mode: "navigate",
    });

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe(SHELL_HTML);
  });

  // Fix: degradation ladder for /sequence/* navigations — shell first, then a
  // previously viewed per-URL cached copy, then (and only then) a 503.
  it("falls back to a per-URL cached copy without a shell, and 503 with nothing", async () => {
    const h = createSwHarness();
    await h.seedCache(
      h.constants.cacheName,
      "/sequence/xyz",
      "<html>seq page</html>"
    );

    const res = await h.dispatchFetch(`${ORIGIN}/sequence/xyz`, {
      mode: "navigate",
    });
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe("<html>seq page</html>");

    // Cold cache: nothing to serve — explicit 503, not a hang or undefined.
    const h2 = createSwHarness();
    const res2 = await h2.dispatchFetch(`${ORIGIN}/sequence/xyz`, {
      mode: "navigate",
    });
    expect(res2!.status).toBe(503);
    expect(await res2!.text()).toBe("Offline");
  });
});

describe("sw.js passthrough boundaries", () => {
  // Fix: the SW must never intercept mutations or foreign origins — a cached
  // response to a POST (or to a third-party request) would be a data-loss
  // class bug that no one sees until a save silently doesn't happen.
  it("does not respond to non-GET or cross-origin requests", async () => {
    const h = createSwHarness();
    await h.seedCache(h.constants.cacheName, "/app", SHELL_HTML);

    const postRes = await h.dispatchFetch(`${ORIGIN}/api/save`, {
      method: "POST",
    });
    expect(postRes).toBeNull();

    const crossOriginRes = await h.dispatchFetch(
      "https://example.com/whatever"
    );
    expect(crossOriginRes).toBeNull();
  });

  // Fix: dev deadlock — a stale production SW on localhost blocked page
  // refreshes because hooks.client.ts can only unregister AFTER load. The SW
  // must pass through everything on localhost so Vite serves it.
  it("never intercepts on localhost (dev bypass)", async () => {
    const h = createSwHarness({ location: "http://localhost:5173/sw.js" });
    await h.seedCache(h.constants.cacheName, "/images/x.svg", "cached");
    h.route("/images/x.svg", respondWith("network"));

    expect(
      await h.dispatchFetch("http://localhost:5173/images/x.svg")
    ).toBeNull();
    expect(
      await h.dispatchFetch("http://localhost:5173/app", { mode: "navigate" })
    ).toBeNull();
  });
});

describe("sw.js lie-fi timeout", () => {
  // Fix: on lie-fi (connection opens but never responds) a bare fetch hangs
  // for minutes while a perfectly good cached shell sits in the catch.
  // fetchWithTimeout aborts at ~10s; the harness fetch mock honors the
  // AbortController signal, so fake timers drive the whole path.
  it("falls back to the cached shell after the 10s timeout instead of hanging", async () => {
    vi.useFakeTimers();
    const h = createSwHarness();
    await h.seedCache(h.constants.cacheName, "/app", SHELL_HTML);
    // Connection opens, response never comes: a promise that never settles.
    h.route("/sequence/liefi", () => new Promise<Response>(() => {}));

    const pending = h.dispatchFetch(`${ORIGIN}/sequence/liefi`, {
      mode: "navigate",
    });
    await vi.advanceTimersByTimeAsync(11_000);
    const res = await pending;

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe(SHELL_HTML);
  });
});

describe("sw.js update flow", () => {
  // Fix: silent auto-update — install used to skipWaiting(), so a new deploy
  // took over an open tab and served new immutable chunks to old in-memory
  // code (→ 404 on the next lazy chunk). Install must now WAIT.
  it("does not skipWaiting on install", async () => {
    const h = createSwHarness();
    h.route("/app", respondWith("<html></html>", { contentType: "text/html" }));
    await h.dispatchInstall();
    expect(h.self.skipWaiting).not.toHaveBeenCalled();
  });

  // Fix: skipWaiting fires ONLY when the client posts SKIP_WAITING (the user
  // clicked Reload), and ignores any other message type.
  it("skipWaiting fires only on a SKIP_WAITING message", async () => {
    const h = createSwHarness();
    h.route("/app", respondWith("<html></html>", { contentType: "text/html" }));
    await h.dispatchInstall();

    h.dispatchMessage({ type: "SOMETHING_ELSE" });
    expect(h.self.skipWaiting).not.toHaveBeenCalled();

    h.dispatchMessage({ type: "SKIP_WAITING" });
    expect(h.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
