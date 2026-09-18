/**
 * NavigationCoordinator
 * Domain: Navigation State Coordination
 *
 * Responsibilities:
 * - Coordinate between legacy system and new module/section system
 * - Manage module definitions and current module state
 * - Calculate available module sections based on context
 * - Synchronize navigation state changes
 */

import { ignoreViewTransitionSkip } from "../transitions/named-route-morph-state.svelte";

/**
 * Document with optional View Transition API support
 * Uses the native ViewTransition type from lib.dom.d.ts when available
 */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (
    callback: () => void | Promise<void>
  ) => ViewTransition;
};

function afterViewTransitionSettles(
  transition: ViewTransition,
  callback: () => void
): void {
  // A skipped transition rejects `ready` while still resolving `finished`.
  // Without this the skip surfaces as an unhandled rejection.
  ignoreViewTransitionSkip(transition);
  void transition.finished.then(callback, callback);
}

import type { ModuleId } from "../navigation/domain/types";
import {
  normalizeNavigationTarget,
  normalizeSectionId,
} from "../navigation/config/module-definitions";
import {
  MODULE_DEFINITIONS,
  ENABLED_MODULE_DEFINITIONS,
  navigationState,
} from "../navigation/state/navigation-state.svelte";
import {
  markNavigationIntent,
  switchModule,
} from "../application/state/ui/module-state";
import { authState } from "../auth/state/auth-state.svelte";
import { resolveAccessTier } from "../auth/domain/access-tier";
import { isTabAccessible } from "../auth/domain/guest-access-config";
import { isPremiumOrAbove } from "../auth/domain/models/user-role";
import {
  featureFlagService,
  featureFlagState,
} from "../auth/services/post-hog-feature-flag-service.svelte";
import { parseCreatorPathname } from "../navigation/services/creator-routes";
import {
  pruneParamsForNavigation,
  pruneRouteScopedParams,
} from "../navigation/services/url-parameter-policy";
import { isStandaloneAppSurface } from "../navigation/services/app-shell-route";
import { writeUrl } from "../navigation/services/url-state";
import { buildNavigationDestinationId } from "../navigation/domain/navigation-visit";
import { getNavigationVisitPersister } from "../navigation/get-navigation-visit-persister";
import {
  normalizeBrowsePrimary,
  resolveBrowsePathname,
} from "../browse/navigation/browse-route-resolver";
import { captureEvent } from "../analytics/services/posthog";

// Session storage key for persisting navigation history across HMR
const PREVIOUS_MODULE_KEY = "tka-previous-module-before-settings";

// Load persisted previous module from sessionStorage (survives HMR)
function loadPreviousModule(): ModuleId | null {
  if (typeof sessionStorage === "undefined") return null;
  const saved = sessionStorage.getItem(PREVIOUS_MODULE_KEY);
  if (saved && MODULE_DEFINITIONS.some((m) => m.id === saved)) {
    return saved as ModuleId;
  }
  return null;
}

// Persist previous module to sessionStorage
function savePreviousModule(moduleId: ModuleId | null) {
  if (typeof sessionStorage === "undefined") return;
  if (moduleId) {
    sessionStorage.setItem(PREVIOUS_MODULE_KEY, moduleId);
  } else {
    sessionStorage.removeItem(PREVIOUS_MODULE_KEY);
  }
}

// Reactive state object using Svelte 5 $state rune
export const navigationCoordinator = $state({
  // Note: Edit and Export are slide-out panels, not navigation sections
  canAccessEditAndExportPanels: false,
  // Track the module we came from when entering Settings (for return animation)
  // Initialized from sessionStorage to survive HMR
  previousModuleBeforeSettings: loadPreviousModule(),
  // Store the entry point for consistent exit animation
  settingsEntryOrigin: { x: 90, y: 95 } as { x: number; y: number },
});

// Set the portal origin position for Settings transition
// Called when settings button is clicked, before navigation
export function setSettingsPortalOrigin(x: number, y: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Convert to percentage for responsive positioning
  const xPercent = (x / vw) * 100;
  const yPercent = (y / vh) * 100;
  // Store for reuse on exit
  navigationCoordinator.settingsEntryOrigin = { x: xPercent, y: yPercent };
  document.documentElement.style.setProperty(
    "--portal-origin-x",
    `${xPercent}%`
  );
  document.documentElement.style.setProperty(
    "--portal-origin-y",
    `${yPercent}%`
  );
}

// Restore the original entry origin for exit animation
// Creates consistent "dive in / pull out from same spot" experience
export function restoreSettingsPortalOrigin() {
  const { x, y } = navigationCoordinator.settingsEntryOrigin;
  document.documentElement.style.setProperty("--portal-origin-x", `${x}%`);
  document.documentElement.style.setProperty("--portal-origin-y", `${y}%`);
}

