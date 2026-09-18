import type { ModuleDefinition, ModuleId, Section } from "../domain/types";
import { logModuleView } from "../../analytics/services/posthog-activity-logger";

import {
  CREATE_TABS,
  DEFAULT_CREATE_TAB,
  LEARN_TABS,
  BROWSE_TABS,
  LIBRARY_TABS,
  COMMUNITY_TABS,
  ADMIN_TABS,
  ACCOUNT_TABS,
  SETTINGS_TABS,
} from "../config/tab-definitions";

import {
  MODULE_DEFINITIONS,
  normalizeModuleId,
  normalizeNavigationTarget,
  normalizeSectionId,
} from "../config/module-definitions";

import {
  CURRENT_MODULE_KEY,
  ACTIVE_TAB_KEY,
  MODULE_LAST_TABS_KEY,
  CURRENT_CREATE_MODE_KEY,
  CURRENT_LEARN_MODE_KEY,
  PREVIOUS_MODULE_SESSION_KEY,
  PREVIOUS_TAB_SESSION_KEY,
} from "../config/storage-keys";

import { panelPersistenceState } from "./panel-persistence-state.svelte";

import { hasMimeErrorOccurred, verifyTabSwitch } from "../../hmr-helper";

export type CreateFrontDoorSource =
  | "direct"
  | "navigation"
  | "workspace"
  | "history";

export {
  CREATE_TABS,
  LEARN_TABS,
  BROWSE_TABS,
  LIBRARY_TABS,
  COMMUNITY_TABS,
  COMPOSE_TABS,
  ADMIN_TABS,
  ACCOUNT_TABS,
  SETTINGS_TABS,
  COLLECT_TABS,
  BUILD_TABS,
  COLLECTION_TABS,
  ABOUT_TABS,
  EDIT_TABS,
  ML_TRAINING_TABS,
  FEEDBACK_TABS,
  TRAIN_TABS,
} from "../config/tab-definitions";

export {
  MODULE_DEFINITIONS,
  ENABLED_MODULE_DEFINITIONS,
} from "../config/module-definitions";

