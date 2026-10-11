/**
 * HMR Helper - Ensures proper handling of hot module replacements
 * Particularly important for Svelte 5 runes state management
 */
import { forceFreshReload } from "#lib/shared/foundation/services/force-fresh.js";
import { recordReloadReason } from "#lib/shared/dev/reload-breadcrumb.js";

// Track if we've already scheduled a reload to prevent multiple reloads
let reloadScheduled = false;

// Track if we've detected a MIME error in this session
// MIME errors corrupt Svelte's reactivity, so we need to reload
let mimeErrorDetected = false;

// Timestamp of the most recent Vite HMR update. A runtime crash that lands
// within a short window after an update is almost always a FAILED HMR APPLY
// (Vite swapped a parent module but a child dynamic import transiently resolved
// to undefined → `mod.default` throws). We scope the self-heal below to this
// window so a genuine app-logic TypeError outside an HMR cycle never triggers a
// surprise reload.
let lastHmrUpdateAt = 0;
const HMR_APPLY_FAILURE_WINDOW_MS = 5000;

// Signature of a failed HMR apply: dereferencing a property off an undefined
// module record. `default` is the Svelte component export; `render`/`$$`/
// `component` cover the other shapes a re-imported module is read through.
const HMR_APPLY_FAILURE_RE =
  /reading '(default|render|\$\$|component|prototype)'/;

function isHmrApplyFailure(message: string): boolean {
  return (
    import.meta.env.DEV &&
    Date.now() - lastHmrUpdateAt < HMR_APPLY_FAILURE_WINDOW_MS &&
    HMR_APPLY_FAILURE_RE.test(message)
  );
}

/**
 * Check if we're in HMR mode and the page needs a full reload
 */
export function shouldForceReload(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Check if this is an HMR update that left the page in a bad state
  // This can happen when Svelte 5 runes state doesn't preserve properly
  const rootElement = document.getElementById("app");
  if (!rootElement) {
    return false;
  }

  // If the root element exists but has no children after HMR, we're in a bad state
  // We rely solely on content check - if HMR left us with an empty app, reload
  const hasContent = rootElement.children.length > 0;

  // Only trigger reload if we're in dev mode (HMR active) and have no content
  const isDevMode = import.meta.env.DEV;

  return isDevMode && !hasContent;
}

/**
 * Schedule a page reload with debounce to prevent multiple reloads
 */
function scheduleReload(reason: string) {
  if (reloadScheduled) return;
  reloadScheduled = true;
  console.warn(`[HMR] Scheduling page reload: ${reason}`);
  setTimeout(() => {
    recordReloadReason("HMR recovery reload", reason);
    window.location.reload();
  }, 100);
}

/**
 * HMR can leave Create's scoped stylesheet present in the document but absent
 * from the active cascade. The module still exists in the accessibility tree,
 * yet its root collapses to its intrinsic height and the user sees only the
 * animated background. A healthy Create surface always fills its module host.
 */
export function isCreateSurfaceCollapsed(
  root: ParentNode = document,
): boolean {
  const surface = root.querySelector<HTMLElement>(".create-tab");
  const host = surface?.parentElement;
  if (!surface || !host) return false;

  const surfaceRect = surface.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  if (hostRect.width <= 0 || hostRect.height <= 0) return false;

  return (
    surfaceRect.width < hostRect.width * 0.5 ||
    surfaceRect.height < hostRect.height * 0.5
  );
}

/**
 * Handle HMR-specific initialization
 * Call this in your main app component's onMount
 */
