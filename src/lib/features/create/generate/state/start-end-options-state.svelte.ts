/**
 * Start/End Options State Management
 *
 * Manages start/end placement generation constraints:
 * - Blocked start placements (synced to Firebase via settings service)
 * - Start placement (session-local)
 * - End placement (session-local)
 * - Must-contain letters (session-local)
 * - Must-not-contain letters (session-local)
 *
 * blockedStartPlacements syncs across devices for logged-in users.
 * Other options are session-specific and stored in localStorage.
 */

import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridMode,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
import { clampStartOrientationToLevel } from "../domain/level-orientation-policy";
import {
  detectPresetFromBlocked,
  getBlockedPlacementsForGrid,
  getBlockedPlacementsForPreset,
  StartPlacementPreset,
} from "../shared/domain/start-placement-presets";
import { normalizePersistedStartEndOptions } from "../domain/generator-persistence-normalizer";

// ===== Session-local Persistence (localStorage) =====
const SESSION_STORAGE_KEY = "tka-start-end-session-options";

type BlockedStartPlacementsByGridMode = Partial<
  Record<GridMode, GridPlacement[]>
>;

interface SerializedSessionOptions {
  startPlacementLetter?: string;
  /**
   * @deprecated Letter alone is ambiguous — "Γ" covers 8 gamma variants — so a
   * restored session could never rebuild the placement the user picked. Read
   * for backwards compatibility, never written. Superseded by endPlacements.
   */
  endPlacementLetter?: string;
  /** Grid placement names, e.g. ["gamma11", "alpha3"]. */
  endPlacements?: string[];
  mustContainLetters: string[];
  mustNotContainLetters: string[];
  leftStartOrientation?: string;
  rightStartOrientation?: string;
  /** @deprecated Read only; replaced by physical hand identity. */
  blueStartOrientation?: string;
  /** @deprecated Read only; replaced by physical hand identity. */
  redStartOrientation?: string;
  timestamp: number;
}

/**
 * Save session-local options to localStorage
 * (excludes blockedStartPlacements which syncs via Firebase)
 */
function saveSessionOptions(options: StartEndOptions): void {
  try {
    const serialized: SerializedSessionOptions = {
      startPlacementLetter: options.startPlacement?.letter || undefined,
      endPlacements: options.endPlacements.map(String),
      mustContainLetters: options.mustContainLetters.map((l) => l.toString()),
      mustNotContainLetters: options.mustNotContainLetters.map((l) =>
        l.toString()
      ),
      leftStartOrientation: options.leftStartOrientation,
      rightStartOrientation: options.rightStartOrientation,
      timestamp: Date.now(),
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.warn("⚠️ StartEndOptions: Failed to save session options:", error);
  }
}

/**
 * Load session-local options from localStorage
 */
function loadSessionOptions(): Partial<StartEndOptions> | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const data = normalizePersistedStartEndOptions(
      JSON.parse(stored) as SerializedSessionOptions
    );

    return {
      startPlacement: data.startPlacementLetter
        ? ({ letter: data.startPlacementLetter } as PictographData)
        : null,
      // The legacy endPlacementLetter is deliberately NOT migrated: a letter
      // cannot name which of its variants was chosen, and the constraint never
      // reached the engine anyway, so there is no working selection to keep.
      endPlacement: null,
      endPlacements: (data.endPlacements || []) as GridPlacement[],
      mustContainLetters: (data.mustContainLetters || []) as Letter[],
      mustNotContainLetters: (data.mustNotContainLetters || []) as Letter[],
      leftStartOrientation:
        (data.leftStartOrientation as Orientation) ?? Orientation.IN,
      rightStartOrientation:
        (data.rightStartOrientation as Orientation) ?? Orientation.IN,
    };
  } catch (error) {
    console.warn("⚠️ StartEndOptions: Failed to load session options:", error);
    return null;
  }
}

/**
 * Clear session options from localStorage
 */
function clearSessionOptions(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn("⚠️ StartEndOptions: Failed to clear session options:", error);
  }
}

const DEFAULT_OPTIONS: StartEndOptions = {
  blockedStartPlacements: [],
  startPlacement: null,
  endPlacement: null,
  endPlacements: [],
  mustContainLetters: [],
  mustNotContainLetters: [],
  leftStartOrientation: Orientation.IN,
  rightStartOrientation: Orientation.IN,
};

/**
 * Creates reactive state for start/end placement options
 *
 * blockedStartPlacements: Loaded from and saved to Firebase settings (syncs across devices)
 * Other options: Loaded from and saved to localStorage (session-specific)
 */