// Derived state as functions (Svelte 5 doesn't allow exporting $derived directly)
export function currentModule() {
  return navigationState.currentModule;
}

export function currentSection() {
  return navigationState.currentSection;
}

export function currentModuleDefinition() {
  return navigationState.getModuleDefinition(currentModule());
}

export function currentModuleName() {
  return currentModuleDefinition()?.label || "Unknown";
}

// Get sections for current module
// Create module: Construct and Generate sections are shown when no sequence exists.
// When a sequence exists (canAccessEditAndExportPanels = true), all sections are shown.
// When creation method selector is visible, hide all tabs (user must pick via selector).
// Settings module: AI tab is admin-only.
export function getAccessibleSectionsForModule(module: ModuleId) {
  const baseSections =
    navigationState.getModuleDefinition(module)?.sections || [];

  // Guest tab gating: role-based canAccessTab() passes for the guest's implicit
  // "user" role, so the guest-config tier check is required to keep gated tabs
  // (e.g. browse collections/hall-of-shame) out of mobile + collapsed
  // navigation, mirroring the expanded desktop sidebar (ModuleGroup.svelte).
  // Only subtracts for guests; isTabAccessible returns true for user/premium.
  const accessTier = resolveAccessTier(
    authState.isAuthenticated,
    authState.isAnonymous,
    isPremiumOrAbove(authState.role)
  );

  // Create module section filtering
  if (module === "create") {
    // Filter sections based on user's feature access (role-based) AND the
    // guest-tier gate — mirroring the browse/default branches. Without the
    // isTabAccessible() check, guests saw the Fuse tab on mobile/collapsed nav
    // even though GUEST_MODULE_ACCESS.create excludes it and the desktop sidebar
    // hides it.
    const availableSections = baseSections.filter((section) => {
      return (
        featureFlagService.canAccessTab("create", section.id) &&
        isTabAccessible("create", section.id, accessTier)
      );
    });

    if (!navigationCoordinator.canAccessEditAndExportPanels) {
      return availableSections.filter((section) => {
        // Show all creation method tabs when no sequence exists
        // These are entry points for building sequences, not editing features
        // Use semantic metadata instead of hardcoded IDs
        return section.metadata?.isCreationMethod === true;
      });
    }

    // When sequence exists (edit/export panels accessible), show all sections
    return availableSections;
  }

  // Settings module: Filter tabs based on role
  if (module === "settings") {
    return baseSections.filter((section: { id: string }) => {
      // AI tab is admin-only
      if (section.id === "ai") {
        return featureFlagService.isAdmin;
      }
      return true;
    });
  }

  // Feedback module: Tracker and Manage are admin-only (not ready for public)
  if (module === "feedback") {
    return baseSections.filter((section: { id: string }) => {
      if (section.id === "tracker" || section.id === "manage") {
        return featureFlagService.isAdmin;
      }
      return featureFlagService.canAccessTab("feedback", section.id);
    });
  }

  // Admin module: Filter tabs based on feature flag access
  if (module === "admin") {
    return baseSections.filter((section: { id: string }) => {
      return featureFlagService.canAccessTab("admin", section.id);
    });
  }

  // Browse module: Filter tabs based on feature flag access (collections, hall-of-shame, etc.)
  // plus guest-tier gating so guests see only Gallery (guest-access-config).
  if (module === "browse") {
    return baseSections.filter((section: { id: string }) => {
      return (
        featureFlagService.canAccessTab("browse", section.id) &&
        isTabAccessible("browse", section.id, accessTier)
      );
    });
  }

  // Default: apply feature flag filtering for ALL modules
  // This ensures mobile navigation (which relies on moduleSections()) respects
  // the same canAccessTab() checks that the desktop sidebar applies via getFilteredSections(),
  // plus the guest-tier gating from isTabAccessible() (only subtracts for guests).
  return baseSections.filter((section) => {
    return (
      featureFlagService.canAccessTab(module, section.id) &&
      isTabAccessible(module, section.id, accessTier)
    );
  });
}

export function moduleSections() {
  return getAccessibleSectionsForModule(currentModule());
}

// Module order for determining slide direction
// Settings is included for transition support but accessed via footer gear icon
const MODULE_ORDER = [
  "create",
  "stage",
  "browse",
  "creators",
  "learn",
  "compose",
  "train",
  "feedback",
  "admin",
  "settings",
];