export function handleHMRInit() {
  if (typeof window === "undefined") {
    return;
  }

  // Listen for Vite HMR events
  if (import.meta.hot) {
    // Before HMR invalidation, track which files are being updated
    import.meta.hot.on("vite:beforeUpdate", (payload: { updates: Array<{ path: string }> }) => {
      // Stamp the update so the global error handler can tell a failed HMR apply
      // apart from an ordinary runtime error (see isHmrApplyFailure).
      lastHmrUpdateAt = Date.now();

      // Clear module cache to prevent stale chunk issues
      clearModuleCache();

      // Track updated files for reactivity check
      const updatedFiles = payload.updates?.map(u => u.path) || [];
      (window as unknown as Record<string, unknown>).__VITE_HMR_UPDATED_FILES__ = updatedFiles;
    });

    // After HMR update, verify the page is still functional and restore theme
    import.meta.hot.on("vite:afterUpdate", async () => {
      // Small delay to let Svelte finish rendering
      setTimeout(async () => {
        if (shouldForceReload()) {
          scheduleReload("Empty app after HMR update");
        } else {
          // Theme CSS variables can be cleared by HMR - restore them
          // Note: BackgroundController handles its own HMR persistence
          await restoreThemeFromSettings();
          // Check if reactivity is still working after HMR
          checkReactivityHealth();
        }
      }, 100);
    });

    // Log HMR errors but do NOT auto-reload — auto-reload causes infinite
    // loops when the current background (e.g. ocean) triggers the same error
    // on every page load.
    import.meta.hot.on("vite:error", (error: unknown) => {
      console.error("[HMR] Vite error (no auto-reload):", error);
    });
  }

  // Listen for global errors that indicate module loading failures
  // These happen when the browser gets HTML instead of JS for a module request
  setupGlobalErrorHandler();
}

/**
 * Callback registry for module cache clearing
 * Modules can register their cache clear functions here
 */
const moduleCacheClearCallbacks = new Set<() => void>();

/**
 * Register a callback to clear a module's cache when HMR updates happen.
 * Returns a deregister function to prevent leaks across HMR cycles.
 */
export function registerModuleCacheClear(callback: () => void): () => void {
  moduleCacheClearCallbacks.add(callback);
  return () => { moduleCacheClearCallbacks.delete(callback); };
}

/**
 * Clear all registered module caches
 */
function clearModuleCache() {
  for (const callback of moduleCacheClearCallbacks) {
    try {
      callback();
    } catch (e) {
      console.warn("[HMR] Error clearing module cache:", e);
    }
  }
}

/**
 * Set up global error handler for module loading failures
 * This catches MIME type errors when Vite serves HTML instead of JS
 *
 * Strategy: Mark the error but don't immediately reload.
 * Instead, we detect the broken state when the user tries to interact
 * (e.g., switch tabs) and the UI doesn't update. This avoids jarring
 * reloads when the user might still be able to work.
 */
function setupGlobalErrorHandler() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;

  // Handle error events (catches synchronous errors)
  window.addEventListener("error", (event) => {
    const message = event.message || "";
    const error = event.error;

    // A `mod.default`-on-undefined crash right after a Vite update is a failed
    // HMR apply that wedges the page (and spams the console on every refresh).
    // Self-heal with one guarded fresh reload instead of dead-ending the user.
    if (isHmrApplyFailure(error?.message || message)) {
      event.preventDefault();
      recoverFromModuleChunkFailure("hmr-apply-failure");
      return;
    }

    // Check for MIME type errors indicating corrupted module loads
    if (
      message.includes("MIME type") ||
      message.includes("Failed to load module script") ||
      (error?.message?.includes("MIME type"))
    ) {
      console.warn(
        "[HMR] Module script MIME error detected - Svelte reactivity may be corrupted. " +
          "Will reload on next tab switch if UI fails to update."
      );
      // Mark the error so we can detect it later
      mimeErrorDetected = true;
      // Don't reload immediately - let the user continue if possible
      // We'll catch the broken state when they try to switch tabs
      event.preventDefault();
    }
  });

  // Handle unhandled promise rejections (catches async import failures)
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason) || "";

    // Failed HMR apply surfacing as a rejected `{#await import() then mod}`
    // (mod is undefined → reading 'default' throws). Self-heal, don't spam.
    if (isHmrApplyFailure(message)) {
      event.preventDefault();
      recoverFromModuleChunkFailure("hmr-apply-failure");
      return;
    }

    // Check for dynamic import failures
    if (
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("MIME type") ||
      message.includes("is not a valid JavaScript")
    ) {
      console.warn(
        "[HMR] Dynamic import failure detected - Svelte reactivity may be corrupted. " +
          "Will reload on next tab switch if UI fails to update."
      );
      mimeErrorDetected = true;
      event.preventDefault();
    }
  });
}

