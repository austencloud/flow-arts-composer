/**
 * Client-side hooks
 */
import type { ClientInit, HandleClientError } from "@sveltejs/kit";
import { browser, dev } from "$app/environment";
import { Capacitor } from "@capacitor/core";
import { isRunningAsStandalone } from "$lib/shared/mobile/services/platform-detector";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  applyWaitingSwUpdateBeforeStart,
  createSwUpdateManager,
} from "$lib/shared/offline/services/sw-update-manager";
import {
  installViteReloadTracers,
  printReloadBreadcrumb,
  recordReloadReason,
} from "$lib/shared/dev/reload-breadcrumb";

// Dev: explain the previous automatic reload (if any) before the boot noise
// starts, and arm the tracers for Vite's own full-reload/ws-disconnect reloads.
// Every automatic reload path in dev records a reason first; this is the print.
if (browser && dev) {
  printReloadBreadcrumb();
  installViteReloadTracers();
}

if (typeof window !== "undefined" && "Capacitor" in window) {
  import("@capgo/capacitor-updater")
    .then(({ CapacitorUpdater }) => {
      CapacitorUpdater.notifyAppReady();
    })
    .catch(() => {});
}

// Suppress Three.js "Multiple instances" warning caused by Vite optimizer
// bundling globe.gl's three-globe with a separate copy despite pnpm dedupe.
if (browser) {
  const _origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Multiple instances of Three.js being imported")
    )
      return;
    _origWarn.apply(console, args);
  };
}

// Always expose cache benchmark utility globally (in both dev and prod for testing)
if (browser) {
  import("$lib/shared/render/utils/cache-benchmark")
    .then((module) => {
      // Explicitly expose on window
      (
        window as unknown as {
          runCacheBenchmark: typeof module.runCacheBenchmark;
        }
      ).runCacheBenchmark = module.runCacheBenchmark;
    })
    .catch(() => {
      // Cache benchmark not available - expected in some builds
    });
}

// Dev mode: tear down ALL service workers + their caches to prevent stale
// production SWs from intercepting Vite HMR fetches.
//
// The footgun: the browser runs the SW bytes that were INSTALLED (from a prior
// prod/preview visit), not the current static/sw.js. An old sw.js that predates
// the localhost-bypass intercepts HMR chunk/asset fetches with no-timeout
// cache-first logic → "Failed to fetch" + dead HMR until a manual hard refresh.
//
// unregister() alone is insufficient: it does NOT release the SW from the page
// it is ALREADY controlling. So if a stale SW controls this load, we also force
// a single guarded reload so the page reloads uncontrolled and HMR works again.
if (browser && dev && "serviceWorker" in navigator) {
  const SW_ESCAPE_KEY = "tka-dev-sw-escape";
  void (async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      // Spare the FCM-only worker: it has no fetch handler, so it cannot
      // interfere with HMR — and killing it would break push on the dev
      // origin every session (fcm-token-manager registers it on demand).
      await Promise.all(
        registrations
          .filter(
            (reg) =>
              !(
                reg.active ??
                reg.waiting ??
                reg.installing
              )?.scriptURL.includes("firebase-messaging-sw")
          )
          .map((reg) => reg.unregister())
      );

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      const controller = navigator.serviceWorker.controller;
      const controllerIsFcmOnly = controller?.scriptURL.includes(
        "firebase-messaging-sw"
      );
      if (controller && !controllerIsFcmOnly) {
        // A stale SW is still controlling this page. A plain reload is not
        // enough: the SW may serve a CACHED HTML shell that points at old chunk
        // hashes, so the reload just re-loads stale code (e.g. an old renderer
        // bundle over the dev.tkaflowarts.com tunnel). Cache-bust the navigation
        // with a unique query so the HTML — and thus the fresh chunk hashes — is
        // refetched from the network. Same trick as forceFreshReload().
        if (!sessionStorage.getItem(SW_ESCAPE_KEY)) {
          sessionStorage.setItem(SW_ESCAPE_KEY, "1");
          recordReloadReason(
            "stale service worker escape",
            "a production SW controlled this dev page; reloading uncontrolled so HMR works"
          );
          const url = new URL(window.location.href);
          url.searchParams.set("fresh", String(Date.now()));
          window.location.replace(url.toString());
        }
      } else {
        // Clean (no controller) — re-arm the escape for any future stale SW.
        // The root layout removes the one-shot URL marker after SvelteKit's
        // router is ready, using its navigation API.
        sessionStorage.removeItem(SW_ESCAPE_KEY);
      }
    } catch {
      // Best-effort cleanup; never block app boot on SW teardown.
    }
  })();
}

