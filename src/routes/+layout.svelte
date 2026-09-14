<script lang="ts">
  import type { Snippet, Component } from "svelte";
  import { onMount } from "svelte";
  import { afterNavigate, onNavigate, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import MarketingChrome from "$lib/shared/landing/components/MarketingChrome.svelte";
  import ViewCaptureListener from "$lib/shared/review/ViewCaptureListener.svelte";
  import { detectSiteMode, type SiteMode } from "../config/domains";
  import { consumeSkipNextViewTransition } from "$lib/shared/transitions/sequence-drawer-state.svelte";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import { navigationMorphs } from "$lib/shared/transitions/navigation-morphs";
  import { runNamedRouteMorph } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import { isConstrainedConnection } from "$lib/shared/platform/network-conditions";
  import { pruneRouteScopedParams } from "$lib/shared/navigation/services/url-parameter-policy";
  import {
    markLanding,
    installLandingMarkReader,
  } from "$lib/shared/performance/landing-marks";
  import { getIabBannerHeight } from "$lib/shared/auth/state/iab-banner-state.svelte";
  import type { LayoutData } from "./$types";
  import "../app.css";
  // Chip toggle tokens - maps --chip-* to TKA design values
  import "@austencloud/chip-toggle/css/tka-tokens.css";
  // Import modern view transitions CSS
  import "$lib/shared/transitions/view-transitions.css";
  // Gallery results-grid filter motion (exit / move / staggered enter). Scoped
  // to `.pane-results-body`; inert on every other surface.
  import "$lib/shared/transitions/results-motion.css";

  // View Transitions driver (2026 canonical SvelteKit pattern), scoped to route
  // pairs that provide matching named participants: browse <-> sequence, the
  // landing launchpad <-> its destinations, and the shop book <-> its product
  // detail. runNamedRouteMorph temporarily opts the document root out of
  // capture, so persistent chrome and the cosmic WebGL canvas stay live while
  // only the shared element is snapshotted. Every other route uses the regular
  // Svelte content fade. Guards cover feature support, reduced motion,
  // swipe-dismiss coordination, same-path query mutations, and the morph-pair
  // allowlist. onNavigate never fires on a full-page F5.
  /**
   * Morph instrumentation (DEV only). Times named-snapshot preparation and flags
   * long tasks during the animation window, printed under the `[morph]` prefix.
   * `vt.ready` resolves once both named snapshots and the pseudo-tree are ready;
   * the document root and persistent cosmic canvas are deliberately excluded.
   * A large ready delta now points at incoming-page mount or shared-element
   * rasterization cost. This is the launchpad-dive stutter probe; zero prod cost.
   */
  function startMorphProbe(route: string) {
    const t0 = performance.now();
    const longTasks: number[] = [];
    let po: PerformanceObserver | undefined;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          longTasks.push(Math.round(e.duration));
      });
      po.observe({ entryTypes: ["longtask"] });
    } catch {
      po = undefined;
    }
    const since = () => Math.round(performance.now() - t0);
    const drainLongTasks = () => {
      for (const entry of po?.takeRecords() ?? []) {
        longTasks.push(Math.round(entry.duration));
      }
    };
    const stop = () => {
      drainLongTasks();
      po?.disconnect();
    };
    return {
      attach(vt: { ready: Promise<void>; finished: Promise<void> }) {
        vt.ready.then(
          () => console.debug(`[morph] ${route} snapshot→ready ${since()}ms`),
          (error) => console.debug(`[morph] ${route} snapshot rejected`, error)
        );
        vt.finished.then(
          () => {
            stop();
            // console.debug is deliberately not wrapped by the development
            // console bridge, so profiling cannot POST inside its own window.
            console.debug(`[morph] ${route} finished ${since()}ms`);
            console.debug(
              `[morph] ${route} long tasks (ms):`,
              longTasks.length ? longTasks : "none"
            );
          },
          (error) => {
            stop();
            console.debug(`[morph] ${route} transition rejected`, error);
            console.debug(
              `[morph] ${route} long tasks before rejection (ms):`,
              longTasks.length ? longTasks : "none"
            );
          }
        );
      },
      cancel() {
        stop();
      },
    };
  }

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    if (reducedMotion()) return;
    if (consumeSkipNextViewTransition()) return;
    if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;
    if (!navigationMorphs(navigation.from, navigation.to)) return;

    const probe = import.meta.env.DEV
      ? startMorphProbe(
          `${navigation.from?.url.pathname}→${navigation.to?.url.pathname}`
        )
      : null;

    return new Promise((resolve) => {
      try {
        const vt = runNamedRouteMorph(() =>
          document.startViewTransition(async () => {
            resolve();
            await navigation.complete;
          })
        );
        probe?.attach(vt);
      } catch {
        // A startup failure must not strand SvelteKit's navigation. The helper
        // has already released the transient root class and chrome ownership.
        probe?.cancel();
        resolve();
      }
    });
  });

  afterNavigate((navigation) => {
    if (typeof window === "undefined") return;
    const pathname = navigation.to?.url.pathname ?? "";

    const url = new URL(window.location.href);
    // `fresh` only forces the recovered document through the network. Once the
    // router has accepted that document, it no longer belongs in the URL.
    let changed = url.searchParams.has("fresh");
    if (changed) url.searchParams.delete("fresh");
    const beforeRouteCleanup = url.search;
    pruneRouteScopedParams(url, pathname);
    changed ||= url.search !== beforeRouteCleanup;

    if (changed) {
      const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
      // Initial afterNavigate callbacks run immediately before SvelteKit marks
      // its router ready. Cross that boundary before using its history API.
      queueMicrotask(() => replaceState(cleaned, {}));
    }
  });

  let { children, data } = $props<{
    children: Snippet;
    data: LayoutData;
  }>();

  // Marketing routes share one persistent cosmic chrome (MarketingChrome) hosted
  // here at the root layout, which never unmounts across client-side navigation.
  // That keeps the COSMIC background + SiteHeader mounted while only the page
  // content transitions — no flash of the body's saved-theme gradient between
  // pages. App routes (everything else) render children exactly as before.
  // Exact marketing pages + whole subtrees (/shop/*) that all render the same
  // persistent cosmic chrome. The exact /guide hub stays here so its homepage
  // shared element can morph beneath a stationary header; deeper Guide routes
  // own their standalone header/footer through GuideShell.
  const MARKETING_EXACT = new Set([
    "/",
    "/about",
    // /roots is a 301 redirect to /notation (routes/(public)/roots/+page.ts) and
    // never renders its own chrome, so it's intentionally absent here. /roots/software
    // is a standalone kept page (not part of the redirect) and needs its own entry.
    "/roots/software",
    "/support",
    // Festival signup funnel — the QR on every sample-pack signup card lands
    // here. Wants the cosmic chrome and the .mkt-shell root ramp for 4K.
    "/start",
    "/composer",
    // The Guide hub participates in the homepage shared-element morph, so it
    // uses the persistent root chrome. Deeper /guide pages keep GuideShell's
    // standalone header/footer and book canvas.
    "/guide",
    "/atlas",
    "/faq",
    "/learn/staff-spinning-choreography",
    // The archive, moved off /notation on 2026-09-03. A single page, not a
    // subtree: nothing renders under /history.
    "/history",
  ]);
  // /notation is a subtree: the per-prop and per-system pages
  // (/notation/staves, /notation/fans, ...) all render the same persistent
  // chrome. Its own index only redirects to /history.
  const MARKETING_SUBTREES = [
    "/shop",
    "/notation",
    "/learn/concepts",
    "/timing-and-direction",
  ];
  // Carve-outs inside those subtrees. The QfT app is an instrument, not a page
  // about one: it wants the whole viewport, owns its own bottom chrome, and
  // carries its own way back out to /history. The persistent site header on
  // top of that reads as a page wrapped around an app. Shape Engine used to
  // sit here as /notation/shape-matrix; it now owns /shape-engine, outside
  // every marketing subtree, so it needs no carve-out.
  const MARKETING_EXCLUDE = new Set(["/notation/qft"]);
  const isMarketing = $derived.by(() => {
    const p = page.url.pathname;
    if (MARKETING_EXCLUDE.has(p)) return false;
    if (MARKETING_EXACT.has(p)) return true;
    return MARKETING_SUBTREES.some(
      (root) => p === root || p.startsWith(root + "/")
    );
  });

  $effect(() => {
    const geo = data?.geo;
    // Presence belongs to the authenticated application. Public pages and
    // focused /test harnesses deliberately use the firebase-free landing
    // bootstrap, so importing the tracker here would undo that boundary.
    if (!geo || typeof window === "undefined" || detectSiteMode() !== "app")
      return;

    let cancelled = false;
    void import("$lib/shared/presence/get-presence-tracker")
      .then(({ getPresenceTracker }) => {
        if (!cancelled) getPresenceTracker().setLocation(geo);
      })
      .catch((error) =>
        console.warn("[Layout] Presence location update failed:", error)
      );

    return () => {
      cancelled = true;
    };
  });

  // The in-app browser banner used to render only on /sequence/*, so that one
  // page read the banner state directly and padded its own footer. It now shows
  // on every route, so the reservation is published here as a root variable any
  // surface can consume — `padding-bottom: var(--iab-banner-height, 0px)`.
  // Height is measured by the banner, since its copy wraps differently by width.
  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--iab-banner-height",
      `${getIabBannerHeight()}px`
    );
  });

  /**
   * First-path-segment → module chunk preloader. Keep synchronized with
   * ModuleRenderer.moduleLoaders. Unlisted segments fall through to lazy load.
   */
  const URL_TO_MODULE: Record<string, () => Promise<unknown>> = {
    create: () =>
      import("$lib/features/create/shared/components/CreateModule.svelte"),
    generate: () =>
      import("$lib/features/create/shared/components/CreateModule.svelte"),
    browse: () =>
      import("$lib/features/browse/shared/components/BrowseModule.svelte"),
    compose: () => import("$lib/features/compose/ComposeModule.svelte"),
    animate: () => import("$lib/features/compose/ComposeModule.svelte"),
    museum: () => import("$lib/features/museum/MuseumModule.svelte"),
    learn: () => import("$lib/features/learn/LearnTab.svelte"),
    train: () => import("$lib/features/train/components/TrainModule.svelte"),
    arena: () => import("$lib/features/arena/ArenaModule.svelte"),
    settings: () => import("$lib/features/settings/SettingsModule.svelte"),
    tika: () => import("$lib/features/tika/TikaModule.svelte"),
    festivals: () => import("$lib/features/festivals/FestivalModule.svelte"),
    admin: () => import("$lib/features/admin/components/AdminDashboard.svelte"),
    stage: () => import("$lib/features/stage/StageModule.svelte"),
  };

  function startActiveModulePreload(): void {
    if (typeof window === "undefined") return;
    // Dev mode: each ES module is a separate HTTP request. Preloading the
    // module chunk (150+ files for /create) contends with the DI container
    // fetch and slows both. Skip in dev - ModuleRenderer lazy loads anyway.
    // Prod mode: chunks are bundled; HTTP/2 multiplexes them at negligible
    // cost, so parallel preload is pure win.
    if (!import.meta.env.PROD) return;
    const segment = window.location.pathname.split("/")[1] ?? "";
    const loader = URL_TO_MODULE[segment];
    if (loader) {
      // Fire-and-forget. Cache warms up while DI/firebase/auth resolve in parallel.
      trackBootImport(`active-module:${segment}`, loader).catch(() => {
        // Preload failure is non-critical - ModuleRenderer retries on demand.
      });
    }
  }

  function trackBootImport<T>(
    label: string,
    load: () => Promise<T>
  ): Promise<T> {
    // Start before the import: timing only its later await misses preloaded work.
    const start = performance.now();
    const finish = (outcome: "ok" | "error") => {
      try {
        performance.measure(`boot:import:${label}:${outcome}`, {
          start,
          end: performance.now(),
        });
      } catch {
        /* timing must not prevent startup */
      }
    };
    return load().then(
      (value) => {
        finish("ok");
        return value;
      },
      (error) => {
        finish("error");
        throw error;
      }
    );
  }

  function startAppImports() {
    // Prod-only: also kick off the active module chunk so ModuleRenderer's
    // later dynamic import resolves from cache.
    startActiveModulePreload();
    const common = {
      bootProfiler: import("$lib/shared/analytics/boot-profiler"),
      di: trackBootImport(
        "composition-root",
        () => import("$lib/shared/composition-root")
      ),
      firebase: trackBootImport(
        "firebase",
        () => import("$lib/shared/auth/firebase")
      ),
      authState: trackBootImport(
        "auth-state",
        () => import("$lib/shared/auth/state/auth-state.svelte")
      ),
      i18n: import("$lib/shared/i18n/i18n.svelte.js"),
      modalUrlState:
        import("$lib/shared/application/state/ui/modal-url-state.svelte"),
      cacheBuster: import("$lib/shared/utils/cache-buster"),
      nativeInitializer: import("$lib/shared/platform/get-native-initializer"),
    };
    // Prod-only: preload MainApp too. In dev, AppShellLoader's own import() is
    // fast enough - adding it here pulls too many deps into initial parallel
    // fetch and slows DI.
    if (import.meta.env.PROD) {
      (common as Record<string, Promise<unknown>>).mainApp = trackBootImport(
        "main-application",
        () =>
          import("$lib/shared/application/components/MainApplication.svelte")
      );
    }
    return common;
  }

  let preloadedImports: ReturnType<typeof startAppImports> | null =
    typeof window !== "undefined" && detectSiteMode() === "app"
      ? startAppImports()
      : null;

  // Site mode detection - determines whether we load the heavy app stack
  let siteMode = $state<SiteMode>("loading");

  // App-mode state
  let containerReady = $state(false);
  let containerError = $state<string | null>(null);

  // Dynamically loaded app-only components (null until loaded)
  let WarningBannerComp = $state<Component | null>(null);
  let EmailVerificationBannerComp = $state<Component | null>(null);
  let FullscreenPromptComp = $state<Component | null>(null);
  let ReportUserModalComp = $state<Component | null>(null);
  let ModalUrlRestorerComp = $state<Component | null>(null);

  // Track cleanup functions for app-mode resources
  let appCleanup: (() => void) | null = null;

  // Update viewport height on window resize and visualViewport changes
  function updateViewportHeight() {
    if (typeof window !== "undefined") {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetBottom = Math.max(0, window.innerHeight - height - offsetTop);
      const rootStyle = document.documentElement.style;

      rootStyle.setProperty("--viewport-height", `${height}px`);
      rootStyle.setProperty("--viewport-offset-top", `${offsetTop}px`);
      rootStyle.setProperty("--viewport-offset-bottom", `${offsetBottom}px`);
    }
  }

  /**
   * Landing mode init: minimal work, no Firebase, no DI, no auth.
   * Just CSS + viewport height + i18n.
   */
  async function initLandingMode() {
    updateViewportHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateViewportHeight);
    }
    window.addEventListener("resize", updateViewportHeight);

    // Start after the browser has painted the usable page. Deferring this for
    // several seconds used to drop the exact early clicks that explain a first
    // visit, and skipping it on constrained links made those visitors entirely
    // invisible. PostHog still loads asynchronously and never blocks the UI.
    // Development harnesses measure and inspect product components. Their
    // traffic is not useful analytics, and downloading PostHog beside a large
    // 3D scene distorts the very startup behavior those pages exist to review.
    const isDevelopmentHarness =
      import.meta.env.DEV && window.location.pathname.startsWith("/test/");
    const analyticsFrame = isDevelopmentHarness
      ? null
      : requestAnimationFrame(() => {
          void import("$lib/shared/analytics/services/posthog")
            .then(({ initPostHog }) => initPostHog())
            .then(() =>
              import("$lib/shared/analytics/web-vitals").then(
                ({ initWebVitals }) => initWebVitals()
              )
            )
            .catch((error) => console.warn("Landing analytics failed:", error));
        });

    // i18n is lightweight - safe for landing
    const { initI18n } = await import("$lib/shared/i18n/i18n.svelte.js");
    initI18n();

    // Landing doesn't need DI container or auth - mark ready immediately
    containerReady = true;

    return () => {
      if (analyticsFrame !== null) cancelAnimationFrame(analyticsFrame);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          updateViewportHeight
        );
      }
      window.removeEventListener("resize", updateViewportHeight);
    };
  }

  /**
   * App mode init: full bootstrap - DI container, Firebase, auth, analytics.
   * Same logic as the original layout, but loaded dynamically.
   */
  async function initAppMode() {
    // Landing→app upgrade: preloadedImports is null because we started in landing
    // mode. Kick off the imports now (still parallel, just late).
    if (!preloadedImports) preloadedImports = startAppImports();
    const imports = preloadedImports;

    // A QR scan can resume Android before the app's dependency container has
    // loaded. Start the native listener now so that intent is retained while
    // the rest of the app catches up behind the launch screen.
    void imports.nativeInitializer
      .then(({ getNativeInitializer }) => getNativeInitializer().initialize())
      .catch((err: unknown) =>
        console.warn("[Layout] Native init skipped:", err)
      );

    // Set inside runDeferred() once library-sync-retry loads; unsubscribed
    // in this function's cleanup below.
    let unsubscribeLibrarySyncRetry: (() => void) | undefined;

    const { bootProfiler } = await imports.bootProfiler;
    bootProfiler.mark("total-init");

    // Progress: SvelteKit has hydrated and onMount is running
    if (typeof (window as any).__tkaLoadProgress === "function") {
      (window as any).__tkaLoadProgress(72, "Starting up...");
    } else {
      const loadingScreen = document.getElementById("app-loading");
      if (loadingScreen) {
        loadingScreen.classList.add("loaded");
        loadingScreen.addEventListener("transitionend", () =>
          loadingScreen.remove()
        );
      }
    }

    // Load composition root - triggers all service registrations
    bootProfiler.mark("di-container");
    await imports.di;
    bootProfiler.end("di-container");

    // Mark container ready so children can render immediately
    containerReady = true;

    // Preload TKA letter glyph images (canvas word headers fall back to plain
    // text until these are ready). Decoding ~70 SVGs into canvas-ready images is
    // main-thread work, so we defer it to idle instead of racing it against the
    // first paint and the active module's load. On a slow connection that
    // contention is exactly what makes the page feel janky on arrival.
    const preloadGlyphs = () => {
      import("$lib/shared/render/services/text-renderer")
        .then(({ textRenderer }) => textRenderer.preloadGlyphImages())
        .catch(() => {});
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(preloadGlyphs);
    } else {
      setTimeout(preloadGlyphs, 0);
    }

    // Desktop only: route 3D asset URLs onto the offline bundle before any
    // scene can mount. A local manifest read; no-op on web/mobile.
    const { installDesktopAssetRuntime } =
      await import("$lib/shared/desktop/desktop-asset-runtime");
    await installDesktopAssetRuntime().catch((err: unknown) =>
      console.warn("[Layout] Desktop asset bundle unavailable:", err)
    );

    // Initialize desktop Tauri features (window state, updater).
    // No-op on web/mobile - the isDesktop check inside returns immediately.
    const { getDesktopInitializer } =
      await import("$lib/shared/desktop/get-desktop-initializer");
    const desktopInitializer = getDesktopInitializer();
    desktopInitializer
      .initialize()
      .catch((err: unknown) =>
        console.warn("[Layout] Desktop init skipped:", err)
      );

    // Prefetch browse data so it's ready before the user navigates there.
    // Uses requestIdleCallback to avoid competing with the active module's load.
    //
    // On a constrained connection (data-saver, slow/congested mobile) we back off
    // the speculative network work entirely: it's a multi-MB download for tabs the
    // user may never open, and on 4G it steals bandwidth from whatever they're
    // actually doing — which is what makes animations stutter on arrival. Both the
    // gallery and the Creators tab still load on demand when actually opened.
    const constrainedConnection = isConstrainedConnection();
    // A fast connection does not make the entire public gallery useful to
    // someone opening Construct. Keep local cache/mutation wiring, but let
    // Browse own its network load when it is actually the requested workspace.
    const prefetchBrowseNetwork =
      !constrainedConnection &&
      window.location.pathname.split("/")[1] === "browse";
    bootProfiler.milestone("browse:prefetch-policy", {
      network: prefetchBrowseNetwork,
      constrainedConnection,
    });
    const prefetchBrowseData = async () => {
      // Gallery: always warm from the IndexedDB cache (local, instant). On a
      // constrained connection or another workspace, skip the fresh Firestore
      // sync. Browse itself loads its network data on demand when opened.
      //
      // The desktop build seeds that cache from its bundled public index on
      // first launch; wait for it so the warm finds data instead of an empty
      // table. Resolved immediately on the web.
      await desktopInitializer.dataSeeded.catch(() => undefined);
      try {
        const { getGalleryPrefetcher } =
          await import("$lib/features/browse/shared/get-gallery-prefetcher");
        const prefetcher = getGalleryPrefetcher();
        if (prefetcher && typeof prefetcher.prefetch === "function") {
          prefetcher
            .prefetch({ skipNetworkSync: !prefetchBrowseNetwork })
            .catch((err: unknown) =>
              console.warn("[Layout] Gallery prefetch failed:", err)
            );
        }
      } catch (err) {
        console.warn("[Layout] Gallery prefetcher not available:", err);
      }

      // Creators: purely speculative warming for the Creators tab. Skip it
      // on other workspaces or constrained connections; the tab loads on demand.
      if (prefetchBrowseNetwork) {
        import("$lib/features/creators/state/creators-data-state.svelte")
          .then(({ creatorsDataState }) => {
            if (!creatorsDataState.isInitialized) {
              Promise.all([
                creatorsDataState.loadCreators(),
                creatorsDataState.loadFeaturedCreators(),
              ]).catch((err: unknown) =>
                console.warn("[Layout] Creators prefetch failed:", err)
              );
            }
          })
          .catch((err: unknown) =>
            console.warn("[Layout] Creators module import failed:", err)
          );
      }
    };

    if (typeof requestIdleCallback !== "undefined") {
      // timeout bounds the boot-window starvation: during startup the main
      // thread is saturated, so a no-timeout idle callback can be deferred
      // 8-27s. 2s caps how late the gallery warm starts.
      requestIdleCallback(prefetchBrowseData, { timeout: 2000 });
    } else {
      setTimeout(prefetchBrowseData, 0);
    }

    // Analytics: PostHog
    bootProfiler.mark("posthog");
    void (async () => {
      try {
        const { initPostHog } =
          await import("$lib/shared/analytics/services/posthog");
        await initPostHog();
        const { initializePostHogLifecycleReporter } =
          await import("$lib/shared/analytics/services/posthog-lifecycle-reporter");
        initializePostHogLifecycleReporter();
      } catch (error) {
        console.warn(
          "[Layout] Optional analytics initialization failed:",
          error
        );
      } finally {
        bootProfiler.end("posthog");
      }
    })();

    // i18n
    bootProfiler.mark("i18n");
    const { initI18n } = await imports.i18n;
    initI18n();
    bootProfiler.end("i18n");

    // Modal URL state
    const { initModalUrlState, cleanupModalUrlState } =
      await imports.modalUrlState;
    initModalUrlState();

    // Viewport height
    updateViewportHeight();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateViewportHeight);
      window.visualViewport.addEventListener("scroll", updateViewportHeight);
    }
    window.addEventListener("resize", updateViewportHeight);

    // Cache clear shortcut
    const { registerCacheClearShortcut } = await imports.cacheBuster;
    registerCacheClearShortcut();

    // Firestore + Auth
    bootProfiler.mark("firestore-init");
    try {
      const { getFirestoreInstance } = await imports.firebase;
      await getFirestoreInstance();
      (window as any).__tkaLoadProgress?.(76, "Connecting to cloud...");
    } catch (error) {
      console.error("[App Init] Firestore initialization failed:", error);
    }
    bootProfiler.end("firestore-init");

    // Arrow placement is presentation data. Load it for every visitor so guest
    // and signed-in pictographs use the same canonical authored values.
    import("$lib/shared/pictograph/arrow/positioning/placement/services/initialize-arrow-placement-data")
      .then(({ initializeArrowPlacementData }) =>
        initializeArrowPlacementData()
      )
      .catch((error) =>
        console.warn("Arrow placement data initialization failed:", error)
      );

    bootProfiler.mark("auth-init");
    const { authState } = await imports.authState;
    await authState.initialize();
    bootProfiler.end("auth-init");
    (window as any).__tkaLoadProgress?.(80, "Checking session...");

    bootProfiler.end("total-init");
    // Don't print summary yet - wait for the active feature module to signalReady.
    // 3s timeout is the safety net if no module signals.
    bootProfiler.scheduleSummary(3000);

    const runDeferred = () => {
      // Web Vitals - analytics, never user-visible
      bootProfiler.mark("web-vitals");
      import("$lib/shared/analytics/web-vitals")
        .then(({ initWebVitals }) => initWebVitals())
        .catch((error) => console.warn("Web Vitals failed:", error))
        .finally(() => bootProfiler.end("web-vitals"));

      // Cloud thumbnail manifest - only needed when user visits browse
      bootProfiler.mark("thumbnail-manifest");
      import("$lib/shared/browse/services/cloud-thumbnail-cache")
        .then(({ loadManifest }) => loadManifest())
        .catch((error) =>
          console.warn("Cloud thumbnail manifest failed:", error)
        )
        .finally(() => bootProfiler.end("thumbnail-manifest"));

      // Library sync retry - one pass now, one more on every reconnect, for
      // sequences a guest/user saved whose background Firestore sync never
      // landed (offline, transient error). See docs/superpowers/specs/
      // active/2026-07-18-onboarding-silent-work-loss.md.
      bootProfiler.mark("library-sync-retry");
      import("$lib/features/library/services/library-sync-retry")
        .then(({ initLibrarySyncRetry }) => {
          unsubscribeLibrarySyncRetry = initLibrarySyncRetry();
        })
        .catch((error) =>
          console.warn("Library sync retry init failed:", error)
        )
        .finally(() => bootProfiler.end("library-sync-retry"));

      // Secondary UI components (banners, prompts) - slot in when ready
      bootProfiler.mark("ui-components");
      Promise.all([
        import("$lib/features/moderation/components/WarningBanner.svelte"),
        import("$lib/shared/auth/components/EmailVerificationBanner.svelte"),
        import("$lib/shared/components/FullscreenPrompt.svelte"),
        import("$lib/features/moderation/components/ReportUserModal.svelte"),
        import("$lib/shared/application/components/ModalUrlRestorer.svelte"),
      ])
        .then(([warning, email, full, report, modal]) => {
          WarningBannerComp = warning.default;
          EmailVerificationBannerComp = email.default;
          FullscreenPromptComp = full.default;
          ReportUserModalComp = report.default;
          ModalUrlRestorerComp = modal.default;
        })
        .catch((error) => console.warn("UI components failed:", error))
        .finally(() => bootProfiler.end("ui-components"));
    };

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(runDeferred);
    } else {
      setTimeout(runDeferred, 0);
    }

    // Return cleanup
    return () => {
      authState.cleanup();
      cleanupModalUrlState();
      unsubscribeLibrarySyncRetry?.();

      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          updateViewportHeight
        );
        window.visualViewport.removeEventListener(
          "scroll",
          updateViewportHeight
        );
      }
      window.removeEventListener("resize", updateViewportHeight);
    };
  }

  onMount(() => {
    // First thing, before any other mount work: hydration is done. Everything
    // after this point is the app's own scheduling, not the network's.
    markLanding("hydrated");
    installLandingMarkReader();

    // Back-gesture guard: in standalone PWA mode, one accidental back swipe
    // exits the app. Push a dummy history entry and re-push on popstate so
    // the first swipe is absorbed. Rapid double-back still exits.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;

    let backGuardCleanup: (() => void) | undefined;
    if (isStandalone) {
      history.pushState({ __backGuard: true }, "");

      const onPopState = (e: PopStateEvent) => {
        if (e.state?.__backGuard) return;
        history.pushState({ __backGuard: true }, "");
      };

      window.addEventListener("popstate", onPopState);
      backGuardCleanup = () =>
        window.removeEventListener("popstate", onPopState);
    }

    siteMode = detectSiteMode();

    // Retro routes get a lightweight bootstrap: Firebase + auth + DI container,
    // but skip prefetch, analytics, moderation banners, modal state, web vitals.
    const isRetroRoute = ["/1989", "/1995", "/1998", "/2003"].some((r) =>
      window.location.pathname.startsWith(r)
    );
    if (isRetroRoute) {
      const loadingScreen = document.getElementById("app-loading");
      if (loadingScreen) loadingScreen.remove();

      import("$lib/features/retro/shared/services/retro-init")
        .then(({ initRetroMode }) => initRetroMode())
        .then(() => {
          containerReady = true;
        })
        .catch((error) => {
          console.error("[Layout] Retro init failed:", error);
          containerError = String(error);
        });
      return;
    }

    const isLanding = siteMode === "landing";

    const initPromise = isLanding ? initLandingMode() : initAppMode();

    initPromise
      .then((cleanup) => {
        appCleanup = cleanup;
      })
      .catch((error) => {
        console.error("[Layout] Initialization failed:", error);
        containerError = String(error);
      });

    return () => {
      backGuardCleanup?.();
      appCleanup?.();
    };
  });

  // Upgrade from landing mode → app mode when navigating to an app route.
  // This happens when a user scans a QR code (/q/[code] = landing mode),
  // then dismisses the viewer and lands on an app route like /browse/gallery.
  // Without this, auth/DI/Firestore are never initialized and the app
  // shows "Warming up..." forever.
  let appModeUpgradeStarted = false;
  afterNavigate(() => {
    if (siteMode !== "landing" || appModeUpgradeStarted) return;
    const newMode = detectSiteMode();
    if (newMode === "app") {
      appModeUpgradeStarted = true;
      siteMode = "app";
      initAppMode()
        .then((cleanup) => {
          appCleanup = cleanup;
        })
        .catch((error) => {
          console.error("[Layout] App mode upgrade failed:", error);
          containerError = String(error);
        });
    }
  });