/**
 * Register a cleanup function that will be called before HMR updates
 */
export function onBeforeHMR(cleanup: () => void) {
  if (import.meta.hot) {
    import.meta.hot.on("vite:beforeUpdate", cleanup);
  }
}

// Patterns that indicate files critical for navigation/reactivity
// HMR updates to these files often break Svelte reactivity
const CRITICAL_FILE_PATTERNS = [
  /navigation.*state/i,
  /navigation-coordinator/i,
  /layout-state/i,
  /ModuleRenderer/i,
  /MainInterface/i,
  /CreateModule/i,
  /StandardWorkspaceLayout/i,
  /CreationToolPanelSlot/i,
];

/**
 * Check if any updated modules are critical for navigation
 * If so, force a full reload to avoid broken reactivity
 */
function checkReactivityHealth() {
  // This is called after HMR update - we can't easily get the updated file list
  // from Vite's afterUpdate event, so we use a different strategy:
  //
  // We expose a global that tracks the last HMR-updated files
  // and check it here
  const updatedFiles = (window as unknown as Record<string, unknown>).__VITE_HMR_UPDATED_FILES__ as string[] | undefined;

  if (!updatedFiles || updatedFiles.length === 0) {
    // Even without knowing which files updated, check for state/UI desync
    checkStateUISync();
    return;
  }

  const hasCriticalUpdate = updatedFiles.some(file =>
    CRITICAL_FILE_PATTERNS.some(pattern => pattern.test(file))
  );

  if (hasCriticalUpdate) {
    console.warn("[HMR] Critical navigation file updated, reloading to ensure reactivity...");
    scheduleReload("Critical navigation file HMR update");
  } else {
    // For non-critical updates, still check for state/UI desync
    checkStateUISync();
  }

  // Clear the tracking array
  (window as unknown as Record<string, unknown>).__VITE_HMR_UPDATED_FILES__ = [];
}

/**
 * Check if navigation state and URL are in sync
 * If they've drifted apart, reactivity is likely broken
 */
async function checkStateUISync() {
  if (reloadScheduled) return;

  try {
    // Dynamic import to get fresh module reference
    const { navigationState } = await import(
      "./navigation/state/navigation-state.svelte"
    );

    const stateTab = navigationState.activeTab;
    const stateModule = navigationState.currentModule;

    if (stateModule === "create" && isCreateSurfaceCollapsed()) {
      console.error("[HMR] Create surface collapsed after update");
      scheduleReload("Collapsed Create surface after HMR update");
      return;
    }

    // Get current URL path
    const urlPath = window.location.pathname;
    const urlParts = urlPath.split('/').filter(Boolean);
    const _urlModule = urlParts[0];
    const urlTab = urlParts[1];

    // Only check for Create module where tab desync is common
    if (stateModule !== 'create') return;

    // If URL has a tab and it doesn't match state, we have a problem
    // But only if URL was recently updated (indicating user navigated)
    if (urlTab && stateTab && urlTab !== stateTab) {
      // Give Svelte a moment to sync
      await new Promise(resolve => setTimeout(resolve, 200));

      // Re-check after delay
      const newStateTab = navigationState.activeTab;
      const newUrlPath = window.location.pathname;
      const newUrlTab = newUrlPath.split('/').filter(Boolean)[1];

      if (newUrlTab && newStateTab && newUrlTab !== newStateTab) {
        console.error(`[HMR] State/URL desync detected: state=${newStateTab}, url=${newUrlTab}`);
        scheduleReload("State/UI desync after HMR");
      }
    }
  } catch (error) {
    // Don't fail loudly - this is a best-effort check
    console.warn("[HMR] State sync check failed:", error);
  }
}

/**
 * Restore theme CSS variables from persisted settings after HMR
 * HMR can clear CSS variables - this restores the --theme-* variables.
 *
 * Note: BackgroundController handles its own HMR persistence via import.meta.hot.data,
 * but theme CSS variables (for panels, accents, text) need to be restored here.
 */