function historySectionFor(
  moduleId: ModuleId,
  requestedSection?: string
): string | undefined {
  if (navigationState.isModuleHomeOpen(moduleId)) {
    return undefined;
  }
  return requestedSection ?? navigationState.activeTab;
}

// Module change handler with View Transitions
// targetTab: Optional tab to navigate to (used when clicking a section in a different module)
// options.forceViewTransition: Force View Transition even when leaving Dashboard (for keyboard shortcuts)
export async function handleModuleChange(
  moduleId: ModuleId,
  targetTab?: string,
  options?: {
    skipHistory?: boolean;
    initiatedByHistory?: boolean;
    forceViewTransition?: boolean;
  }
) {
  markNavigationIntent();

  if (moduleId === "browse") {
    targetTab = normalizeBrowsePrimary(targetTab);
  }

  const currentMod = currentModule();
  const shouldSkipHistory = options?.skipHistory === true;
  const forceTransition = options?.forceViewTransition === true;

  // Skip transition logic if same module
  if (moduleId === currentMod) {
    navigationState.setCurrentModule(
      moduleId,
      targetTab,
      options?.initiatedByHistory ? "history" : "navigation"
    );
    if (!shouldSkipHistory) {
      pushHistoryState(moduleId, historySectionFor(moduleId, targetTab));
    }
    return;
  }

  // Determine direction based on module order
  const currentIndex = MODULE_ORDER.indexOf(currentMod);
  const newIndex = MODULE_ORDER.indexOf(moduleId);
  const goingRight = newIndex > currentIndex;

  const doc = document as DocumentWithViewTransition;

  // Settings portal transitions - special "dimension" feel
  const isEnteringSettings = moduleId === "settings";
  const isExitingSettings = currentMod === "settings";

  // Allow view transitions for most navigation
  // Exception: forceViewTransition (keyboard shortcuts) should always animate
  const shouldUseViewTransition =
    isEnteringSettings || isExitingSettings || forceTransition || true; // Always use view transitions for module changes

  if (
    typeof doc.startViewTransition === "function" &&
    shouldUseViewTransition
  ) {
    if (isEnteringSettings) {
      // ENTERING SETTINGS - Portal expand animation
      // Store where we came from for the return journey (persist to survive HMR)
      navigationCoordinator.previousModuleBeforeSettings = currentMod;
      savePreviousModule(currentMod);

      document.documentElement.classList.add("settings-portal-enter");

      const transition = doc.startViewTransition(async () => {
        navigationState.setCurrentModule(
          moduleId,
          targetTab,
          options?.initiatedByHistory ? "history" : "navigation"
        );
        await switchModule(moduleId);
      });

      const finishSettingsEntry = (): void => {
        document.documentElement.classList.remove("settings-portal-enter");
        if (!shouldSkipHistory) {
          pushHistoryState(moduleId, historySectionFor(moduleId, targetTab));
        }
      };
      afterViewTransitionSettles(transition, finishSettingsEntry);
    } else if (isExitingSettings) {
      // EXITING SETTINGS - Portal collapse animation
      // Restore original entry point for consistent "pull out" to same spot
      restoreSettingsPortalOrigin();
      document.documentElement.classList.add("settings-portal-exit");

      const transition = doc.startViewTransition(async () => {
        navigationState.setCurrentModule(
          moduleId,
          targetTab,
          options?.initiatedByHistory ? "history" : "navigation"
        );
        await switchModule(moduleId);
      });

      const finishSettingsExit = (): void => {
        document.documentElement.classList.remove("settings-portal-exit");
        navigationCoordinator.previousModuleBeforeSettings = null;
        savePreviousModule(null);
        if (!shouldSkipHistory) {
          pushHistoryState(moduleId, historySectionFor(moduleId, targetTab));
        }
      };
      afterViewTransitionSettles(transition, finishSettingsExit);
    } else {
      // Module-to-module: horizontal slide
      document.documentElement.classList.remove(
        "module-slide-left",
        "module-slide-right"
      );
      document.documentElement.classList.add(
        goingRight ? "module-slide-left" : "module-slide-right"
      );

      const transition = doc.startViewTransition(async () => {
        navigationState.setCurrentModule(
          moduleId,
          targetTab,
          options?.initiatedByHistory ? "history" : "navigation"
        );
        await switchModule(moduleId);
      });

      const finishModuleSlide = (): void => {
        document.documentElement.classList.remove(
          "module-slide-left",
          "module-slide-right"
        );
        if (!shouldSkipHistory) {
          pushHistoryState(moduleId, historySectionFor(moduleId, targetTab));
        }
      };
      afterViewTransitionSettles(transition, finishModuleSlide);
    }
  } else {
    // Fallback for browsers without View Transitions
    navigationState.setCurrentModule(
      moduleId,
      targetTab,
      options?.initiatedByHistory ? "history" : "navigation"
    );
    await switchModule(moduleId);
    if (!shouldSkipHistory) {
      pushHistoryState(moduleId, historySectionFor(moduleId, targetTab));
    }
  }
}