export function createStartEndOptionsState(
  initialOptions?: Partial<StartEndOptions>,
  initialGridMode: GridMode = GridMode.DIAMOND
) {
  // Get settings service for Firebase-synced blocked placements
  let settingsState: SettingsState | null = null;
  try {
    settingsState = settingsService;
  } catch {
    console.warn("⚠️ StartEndOptions: Settings service not available");
  }

  // The legacy array remains the active-grid value consumed by generation.
  // The keyed setting distinguishes an untouched grid from one explicitly set
  // to All, which an empty array alone cannot represent.
  const legacyBlockedPlacements =
    (settingsState?.settings?.blockedStartPlacements as GridPlacement[]) ?? [];
  let blockedStartPlacementsByGridMode: BlockedStartPlacementsByGridMode = {
    ...(settingsState?.settings?.blockedStartPlacementsByGridMode ?? {}),
  };
  for (const gridMode of [GridMode.DIAMOND, GridMode.BOX]) {
    if (blockedStartPlacementsByGridMode[gridMode] !== undefined) continue;
    const legacyForGrid = getBlockedPlacementsForGrid(
      legacyBlockedPlacements,
      gridMode
    );
    if (legacyForGrid.length > 0) {
      blockedStartPlacementsByGridMode[gridMode] = legacyForGrid;
    }
  }
  let currentGridMode = initialGridMode;
  const savedForInitialGrid =
    blockedStartPlacementsByGridMode[initialGridMode] ?? [];
  const initialBlockedPlacements =
    initialOptions?.blockedStartPlacements ?? savedForInitialGrid;
  blockedStartPlacementsByGridMode = {
    ...blockedStartPlacementsByGridMode,
    [initialGridMode]: [...initialBlockedPlacements],
  };

  // Load session-local options from localStorage
  const savedSessionOptions = loadSessionOptions();

  // Initialize options with priority: initialOptions > saved > defaults
  let options = $state<StartEndOptions>({
    ...DEFAULT_OPTIONS,
    blockedStartPlacements: initialBlockedPlacements,
    ...(savedSessionOptions || {}),
    ...initialOptions,
  });

  // Derived values
  const hasAnyConstraints = $derived(
    options.blockedStartPlacements.length > 0 ||
      options.startPlacement !== null ||
      options.endPlacement !== null ||
      options.endPlacements.length > 0 ||
      options.mustContainLetters.length > 0 ||
      options.mustNotContainLetters.length > 0
  );

  const constraintsSummary = $derived.by(() => {
    const parts: string[] = [];

    if (options.startPlacement) {
      parts.push(`Start: ${options.startPlacement.letter || "?"}`);
    }

    if (options.endPlacements.length === 1) {
      parts.push(`End: ${options.endPlacements[0]}`);
    } else if (options.endPlacements.length > 1) {
      parts.push(`End: ${options.endPlacements.length} placements`);
    }

    if (options.mustContainLetters.length > 0) {
      parts.push(`+${options.mustContainLetters.length}`);
    }

    if (options.mustNotContainLetters.length > 0) {
      parts.push(`-${options.mustNotContainLetters.length}`);
    }

    return parts.length > 0 ? parts.join(" · ") : "None";
  });

  /**
   * Save blockedStartPlacements to Firebase settings
   */
  function saveBlockedPlacements(blocked: GridPlacement[]) {
    blockedStartPlacementsByGridMode = {
      ...blockedStartPlacementsByGridMode,
      [currentGridMode]: [...blocked],
    };
    if (settingsState) {
      void settingsState.updateSettings({
        blockedStartPlacements: blocked,
        blockedStartPlacementsByGridMode,
      });
    }
  }

  /**
   * Restore the target grid's selection. A grid visited for the first time
   * inherits Classic 3 when that named preset is active; after that, even an
   * explicit All selection is stored and restored independently.
   */
  function setGridMode(gridMode: GridMode): boolean {
    if (gridMode === currentGridMode) return false;

    blockedStartPlacementsByGridMode = {
      ...blockedStartPlacementsByGridMode,
      [currentGridMode]: [...options.blockedStartPlacements],
    };
    const savedForNextGrid = blockedStartPlacementsByGridMode[gridMode];
    const currentPreset = detectPresetFromBlocked(
      options.blockedStartPlacements,
      currentGridMode
    );
    const nextBlockedPlacements =
      savedForNextGrid !== undefined
        ? [...savedForNextGrid]
        : currentPreset === StartPlacementPreset.CLASSIC
          ? getBlockedPlacementsForPreset(StartPlacementPreset.CLASSIC, gridMode)
          : [];
    // Grid mode changes the placement vocabulary (diamond vs box names), so any
    // exact placement held from the other mode is meaningless here.
    const clearedExactPlacements =
      options.startPlacement !== null ||
      options.endPlacement !== null ||
      options.endPlacements.length > 0;

    currentGridMode = gridMode;
    options = {
      ...options,
      blockedStartPlacements: nextBlockedPlacements,
      startPlacement: null,
      endPlacement: null,
      endPlacements: [],
    };
    saveBlockedPlacements(nextBlockedPlacements);
    saveSessionOptions(options);

    return clearedExactPlacements;
  }

  // Update function with persistence
  function updateOptions(updates: Partial<StartEndOptions>) {
    options = { ...options, ...updates };

    // If blockedStartPlacements changed, save to Firebase
    if (updates.blockedStartPlacements !== undefined) {
      saveBlockedPlacements(updates.blockedStartPlacements);
    }

    // Always save session options to localStorage
    saveSessionOptions(options);
  }

  // Replace entire options (used by sheet onChange callback)
  function setOptions(newOptions: StartEndOptions) {
    const blockedChanged =
      JSON.stringify(options.blockedStartPlacements) !==
      JSON.stringify(newOptions.blockedStartPlacements);

    options = { ...newOptions };

    // If blocked placements changed, save to Firebase
    if (blockedChanged) {
      saveBlockedPlacements(newOptions.blockedStartPlacements);
    }

    // Save session options to localStorage
    saveSessionOptions(options);
  }

  // Clear all constraints
  function resetOptions(gridMode: GridMode = GridMode.DIAMOND) {
    currentGridMode = gridMode;
    blockedStartPlacementsByGridMode = {
      [GridMode.DIAMOND]: [],
      [GridMode.BOX]: [],
    };
    options = { ...DEFAULT_OPTIONS };
    saveBlockedPlacements([]);
    clearSessionOptions();
  }

  /**
   * Keep persisted start orientations inside the vocabulary selected by Level.
   * Returns whether either prop had to be normalized.
   */
  function normalizeOrientationsForLevel(level: number): boolean {
    const leftStartOrientation = clampStartOrientationToLevel(
      options.leftStartOrientation,
      level
    );
    const rightStartOrientation = clampStartOrientationToLevel(
      options.rightStartOrientation,
      level
    );
    const changed =
      leftStartOrientation !== options.leftStartOrientation ||
      rightStartOrientation !== options.rightStartOrientation;

    if (changed) {
      updateOptions({ leftStartOrientation, rightStartOrientation });
    }

    return changed;
  }

  // Individual field setters
  function setStartPlacement(placement: PictographData | null) {
    updateOptions({ startPlacement: placement });
  }

  function setEndPlacement(placement: PictographData | null) {
    updateOptions({ endPlacement: placement });
  }

  function setEndPlacements(placements: GridPlacement[]) {
    updateOptions({ endPlacements: [...placements] });
  }

  /**
   * LOOPs determine their own endpoint, so a manually selected endpoint cannot
   * remain active once LOOP generation is enabled. Clear both representations
   * together so an older saved session cannot keep an invisible constraint.
   */
  function reconcileLoopEnabled(loopEnabled: boolean): boolean {
    if (
      !loopEnabled ||
      (options.endPlacement === null && options.endPlacements.length === 0)
    ) {
      return false;
    }

    updateOptions({ endPlacement: null, endPlacements: [] });
    return true;
  }

  function setMustContainLetters(letters: Letter[]) {
    updateOptions({ mustContainLetters: [...letters] });
  }

  function setMustNotContainLetters(letters: Letter[]) {
    updateOptions({ mustNotContainLetters: [...letters] });
  }

  return {
    // State
    get options() {
      return options;
    },
    get hasAnyConstraints() {
      return hasAnyConstraints;
    },
    get constraintsSummary() {
      return constraintsSummary;
    },

    // Actions
    updateOptions,
    setOptions,
    setGridMode,
    resetOptions,
    normalizeOrientationsForLevel,
    clearSavedOptions: () => {
      blockedStartPlacementsByGridMode = {};
      if (settingsState) {
        void settingsState.updateSettings({
          blockedStartPlacements: [],
          blockedStartPlacementsByGridMode: {},
        });
      }
      clearSessionOptions();
    },

    // Field-level setters
    setStartPlacement,
    setEndPlacement,
    setEndPlacements,
    reconcileLoopEnabled,
    setMustContainLetters,
    setMustNotContainLetters,
  };
}

export type StartEndOptionsState = ReturnType<
  typeof createStartEndOptionsState
>;

/** @deprecated Use createStartEndOptionsState instead */
export const createCustomizeOptionsState = createStartEndOptionsState;

/** @deprecated Use StartEndOptionsState instead */
export type CustomizeOptionsState = StartEndOptionsState;