export function createNavigationState() {
  let currentCreateMode = $state<string>("construct");
  let currentLearnMode = $state<string>("concepts");

  // A module home is navigation intent, not a fake tab. The active tab remains
  // valid behind it so returning to a workspace restores in-progress work.
  let activeModuleHome = $state<ModuleId | null>("create");
  let createFrontDoorSource = $state<CreateFrontDoorSource>("direct");
  let hasRememberedCreateMode = $state(false);

  let currentModule = $state<ModuleId>("create");
  let activeTab = $state<string>(DEFAULT_CREATE_TAB);

  let previousModule = $state<ModuleId | null>(loadPreviousModuleFromSession());

  let previousTab = $state<string>(loadPreviousTabFromSession());

  function loadPreviousModuleFromSession(): ModuleId | null {
    if (typeof sessionStorage === "undefined") return null;
    const saved = sessionStorage.getItem(PREVIOUS_MODULE_SESSION_KEY);
    if (saved && MODULE_DEFINITIONS.some((m) => m.id === saved)) {
      return saved as ModuleId;
    }
    return null;
  }

  function savePreviousModuleToSession(moduleId: ModuleId | null) {
    if (typeof sessionStorage === "undefined") return;
    if (moduleId) {
      sessionStorage.setItem(PREVIOUS_MODULE_SESSION_KEY, moduleId);
    } else {
      sessionStorage.removeItem(PREVIOUS_MODULE_SESSION_KEY);
    }
  }

  function loadPreviousTabFromSession(): string {
    if (typeof sessionStorage === "undefined") return "";
    return sessionStorage.getItem(PREVIOUS_TAB_SESSION_KEY) || "";
  }

  function savePreviousTabToSession(tabId: string) {
    if (typeof sessionStorage === "undefined") return;
    if (tabId) {
      sessionStorage.setItem(PREVIOUS_TAB_SESSION_KEY, tabId);
    } else {
      sessionStorage.removeItem(PREVIOUS_TAB_SESSION_KEY);
    }
  }

  function saveModuleTab(moduleId: string, tabId: string) {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(MODULE_LAST_TABS_KEY);
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      map[moduleId] = tabId;
      localStorage.setItem(MODULE_LAST_TABS_KEY, JSON.stringify(map));
    } catch {
      localStorage.setItem(
        MODULE_LAST_TABS_KEY,
        JSON.stringify({ [moduleId]: tabId })
      );
    }
  }

  function loadModuleTab(moduleId: string): string | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(MODULE_LAST_TABS_KEY);
      if (!raw) return null;
      const map: Record<string, string> = JSON.parse(raw);
      const savedTab = map[moduleId] || null;
      const normalizedTab = normalizeSectionId(moduleId, savedTab);
      if (normalizedTab && normalizedTab !== savedTab) {
        map[moduleId] = normalizedTab;
        localStorage.setItem(MODULE_LAST_TABS_KEY, JSON.stringify(map));
      }
      return normalizedTab ?? null;
    } catch {
      return null;
    }
  }

  const HEAVYWEIGHT_MODULES: ReadonlySet<string> = new Set(["realm"]);

  const HMR_SESSION_KEY = "tka-nav-session-active";
  let isHmrRemount = false;
  if (typeof sessionStorage !== "undefined") {
    isHmrRemount = sessionStorage.getItem(HMR_SESSION_KEY) === "1";
    sessionStorage.setItem(HMR_SESSION_KEY, "1");
  }

  if (typeof localStorage !== "undefined") {
    const savedCreateMode = localStorage.getItem(CURRENT_CREATE_MODE_KEY);
    if (savedCreateMode && CREATE_TABS.some((t) => t.id === savedCreateMode)) {
      currentCreateMode = savedCreateMode;
      hasRememberedCreateMode = true;
    }

    const savedLearnMode = localStorage.getItem(CURRENT_LEARN_MODE_KEY);
    if (savedLearnMode && LEARN_TABS.some((t) => t.id === savedLearnMode)) {
      currentLearnMode = savedLearnMode;
    }

    const savedModule = localStorage.getItem(CURRENT_MODULE_KEY);
    if (savedModule) {
      const normalizedSavedModule = normalizeModuleId(savedModule);
      if (normalizedSavedModule) {
        if (!isHmrRemount && HEAVYWEIGHT_MODULES.has(normalizedSavedModule)) {
          currentModule = "create";
          localStorage.setItem(CURRENT_MODULE_KEY, "create");
        } else {
          currentModule = normalizedSavedModule;
          if (normalizedSavedModule !== savedModule) {
            localStorage.setItem(CURRENT_MODULE_KEY, normalizedSavedModule);
          }
        }
      } else {
        console.warn(
          `Invalid module "${savedModule}" in localStorage, using default`
        );
        currentModule = "create";
        localStorage.setItem(CURRENT_MODULE_KEY, "create");
      }
    }

    panelPersistenceState.loadFromStorage((tabKey: string) => {
      const [moduleId, tabId] = tabKey.split(":");
      if (!moduleId || !tabId) return false;
      const moduleDefinition = MODULE_DEFINITIONS.find(
        (m) => m.id === moduleId
      );
      return (
        moduleDefinition?.sections.some((tab) => tab.id === tabId) ?? false
      );
    });

    if (typeof window !== "undefined") {
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);

      const pathParts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);

      const firstPart = pathParts[0];
      if (pathParts.length >= 1 && firstPart) {
        const rawUrlModule = firstPart.toLowerCase();
        let urlTab =
          pathParts[1]?.toLowerCase() ||
          searchParams.get("section")?.toLowerCase();

        let normalizedModule = normalizeModuleId(rawUrlModule);
        if (normalizedModule) {
          const target = normalizeNavigationTarget(normalizedModule, urlTab);
          normalizedModule = target.moduleId;
          urlTab = target.sectionId;
        }

        // Moderation folded into Admin as a tab (2026-06-30): a bare /moderation
        // deep link normalizes to the Admin module — open its Moderation tab.
        if (rawUrlModule === "moderation" && !urlTab) urlTab = "moderation";

        const urlModuleDefinition = normalizedModule
          ? MODULE_DEFINITIONS.find((m) => m.id === normalizedModule)
          : null;

        if (urlModuleDefinition && normalizedModule) {
          if (!isHmrRemount && HEAVYWEIGHT_MODULES.has(normalizedModule)) {
            currentModule = "create";
            activeTab = DEFAULT_CREATE_TAB;
          } else {
            currentModule = normalizedModule;
            activeModuleHome = null;

            if (urlModuleDefinition.sections.length > 0) {
              const validTab = urlTab
                ? urlModuleDefinition.sections.find((s) => s.id === urlTab)
                : null;

              if (validTab && urlTab) {
                activeTab = urlTab;
                if (normalizedModule === "create") {
                  activeModuleHome = null;
                  hasRememberedCreateMode = true;
                }
              } else if (normalizedModule === "create") {
                // Bare /create is a generic creation intent. Keep the last
                // valid method as the backing tab so returning through the
                // chooser can restore its state without pretending it is a
                // separate navigation section.
                activeTab = currentCreateMode || DEFAULT_CREATE_TAB;
                activeModuleHome = "create";
                createFrontDoorSource = "direct";
              } else {
                const savedTab = loadModuleTab(normalizedModule);
                if (
                  savedTab &&
                  urlModuleDefinition.sections.some((s) => s.id === savedTab)
                ) {
                  activeTab = savedTab;
                } else {
                  activeTab = urlModuleDefinition.sections[0]?.id || "";
                }
              }
            } else {
              activeTab = "";
              activeModuleHome = urlModuleDefinition.home
                ? normalizedModule
                : null;
            }
          }
        } else {
          currentModule = "create";
          activeTab = DEFAULT_CREATE_TAB;
          activeModuleHome = "create";
          createFrontDoorSource = "direct";
        }
      }
    }

    const moduleAtInit = currentModule;
    const tabAtInit = activeTab;
    if (
      moduleAtInit === "learn" &&
      LEARN_TABS.some((t) => t.id === tabAtInit)
    ) {
      currentLearnMode = tabAtInit;
    } else if (
      moduleAtInit === "create" &&
      CREATE_TABS.some((t) => t.id === tabAtInit)
    ) {
      currentCreateMode = tabAtInit;
    }
  }

  function setCreateMode(mode: string) {
    if (CREATE_TABS.some((t) => t.id === mode)) {
      currentCreateMode = mode;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CURRENT_CREATE_MODE_KEY, mode);
      }
    }
  }

  function setLearnMode(mode: string) {
    if (LEARN_TABS.some((t) => t.id === mode)) {
      currentLearnMode = mode;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CURRENT_LEARN_MODE_KEY, mode);
      }
      if (currentModule === "learn") {
        activeTab = mode;
      }
    }
  }

  function setCurrentModule(
    moduleId: ModuleId,
    targetTab?: string,
    entrySource: CreateFrontDoorSource = "navigation"
  ) {
    if (MODULE_DEFINITIONS.some((m) => m.id === moduleId)) {
      const previousModuleLocal = currentModule;

      if (currentModule !== moduleId) {
        if (
          currentModule &&
          currentModule !== "feedback" &&
          currentModule !== "settings"
        ) {
          previousModule = currentModule;
          previousTab = activeTab;
          savePreviousModuleToSession(currentModule);
          savePreviousTabToSession(activeTab);
        }
      }

      currentModule = moduleId;

      const moduleDefinition = MODULE_DEFINITIONS.find(
        (m) => m.id === moduleId
      );
      const normalizedTargetTab = normalizeSectionId(moduleId, targetTab);
      let nextTab = "";
      if (moduleDefinition && moduleDefinition.sections.length > 0) {
        if (
          normalizedTargetTab &&
          moduleDefinition.sections.some(
            (tab) => tab.id === normalizedTargetTab
          )
        ) {
          nextTab = normalizedTargetTab;
        } else {
          const savedTab = loadModuleTab(moduleId);
          if (
            savedTab &&
            moduleDefinition.sections.some((tab) => tab.id === savedTab)
          ) {
            nextTab = savedTab;
          } else {
            nextTab =
              moduleId === "create"
                ? DEFAULT_CREATE_TAB
                : moduleDefinition.sections[0]?.id || "";
          }
        }
      }

      activeTab = nextTab;

      activeModuleHome =
        moduleDefinition?.home && !normalizedTargetTab ? moduleId : null;

      if (moduleId === "create") {
        if (normalizedTargetTab) {
          hasRememberedCreateMode = true;
        } else {
          createFrontDoorSource = entrySource;
        }
      }

      if (previousModuleLocal !== moduleId) {
        try {
          const moduleWithTab = nextTab ? `${moduleId}:${nextTab}` : moduleId;
          void logModuleView(moduleWithTab, previousModuleLocal);
        } catch {
          // ignore
        }

        void import("../../presence/get-presence-tracker")
          .then(({ getPresenceTracker }) => {
            getPresenceTracker().updateLocation(moduleId, nextTab || null);
          })
          .catch(() => {});
      }

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CURRENT_MODULE_KEY, moduleId);
        if (nextTab) {
          localStorage.setItem(ACTIVE_TAB_KEY, nextTab);
          saveModuleTab(moduleId, nextTab);
        } else {
          localStorage.removeItem(ACTIVE_TAB_KEY);
        }
      }

      const tab = getActiveTab();
      if (moduleId === "create") {
        setCreateMode(tab);
      } else if (moduleId === "learn") {
        setLearnMode(tab);
      }
    }
  }

  function setActiveTab(tabId: string) {
    const normalizedTabId = normalizeSectionId(currentModule, tabId);
    if (!normalizedTabId) return;

    const debug =
      typeof window !== "undefined" &&
      (window as unknown as Record<string, unknown>).__DEBUG_NAV__;

    const moduleDefinition = MODULE_DEFINITIONS.find(
      (m) => m.id === currentModule
    );
    const tabExists = moduleDefinition?.sections.some(
      (tab) => tab.id === normalizedTabId
    );

    if (debug) {
      console.log("[NavState] setActiveTab called:", {
        tabId,
        normalizedTabId,
        currentModule,
        moduleFound: !!moduleDefinition,
        tabExists,
        availableTabs: moduleDefinition?.sections.map((s) => s.id),
        currentActiveTab: activeTab,
      });
    }

    if (!moduleDefinition || !tabExists) {
      return;
    }

    activeModuleHome = null;

    if (currentModule === "create") {
      hasRememberedCreateMode = true;
    }

    const previousTab = activeTab;

    activeTab = normalizedTabId;

    if (previousTab === normalizedTabId) {
      return;
    }

    try {
      const moduleWithTab = `${currentModule}:${normalizedTabId}`;
      const previousModuleWithTab = `${currentModule}:${previousTab}`;
      void logModuleView(moduleWithTab, previousModuleWithTab);
    } catch {
      // ignore
    }

    try {
      import("../../presence/get-presence-tracker")
        .then(({ getPresenceTracker }) => {
          void getPresenceTracker().updateLocation(
            currentModule,
            normalizedTabId
          );
        })
        .catch(() => {
          /* presence is non-critical */
        });
    } catch {
      // ignore
    }

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ACTIVE_TAB_KEY, normalizedTabId);
      saveModuleTab(currentModule, normalizedTabId);
    }

    const module = getCurrentModule();
    if (module === "create") {
      setCreateMode(normalizedTabId);
    } else if (module === "learn") {
      setLearnMode(normalizedTabId);
    }

    if (import.meta.env.DEV && hasMimeErrorOccurred()) {
      void verifyTabSwitch(normalizedTabId, 200);
    }
  }

  function getCurrentModule(): ModuleId {
    return currentModule;
  }

  function getActiveTab(): string {
    return activeTab;
  }

  function getTabsForModule(moduleId: ModuleId): Section[] {
    const moduleDefinition = MODULE_DEFINITIONS.find((m) => m.id === moduleId);
    return moduleDefinition ? moduleDefinition.sections : [];
  }

  function getModuleDefinition(
    moduleId: ModuleId
  ): ModuleDefinition | undefined {
    return MODULE_DEFINITIONS.find((m) => m.id === moduleId);
  }

  function updateTabAccessibility(tabId: string, disabled: boolean) {
    const tab = CREATE_TABS.find((t) => t.id === tabId);
    if (tab) {
      tab.disabled = disabled;
    }
  }

  function openModuleHome(
    moduleId: ModuleId,
    source: CreateFrontDoorSource = "navigation"
  ): void {
    const moduleDefinition = MODULE_DEFINITIONS.find(
      (definition) => definition.id === moduleId
    );
    if (currentModule !== moduleId || !moduleDefinition?.home) return;
    activeModuleHome = moduleId;
    if (moduleId === "create") createFrontDoorSource = source;
  }

  function openCreateFrontDoor(
    source: CreateFrontDoorSource = "navigation"
  ): void {
    openModuleHome("create", source);
  }

  return {
    get currentCreateMode() {
      return currentCreateMode;
    },
    get currentLearnMode() {
      return currentLearnMode;
    },
    get isCreateFrontDoorOpen() {
      return activeModuleHome === "create";
    },
    get activeModuleHome() {
      return activeModuleHome;
    },
    get createFrontDoorSource() {
      return createFrontDoorSource;
    },
    get hasRememberedCreateMode() {
      return hasRememberedCreateMode;
    },

    get currentModule() {
      return currentModule;
    },
    get activeTab() {
      return activeTab;
    },
    get previousModule() {
      return previousModule;
    },
    get previousTab() {
      return previousTab;
    },

    get createTabs() {
      return CREATE_TABS;
    },
    get learnTabs() {
      return LEARN_TABS;
    },
    get browseTabs() {
      return BROWSE_TABS;
    },
    get communityTabs() {
      return COMMUNITY_TABS;
    },
    get libraryTabs() {
      return LIBRARY_TABS;
    },
    get adminTabs() {
      return ADMIN_TABS;
    },
    get accountTabs() {
      return ACCOUNT_TABS;
    },
    get settingsTabs() {
      return SETTINGS_TABS;
    },
    get moduleDefinitions() {
      return MODULE_DEFINITIONS;
    },

    /** @deprecated Use createTabs instead */
    get CreateModules() {
      return CREATE_TABS;
    },
    /** @deprecated Use createTabs instead */
    get buildModes() {
      return CREATE_TABS;
    },
    /** @deprecated Use createTabs instead */
    get createModes() {
      return CREATE_TABS;
    },
    /** @deprecated Use currentCreateMode instead */
    get currentBuildMode() {
      return currentCreateMode;
    },
    /** @deprecated Use learnTabs instead */
    get learnModes() {
      return LEARN_TABS;
    },
    /** @deprecated Use browseTabs instead */
    get browseModes() {
      return BROWSE_TABS;
    },
    /** @deprecated Use browseTabs instead */
    get BrowseModes() {
      return BROWSE_TABS;
    },
    /** @deprecated Use activeTab instead */
    get currentSection() {
      return activeTab;
    },

    setCreateMode,
    setLearnMode,

    setCurrentModule,
    setActiveTab,
    openModuleHome,
    openCreateFrontDoor,
    isModuleHomeOpen(moduleId: ModuleId) {
      return currentModule === moduleId && activeModuleHome === moduleId;
    },
    getCurrentModule,
    getActiveTab,
    getTabsForModule,
    getModuleDefinition,
    updateTabAccessibility,

    getLastPanelForTab(moduleId?: ModuleId, tabId?: string): string | null {
      const module = moduleId ?? currentModule;
      const tab = tabId ?? activeTab;
      return panelPersistenceState.getLastPanel(`${module}:${tab}`);
    },

    setLastPanelForTab(
      panelId: string | null,
      moduleId?: ModuleId,
      tabId?: string
    ) {
      const module = moduleId ?? currentModule;
      const tab = tabId ?? activeTab;
      panelPersistenceState.setLastPanel(`${module}:${tab}`, panelId);
    },

    clearPanelForTab(moduleId?: ModuleId, tabId?: string) {
      const module = moduleId ?? currentModule;
      const tab = tabId ?? activeTab;
      panelPersistenceState.clearPanel(`${module}:${tab}`);
    },

    /** @deprecated Use setCreateMode instead */
    setBuildMode: setCreateMode,
    /** @deprecated Use setActiveTab instead */
    setCurrentSection: setActiveTab,
    /** @deprecated Use getActiveTab instead */
    getCurrentSection: getActiveTab,
    /** @deprecated Use getTabsForModule instead */
    getSectionsForModule: getTabsForModule,
  };
}

export type NavigationState = ReturnType<typeof createNavigationState>;

export const navigationState = createNavigationState();

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__navState = navigationState;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