// Tab order for determining slide direction (per module)
// Note: Compose module playback is an overlay, not a tab
const TAB_ORDERS: Record<string, string[]> = {
  create: [
    "assemble",
    "construct",
    "generate",
    "shape-engine",
    "fuse",
    "spell",
    "editor",
    "export",
  ],
  browse: ["explore", "you"],
  social: ["community", "connect"],
  learn: ["concepts", "play"],
  compose: ["arrange", "browse"],
  realm: ["stage", "gallery", "worlds"],
  train: ["drills", "challenges", "progress"],
  collect: ["achievements", "badges", "stats"],
  feedback: ["submit", "my-feedback", "tracker", "manage"],
  settings: [
    "profile",
    "release-notes",
    "notifications",
    "props",
    "theme",
    "preferences",
    "keyboard",
    "language",
  ],
};

// Debug flag - enable via: window.__DEBUG_NAV__ = true
function navDebug(...args: unknown[]) {
  if (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__DEBUG_NAV__
  ) {
    console.log("[NavCoord]", ...args);
  }
}

// Section change handler with View Transitions
// Now that Svelte transitions are removed from #key blocks, View Transitions work smoothly
export function handleSectionChange(
  sectionId: string,
  options?: { skipHistory?: boolean; initiatedByHistory?: boolean }
) {
  const module = currentModule();
  if (module === "browse") {
    sectionId = normalizeBrowsePrimary(sectionId);
  }
  const currentSectionId = currentSection();
  const shouldSkipHistory = options?.skipHistory === true;

  navDebug("handleSectionChange called:", {
    targetSection: sectionId,
    currentSection: currentSectionId,
    module,
    skipHistory: shouldSkipHistory,
  });

  // Validate section accessibility via feature flags.
  // Skip the gate when feature flags haven't initialized yet — the role
  // defaults to "user" before auth loads, which incorrectly blocks admin-only
  // tabs on page restore. The reactive moduleSections() will hide/redirect
  // once flags are loaded if the user truly lacks access.
  if (
    featureFlagService.isInitialized &&
    !featureFlagService.canAccessTab(module, sectionId)
  ) {
    console.warn(`⚠️ User does not have access to ${module}:${sectionId} tab`);
    navDebug("BLOCKED: Feature flag denied access");
    if (module === "create") {
      navigationState.setActiveTab("construct");
    }
    return;
  }

  // Selecting the backing method from the Create home still changes the
  // visible surface and URL, even when the remembered tab ID already matches.
  const entersCreateWorkspace =
    module === "create" && navigationState.isCreateFrontDoorOpen;

  // Don't switch if same section and no surface transition is required.
  if (sectionId === currentSectionId && !entersCreateWorkspace) {
    navDebug("SKIPPED: Already on this section");
    return;
  }

  const doc = document as DocumentWithViewTransition;
  const tabOrder = TAB_ORDERS[module] || [];
  const currentIndex = tabOrder.indexOf(currentSectionId);
  const newIndex = tabOrder.indexOf(sectionId);
  const goingRight = newIndex > currentIndex;

  // Helper to update the navigation state
  const updateState = () => {
    navDebug("updateState() executing for:", sectionId);
    if (module === "learn") {
      navigationState.setLearnMode(sectionId);
    } else {
      navigationState.setActiveTab(sectionId);
    }
    navDebug("State after update:", {
      activeTab: navigationState.activeTab,
      currentSection: navigationState.currentSection,
    });
  };

  // Use View Transitions if available
  if (typeof doc.startViewTransition === "function" && !entersCreateWorkspace) {
    // Add direction class for CSS to target
    document.documentElement.classList.remove(
      "tab-slide-left",
      "tab-slide-right"
    );
    document.documentElement.classList.add(
      goingRight ? "tab-slide-left" : "tab-slide-right"
    );

    const transition = doc.startViewTransition(() => {
      updateState();
    });

    const finishTabSlide = (): void => {
      document.documentElement.classList.remove(
        "tab-slide-left",
        "tab-slide-right"
      );
      if (!shouldSkipHistory) {
        pushHistoryState(module as ModuleId, sectionId);
      }
    };
    afterViewTransitionSettles(transition, finishTabSlide);
  } else {
    // Fallback: instant switch for browsers without View Transitions
    updateState();
    if (!shouldSkipHistory) {
      pushHistoryState(module as ModuleId, sectionId);
    }
  }
}

