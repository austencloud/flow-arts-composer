import { browser } from "$app/env";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import { writeUrl } from "#lib/shared/navigation/services/url-state.js";
import { isStandaloneAppSurface } from "#lib/shared/navigation/services/app-shell-route.js";
import type { ModuleId } from "../../../navigation/domain/types";
import { featureFlagService } from "../../../auth/services/post-hog-feature-flag-service.svelte";
import { navigationState } from "../../../navigation/state/navigation-state.svelte";
import type { CreateFrontDoorSource } from "../../../navigation/state/navigation-state.svelte";
import { normalizeModuleId } from "../../../navigation/config/module-definitions";
import {
  saveActiveTab as persistSaveActiveTab,
  getActiveTab as persistGetActiveTab,
  initialize as persistInitialize,
} from "../../../persistence/services/dexie-persistence-service";
import {
  getActiveModule,
  setActiveModule,
  setIsTransitioning,
} from "./ui-state.svelte";

// ITI containers are synchronous - no initialization needed
// loadFeatureModule is now a no-op since all services are registered at container creation
async function loadFeatureModule(_feature: string): Promise<void> {
  // ITI containers are synchronous - all services are already available
  return Promise.resolve();
}

const LOCAL_STORAGE_KEY = "tka-active-module-cache";
const TRANSITION_RESET_DELAY = 300;

// Restoring a saved workspace is allowed only until the user asks to go
// somewhere. Without this epoch, a slower IndexedDB/auth read can finish after
// a click and put the old module back on screen.
let navigationIntentEpoch = 0;

export function markNavigationIntent(): void {
  navigationIntentEpoch += 1;
}

function canApplyAutomaticRestore(startEpoch: number): boolean {
  return startEpoch === 0 && navigationIntentEpoch === startEpoch;
}

/**
 * Sync both UI state and navigation state to the same module.
 * This ensures the navigation bar and content display are always in agreement.
 */
function syncBothStateSystems(
  moduleId: ModuleId,
  targetTab?: string,
  entrySource: CreateFrontDoorSource = "navigation"
): void {
  setActiveModule(moduleId);
  // Also sync navigationState to prevent navigation bar showing different module than content
  // Pass targetTab if provided (for deep linking via URL)
  navigationState.setCurrentModule(moduleId, targetTab, entrySource);
}

/**
 * Check if a module is accessible to the current user
 * Uses the feature flag service for role-based access control
 */
function isModuleAccessible(moduleId: ModuleId): boolean {
  // This checks the user's role against the module's minimum required role
  return featureFlagService.canAccessModule(moduleId);
}

/**
 * Re-validate current module and section after auth state changes
 * Called when auth initializes to restore any cached module that user now has access to
 * Also validates that current section is accessible (e.g., guided mode requires admin)
 */