export async function restoreThemeFromSettings() {
  if (typeof window === "undefined") return;

  // Check if theme variables are missing (sign of HMR clearing them)
  const root = document.documentElement;
  const currentPanelBg = getComputedStyle(root)
    .getPropertyValue("--theme-panel-bg")
    .trim();

  // If we still have theme variables, no need to restore
  if (currentPanelBg && currentPanelBg !== "") {
    return;
  }

  try {
    // Restore theme CSS variables (--theme-panel-bg, --theme-accent, etc.)
    const { ensureThemeApplied } = await import(
      "./settings/utils/background-theme-calculator"
    );
    ensureThemeApplied();
  } catch (error) {
    console.warn("[HMR] Failed to restore theme:", error);
  }
}

/**
 * Check if a MIME error has been detected in this session.
 * MIME errors corrupt Svelte's reactivity, causing state changes
 * to not reflect in the UI.
 */
export function hasMimeErrorOccurred(): boolean {
  return mimeErrorDetected;
}

/**
 * Mark that a MIME error has occurred.
 * Called from the global error handler when MIME errors are detected.
 */
export function markMimeError() {
  mimeErrorDetected = true;
}

/**
 * Verify that a tab switch actually rendered the new tab.
 * Call this after setActiveTab() to detect reactivity failures.
 *
 * @param expectedTab - The tab ID that should now be active
 * @param timeout - How long to wait before checking (ms)
 * @returns Promise that resolves to true if tab rendered, false if desync detected
 */
export async function verifyTabSwitch(
  expectedTab: string,
  timeout = 150
): Promise<boolean> {
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    return true; // Skip in production or SSR
  }

  // Wait for Svelte to process the state change and re-render
  await new Promise((resolve) => setTimeout(resolve, timeout));

  // Check if a MIME error occurred - if so, reactivity is likely broken
  if (mimeErrorDetected) {
    console.error(
      "[HMR] MIME error detected earlier - tab switch may have failed"
    );

    // Check DOM for evidence of the expected tab
    const tabContent = document.querySelector(
      `[data-tab="${expectedTab}"], [data-active-tab="${expectedTab}"]`
    );

    if (!tabContent) {
      console.error(
        `[HMR] Tab "${expectedTab}" not found in DOM after MIME error - reloading`
      );
      scheduleReload("Tab switch failed after MIME error");
      return false;
    }
  }

  return true;
}

/**
 * Force a page reload if reactivity appears broken.
 * Use this as a last resort when state changes don't reflect in UI.
 */
export function forceReloadIfNeeded(reason: string) {
  if (mimeErrorDetected && !reloadScheduled) {
    scheduleReload(reason);
  }
}

// ── Resilient dynamic imports ────────────────────────────────────────────

let recentImportFailures = 0;
let failureWindowStart = 0;

function trackImportFailure() {
  const now = Date.now();
  if (now - failureWindowStart > 2000) {
    recentImportFailures = 0;
    failureWindowStart = now;
  }
  recentImportFailures++;

  if (recentImportFailures >= 5) {
    recentImportFailures = 0;
    scheduleReload("Cascading dynamic import failures");
  }
}

/** Pull the module URL out of a "Failed to fetch dynamically imported module:
 * <url>" rejection (Chrome) or "error loading dynamically imported module: <url>"
 * (Firefox). Returns null when no URL is present. */
function extractFailedModuleUrl(err: unknown): string | null {
  const message = (err as Error)?.message ?? "";
  const match = message.match(/(https?:\/\/[^\s)]+)/);
  return match?.[1] ?? null;
}

/**
 * Wraps a dynamic import factory with retry + backoff for HMR resilience.
 * Dev-only — production throws immediately (stale chunks handled by
 * vite:preloadError in hooks.client.ts).
 *
 * The browser caches a FAILED module specifier in its module map
 * (whatwg/html#6768), so a plain re-`import()` of the same specifier returns the
 * cached rejection without ever hitting the network — a naive retry is a no-op.
 * To actually re-fetch, retries re-import the failed URL with a fresh `?t=`
 * cache-busting query (the same mechanism as vite-plugin-retrying-dynamic-import).
 * This recovers the common dev case: another Claude session / editor saves a
 * .svelte file mid-write, the first fetch gets an incomplete chunk, and a moment
 * later the cache-busted re-fetch gets the finished file — no page reload.
 */
