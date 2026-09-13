/**
 * Minimal service worker — caches app shell, fonts, immutable assets, and viewed content.
 * No Workbox. No precache manifest. Hashed immutable assets are cached on first visit.
 */

const CACHE_NAME = "tka-v3";
const ASSETS_3D_CACHE = "tka-3d-assets-v1";
const APP_SHELL_URLS = ["/app"];
// Build-generated list of pictograph SVGs (props/grid/arrows/letters/numbers/
// glyphs) so pictographs render cold-offline. See scripts/generate-svg-precache-manifest.cjs.
const SVG_PRECACHE_MANIFEST = "/svg-precache-manifest.json";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // cache: "reload" bypasses the browser HTTP cache so a new SW never
      // precaches stale bytes it happens to have lying around.
      await cache.addAll(
        APP_SHELL_URLS.map((url) => new Request(url, { cache: "reload" }))
      );
      await precacheBootChunks(cache);
      await precacheSvgAssets(cache);
    })
  );
  // NOTE: no self.skipWaiting() here. Auto-skipWaiting made a new deploy take
  // over an already-open tab, serving new content-hashed chunks to old code
  // still in memory → 404 on the next lazy chunk. Instead the new SW WAITS;
  // the page posts SKIP_WAITING below only when the user clicks Reload. First
  // install has no controller to wait behind, so it activates immediately
  // anyway (no reload prompt shown — see sw-update-manager.ts).
});