export function handleModuleHome(
  moduleId: ModuleId,
  source: "navigation" | "workspace" | "history" = "workspace",
  options?: { skipHistory?: boolean }
): void {
  if (!navigationState.getModuleDefinition(moduleId)?.home) return;
  const previousSection = navigationState.activeTab;
  const previousModule = navigationState.currentModule;

  if (previousModule !== moduleId) {
    captureEvent("module_home_selected", {
      module_id: moduleId,
      previous_module: previousModule,
      previous_section: previousSection,
      source,
    });
    void handleModuleChange(moduleId, undefined, {
      skipHistory: options?.skipHistory,
      initiatedByHistory: source === "history",
    });
    return;
  }

  navigationState.openModuleHome(moduleId, source);
  captureEvent("module_home_selected", {
    module_id: moduleId,
    previous_section: previousSection,
    source,
  });
  if (moduleId === "create") {
    captureEvent("create_front_door_returned", {
      method: previousSection,
      source,
    });
  }
  if (options?.skipHistory !== true) {
    pushHistoryState(moduleId, undefined);
  }
}

export function handleCreateFrontDoor(
  source: "navigation" | "workspace" | "history" = "workspace",
  options?: { skipHistory?: boolean }
): void {
  handleModuleHome("create", source, options);
}

// Export as a getter function that reads feature flags reactively
// This ensures the module list updates when user role or feature flags change
export function getModuleDefinitions() {
  // Read auth state directly in the getter so it's reactive
  const isAuthInitialized = authState.isInitialized;
  const isFeatureFlagsInitialized = featureFlagService.isInitialized;

  // Read role-based flags BEFORE the filter to establish Svelte reactivity
  // Read reactive values to ensure $derived recalculates when role changes
  // (including when impersonation syncs to debugRoleOverride)
  const _effectiveRole = featureFlagService.effectiveRole;

  // Read flagsVersion directly from $state to ensure $derived recalculates when admin toggles flags
  // This is incremented by updateGlobalFeatureFlag() in the admin UI
  // Must access the $state directly (not through getter) for Svelte 5 reactivity
  const _flagsVersion = featureFlagState.flagsVersion;

  // Also read globalFlagOverrides to ensure reactivity when flags are toggled
  // The object reference changes on each update, so reading it establishes the dependency
  const _globalOverrides = featureFlagState.globalFlagOverrides;

  return ENABLED_MODULE_DEFINITIONS.filter((module) => {
    // Library module is now integrated into Gallery via Community/My Library toggle
    // (Note: "library" is not in ModuleId type but may exist in legacy data)
    if (module.id === ("library" as unknown)) {
      return false;
    }

    // If auth/feature flags not initialized, show core modules optimistically
    // This prevents layout shifts while waiting for auth
    if (!isAuthInitialized || !isFeatureFlagsInitialized) {
      // Only show these core modules before auth is ready
      return ["create", "browse", "creators"].includes(module.id);
    }

    // Defense in depth: adminOnly modules require admin role regardless of feature flags.
    // The feature flag service stores role overrides in localStorage (browser-local),
    // and the PostHog API proxy doesn't exist on the static production site,
    // so we enforce adminOnly directly from the module definition.
    if (module.adminOnly) {
      const effectiveRole = featureFlagService.effectiveRole;
      if (effectiveRole !== "admin") {
        return false;
      }
    }

    // Use feature flag service for all access checks
    // When impersonating, the Impersonator syncs the role to featureFlagService.debugRoleOverride
    // so canAccessModule() automatically respects the impersonated role
    return featureFlagService.canAccessModule(module.id);
  });
}

// ---------------------------------------------------------------------------
// History integration (native back/forward without route-per-tab)
// ---------------------------------------------------------------------------

type HistoryState = { moduleId: ModuleId; sectionId?: string };

/**
 * Read our own payload back out of a history entry.
 *
 * `pushHistoryState` writes through SvelteKit's `pushState`, which does NOT put
 * the payload at the top level — it nests it under `sveltekit:states` alongside
 * its own bookkeeping keys. The popstate handler below read `event.state.moduleId`
 * directly, which is always undefined for an entry we pushed, so it bailed on
 * every single back/forward and the module never followed the URL: press Back
 * after leaving Creators for Browse and the address bar said /creators/{id}
 * while Browse stayed on screen.
 *
 * Both shapes are accepted. Entries pushed by other code (or by an older build)
 * may still carry the flat form, and a history stack outlives a deploy.
 */