export async function revalidateCurrentModule(): Promise<void> {
  // ITI containers are synchronous - no initialization needed
  const currentModule = getActiveModule();
  const restoreStartEpoch = navigationIntentEpoch;

  // IMPORTANT: Check if this is URL-based navigation (deep linking)
  // If user explicitly navigated to a URL, do NOT override with cached module
  let isUrlNavigation = false;
  if (browser) {
    const pathname = window.location.pathname;
    const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length > 0 && parts[0]) {
      // URL has a module path - this is explicit navigation
      isUrlNavigation = true;
    }
  }

  // Try to restore any cached module that user now has access to
  // BUT skip if user explicitly navigated via URL
  if (
    (featureFlagService.isTester || featureFlagService.isAdmin) &&
    !isUrlNavigation &&
    canApplyAutomaticRestore(restoreStartEpoch)
  ) {
    try {
      // Check localStorage FIRST (most recent user intent, survives even if Firestore was overwritten)
      const cached = browser ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // Normalize module ID to handle renamed modules (e.g., "TIKA" -> "tika")
          const cachedModuleId = normalizeModuleId(parsed.moduleId);

          // Restore ANY module the user has access to (not just admin)
          if (
            cachedModuleId &&
            isModuleAccessible(cachedModuleId) &&
            currentModule !== cachedModuleId &&
            canApplyAutomaticRestore(restoreStartEpoch)
          ) {
            // Load feature module BEFORE setting active module to ensure services are available
            await loadFeatureModule(cachedModuleId);

            // Sync BOTH ui state and navigation state to ensure nav bar matches content
            syncBothStateSystems(cachedModuleId);
            // Update localStorage if we normalized the value (e.g., "TIKA" -> "tika")
            if (cachedModuleId !== parsed.moduleId) {
              localStorage.setItem(
                LOCAL_STORAGE_KEY,
                JSON.stringify({ moduleId: cachedModuleId })
              );
            }
            await persistSaveActiveTab(cachedModuleId);
            return;
          }
        } catch {
          // Ignore parse errors
        }
      }

      // If localStorage doesn't have a valid module, check Firestore as fallback
      const savedFromFirestore = await persistGetActiveTab();
      // Normalize module ID from Firestore (may have stale data like "TIKA" -> "tika")
      const normalizedFirestoreModule = savedFromFirestore
        ? normalizeModuleId(savedFromFirestore)
        : undefined;

      // If Firestore has a module the user can access, restore it
      if (
        normalizedFirestoreModule &&
        isModuleAccessible(normalizedFirestoreModule) &&
        currentModule !== normalizedFirestoreModule &&
        canApplyAutomaticRestore(restoreStartEpoch)
      ) {
        // Load feature module BEFORE setting active module to ensure services are available
        await loadFeatureModule(normalizedFirestoreModule);

        // Sync BOTH ui state and navigation state to ensure nav bar matches content
        syncBothStateSystems(normalizedFirestoreModule);
        // Update localStorage to match (with normalized value)
        if (browser) {
          localStorage.setItem(
            LOCAL_STORAGE_KEY,
            JSON.stringify({ moduleId: normalizedFirestoreModule })
          );
        }
        // Also update Firestore if we normalized the value
        if (normalizedFirestoreModule !== savedFromFirestore) {
          await persistSaveActiveTab(normalizedFirestoreModule);
        }
        return;
      }
    } catch (_error) {
      console.warn(`⚠️ [module-state] Failed to revalidate module:`, _error);
    }
  }

  // Validate current section accessibility (e.g., assembler mode requires admin)
  if (currentModule === "create") {
    try {
      // Dynamic import to avoid circular dependency
      const { navigationState } =
        await import("../../../navigation/state/navigation-state.svelte");
      const currentSection = navigationState.activeTab;

      // Check if user has access to the current section via feature flags
      // Guard: skip if feature flags haven't loaded yet — role defaults to "user"
      // before init, which would incorrectly redirect admin-gated tabs
      if (
        currentSection &&
        featureFlagService.isInitialized &&
        !featureFlagService.canAccessTab("create", currentSection)
      ) {
        console.warn(
          `⚠️ [module-state] User does not have access to ${currentSection} tab. Redirecting to construct.`
        );
        navigationState.setActiveTab("construct");
      }
    } catch (_error) {
      console.warn(`⚠️ [module-state] Failed to validate section:`, _error);
    }
  }
}

export function getInitialModuleFromCache(): ModuleId {
  if (!browser) {
    return "create";
  }

  try {
    const savedModuleData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedModuleData) {
      const parsed = JSON.parse(savedModuleData);
      if (parsed && typeof parsed.moduleId === "string") {
        const moduleId = parsed.moduleId as ModuleId;
        // Return the cached module even if it's admin
        // If user doesn't have access, initializeModulePersistence will handle it
        return moduleId;
      }
    }
  } catch (_error) {
    console.warn("⚠️ Failed to pre-load saved module from cache:", _error);
  }

  return "create";
}

/**
 * Preload the cached module's services immediately to prevent UI flicker
 * This should be called as early as possible in the app lifecycle
 */
export function preloadCachedModuleServices(): void {
  if (!browser) return;

  try {
    const savedModuleData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedModuleData) {
      const parsed = JSON.parse(savedModuleData);
      if (parsed && typeof parsed.moduleId === "string") {
        const moduleId = parsed.moduleId as ModuleId;

        // Start loading feature module immediately (non-blocking)
        // This prevents the UI flicker where it shows "create" first
        loadFeatureModule(moduleId).catch((_error) => {
          console.warn(
            `⚠️ Failed to preload module services for "${moduleId}":`,
            _error
          );
        });
      }
    }
  } catch (_error) {
    console.warn("⚠️ Failed to preload cached module services:", _error);
  }
}

export async function switchModule(module: ModuleId): Promise<void> {
  if (getActiveModule() === module) {
    return;
  }

  // Check if user has access to the module
  if (!isModuleAccessible(module)) {
    console.warn(
      `⚠️ switchTab: User does not have access to module "${module}"`
    );
    setIsTransitioning(false);
    return;
  }

  markNavigationIntent();

  setIsTransitioning(true);

  try {
    // ⚡ PERFORMANCE: Load feature module on-demand (Tier 3)
    // Only loads the DI services needed for this specific tab
    await loadFeatureModule(module);

    setActiveModule(module);

    await persistSaveActiveTab(module);

    if (browser) {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ moduleId: module })
      );
    }
  } catch (_error) {
    console.warn("⚠️ switchTab: Failed to save module to persistence:", _error);
  }

  setTimeout(() => {
    setIsTransitioning(false);
  }, TRANSITION_RESET_DELAY);
}

