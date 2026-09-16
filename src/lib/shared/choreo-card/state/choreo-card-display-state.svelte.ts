import { onDestroy } from "svelte";
import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import { calculateDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
import {
  DEFAULT_DIFFICULTY_STYLE,
  DIFFICULTY_LEVELS,
} from "$lib/shared/config/difficulty-styles";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  tryGetLoopDisplayResolver,
  type LoopDisplay,
} from "$lib/shared/loop-labeler/get-loop-display-resolver";
import type { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";

export interface ChoreoCardDisplayDeps {
  readonly sequence: SequenceData;
  readonly browseViewMode: BrowseViewMode | undefined;
  readonly handPathMode: boolean;
  readonly showWord: boolean;
  readonly customTitleText: string | undefined;
  readonly showDifficultyLevel: boolean;
  readonly hideSoloHeader: boolean;
  readonly showLoopGlyph: boolean;
  readonly showNotes: boolean;
  readonly showLeftMotion: boolean;
  readonly showRightMotion: boolean;
}

/** Owns card display semantics derived from viewer and glyph visibility. */
export function createChoreoCardDisplayState(
  getDeps: () => ChoreoCardDisplayDeps,
  visibilityManager: ReturnType<typeof getVisibilityStateManager>
) {
  let visibilityVersion = $state(0);
  const onVisibilityChanged = (): void => {
    visibilityVersion++;
  };
  const refreshVisibility = (): void => {
    visibilityVersion++;
  };
  visibilityManager.registerObserver(onVisibilityChanged, [
    "glyph",
    "non_radial",
    "all",
  ]);
  onDestroy(() => visibilityManager.unregisterObserver(onVisibilityChanged));

  const showLeftMotion = $derived(getDeps().showLeftMotion);
  const showRightMotion = $derived(getDeps().showRightMotion);
  const allMotionsVisible = $derived(showLeftMotion && showRightMotion);
  const showTnD = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("tndGlyph");
  });
  const showElemental = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("elementalGlyph");
  });
  const showPropTnD = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("propTndGlyph");
  });
  const showPositions = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("positionsGlyph");
  });
  const showHandColorKey = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("handColorKey");
  });
  const showGrid = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getGridVisibility();
  });
  const showNonRadial = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getNonRadialVisibility();
  });
  const handPointVis = $derived.by<"all" | "active" | "none">(() => {
    void visibilityVersion;
    return visibilityManager.getHandPointVisibility();
  });
  const showTKA = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("tkaGlyph");
  });
  const showReversals = $derived.by(() => {
    void visibilityVersion;
    return visibilityManager.getRawGlyphVisibility("reversalIndicators");
  });

  const isBrowseSoloMode = $derived(
    getDeps().browseViewMode?.granularity === "solo"
  );
  const isMotionSoloMode = $derived(
    (showLeftMotion && !showRightMotion) || (showRightMotion && !showLeftMotion)
  );
  const isSoloMode = $derived(isBrowseSoloMode || isMotionSoloMode);
  const soloHand = $derived<"left" | "right" | undefined>(
    getDeps().browseViewMode?.hand ??
      (isMotionSoloMode ? (showLeftMotion ? "left" : "right") : undefined)
  );
  const isHandsMode = $derived(getDeps().browseViewMode?.subject === "hands");

  const customTitleVisible = $derived(
    !!getDeps().customTitleText?.trim() && !isSoloMode
  );

  const difficultyLevel = $derived.by(() => {
    const steps = getDeps().sequence.steps;
    return steps.length > 0 ? calculateDifficultyLevel([...steps]) : 1;
  });
  const currentLevelStyle = $derived.by(() => {
    const style =
      DIFFICULTY_LEVELS[difficultyLevel] ?? DEFAULT_DIFFICULTY_STYLE;
    return { bg: style.cssBg, border: style.border, text: style.text };
  });

  const emptyLoopDisplay: LoopDisplay = { components: new Set(), period: 1 };
  const loopDisplay = $derived.by(() => {
    const resolve = tryGetLoopDisplayResolver();
    return resolve ? resolve(getDeps().sequence) : emptyLoopDisplay;
  });
  const rawLoopComponents = $derived(
    loopDisplay.components.size > 0 ? loopDisplay.components : null
  );
  const loopComponents = $derived.by(() => {
    if (!rawLoopComponents) return null;
    const deps = getDeps();
    if (!isSoloMode && !isHandsMode) return rawLoopComponents;
    const filtered = new Set(rawLoopComponents);
    if (isSoloMode) filtered.delete(LOOPComponent.SWAPPED);
    if (isHandsMode || deps.handPathMode) {
      filtered.delete(LOOPComponent.INVERTED);
    }
    return filtered.size > 0 ? filtered : null;
  });

  const wordVisible = $derived(
    getDeps().showWord &&
      !customTitleVisible &&
      !!getDeps().sequence.word &&
      !isSoloMode &&
      !isHandsMode
  );
  const effectiveShowDifficulty = $derived(
    getDeps().showDifficultyLevel &&
      !getDeps().handPathMode &&
      !isHandsMode &&
      !isSoloMode
  );
  const showHeader = $derived(
    (isBrowseSoloMode && !getDeps().hideSoloHeader) ||
      customTitleVisible ||
      effectiveShowDifficulty ||
      (getDeps().showLoopGlyph && !!loopComponents) ||
      wordVisible
  );
  const hasPathShapeMetadata = $derived(
    getDeps().sequence.metadata?.pathShape === "linear" ||
      getDeps().sequence.metadata?.pathShape === "concave"
  );
  const showFooter = $derived(getDeps().showNotes || hasPathShapeMetadata);

  return {
    get visibilityVersion() {
      return visibilityVersion;
    },
    get showLeftMotion() {
      return showLeftMotion;
    },
    get showRightMotion() {
      return showRightMotion;
    },
    get allMotionsVisible() {
      return allMotionsVisible;
    },
    get showTnD() {
      return showTnD;
    },
    get showElemental() {
      return showElemental;
    },
    get showPropTnD() {
      return showPropTnD;
    },
    get showPositions() {
      return showPositions;
    },
    get showHandColorKey() {
      return showHandColorKey;
    },
    get showGrid() {
      return showGrid;
    },
    get showNonRadial() {
      return showNonRadial;
    },
    get handPointVis() {
      return handPointVis;
    },
    get showTKA() {
      return showTKA;
    },
    get showReversals() {
      return showReversals;
    },
    get isBrowseSoloMode() {
      return isBrowseSoloMode;
    },
    get isMotionSoloMode() {
      return isMotionSoloMode;
    },
    get isSoloMode() {
      return isSoloMode;
    },
    get soloHand() {
      return soloHand;
    },
    get isHandsMode() {
      return isHandsMode;
    },
    get difficultyLevel() {
      return difficultyLevel;
    },
    get currentLevelStyle() {
      return currentLevelStyle;
    },
    get loopComponents() {
      return loopComponents;
    },
    get loopRotationPeriod() {
      return loopDisplay.rotationPeriod;
    },
    get loopInversionPeriod() {
      return loopDisplay.inversionPeriod;
    },
    get loopReflectionAxis() {
      return loopDisplay.reflectionAxis;
    },
    get loopOverlayComponents() {
      return loopDisplay.overlayComponents;
    },
    get wordVisible() {
      return wordVisible;
    },
    get customTitleVisible() {
      return customTitleVisible;
    },
    get effectiveShowDifficulty() {
      return effectiveShowDifficulty;
    },
    get showHeader() {
      return showHeader;
    },
    get hasPathShapeMetadata() {
      return hasPathShapeMetadata;
    },
    get showFooter() {
      return showFooter;
    },
    refreshVisibility,
  } as const;
}
