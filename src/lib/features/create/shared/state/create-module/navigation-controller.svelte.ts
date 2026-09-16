/**
 * Navigation Controller
 *
 * Owns active section transitions, navigation history, and toggle sync.
 * All persistence-aware concerns are delegated to the persistence controller.
 */

import type { BuildModeId } from "$lib/shared/foundation/ui/ui-types";
import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type { SequenceState } from "../sequence-state-orchestrator.svelte";
import type { CreateModulePersistenceController } from "./persistence-controller.svelte";

type NavigationHistoryEntry = {
  panel: BuildModeId;
  timestamp: number;
};

const MAX_HISTORY = 10;

type ConstructTabState =
  | {
      setShowStartPlacementPicker: (show: boolean) => void;
      setSelectedStartPlacement: (value: unknown) => void;
    }
  | null
  | undefined;

type NavigationControllerDeps = {
  sequenceState: SequenceState;
  persistenceController: CreateModulePersistenceController;
  getConstructTabState: () => ConstructTabState;
};

const CREATION_MODES: BuildModeId[] = [
  "construct",
  "assemble",
  "generate",
  "fuse",
  "tunnel",
  // REMOVED: "spell" - unified into Generate tab (Feb 2026)
] as const;

const isCreationMode = (mode: BuildModeId) =>
  CREATION_MODES.includes(mode as (typeof CREATION_MODES)[number]);

export function createNavigationController({
  sequenceState,
  persistenceController,
  getConstructTabState,
}: NavigationControllerDeps) {
  let activeSection = $state<BuildModeId>("construct");
  let lastContentTab = $state<"generate" | "construct">("construct");
  const navigationHistory = $state<NavigationHistoryEntry[]>([]);
  let isNavigatingBack = $state(false);
  let isUpdatingFromToggle = $state(false);

  const canGoBack = $derived(navigationHistory.length > 0);

  function bootstrap(section: BuildModeId) {
    activeSection = section;
  }

  async function setActiveToolPanel(panel: BuildModeId) {
    isUpdatingFromToggle = true;
    await setActiveToolPanelInternal(panel, true);
    navigationState.setCurrentSection(panel);
    setTimeout(() => {
      isUpdatingFromToggle = false;
    }, 0);
  }

  async function setActiveToolPanelInternal(
    panel: BuildModeId,
    addToHistory: boolean = true
  ) {
    const previousMode = activeSection;
    const isModeSwitching =
      previousMode !== panel &&
      isCreationMode(previousMode) &&
      isCreationMode(panel);

    if (isModeSwitching && persistenceController.isInitialized) {
      await persistenceController.saveCurrentState(previousMode);
    }

    if (
      (activeSection === "generate" || activeSection === "construct") &&
      activeSection !== panel
    ) {
      lastContentTab = activeSection;
    }

    if (addToHistory && activeSection !== panel) {
      navigationHistory.push({
        panel: activeSection,
        timestamp: Date.now(),
      });

      if (navigationHistory.length > MAX_HISTORY) {
        navigationHistory.shift();
      }
    }

    activeSection = panel;

    if (isModeSwitching && persistenceController.isInitialized) {
      await persistenceController.restoreWorkspaceForMode(
        panel,
        getConstructTabState()
      );
    } else if (!isModeSwitching) {
      await persistenceController.saveCurrentState(activeSection);
    }

    sequenceState.updateCachedActiveTab(panel);
  }

  async function goBack() {
    if (navigationHistory.length === 0) {
      return;
    }

    const previous = navigationHistory.pop();
    if (!previous) {
      return;
    }

    isNavigatingBack = true;
    await setActiveToolPanelInternal(previous.panel, false);
    setTimeout(() => {
      isNavigatingBack = false;
    }, 0);
  }

  return {
    get activeSection() {
      return activeSection;
    },
    get lastContentTab() {
      return lastContentTab;
    },
    get navigationHistory() {
      return navigationHistory;
    },
    get isNavigatingBack() {
      return isNavigatingBack;
    },
    get isUpdatingFromToggle() {
      return isUpdatingFromToggle;
    },
    get canGoBack() {
      return canGoBack;
    },
    bootstrap,
    setActiveToolPanel,
    setActiveToolPanelInternal,
    goBack,
  };
}

export type NavigationController = ReturnType<
  typeof createNavigationController
>;