// Activate the waiting worker on demand (user clicked "Reload" in the update
// toast). Mirrors static/legacy-sw.js:431.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Precache the shell's boot-critical JS/CSS chunks by scraping them out of the
// /app HTML cached just above. SvelteKit injects <script src>, modulepreload,
// and stylesheet links for the exact boot graph into the shell, so the shell
// and its chunk list always come from the same deploy snapshot — self-syncing,
// zero build tooling. Without this, install → go offline → reload
// white-screens: /app itself is cached but its entry chunks were only ever
// runtime-cached. Failure-tolerant: a stray chunk 404 (e.g. mid-deploy race)
// must NEVER fail install — the cache-first /_app/immutable/ runtime rule
// below still picks up anything missed on the next online visit.
async function precacheBootChunks(cache) {
  try {
    // Read the shell back OUT of the cache instead of re-fetching. cache.match
    // returns a fresh Response copy each call, so consuming its body here does
    // not touch the stored entry — no clone-before-put dance needed. If the
    // shell isn't there (addAll failed upstream), skip silently.
    const shell = await cache.match("/app");
    if (!shell) return;
    const html = await shell.text();
    // Every boot asset SvelteKit injected into the shell lives under
    // /_app/immutable/ (content-hashed). Dedupe — the same chunk appears as
    // both a modulepreload link and inline import data.
    const urls = [...new Set(html.match(/\/_app\/immutable\/[^"']+/g) || [])];
    await Promise.allSettled(
      urls.map(async (url) => {
        // cache: "reload" — same install-time freshness as the shell above.
        // Safe for these URLs: they're content-hashed, so bypassing the HTTP
        // cache can never fetch different bytes, only guaranteed-real ones.
        const r = await fetch(new Request(url, { cache: "reload" }));
        if (r.ok) await cache.put(url, r.clone());
      })
    );
  } catch {
    // Parse/network hiccup — non-fatal; runtime chunk caching still applies.
  }
}

// Precache the finite essential pictograph SVG set. Resilient: a missing
// manifest (older deploy) or a stray 404 must NEVER fail install — the runtime
// /images stale-while-revalidate rule below still covers everything on first
// online view.
async function precacheSvgAssets(cache) {
  try {
    const res = await fetch(SVG_PRECACHE_MANIFEST, { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    const assets = Array.isArray(data.assets) ? data.assets : [];
    await Promise.allSettled(
      assets.map(async (url) => {
        // cache: "reload" — same install-time freshness as the shell above.
        const r = await fetch(new Request(url, { cache: "reload" }));
        if (r.ok) await cache.put(url, r.clone());
      })
    );
  } catch {
    // No manifest / network hiccup — non-fatal.
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME && name !== ASSETS_3D_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Dev mode: never intercept requests on localhost — Vite serves everything.
  // A stale production SW on localhost blocks page refreshes because
  // hooks.client.ts can only unregister AFTER the page loads (deadlock).
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip cross-origin requests except Firebase Storage thumbnails
  if (url.origin !== self.location.origin) {
    if (url.hostname === "firebasestorage.googleapis.com") {
      // Thumbnail images can serve stale while they refresh, but the manifest
      // decides which images the app will request. Returning an old manifest
      // first can trigger hundreds of requests for objects that were deleted
      // since it was cached, so online reads wait for the current snapshot and
      // fall back to the cached copy only when the network is unavailable.
      const isThumbnailManifest =
        /\/o\/thumbnails(?:%2f|\/)manifest\.json$/i.test(url.pathname);
      event.respondWith(
        isThumbnailManifest
          ? networkFirst(event.request)
          : staleWhileRevalidate(event.request)
      );
    }
    return;
  }

  // 3D model assets keep an offline copy in their own cache, but their public
  // URLs are stable while the art behind them changes. Cache-first left people
  // looking at an old forest or Autumn build forever after one visit. Online
  // loads therefore wait for the current model and replace the offline copy;
  // a failed connection or timeout still falls back to the last working scene.
  //
  // /draco/ and /basis/ are one pair, not two rules: they are the geometry
  // decoder and the KTX2 texture transcoder that every optimized GLB needs
  // before its first byte decodes (see DECODER_RUNTIME_URLS in
  // src/lib/shared/3d/scene-boot/scene-asset-manifest.ts, which warms both
  // together). Only /draco/ was listed here, so offline a scene had its models
  // AND its geometry decoder cached and still died on the network-only
  // transcoder — a full model cache that could not draw a single texture.
  if (
    /\/models\/.*\.glb$/.test(url.pathname) ||
    /\/models\/.*\.ktx2$/.test(url.pathname) ||
    url.pathname.startsWith("/draco/") ||
    url.pathname.startsWith("/basis/")
  ) {
    event.respondWith(networkFirstDedicated(event.request, ASSETS_3D_CACHE));
    return;
  }

  // Font files: cache-first (immutable, never change)
  if (url.pathname.startsWith("/fonts/") && /\.woff2?$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Font CSS: cache-first (changes only on FA version bump)
  if (url.pathname.startsWith("/fonts/css/")) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // SvelteKit immutable assets (JS/CSS chunks with content hashes): cache-first.
  // These filenames contain a hash — once built they never change, so caching is safe.
  // This is the critical fix for offline: without this, the app can't load when
  // the browser HTTP cache is evicted.
  if (url.pathname.startsWith("/_app/immutable/")) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Pictograph render assets: stale-while-revalidate (durable offline, fresh
  // online). /images/* = prop/grid/arrow/letter/number/glyph SVGs the live
  // pictograph renderer fetches on demand. These files are NOT content-hashed,
  // so cache-first would serve them stale forever once cached; SWR serves the
  // cache instantly (still offline-safe) and revalidates in the background.
  // SVG loaders memoize in-memory per session, so revalidation traffic is small.
  // Origin: audit 2026-06-30 fix #1 (was cache-first; pictographs rendered
  // blank offline before the rule existed). Essential SVG subset is also
  // precached on install.
  // NOTE: the /thumbnails/*.webp branch is dead in production — the deploy
  // trims static/thumbnails (scripts/trim-deploy-assets.js), so this rule only
  // matters for /images. Kept so a future un-trim doesn't regress to network-only.
  if (
    url.pathname.startsWith("/images/") ||
    (url.pathname.startsWith("/thumbnails/") && url.pathname.endsWith(".webp"))
  ) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Viewed sequences and QR pages: network-first (offline festival use).
  // NAVIGATIONS additionally fall back to the cached /app shell: these routes
  // have client-side local-decode paths (/sequence/[id] inline decode,
  // /q/[code] resolution), so serving the shell lets the SvelteKit client
  // router mount the page and handle offline itself — instead of the raw 503
  // networkFirst returns on a cold-offline cache miss. Subresource
  // (non-navigation) requests keep plain network-first.
  if (url.pathname.startsWith("/sequence/") || url.pathname.startsWith("/q/")) {
    event.respondWith(
      event.request.mode === "navigate"
        ? networkFirstNavigation(event.request)
        : networkFirst(event.request)
    );
    return;
  }

  // SPA navigation fallback: serve cached /app for any app navigation.
  // Public/prerendered routes (guide, landing) try network first, but all
  // in-app routes (/create, /browse, /train, etc.) get the cached shell
  // so the client-side router can handle them offline.
  if (event.request.mode === "navigate") {
    // Static public routes that have their own prerendered HTML — skip SPA fallback
    const isPublicRoute =
      url.pathname === "/" ||
      url.pathname.startsWith("/guide/") ||
      url.pathname.startsWith("/landing/") ||
      url.pathname.startsWith("/auth/");

    if (!isPublicRoute) {
      event.respondWith(
        fetchWithTimeout(event.request, 10000).catch(() =>
          caches
            .match("/app")
            .then(
              (cached) => cached || new Response("Offline", { status: 503 })
            )
        )
      );
      return;
    }
  }

  // Everything else: network only (non-immutable assets use standard HTTP cache)
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirstDedicated(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstDedicated(request, cacheName) {
  const cache = await caches.open(cacheName);
  let response;
  try {
    response = await fetchWithTimeout(request, 10000);
  } catch {
    // Only a FETCH failure is an offline signal. The cache write below is
    // deliberately outside this try: it used to live inside it, so a rejecting
    // Cache.put — quota exhausted on a phone full of models, or a 206 partial,
    // both of which reject rather than resolve — threw away a perfectly good
    // 200 and answered with the previous scene, or a bare 503 when nothing was
    // cached yet. A storage problem must never be reported as no network.
    const cached = await cache.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
  if (response.ok) {
    // Still awaited: the worker may be terminated once respondWith settles, and
    // finishing the write here is what makes the next offline load work.
    try {
      await cache.put(request, response.clone());
    } catch {
      // Full storage / unsupported response: keep the offline copy we already
      // have and serve the live one. Nothing else to do from inside the SW.
    }
  }
  return response;
}

async function networkFirst(request) {
  try {
    // fetchWithTimeout (not bare fetch): on lie-fi — a connection that opens
    // but never responds — a bare fetch can hang for minutes while a perfectly
    // good cached copy sits in the catch below. ~10s matches the SPA
    // navigation fallback. Real server responses (including 4xx/5xx) still
    // pass through untouched; only fetch failure/abort reaches the catch.
    const response = await fetchWithTimeout(request, 10000);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

// Network-first for /sequence/* and /q/* NAVIGATIONS with an /app shell
// fallback. Only fetch failure/timeout falls back — a real server response
// (even an error status) is returned as-is, so genuine server errors are never
// masked by the shell. If the shell isn't cached either, degrade to the plain
// networkFirst failure path: a previously cached copy of the page, then 503.
async function networkFirstNavigation(request) {
  try {
    const response = await fetchWithTimeout(request, 10000);
    // Cache successful page loads exactly like networkFirst, so a previously
    // viewed page still has a per-URL cached copy as a last-resort fallback.
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const shell = await caches.match("/app");
    if (shell) return shell;
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      // Only cache real successes — never opaque or error responses.
      if (response.ok && !response.bodyUsed) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch((err) => {
      // Cached copy exists: it was already served below; returning it here
      // just settles the background revalidation without an unhandled
      // rejection. No cached copy: propagate the fetch error so respondWith
      // rejects cleanly instead of resolving undefined.
      if (cached) return cached;
      throw err;
    });
  return cached || fetchPromise;
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    fetch(request, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Firebase Cloud Messaging handler (push notifications)
importScripts("/firebase-messaging-handler.js");
