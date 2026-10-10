import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { AnimationEngineProps } from "#lib/shared/animation-engine/services/animation-engine.svelte.js";
import type { AnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import type { TrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";

export interface ExportFrameContext {
  virtualTime: number;
  isSeamlesslyLoopable: boolean;
  backgroundAlpha: number;
  showNonRadialPoints: boolean;
  /**
   * Live trail settings. Load-bearing: PlaybackSync only initializes the trail
   * capturer + syncs trail params when externalTrailSettings is defined. Omitting
   * it leaves the offscreen engine with no trail capturer → trails never draw and
   * props blank along the path. The engine self-applies the unilateral constraint.
   */
  trailSettings: TrailSettings;
  /**
   * Prop types (e.g. "staff"). Load-bearing: the renderer draws the prop BODIES
   * from these. Omitting them leaves the offscreen engine with no prop geometry →
   * props missing from the export (fire/tips still track positions, so fire shows
   * but the staves don't). Live path feeds these from propRendering.
   */
  leftPropType: string | null;
  rightPropType: string | null;
  /** Dark-mode override for prop rendering, matching the export's theme. */
  previewDarkMode: boolean | null;
}

/**
 * Map live panel state + the frame context into the render-relevant props the
 * offscreen engine needs. letter/stepData are intentionally omitted: in export
 * the glyph/word/step overlays are composited by ExportFrameCompositor, not by
 * the engine canvas. The engine renders props + effects (fire/trails/grid) only.
 */
export function assembleExportEngineProps(
  panelState: AnimationPanelState,
  frame: ExportFrameContext,
): AnimationEngineProps {
  const sequenceData = panelState.sequenceData;
  const gridMode = sequenceData?.gridMode ?? GridMode.DIAMOND;
  return {
    leftProp: panelState.leftPropState,
    rightProp: panelState.rightPropState,
    gridVisible: true,
    gridMode,
    backgroundAlpha: frame.backgroundAlpha,
    sequenceData,
    currentStep: panelState.currentStep,
    isPlaying: true,
    isSeamlesslyLoopable: frame.isSeamlesslyLoopable,
    virtualTime: frame.virtualTime,
    showNonRadialPoints: frame.showNonRadialPoints,
    externalTrailSettings: frame.trailSettings,
    leftPropType: frame.leftPropType,
    rightPropType: frame.rightPropType,
    previewDarkMode: frame.previewDarkMode,
  };
}