</script>

<svelte:head>
  <!-- Default title only if page doesn't set one -->
  <meta charset="utf-8" />
</svelte:head>

<!-- P copies the current view - camera pose and frame in a 3D room, URL and
     the element under the cursor everywhere else. Mounted at the root because
     "when I see something in the app" means any route, not one dev page. -->
<ViewCaptureListener />

{#if containerError}
  <div class="error-screen">
    <h1>Critical Error</h1>
    <p>{containerError}</p>
    <button onclick={() => window.location.reload()}>Retry</button>
  </div>
{:else}
  <!-- App-only shell components (only after container initializes client-side;
       skipped during SSR and for landing mode). The #app-loading DOM in app.html
       covers the visible loading state until hydration completes. -->
  {#if containerReady && WarningBannerComp}
    <WarningBannerComp />
  {/if}

  {#if containerReady && EmailVerificationBannerComp}
    <EmailVerificationBannerComp />
  {/if}

  <!-- Render children always - required for SSR/prerender of public routes.
       App routes opt out of SSR via their own +layout.ts (ssr = false).
       Marketing routes wrap children in the persistent MarketingChrome (one
       cosmic background + SiteHeader shared across landing/about/roots/support). -->
  {#if isMarketing}
    <MarketingChrome>
      {@render children()}
    </MarketingChrome>
  {:else}
    {@render children()}
  {/if}

  {#if containerReady && FullscreenPromptComp}
    <FullscreenPromptComp />
  {/if}

  {#if containerReady && ReportUserModalComp}
    <ReportUserModalComp />
  {/if}

  {#if containerReady && ModalUrlRestorerComp}
    <ModalUrlRestorerComp />
  {/if}
{/if}

<style>
  .error-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }
</style>