export function resilientLazyImport<T>(
  loader: () => Promise<T>,
  retries = 3,
): () => Promise<T> {
  return async () => {
    if (!import.meta.env.DEV) return loader();

    let lastError: unknown;
    let bustUrl: string | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (bustUrl) {
          // Re-fetch the failed URL with a unique query to bypass the browser's
          // cached module-map failure. @vite-ignore: the specifier is a runtime
          // value, not a literal for Vite to pre-analyze.
          const sep = bustUrl.includes("?") ? "&" : "?";
          return (await import(/* @vite-ignore */ `${bustUrl}${sep}t=${Date.now()}`)) as T;
        }
        return await loader();
      } catch (err) {
        lastError = err;
        // Capture the URL from the first failure so subsequent attempts can
        // cache-bust it. Keep the last known URL if a later attempt lacks one.
        bustUrl = extractFailedModuleUrl(err) ?? bustUrl;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }

    trackImportFailure();
    throw lastError;
  };
}

// ── Top-level module chunk recovery ──────────────────────────────────────
// When a whole feature module's chunk fails to load even after retries (common
// dev trigger: another Claude session / editor saved its .svelte file
// mid-write), the user is otherwise dead-ended at a full-screen "Failed to load
// module" + manual Reload button — and that manual reload often means opening a
// fresh tab. Instead, self-heal with ONE guarded full reload so the page
// recovers on its own. The sessionStorage guard prevents an infinite reload
// loop if the failure is a genuine, persistent syntax error: after the first
// auto-reload the guard stays set until a module loads cleanly, so a real error
// just shows the manual button (and Vite's overlay) without looping.

const MODULE_CHUNK_RELOAD_KEY = "tka-module-chunk-reload";

/**
 * Reserve the one automatic reload for the active module that failed. A clean
 * background preload must not erase another module's reservation, or a
 * persistent error turns into a reload loop instead of settling on the visible
 * error state.
 */
export function claimModuleChunkRecovery(moduleName: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const guardedModule = sessionStorage.getItem(MODULE_CHUNK_RELOAD_KEY);
    if (guardedModule === moduleName) return false;
    if (guardedModule === "1") {
      // Older builds stored only a boolean marker. Attach it to the module that
      // is still failing so that module can clear it after a clean load.
      sessionStorage.setItem(MODULE_CHUNK_RELOAD_KEY, moduleName);
      return false;
    }
    sessionStorage.setItem(MODULE_CHUNK_RELOAD_KEY, moduleName);
  } catch {
    // sessionStorage can be blocked. The in-memory reloadScheduled flag still
    // limits this page instance to one navigation.
  }

  return true;
}

/**
 * Self-heal a top-level module chunk that failed to load after retries.
 * Call only for the ACTIVE module — background preloads must not reload the page.
 */
export function recoverFromModuleChunkFailure(moduleName: string): void {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  if (reloadScheduled) return;
  if (!claimModuleChunkRecovery(moduleName)) return;
  reloadScheduled = true;
  console.warn(`[HMR] Module chunk "${moduleName}" failed after retries — fresh reload`);
  recordReloadReason(
    "module chunk failed to load",
    `"${moduleName}" — usually a file saved mid-write; recovering with a cache-busted reload`
  );
  // Use a fresh, cache-busted navigation rather than location.reload(): a plain
  // reload often HANGS here because in-flight /data/*.json fetches stall while
  // the dev server re-settles after the mid-write save — which is exactly why a
  // manual reload forces opening a brand-new tab. forceFreshReload() tears down
  // the SW + caches and navigates to a ?fresh= URL, so the page boots clean and
  // never gets stuck on the spinner.
  void forceFreshReload();
}

/**
 * Re-arm module-chunk recovery after a clean load. Once any module loads
 * successfully we know the page is healthy, so a future mid-write edit is
 * allowed to trigger one fresh recovery reload again.
 */
export function clearModuleChunkRecoveryGuard(moduleName?: string): void {
  if (typeof window === "undefined") return;
  try {
    const guardedModule = sessionStorage.getItem(MODULE_CHUNK_RELOAD_KEY);
    if (moduleName && guardedModule !== moduleName) {
      return;
    }
    sessionStorage.removeItem(MODULE_CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
