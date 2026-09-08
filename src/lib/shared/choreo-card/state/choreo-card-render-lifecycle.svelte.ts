import { onDestroy, onMount, untrack } from "svelte";
import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { markScan } from "$lib/shared/analytics/scan-perf";
import { buildChoreoCardRenderKeys } from "$lib/shared/choreo-card/services/choreo-card-render-keys";
import type {
  ChoreoCardRenderModel,
  createChoreoCardRenderEngine,
} from "$lib/shared/choreo-card/services/choreo-card-render-engine";
import type { createCrossfaderState } from "$lib/shared/choreo-card/state/crossfader-state.svelte";

export interface ChoreoCardRenderLifecycleDeps {
  readonly primaryPropColors?: { left: string; right: string } | null;
  readonly sequence: SequenceData;
  readonly handPathMode?: boolean;
  readonly leftPropType: PropType | undefined;
  readonly rightPropType: PropType | undefined;
  readonly browseViewMode: BrowseViewMode | undefined;
  readonly catDogModeEnabled: boolean;
  readonly leftBuugengFlipped: boolean;
  readonly rightBuugengFlipped: boolean;
  readonly showStepNumbers: boolean;
  readonly showNonRadial: boolean;
  readonly handPointVis: "all" | "active" | "none";
  readonly showTKA: boolean;
  readonly showReversals: boolean;
  readonly showTnD: boolean;
  readonly showElemental: boolean;
  readonly showPositions: boolean;
  readonly showGrid: boolean;
  readonly showLeftMotion: boolean;
  readonly showRightMotion: boolean;
  readonly includeStartPosition: boolean;
  readonly startPositionLayout: "row" | "column";
  readonly effectiveColumns: number;
  readonly columnCount: number | null;
  readonly darkMode: boolean;
  readonly rerenderTrigger: number;
  readonly flipSuppressed: boolean;
}

interface SizingLifecyclePort {
  captureContainerDimensions(): void;
}

/** Owns render invalidation, initial cache adoption, and transition selection. */
export function createChoreoCardRenderLifecycle(
  getDeps: () => ChoreoCardRenderLifecycleDeps,
  model: ChoreoCardRenderModel,
  engine: ReturnType<typeof createChoreoCardRenderEngine>,
  crossfader: ReturnType<typeof createCrossfaderState>,
  sizing: SizingLifecyclePort
) {
  let hasMounted = $state(false);
  let flipEnabled = $state(false);
  let lastRenderKey = "";
  let lastStructuralKey = "";
  let settleWindowOpen = true;
  let settleWindowTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRerenderTrigger = 0;

  const flipDuration = $derived(
    flipEnabled && !getDeps().flipSuppressed ? 250 : 0
  );

  function renderKeys(deps: ChoreoCardRenderLifecycleDeps) {
    return buildChoreoCardRenderKeys({
      sequence: deps.sequence,
      handPathMode: deps.handPathMode,
      browseViewMode: deps.browseViewMode,
      primaryPropColors: deps.primaryPropColors,
      leftPropType: deps.leftPropType,
      rightPropType: deps.rightPropType,
      catDogModeEnabled: deps.catDogModeEnabled,
      leftBuugengFlipped: deps.leftBuugengFlipped,
      rightBuugengFlipped: deps.rightBuugengFlipped,
      showStepNumbers: deps.showStepNumbers,
      showNonRadial: deps.showNonRadial,
      handPointVis: deps.handPointVis,
      showTKA: deps.showTKA,
      showReversals: deps.showReversals,
      showTnD: deps.showTnD,
      showElemental: deps.showElemental,
      showPositions: deps.showPositions,
      showGrid: deps.showGrid,
      showLeftMotion: deps.showLeftMotion,
      showRightMotion: deps.showRightMotion,
      includeStartPosition: deps.includeStartPosition,
      startPositionLayout: deps.startPositionLayout,
      effectiveColumns: deps.effectiveColumns,
      darkMode: deps.darkMode,
    });
  }

  function markRenderSettled(): void {
    hasMounted = true;
    requestAnimationFrame(() => {
      flipEnabled = true;
    });
  }

  $effect(() => {
    const deps = getDeps();
    void deps.columnCount;
    const { imageKey, contentKey, structuralKey, renderKey } = renderKeys(deps);
    if (!hasMounted || renderKey === lastRenderKey) return;

    const cellsLoaded = untrack(
      () => model.cells.length > 0 && model.cells.some((cell) => cell.isLoaded)
    );
    const hasDurations = untrack(() => model.hasMixedDurations);
    const durationKey =
      deps.sequence.steps.map((step) => step.duration ?? 1).join(",") ?? "";
    const gridStableKey = `${deps.sequence.steps.length}-${durationKey}-cols:${deps.effectiveColumns}-isp:${deps.includeStartPosition}`;
    const darkModeChanged =
      untrack(() => crossfader.activeDarkMode) !== deps.darkMode;
    const changeType = crossfader.classifyChange(
      contentKey,
      imageKey,
      gridStableKey,
      cellsLoaded,
      hasDurations,
      darkModeChanged
    );
    const structuralChanged = structuralKey !== lastStructuralKey;

    lastRenderKey = renderKey;
    lastStructuralKey = structuralKey;
    crossfader.updateKeys({ contentKey, imageKey, gridStableKey });
    const animateChange = !settleWindowOpen;
    settleWindowOpen = false;

    if (changeType === "dark-mode-only") {
      untrack(() => {
        void engine.transitionCellImages("crossfade", animateChange);
      });
    } else if (changeType === "layout-only") {
      crossfader.setActiveDarkMode(deps.darkMode);
      untrack(engine.relayoutCells);
    } else if (changeType === "grid-stable-image") {
      crossfader.setActiveDarkMode(deps.darkMode);
      const mode = structuralChanged ? "swap" : "crossfade";
      untrack(() => {
        void engine.transitionCellImages(mode, animateChange);
      });
    } else {
      crossfader.setActiveDarkMode(deps.darkMode);
      untrack(() => {
        void engine.renderAllCells();
      });
    }
  });

  $effect(() => {
    const trigger = getDeps().rerenderTrigger;
    if (!hasMounted || trigger === lastRerenderTrigger) return;
    lastRerenderTrigger = trigger;
    untrack(() => {
      void engine.forceRerenderAllCells();
    });
  });

  onMount(() => {
    markScan("card-component-mounted");
    sizing.captureContainerDimensions();
    settleWindowTimer = setTimeout(() => {
      settleWindowOpen = false;
    }, 1500);

    const deps = getDeps();
    const initialKeys = renderKeys(deps);
    crossfader.updateKeys({
      contentKey: initialKeys.contentKey,
      imageKey: initialKeys.imageKey,
      gridStableKey: initialKeys.gridStableKey,
    });
    lastRenderKey = initialKeys.renderKey;
    lastStructuralKey = initialKeys.structuralKey;

    if (engine.adoptCachedPreview()) {
      markRenderSettled();
      return;
    }
    void engine.renderAllCells();
  });

  onDestroy(() => {
    if (settleWindowTimer !== null) clearTimeout(settleWindowTimer);
    engine.dispose();
    crossfader.destroy();
  });

  return {
    get flipDuration() {
      return flipDuration;
    },
    markRenderSettled,
  } as const;
}