// Dev: auto-recover from a failed HMR update.
// When a child module fails to hot-reload (commonly: a .svelte/.svelte.ts file
// saved mid-write by an external editor or cloud agent), Vite leaves an
// undefined module in the graph and the HMR apply throws an unhandled rejection
// inside the HMR client (HMRClient.queueUpdate → "reading 'default'"). The
// affected pane goes dead until a manual refresh.
//
// Recovery does NOT reload immediately: during a multi-agent write storm an
// instant reload usually lands on a file the agent is STILL mid-writing, so it
// re-fails and thrashes. Instead we SCHEDULE a reload ~700ms out (longer than the
// server's 400ms awaitWriteFinish coalescing window). If Vite manages to apply a
// clean update on its own before then (vite:afterUpdate), the pending reload is
// cancelled — the page self-healed and no reload is needed. Only if the failure
// persists past the settle window do we full-reload. The sessionStorage guard
// caps it to one reload per 4s so a genuinely-broken file (Vite overlay shows the
// real error) pulses slowly instead of looping.
if (browser && dev) {
  const HMR_RELOAD_KEY = "tka-hmr-reload";
  const SETTLE_MS = 700;
  let pendingReload: ReturnType<typeof setTimeout> | null = null;

  const isHmrClientFailure = (reason: unknown): boolean => {
    const stack = (reason as Error)?.stack ?? "";
    return /HMRClient|queueUpdate|fetchUpdate|warnFailedUpdate/.test(stack);
  };

  const recoverFromHmrFailure = (reason: unknown): void => {
    if (!isHmrClientFailure(reason)) return;
    if (sessionStorage.getItem(HMR_RELOAD_KEY)) return; // already reloaded recently
    if (pendingReload !== null) return; // a reload is already queued
    console.warn(
      "[hmr-guard] HMR apply failed — reloading in " +
        SETTLE_MS +
        "ms unless it self-heals"
    );
    pendingReload = setTimeout(() => {
      sessionStorage.setItem(HMR_RELOAD_KEY, "1");
      recordReloadReason(
        "HMR apply crashed",
        String((reason as Error)?.message ?? reason).slice(0, 200) ||
          "a module was saved mid-write and failed to hot-apply"
      );
      location.reload();
    }, SETTLE_MS);
  };

  // If a later HMR update applies cleanly, the failure was transient (mid-write).
  // Cancel the scheduled reload — the page already recovered.
  if (import.meta.hot) {
    import.meta.hot.on("vite:afterUpdate", () => {
      if (pendingReload !== null) {
        clearTimeout(pendingReload);
        pendingReload = null;
        console.warn("[hmr-guard] HMR self-healed — reload cancelled");
      }
    });
  }

  window.addEventListener("unhandledrejection", (event) =>
    recoverFromHmrFailure(event.reason)
  );
  window.addEventListener("error", (event) =>
    recoverFromHmrFailure(event.error)
  );

  // Re-arm after the page has stayed alive: a later edit may legitimately need
  // another recovery reload. If a reload immediately re-errors during boot, the
  // guard is still set within this window, so the loop is broken.
  setTimeout(() => sessionStorage.removeItem(HMR_RELOAD_KEY), 4000);
}

