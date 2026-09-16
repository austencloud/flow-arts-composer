/**
 * Simplified Start Placement State
 *
 * Based on the working legacy implementation - simple and effective.
 * No over-engineering, just the core functionality needed.
 */

import { settingsService as settingsServiceSingleton } from "$lib/shared/settings/state/settings-state.svelte";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { startPlacementManager } from "$lib/shared/create/services/start-placement-manager";

export function createSimplifiedStartPlacementState() {
  let settingsService: SettingsState | null = null;

  function getSettingsServiceSync(): SettingsState {
    if (!settingsService) {
      settingsService = settingsServiceSingleton;
    }
    return settingsService!;
  }

  // Simple reactive state - just what we need
  let placements = $state<PictographData[]>([]);
  let allVariations = $state<PictographData[]>([]);
  let selectedPlacement = $state<PictographData | null>(null);
  let currentGridMode = $state<GridMode>(GridMode.DIAMOND); // Default, loaded async
  let leftOri = $state<Orientation>(Orientation.IN);
  let rightOri = $state<Orientation>(Orientation.IN);
  const selectionListeners = new Set<
    (placement: PictographData | null, source: "user" | "sync") => void
  >();

  function notifySelectionChange(
    placement: PictographData | null,
    source: "user" | "sync" = "user"
  ) {
    selectionListeners.forEach((listener) => {
      try {
        listener(placement, source);
      } catch (error) {
        console.error("? start-placement-state: listener error", error);
      }
    });
  }

  // Load placements on initialization - always succeeds with hardcoded placements
  async function loadPlacements(gridMode: GridMode = currentGridMode) {
    currentGridMode = gridMode;
    placements = await startPlacementManager.getStartPlacements(gridMode, leftOri, rightOri);

    // Persist grid mode to settings when it changes
    try {
      const settings = getSettingsServiceSync();
      await settings.updateSetting("gridMode", gridMode);
    } catch (error) {
      console.warn("Failed to persist grid mode to settings", error);
    }
  }

  // Set grid mode directly without loading placements
  // Useful when importing a sequence where we just need the mode to match
  function setGridMode(gridMode: GridMode) {
    if (currentGridMode !== gridMode) {
      currentGridMode = gridMode;
    }
  }

  // Load all 16 start placement variations for the current grid mode
  async function loadAllVariations(gridMode: GridMode = currentGridMode) {
    currentGridMode = gridMode;
    allVariations = startPlacementManager.getAllStartPlacementVariations(gridMode, leftOri, rightOri);

    // Persist grid mode to settings when it changes
    try {
      const settings = getSettingsServiceSync();
      await settings.updateSetting("gridMode", gridMode);
    } catch (error) {
      console.warn("Failed to persist grid mode to settings", error);
    }
  }

  // Regenerate all placement sets with current orientations
  async function regeneratePlacements() {
    placements = await startPlacementManager.getStartPlacements(currentGridMode, leftOri, rightOri);
    allVariations = startPlacementManager.getAllStartPlacementVariations(currentGridMode, leftOri, rightOri);
  }

  // Change blue orientation and reload placements
  async function setLeftOrientation(orientation: Orientation) {
    leftOri = orientation;
    await regeneratePlacements();
  }

  // Change red orientation and reload placements
  async function setRightOrientation(orientation: Orientation) {
    rightOri = orientation;
    await regeneratePlacements();
  }

  // Convenience: set both orientations at once
  async function setOrientation(orientation: Orientation) {
    leftOri = orientation;
    rightOri = orientation;
    await regeneratePlacements();
  }

  // Select a placement
  async function selectPlacement(placement: PictographData) {
    startPlacementManager.selectStartPlacement(placement);
    selectedPlacement = placement;
    notifySelectionChange(placement, "user");
  }

  function setSelectedPlacement(placement: PictographData | null) {
    selectedPlacement = placement;
    notifySelectionChange(placement, "sync");
  }

  function clearSelectedPlacement() {
    setSelectedPlacement(null);
  }

  function onSelectedPlacementChange(
    listener: (placement: PictographData | null, source: "user" | "sync") => void
  ) {
    selectionListeners.add(listener);
    return () => {
      selectionListeners.delete(listener);
    };
  }

  // Initialize on creation
  void loadPlacements();

  return {
    // State
    get placements() {
      return placements;
    },
    get allVariations() {
      return allVariations;
    },
    get selectedPlacement() {
      return selectedPlacement;
    },
    get currentGridMode() {
      return currentGridMode;
    },
    get leftOrientation() {
      return leftOri;
    },
    get rightOrientation() {
      return rightOri;
    },

    // Actions
    selectPlacement,
    setLeftOrientation,
    setRightOrientation,
    setOrientation,
    setSelectedPlacement,
    clearSelectedPlacement,
    loadPlacements,
    loadAllVariations,
    setGridMode,
    onSelectedPlacementChange,
  };
}

export type SimplifiedStartPlacementState = ReturnType<
  typeof createSimplifiedStartPlacementState
>;