function readHistoryState(raw: unknown): HistoryState | null {
  if (!raw || typeof raw !== "object") return null;
  const flat = raw as Partial<HistoryState>;
  if (flat.moduleId) return flat as HistoryState;
  const nested = (raw as Record<string, unknown>)["sveltekit:states"];
  if (nested && typeof nested === "object") {
    const inner = nested as Partial<HistoryState>;
    if (inner.moduleId) return inner as HistoryState;
  }
  return null;
}

/** Modules whose default tab should not appear in the URL (full-screen experiences) */
// The Stage is one surface, not a set of tabs, so its single section never
// belongs in the address bar: /stage, never /stage/scene.
const CLEAN_URL_MODULES: Set<string> = new Set(["museum", "stage"]);
// Keep retired default tab IDs here so an HMR session or old history entry
// cannot put a removed section back into an otherwise sectionless URL.
const RETIRED_DEFAULT_SECTIONS: ReadonlyMap<string, string> = new Map([
  ["museum", "play"],
]);

function buildPath(moduleId: ModuleId, sectionId?: string) {
  const normalizedSectionId = normalizeSectionId(moduleId, sectionId);

  // Browse's outer navigation only knows Explore and You, but those buttons
  // still need to land on a complete inner route. Writing the alias here races
  // Browse's own resolver at the end of the View Transition and used to leave
  // the address bar at /browse/you after the content had already changed.
  if (moduleId === "browse") {
    return normalizeBrowsePrimary(normalizedSectionId) === "you"
      ? "/browse/you/sequences"
      : "/browse/explore/sequences";
  }

  // For clean-URL modules, omit the default section from the path
  if (CLEAN_URL_MODULES.has(moduleId)) {
    const moduleDef = getModuleDefinitions().find((m) => m.id === moduleId);
    const defaultSection =
      moduleDef?.sections?.[0]?.id ?? RETIRED_DEFAULT_SECTIONS.get(moduleId);
    if (!normalizedSectionId || normalizedSectionId === defaultSection) {
      return `/${moduleId}`;
    }
  }
  return normalizedSectionId
    ? `/${moduleId}/${normalizedSectionId}`
    : `/${moduleId}`;
}

function recordNavigationVisit(moduleId: ModuleId, sectionId?: string): void {
  getNavigationVisitPersister().recordVisit(
    buildNavigationDestinationId(
      moduleId,
      normalizeSectionId(moduleId, sectionId)
    )
  );
}

function replaceHistoryState(moduleId: ModuleId, sectionId?: string) {
  if (typeof window === "undefined") return;
  const normalizedSectionId = normalizeSectionId(moduleId, sectionId);
  const url = new URL(window.location.href);
  const canonical = buildPath(moduleId, normalizedSectionId);
  // Deep links carry more path than the canonical /module/tab —
  // /browse/library/{id}?scan=1 (the phone scan handoff) or
  // /creators/{userId}. This runs at boot BEFORE the lazy-loaded
  // module reads the URL, so flattening to the canonical path here would
  // eat those segments and strand the deep link on the tab's list view.
  // Keep the longer pathname whenever it sits under the canonical path.
  const browsePrimary =
    moduleId === "browse" ? normalizeBrowsePrimary(normalizedSectionId) : null;
  const preservesBrowseInnerRoute =
    browsePrimary !== null &&
    (url.pathname === `/browse/${browsePrimary}` ||
      url.pathname.startsWith(`/browse/${browsePrimary}/`));
  if (!preservesBrowseInnerRoute && !url.pathname.startsWith(`${canonical}/`)) {
    url.pathname = canonical;
  }
  url.hash = "";
  pruneRouteScopedParams(url, url.pathname);
  writeUrl(url, { state: { moduleId, sectionId: normalizedSectionId } });
  recordNavigationVisit(moduleId, normalizedSectionId);
}

function pushHistoryState(moduleId: ModuleId, sectionId?: string) {
  if (typeof window === "undefined") return;
  const normalizedSectionId = normalizeSectionId(moduleId, sectionId);
  const url = new URL(window.location.href);
  url.pathname = buildPath(moduleId, normalizedSectionId);
  url.hash = "";
  pruneParamsForNavigation(url, url.pathname);
  writeUrl(url, {
    mode: "push",
    state: { moduleId, sectionId: normalizedSectionId },
  });
  recordNavigationVisit(moduleId, normalizedSectionId);
}

let historyInitialized = false;

/**
 * Parse the URL pathname and extract module/section IDs
 * Expected format: /moduleId or /moduleId/sectionId
 * Also supports query param: /moduleId?section=sectionId
 * Also handles legacy /app prefix and hash format for backwards compatibility
 */