// Production: auto-recover from stale chunks after a deploy.
// When the SW serves an old HTML shell that references chunk hashes the server
// no longer has, dynamic imports fail. A single reload fetches the new manifest.
if (browser && !dev) {
  window.addEventListener("vite:preloadError", () => {
    // Vite turns a cancelled preload error into a fulfilled import whose value
    // is undefined. The page is already leaving, but app startup keeps running
    // long enough to destructure that missing module and emit a cascade of fake
    // state/initializer failures. Let the import reject so its caller stops;
    // the rejection listener below keeps the expected exit quiet.
    // Time-based guard, NOT cleared on boot: the old clear-on-load guard could
    // loop (fail → reload → boot clears guard → fail → reload …) when the SW
    // kept serving the same stale shell — one user logged 74 of these in a row.
    const last = Number(sessionStorage.getItem("tka-chunk-reload") || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("tka-chunk-reload", String(Date.now()));
    // Cache-bust the navigation: a plain reload can re-serve the identical
    // SW-cached HTML shell with the same dead chunk hashes (same trick as the
    // dev SW-escape above). The unique query forces the HTML from network.
    const url = new URL(window.location.href);
    url.searchParams.set("fresh", String(Date.now()));
    window.location.replace(url.toString());
  });

  // Report unhandled promise rejections to error telemetry
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason) || "Unknown rejection";
    const stack = reason?.stack;

    if (message.includes("ResizeObserver loop")) {
      return;
    }

    const isModuleLoadFailure =
      message.includes("Failed to fetch dynamically imported module") ||
      // Safari's phrasing of the same stale-chunk failure the vite:preloadError
      // handler above already recovers from.
      message.includes("Importing a module script failed") ||
      message.includes("MIME type");
    if (isModuleLoadFailure) {
      event.preventDefault();
      return;
    }

    import("$lib/shared/error/services/error-telemetry-reporter")
      .then(({ reportErrorTelemetry }) => {
        reportErrorTelemetry(
          {
            message: `Unhandled rejection: ${message.slice(0, 200)}`,
            severity: "warning",
            context: {
              module: "global",
              action: "unhandledrejection",
              additionalData: {
                url: window.location.pathname,
                stack: stack?.slice(0, 1000),
              },
            },
            error: reason instanceof Error ? reason : undefined,
          },
          // PostHog capture_exceptions already auto-captures unhandled
          // rejections — mirroring here would double-count the $exception.
          { skipPostHog: true }
        );
      })
      .catch(() => {});
  });
}

// SvelteKit routes unexpected load/navigation errors here — they never reach
// window.onerror, so PostHog's auto-capture misses them without this hook.
export const handleError: HandleClientError = ({ error, message, status }) => {
  if (browser && !dev) {
    import("$lib/shared/error/services/error-telemetry-reporter")
      .then(({ reportErrorTelemetry }) => {
        reportErrorTelemetry({
          message: `Client error: ${message.slice(0, 200)}`,
          severity: "error",
          context: {
            module: "global",
            action: "handleError",
            additionalData: {
              url: window.location.pathname,
              status,
              stack: (error as Error)?.stack?.slice(0, 1000),
            },
          },
          error: error instanceof Error ? error : undefined,
        });
      })
      .catch(() => {});
  }
  return { message };
};

// Production: register the minimal hand-written service worker
// (The old "tka-sync-queue" Background Sync registration was deleted — the SW
// has no sync listener, so it was a no-op. Firestore's own persistence queue
// handles offline writes while a tab is open.)
export const init: ClientInit = async () => {
  // Existing home-screen installs still launch /create. Let the dev install
  // join review without redirecting the app embedded inside that review page.
  if (
    browser &&
    dev &&
    window.top === window &&
    window.location.hostname === "dev.tkaflowarts.com" &&
    ["/", "/create", "/create/"].includes(window.location.pathname) &&
    !window.location.search &&
    !window.location.hash &&
    isRunningAsStandalone()
  ) {
    window.location.replace("/review");
    await new Promise<void>(() => {});
    return;
  }

  if (
    !browser ||
    dev ||
    Capacitor.isNativePlatform() ||
    // Tauri desktop: updates are owned by the Tauri updater, and a SW caching
    // the embedded bundle would keep serving it after the binary updates.
    // DesktopInitializer tears down workers left by older desktop builds.
    "__TAURI_INTERNALS__" in window ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    const startupUpdate = await applyWaitingSwUpdateBeforeStart({
      registration,
    });
    if (startupUpdate === "reloading") {
      // Keep SvelteKit from hydrating the old app while navigation switches to
      // the newly activated worker.
      await new Promise<void>(() => {});
      return;
    }

    createSwUpdateManager({
      registration,
      activationAlreadyRequested: startupUpdate === "deferred",
      onUpdateReady: (apply) => {
        showToast({
          message: "An update is ready.",
          type: "info",
          duration: 15_000,
          action: { label: "Reload", onClick: apply },
        });
      },
    });
  } catch (err) {
    console.error("[SW] Registration failed:", err);
  }

  // Ask the browser to exempt our storage (Cache Storage + IndexedDB, the
  // whole offline kit) from best-effort eviction. Denials are fine: installed
  // PWAs and engaged origins usually get it, and everything self-heals on the
  // next online visit anyway.
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
};