export function isModuleActive(module: string): boolean {
  return getActiveModule() === module;
}

export async function initializeModulePersistence(): Promise<void> {
  const restoreStartEpoch = navigationIntentEpoch;

  // A legacy sheet redirect or an unusually fast click can happen while the
  // rest of startup is still resolving. That newer destination owns the
  // screen; persistence must not compete with it.
  if (!canApplyAutomaticRestore(restoreStartEpoch)) return;

  try {
    // FIRST: Check if URL specifies a module (deep linking takes priority)
    // This prevents localStorage from overriding the user's navigation intent
    let urlModule: string | null = null;
    let urlTab: string | null = null;
    if (browser) {
      const pathname = window.location.pathname;
      // Some focused screens need Firebase and auth without being navigation
      // modules. Their URL belongs to the screen, so module restore must not
      // reinterpret the first path segment and rewrite it to Create.
      if (isStandaloneAppSurface(pathname)) return;
      const searchParams = new URLSearchParams(window.location.search);
      const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
      const firstPart = parts[0];
      const secondPart = parts[1];
      if (firstPart) {
        urlModule = firstPart.toLowerCase();
      }
      // Tab can come from path (/app/admin/loop-labeler) OR query param (?section=loop-labeler)
      if (secondPart) {
        urlTab = secondPart.toLowerCase();
      } else {
        const sectionParam = searchParams.get("section");
        if (sectionParam) {
          urlTab = sectionParam.toLowerCase();
        }
      }
    }

    // Try localStorage FIRST (faster, synchronous)
    let savedModule: string | null = null;
    if (browser) {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          savedModule = parsed.moduleId;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Fallback to Firestore if not in localStorage
    if (!savedModule) {
      await persistInitialize();
      savedModule = await persistGetActiveTab();
    }

    // Determine which module to use:
    // - If URL specifies a module, always use URL (deep linking - user explicitly navigated here)
    // - Otherwise use saved module (normal restore)
    const isUrlNavigation = !!urlModule;
    const rawEffectiveModule = urlModule || savedModule;

    // Normalize the module ID (handles migrations like "dashboard" → "create" and typos)
    const normalizedModule = rawEffectiveModule
      ? normalizeModuleId(rawEffectiveModule)
      : undefined;

    if (normalizedModule) {
      const moduleId = normalizedModule;

      // IMPORTANT: During initial load, skip access check because auth might not be ready yet
      // revalidateCurrentModule() will correct this after auth loads if needed

      // ⚡ CRITICAL: Load module services BEFORE setting activeModule
      // This prevents the UI from trying to render before services are ready
      await loadFeatureModule(moduleId);

      // Sync BOTH ui state and navigation state to ensure nav bar matches content
      // Pass URL tab if this is URL-based navigation (deep linking)
      if (!canApplyAutomaticRestore(restoreStartEpoch)) return;
      syncBothStateSystems(
        moduleId,
        isUrlNavigation ? (urlTab ?? undefined) : undefined,
        isUrlNavigation && moduleId === "create" && !urlTab
          ? "direct"
          : "navigation"
      );

      // Clean up localStorage if we normalized the value
      if (browser) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ moduleId }));
      }
    } else {
      // No valid module (could be typo like "sdashboard" or truly empty)
      if (rawEffectiveModule) {
        console.warn(
          `Invalid module "${rawEffectiveModule}" - redirecting to Create`
        );
      }

      const defaultModule = "create" as ModuleId;

      // Load default module's DI services
      await loadFeatureModule(defaultModule);

      // Sync BOTH ui state and navigation state to ensure nav bar matches content
      if (!canApplyAutomaticRestore(restoreStartEpoch)) return;
      syncBothStateSystems(defaultModule);

      await persistInitialize();
      await persistSaveActiveTab(defaultModule);
      if (browser) {
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({ moduleId: defaultModule })
        );
        // Fix the URL if it had an invalid module
        if (rawEffectiveModule) {
          const correctedPath = `/create`;
          writeUrl(correctedPath, {
            state: { moduleId: "create", sectionId: "construct" },
          });
        }
      }
    }
  } catch (_error) {
    console.warn("⚠️ Failed to initialize module persistence:", _error);
    // Fallback to create module on error
    try {
      await loadFeatureModule("create");
      // Sync BOTH ui state and navigation state to ensure nav bar matches content
      if (!canApplyAutomaticRestore(restoreStartEpoch)) return;
      syncBothStateSystems("create");
    } catch (_fallbackError) {
      console.error(
        "❌ Failed to load fallback create module:",
        _fallbackError
      );
      // Surface the failure — both persistence init and fallback module load have failed.
      // Show an error toast so the user knows the app is in a degraded state.
      if (browser) {
        toast.error("App failed to load. Please refresh the page.", 0);
      }
    }
  }
}