function parsePathNavigation(): {
  moduleId: ModuleId;
  sectionId?: string;
} | null {
  if (typeof window === "undefined") return null;

  // First try pathname (format: /create/construct)
  let pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // Strip legacy /app prefix if present (backwards compatibility)
  if (pathname.startsWith("/app")) {
    pathname = pathname.substring(4); // Remove "/app"
  }

  if (pathname && pathname !== "/") {
    // Remove leading slash and split by /
    const parts = pathname.substring(1).split("/").filter(Boolean);
    let moduleId = parts[0] as ModuleId;
    // Section can come from path (/admin/loop-labeler) OR query param (?section=loop-labeler)
    let sectionId = parts[1] || searchParams.get("section") || undefined;
    const creatorPath = parseCreatorPathname(`/${parts.join("/")}`);
    const browseRoute = resolveBrowsePathname(`/${parts.join("/")}`);

    // Redirect legacy module URLs to their new locations
    // (Note: these IDs are not in ModuleId type but may exist in legacy URLs)
    if (creatorPath) {
      moduleId = "creators";
      sectionId = undefined;

      if (creatorPath.isLegacy) {
        const url = new URL(window.location.href);
        url.pathname = creatorPath.canonicalPath;
        writeUrl(url, { state: { moduleId: "creators" } });
      }
    } else if (browseRoute) {
      if (browseRoute.externalRedirect) {
        window.location.replace(browseRoute.externalRedirect);
        return null;
      }

      moduleId = "browse" as ModuleId;
      sectionId = browseRoute.location.primary;
      if (browseRoute.isLegacy) {
        const url = new URL(window.location.href);
        url.pathname = browseRoute.canonicalPath;
        writeUrl(url, {
          state: { moduleId: "browse", sectionId },
        });
      }
    } else if (moduleId === ("dashboard" as unknown)) {
      // Dashboard removed Jan 2026 - Create is now the default landing
      moduleId = "create" as ModuleId;
    }

    // Validate module exists
    let moduleDefinition = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
    if (moduleDefinition) {
      // A section that moved to another module (e.g. /toys/shape-matrix) resolves
      // to its new home; the seeded history entry below rewrites the URL.
      const target = normalizeNavigationTarget(moduleId, sectionId);
      if (target.moduleId !== moduleId) {
        moduleId = target.moduleId;
        moduleDefinition = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
      }
      sectionId = target.sectionId;
      // If section is provided, validate it exists for this module
      if (sectionId) {
        const validSection = moduleDefinition?.sections.some(
          (s) => s.id === sectionId
        );
        if (!validSection) {
          // Module is valid but section isn't - return module only
          return { moduleId };
        }
        return { moduleId, sectionId };
      }
      return { moduleId };
    }
  }

  // Fallback: check for legacy hash format (#create/construct)
  // This provides backwards compatibility for existing bookmarks
  const hash = window.location.hash;
  if (hash && hash !== "#") {
    const parts = hash.substring(1).split("/");
    let moduleId = parts[0] as ModuleId;
    let sectionId = parts[1];

    // Redirect legacy hash URLs to their new locations
    // (Note: these IDs are not in ModuleId type but may exist in legacy hash URLs)
    if (moduleId === ("library" as unknown)) {
      moduleId = "browse" as ModuleId;
    } else if (moduleId === ("dashboard" as unknown)) {
      // Dashboard removed Jan 2026 - Create is now the default landing
      moduleId = "create" as ModuleId;
    }

    const moduleDefinition = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
    if (moduleDefinition) {
      sectionId = normalizeSectionId(moduleId, sectionId);
      if (sectionId) {
        const validSection = moduleDefinition.sections.some(
          (s) => s.id === sectionId
        );
        if (!validSection) {
          return { moduleId };
        }
        return { moduleId, sectionId };
      }
      return { moduleId };
    }
  }

  return null;
}

export function initializeNavigationHistory() {
  if (historyInitialized || typeof window === "undefined") return;

  // Focused app surfaces use auth and the shared application bootstrap, but
  // they own their URL and content. Seeding module history here would rewrite
  // an unknown first segment such as /start to the current app module.
  if (isStandaloneAppSurface(window.location.pathname)) return;

  historyInitialized = true;

  // First, parse the URL pathname to see if user navigated directly to a specific module/tab
  // Also handles legacy hash URLs for backwards compatibility
  const pathNav = parsePathNavigation();
  if (pathNav) {
    // On fresh page load (not HMR), don't restore heavyweight 3D modules from the URL.
    // sessionStorage is cleared by hard reload (Ctrl+Shift+R) but survives HMR remounts,
    // so its presence reliably distinguishes the two cases.
    const isHmrRemount =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("tka-nav-session-active") === "1";
    const isHeavyweight = pathNav.moduleId === "museum";

    // Block direct-URL access to adminOnly modules for non-admins. The nav-surface
    // filter (getModuleDefinitions) hides them, but parsePathNavigation resolves
    // against the unfiltered MODULE_DEFINITIONS, so a direct hit would otherwise
    // mount a gated module. Skip the gate until feature flags initialize — role
    // defaults to "user" pre-auth and would wrongly block admins on page restore
    // (same timing guard as handleSectionChange).
    const targetModuleDef = MODULE_DEFINITIONS.find(
      (m) => m.id === pathNav.moduleId
    );
    const isGatedForNonAdmin =
      targetModuleDef?.adminOnly === true &&
      featureFlagService.isInitialized &&
      featureFlagService.effectiveRole !== "admin";

    if (!isHmrRemount && isHeavyweight) {
      // Redirect to default module instead of re-mounting heavy 3D content
      navigationState.setCurrentModule("create");
    } else if (isGatedForNonAdmin) {
      // Non-admin hit a gated module URL directly — land on the default consumer module
      navigationState.setCurrentModule("create");
    } else {
      // URL has a valid module/section - navigate to it (overrides localStorage)
      if (pathNav.moduleId !== navigationState.currentModule) {
        navigationState.setCurrentModule(pathNav.moduleId, pathNav.sectionId);
      } else if (
        pathNav.sectionId &&
        pathNav.sectionId !== navigationState.activeTab
      ) {
        navigationState.setActiveTab(pathNav.sectionId);
      }

      // If user came from legacy hash URL, update to new path format
      if (window.location.hash && window.location.hash !== "#") {
        replaceHistoryState(pathNav.moduleId, pathNav.sectionId);
      }
    }
  }

  // Seed initial state so back/forward has a valid entry
  replaceHistoryState(
    navigationState.currentModule,
    historySectionFor(navigationState.currentModule)
  );

  window.addEventListener("popstate", async (event: PopStateEvent) => {
    const state = readHistoryState(event.state);
    if (!state?.moduleId) return;

    // Redirect legacy history entries to their new locations
    // (Note: these IDs are not in ModuleId type but may exist in legacy history)
    let targetModule = state.moduleId;
    let targetSection = state.sectionId;
    let needsHistoryUpdate = false;

    const browseHistoryRoute = resolveBrowsePathname(window.location.pathname);
    if (browseHistoryRoute) {
      if (browseHistoryRoute.externalRedirect) {
        window.location.replace(browseHistoryRoute.externalRedirect);
        return;
      }
      targetModule = "browse" as ModuleId;
      targetSection = browseHistoryRoute.location.primary;
      if (browseHistoryRoute.isLegacy) {
        const url = new URL(window.location.href);
        url.pathname = browseHistoryRoute.canonicalPath;
        writeUrl(url, {
          state: { moduleId: targetModule, sectionId: targetSection },
        });
      }
    } else if (targetModule === ("dashboard" as unknown)) {
      // Dashboard removed Jan 2026 - Create is now the default landing
      targetModule = "create" as ModuleId;
      targetSection = undefined;
      needsHistoryUpdate = true;
    }

    const normalizedTarget = normalizeNavigationTarget(
      targetModule,
      targetSection
    );
    if (
      normalizedTarget.moduleId !== targetModule ||
      normalizedTarget.sectionId !== targetSection
    ) {
      targetModule = normalizedTarget.moduleId;
      targetSection = normalizedTarget.sectionId;
      needsHistoryUpdate = true;
    }

    if (needsHistoryUpdate) {
      // Update URL to new path
      replaceHistoryState(targetModule, targetSection);
    }

    if (targetModule !== navigationState.currentModule) {
      await handleModuleChange(targetModule, targetSection, {
        skipHistory: true,
        initiatedByHistory: true,
      });
    } else if (
      targetSection &&
      (targetSection !== navigationState.activeTab ||
        (targetModule === "create" && navigationState.isCreateFrontDoorOpen))
    ) {
      handleSectionChange(targetSection, {
        skipHistory: true,
        initiatedByHistory: true,
      });
    } else if (
      !targetSection &&
      MODULE_DEFINITIONS.some(
        (definition) => definition.id === targetModule && definition.home
      )
    ) {
      handleModuleHome(targetModule, "history", { skipHistory: true });
    } else if (!targetSection && navigationState.activeTab) {
      // Module with no stored tab; clear any lingering tab state
      navigationState.setActiveTab("");
    }

    recordNavigationVisit(targetModule, targetSection);
  });
}
