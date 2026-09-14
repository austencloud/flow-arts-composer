import type { WorkspaceReplayCommand } from "./workspace-review-replays";

export type TransitionTraceCommand =
  | WorkspaceReplayCommand
  | "2d"
  | "card"
  | "interrupt"
  | "3d-first"
  | "3d-repeat"
  | "3d-interrupt"
  | "tunnel-first"
  | "tunnel-3d"
  | "tunnel-interrupt"
  | "card-2d"
  | "card-3d"
  | "card-tunnel"
  | "card-performances"
  | "card-stage-interrupt"
  | "performances-2d"
  | "performances-3d"
  | "performances-interrupt";

export type TransitionTracePhase =
  | "workspace-enter"
  | "workspace-return"
  | "workspace-interrupt"
  | "focus-2d"
  | "focus-card"
  | "return-split"
  | "interrupt-2d"
  | "interrupt-split"
  | "interrupt-card"
  | "interrupt-return"
  | "prepare-3d"
  | "show-3d"
  | "return-2d"
  | "repeat-3d"
  | "interrupt-3d"
  | "interrupt-2d-return"
  | "prepare-tunnel"
  | "show-tunnel"
  | "return-stage"
  | "prepare-tunnel-from-3d"
  | "return-3d"
  | "interrupt-tunnel"
  | "interrupt-stage"
  | "card-to-stage"
  | "stage-to-card"
  | "card-stage-interrupt"
  | "card-to-performances"
  | "performances-to-card"
  | "settle"
  | "stage-to-performances"
  | "performances-to-stage"
  | "interrupt-performances"
  | "interrupt-performance-stage";

export interface TransitionGeometrySample {
  workspace?: {
    studioOpacity: number;
    practiceHeight: number;
    selectedButtons: number;
    stageIdentity: number;
    sharedCanvasIdentity?: number;
    sharedTransportCovered?: boolean;
    sharedRasterDensity?: number | null;
    sharedInspectorIdentity?: number;
    motionInspectorOpacity?: number;
    cardInspectorOpacity?: number;
    sharedCardInspectorIdentity?: number;
    selectedStudioHalf?: string | null;
    sharedCardIdentity?: number;
    sharedTransportIdentity?: number;
    sharedScrubberIdentity?: number;
    sharedPlayButtonIdentity?: number;
    sharedSurfaces?: Record<
      string,
      { left: number; top: number; width: number; height: number }
    >;
    sharedCanvasInStudio?: boolean;
    sharedInspectorInStudio?: boolean;
  };
  time: number;
  phase: TransitionTracePhase;
  direction: "horizontal" | "vertical";
  focusedPane: string | null;
  selectedMode:
    | "split"
    | "animation"
    | "animation-3d"
    | "card"
    | "tunnel"
    | "videos"
    | "post-studio"
    | null;
  outerDirection: "horizontal" | "vertical";
  stageSize: number;
  stageFlexGrow: number;
  animationSize: number;
  animationFlexGrow: number;
  animationHidden: boolean;
  animationReadable: boolean;
  mandalaBackingSize: number;
  mandalaDisplaySize: number;
  mandalaRasterScale: number;
  mandalaDisplayWidth: number;
  mandalaDisplayHeight: number;
  mandalaMaximumRasterScale: number;
  cardSize: number;
  cardFlexGrow: number;
  cardHidden: boolean;
  cardReadable: boolean;
  cardPanelWidth: number;
  cardPanelHeight: number;
  cardPanelCenterX: number;
  cardPanelCenterY: number;
  cardRootWidth: number;
  cardRootHeight: number;
  cardRootCenterY: number;
  cardContentWidth: number;
  cardContentHeight: number;
  cardContentCenterX: number;
  cardContentCenterY: number;
  cardTransformedCellCount: number;
  cardColumns: number;
  cardRows: number;
  cardContainSizeMotion: string | null;
  cardAutoLayoutLocked: boolean;
  cardAutoLayoutLockColumns: number;
  cardAutoLayoutLockRows: number;
  inspectorSize: number;
  inspectorFlexGrow: number;
  inspectorIdentity: number;
  effectsInspectorOpacity: number;
  cardEffectsSeamGap: number;
  desktopInspectorExpected: boolean;
  cardSettingsWidth: number;
  cardSettingsHeight: number;
  cardSettingsCenterY: number;
  cardSettingsOpacity: number;
  cardIdentity: number;
  dissolveActive: boolean;
  animationOpacity: number;
  cardOpacity: number;
  motion2DOpacity: number;
  motion3DOpacity: number;
  motion2DPresented: boolean;
  motion3DPresented: boolean;
  motion3DReady: boolean;
  motion3DPreparing: boolean;
  motion2DPreparationHeld: boolean;
  sceneCurtainVisible: boolean;
  scenePreparationProgress: number | null;
  scenePreparationLabel: string | null;
  tunnelOpacity: number;
  tunnelLayersReady: boolean;
  tunnelLayerCount: number;
  tunnelPreparedLayerCount: number;
  tunnelTextureRequested: number;
  tunnelTextureLoaded: number;
  tunnelTexturesReady: boolean;
  tunnelLayerOpacityMinimum: number;
  tunnelLayerOpacityMaximum: number;
  tunnelLayerOpacityMean: number;
  tunnelPerceptibleLayerCount: number;
  tunnelMovingLayerCount: number;
  tunnelTrailSuppressedLayerCount: number;
  /** Maximum difference between a rendered copy and its prepared Tunnel pose. */
  tunnelFormationPoseDrift: number;
  tunnelGridOpacity: number;
  tunnelPaintFrame: number;
  tunnelPaintedPropCount: number;
  tunnelPaintedPerceptiblePropCount: number;
  tunnelPaintedOpacityMean: number;
  tunnelFormationTrailCaptures: number;
  tunnelPresented: boolean;
  tunnelCanvasReady: boolean;
  animatorIdentity: number;
  animatorCanvasCount: number;
  activeArtSettingsCount: number;
  artSettingsOpacity: number;
  artSettingsWidth: number;
  artSettingsLeft: number;
  inspectorReveal: Record<InspectorLayerId, InspectorRevealSample>;
  artSettingsContentTop: number;
  cardSettingsLeft: number;
  cardSettingsContentTop: number;
  tunnelBackingWidth: number;
  tunnelBackingHeight: number;
  tunnelDisplayWidth: number;
  tunnelDisplayHeight: number;
  stageLayerOpacity: number;
  performanceLayerOpacity: number;
  stageLayerIdentity: number;
  performanceLayerIdentity: number;
  stageLayerActive: boolean;
  performanceLayerActive: boolean;
  performanceGalleryReady: boolean;
  performanceLayoutColumns: number;
  performancePlayerCount: number;
  stageLayerWidth: number;
  performanceLayerWidth: number;
}

export interface TransitionGeometryTrace {
  command: TransitionTraceCommand;
  duration: number;
  samples: TransitionGeometrySample[];
  tunnelPaintSamples?: TunnelPaintSample[];
  modeCommits: Array<{
    mode: "split" | "animation" | "animation-3d" | "card" | "tunnel" | "videos";
    latency: number;
  }>;
}

export interface TunnelPaintSample {
  time: number;
  progress: number;
  paintedPropCount: number;
  perceptiblePropCount: number;
  meanAlpha: number;
}

export interface TunnelPaintedArrival {
  peakProps: number;
  allPropsPerceptibleProgress: number | null;
  quarterMeanAlpha: number;
  halfwayMeanAlpha: number;
  growthFrames: number;
  durationMs: number;
}

export interface TransitionGeometrySummary {
  cardExitMinimum: number | null;
  cardEntryMinimum: number | null;
  animationExitMinimum: number | null;
  animationEntryMinimum: number | null;
  tinyCardFrames: number;
  tinyAnimationFrames: number;
  mandalaReturnRasterScaleMaximum: number | null;
  magnifiedMandalaReturnFrames: number;
  dissolveFrames: number;
  cardBoxMinimum: { width: number; height: number } | null;
  cardAspectMinimum: number | null;
  cardAspectMaximum: number | null;
  squashedCardFrames: number;
  dissolveCoveredCardFrames: number;
  transformedCardCellFrames: number;
  maximumTransformedCardCells: number;
  modePath: string[];
  panelDirectionPath: string[];
  outerDirectionPath: string[];
  cardLayoutPath: string[];
  cardLayoutLockPath: string[];
  cardReturnPanelWidth: TransitionEndpointUndershoot | null;
  cardReturnPanelHeight: TransitionEndpointUndershoot | null;
  cardReturnRootWidth: TransitionEndpointUndershoot | null;
  cardReturnRootHeight: TransitionEndpointUndershoot | null;
  cardReturnVisualWidth: TransitionEndpointUndershoot | null;
  cardReturnVisualHeight: TransitionEndpointUndershoot | null;
  cardReturnTravel: TransitionTravelSummary | null;
  animationReturnSizeTravel: TransitionTravelSummary | null;
  cardSettingsFocusWidth: TransitionValueRange | null;
  cardSettingsFocusHeight: TransitionValueRange | null;
  cardSettingsFocusCenterY: TransitionValueRange | null;
  cardSettingsReturnWidth: TransitionValueRange | null;
  cardSettingsReturnHeight: TransitionValueRange | null;
  cardSettingsReturnCenterY: TransitionValueRange | null;
  cardEffectsSeamGapMaximum: number;
  cardEffectsOpacityOnsetSkew: number | null;
  cardEffectsCrossfadeFrames: number;
  cardEffectsBlankFrames: number;
  motionBlankFrames: number;
  motionUnready3DFrames: number;
  motionCurtainFrames: number;
  motionMisidentified3DFrames: number;
  motionPreparationProgressRegressions: number;
  motionPreparationLabels: string[];
  motionCrossfadeFrames: number;
  motionPreparationFrames: number;
  motionPreparationGeometryHeldFrames: number;
  motionPreparationRasterScaleMaximum: number | null;
  motionPreparationRasterGrowthMaximum: number | null;
  motionMagnifiedPreparationFrames: number;
  motionLate2DBackingChanges: number;
  motionSurfacePath: string[];
  motionHandoffLatency: number | null;
  motionStageSize: TransitionValueRange | null;
  motionInspectorSize: TransitionValueRange | null;
  tunnelUnreadyFrames: number;
  tunnelUnpreparedLayerFrames: number;
  tunnelUnpreparedTextureFrames: number;
  tunnelLateLayerArrivals: number;
  tunnelLayerOpacityStepMaximum: number;
  tunnelGridOpacityStepMaximum: number;
  tunnelLayerOpacitySpreadMaximum: number;
  tunnelAllLayersPerceptibleProgress: number | null;
  tunnelLayerMeanOpacityAtHalf: number | null;
  tunnelPaintedArrival: TunnelPaintedArrival | null;
  tunnelFormationTrailCaptures: number;
  tunnelUnguardedFormationFrames: number;
  tunnelPreparedLayerCountMaximum: number;
  tunnelFormationPoseDriftMaximum: number;
  tunnelFormationPoseDriftFrames: number;
  tunnelCrossfadeFrames: number;
  tunnelDoubleFadeFrames: number;
  tunnelBlankFrames: number;
  tunnelLateBackingChanges: number;
  tunnelInspectorIdentityChanges: number;
  tunnelAnimatorIdentityChanges: number;
  tunnelDuplicateCanvasFrames: number;
  tunnelDuplicateSettingsFrames: number;
  tunnelSurfacePath: string[];
  tunnelHandoffLatency: number | null;
  tunnelStageSize: TransitionValueRange | null;
  tunnelDisplaySize: TransitionValueRange | null;
  cardStageCardIdentityChanges: number;
  cardStageAnimatorIdentityChanges: number;
  cardStageInspectorIdentityChanges: number;
  cardStageBlankFrames: number;
  cardStageSplitFrames: number;
  cardStageSettingsBlankFrames: number;
  cardStageSettingsCrossfadeFrames: number;
  cardStageExitTravel: TransitionTravelSummary | null;
  cardStageEntryTravel: TransitionTravelSummary | null;
  cardStageExitAllocation: TransitionTravelSummary | null;
  cardStageEntryAllocation: TransitionTravelSummary | null;
  cardStageInspectorSize: TransitionValueRange | null;
  cardStageInspectorExit: TransitionTravelSummary | null;
  cardStageInspectorEntry: TransitionTravelSummary | null;
  artSettingsContentDrift: TransitionContentDrift | null;
  inspectorReveal: InspectorRevealSummary[];
  inspectorSurfaceStep: InspectorSurfaceStep | null;
  cardSizePinRelease: CardSizePinRelease | null;
  cardArrival: CardArrival | null;
  dockCollapse: DockCollapse | null;
  cardSettingsContentDrift: TransitionContentDrift | null;
  longestSampleGap: number;
  performanceStageIdentityChanges: number;
  performanceGalleryIdentityChanges: number;
  performanceInspectorIdentityChanges: number;
  performanceBlankFrames: number;
  performanceDoubleOpaqueFrames: number;
  performanceCrossfadeFrames: number;
  performanceUnreadyFrames: number;
  performanceLayoutChanges: number;
  performancePlayerCountMaximum: number;
  performanceOpacityComplementDriftMaximum: number;
  performanceLayerWidthMismatchMaximum: number;
  performanceSurfacePath: string[];
  performanceStageExit: TransitionTravelSummary | null;
  performanceStageEntry: TransitionTravelSummary | null;
  performanceInspectorExit: TransitionTravelSummary | null;
  performanceInspectorEntry: TransitionTravelSummary | null;
}

export interface TransitionEndpointUndershoot {
  start: number;
  end: number;
  minimum: number;
  undershoot: number;
  minimumTime: number;
}

export interface TransitionTravelSummary {
  start: number;
  end: number;
  minimum: number;
  maximum: number;
  backtrack: number;
  overshoot: number;
}

export interface TransitionValueRange {
  start: number;
  end: number;
  minimum: number;
  maximum: number;
  variation: number;
}

/**
 * The four persistent inspector layers, by the surface each one presents.
 * Every one of them is a fixed-size clip box whose width PanelGroup animates,
 * holding a settings panel composed at its own destination width.
 */
export type InspectorLayerId = "motion" | "art" | "card" | "performance";

/**
 * One frame of the relationship between an inspector layer's clip box and the
 * panel composed inside it. The panel is wider than the clip box for as long as
 * the seam is still travelling, so exactly one of two things is true on every
 * intermediate frame: part of the panel is cut off, or part of the clip box has
 * no panel behind it.
 */
export interface InspectorRevealSample {
  layerLeft: number;
  layerWidth: number;
  panelLeft: number;
  panelWidth: number;
  opacity: number;
  layerSurfaceAlpha: number;
  panelSurfaceAlpha: number;
}

/**
 * The widest lighter strip the inspector track showed in any single frame.
 *
 * A crossfade dims the whole track for a moment, and a uniform dim reads as a
 * fade. What reads as a defect is a band: one stretch of the track noticeably
 * more transparent than the stretch beside it, with a hard vertical edge
 * between them. This measures that difference within a frame, so an honest
 * crossfade scores zero however deep it dips.
 */
export interface InspectorSurfaceStep {
  widthPx: number;
  alphaDrop: number;
  ms: number;
  frames: number;
}

/**
 * What a person could actually see of one inspector layer while it was legible.
 *
 * `clippedLeft` is the band of the panel cut off by the clip box's left edge —
 * on a right-anchored layer that is the label and selector column, which is
 * what "the selectors take a second to pull in" describes. `clippedRight` is
 * the same defect mirrored on a left-anchored layer, where the values column
 * is the part that goes missing. `uncovered` is the opposite failure: the clip
 * box is wider than the panel, so a band of the inspector track has nothing
 * drawn in it and the workspace behind shows through.
 *
 * A transition that resizes the inspector while swapping its contents cannot
 * report zero on all three unless the panel and the track change width
 * together. The millisecond figures say how long each defect was on screen,
 * which is what separates a one-frame rounding artifact from a visible hole.
 */
export interface InspectorRevealSummary {
  layer: InspectorLayerId;
  readableFrames: number;
  maxClippedLeft: number;
  maxClippedRight: number;
  maxUncovered: number;
  clippedMs: number;
  uncoveredMs: number;
}

/**
 * How far a settings surface re-laid itself out while a person could see it.
 * A panel composed at its own destination width and revealed through
 * PanelGroup's moving clip reports zero on all three axes: its rows never
 * rewrap, its right edge never leaves the viewport edge, and its content never
 * rides up or down. Any non-zero value is the surface following the animating
 * inspector track instead of being revealed by it.
 */
export interface TransitionContentDrift {
  width: number;
  origin: number;
  vertical: number;
}

export const READABLE_PANE_SIZE = 180;
export const VISIBLE_PANE_OPACITY = 0.15;
export const MAX_MANDALA_RASTER_SCALE = 1.08;
// Auto's canonical 3×4 Card is about 0.69 once its header/footer are included.
// Anything below 0.6 represents a transient pencil-thin recomposition rather
// than an intentional portrait Card.
export const MIN_CARD_ASPECT_RATIO = 0.6;
export const MAX_CARD_ASPECT_RATIO = 1.8;

function cardExpectedToRemainReadable(
  trace: TransitionGeometryTrace,
  sample: TransitionGeometrySample
): boolean {
  if (trace.command === "card") {
    return sample.phase === "focus-card" || sample.phase === "return-split";
  }

  if (trace.command === "interrupt") {
    // The replay labels the next leg immediately before its click. Ignore the
    // covered Card's final pre-click sample; once its opacity becomes readable,
    // the same geometry checks apply and catch any surface a person can see.
    return (
      sample.phase === "interrupt-card" &&
      sample.cardOpacity >= VISIBLE_PANE_OPACITY
    );
  }

  return sample.cardOpacity >= VISIBLE_PANE_OPACITY;
}

function uniqueModePath(samples: TransitionGeometrySample[]): string[] {
  const path: string[] = [];
  for (const sample of samples) {
    if (!sample.selectedMode || path.at(-1) === sample.selectedMode) continue;
    path.push(sample.selectedMode);
  }
  return path;
}

function uniqueValuePath<T extends string | number>(values: T[]): T[] {
  const path: T[] = [];
  for (const value of values) {
    if (path.at(-1) !== value) path.push(value);
  }
  return path;
}

function uniqueCardLayoutPath(samples: TransitionGeometrySample[]): string[] {
  const path: string[] = [];
  for (const sample of samples) {
    const layout = `${sample.cardColumns}×${sample.cardRows}`;
    if (
      sample.cardColumns < 1 ||
      sample.cardRows < 1 ||
      path.at(-1) === layout
    ) {
      continue;
    }
    path.push(layout);
  }
  return path;
}

function uniqueCardLayoutLockPath(
  samples: TransitionGeometrySample[]
): string[] {
  const path: string[] = [];
  for (const sample of samples) {
    const state = sample.cardAutoLayoutLocked
      ? `locked ${sample.cardAutoLayoutLockColumns}×${sample.cardAutoLayoutLockRows}`
      : "free";
    if (path.at(-1) !== state) path.push(state);
  }
  return path;
}

function uniqueMotionSurfacePath(
  samples: TransitionGeometrySample[]
): string[] {
  return uniqueValuePath(
    samples.map((sample) => {
      if (sample.motion2DPresented && sample.motion3DPresented) {
        return "2D + 3D";
      }
      if (sample.motion3DPresented) return "3D";
      if (sample.motion2DPresented) return "2D";
      return "hidden";
    })
  );
}

function minimumVisibleSize(
  samples: TransitionGeometrySample[],
  phase: TransitionTracePhase,
  size: (sample: TransitionGeometrySample) => number,
  opacity: (sample: TransitionGeometrySample) => number
): number | null {
  const visibleSizes = samples
    .filter(
      (sample) =>
        sample.phase === phase && opacity(sample) >= VISIBLE_PANE_OPACITY
    )
    .map(size);

  return visibleSizes.length > 0 ? Math.min(...visibleSizes) : null;
}

function endpointUndershoot(
  samples: TransitionGeometrySample[],
  value: (sample: TransitionGeometrySample) => number
): TransitionEndpointUndershoot | null {
  const returnSamples = samples.filter(
    (sample) => sample.phase === "return-split" && value(sample) > 0
  );
  if (returnSamples.length < 2) return null;

  const start = value(returnSamples[0]!);
  const end = value(returnSamples.at(-1)!);
  const minimumSample = returnSamples.reduce((minimum, sample) =>
    value(sample) < value(minimum) ? sample : minimum
  );
  const minimum = value(minimumSample);
  return {
    start,
    end,
    minimum,
    undershoot: Math.max(0, Math.min(start, end) - minimum),
    minimumTime: minimumSample.time,
  };
}

function travelSummary(
  samples: TransitionGeometrySample[],
  value: (sample: TransitionGeometrySample) => number
): TransitionTravelSummary | null {
  const returnValues = samples
    .filter((sample) => sample.phase === "return-split" && value(sample) > 0)
    .map(value);
  if (returnValues.length < 2) return null;

  const start = returnValues[0]!;
  const end = returnValues.at(-1)!;
  const minimum = Math.min(...returnValues);
  const maximum = Math.max(...returnValues);
  const movingRight = end >= start;
  return {
    start,
    end,
    minimum,
    maximum,
    backtrack: movingRight
      ? Math.max(0, start - minimum)
      : Math.max(0, maximum - start),
    overshoot: movingRight
      ? Math.max(0, maximum - end)
      : Math.max(0, end - minimum),
  };
}

function phaseTravelSummary(
  samples: TransitionGeometrySample[],
  phase: TransitionTracePhase,
  value: (sample: TransitionGeometrySample) => number
): TransitionTravelSummary | null {
  const values = samples
    .filter((sample) => sample.phase === phase && value(sample) > 0)
    .map(value);
  if (values.length < 2) return null;

  const start = values[0]!;
  const end = values.at(-1)!;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const increasing = end >= start;
  return {
    start,
    end,
    minimum,
    maximum,
    backtrack: increasing
      ? Math.max(0, start - minimum)
      : Math.max(0, maximum - start),
    overshoot: increasing
      ? Math.max(0, maximum - end)
      : Math.max(0, end - minimum),
  };
}

function visiblePhaseRange(
  samples: TransitionGeometrySample[],
  phase: TransitionTracePhase,
  value: (sample: TransitionGeometrySample) => number
): TransitionValueRange | null {
  const values = samples
    .filter(
      (sample) =>
        sample.phase === phase &&
        sample.cardSettingsOpacity >= VISIBLE_PANE_OPACITY &&
        value(sample) > 0
    )
    .map(value);
  if (values.length === 0) return null;

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return {
    start: values[0]!,
    end: values.at(-1)!,
    minimum,
    maximum,
    variation: maximum - minimum,
  };
}

function cardEffectsOpacityOnsetSkew(
  samples: TransitionGeometrySample[]
): number | null {
  const handoff = samples.filter(
    (sample) => sample.phase === "focus-2d" && sample.desktopInspectorExpected
  );
  const first = handoff[0];
  if (!first || handoff.some((sample) => sample.dissolveActive)) return null;

  const cardOnset = handoff.find(
    (sample) => sample.cardOpacity < first.cardOpacity - 0.02
  );
  const effectsOnset = handoff.find(
    (sample) =>
      sample.effectsInspectorOpacity > first.effectsInspectorOpacity + 0.02
  );
  if (!cardOnset || !effectsOnset) return null;
  return Math.abs(cardOnset.time - effectsOnset.time);
}

function valueRange(
  samples: TransitionGeometrySample[],
  value: (sample: TransitionGeometrySample) => number
): TransitionValueRange | null {
  const values = samples.map(value).filter((candidate) => candidate > 0);
  if (values.length === 0) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return {
    start: values[0]!,
    end: values.at(-1)!,
    minimum,
    maximum,
    variation: maximum - minimum,
  };
}

function visibleTunnelRange(
  samples: TransitionGeometrySample[],
  value: (sample: TransitionGeometrySample) => number
): TransitionValueRange | null {
  return valueRange(
    samples.filter((sample) => sample.tunnelOpacity >= 0.05),
    value
  );
}

export function tunnelStageOpacity(sample: TransitionGeometrySample): number {
  return Math.max(sample.motion2DOpacity, sample.motion3DOpacity);
}

function motionHandoffLatency(trace: TransitionGeometryTrace): number | null {
  if (!trace.command.startsWith("3d")) return null;
  const request = trace.samples.find(
    (sample) => sample.selectedMode === "animation-3d"
  );
  if (!request) return null;
  const reveal = trace.samples.find(
    (sample) =>
      sample.time >= request.time &&
      sample.motion3DPresented &&
      sample.motion3DReady
  );
  return reveal ? Math.max(0, reveal.time - request.time) : null;
}

function late2DBackingChanges(samples: TransitionGeometrySample[]): number {
  const settledReturn = samples.filter(
    (sample) =>
      sample.phase === "return-2d" &&
      sample.motion2DPresented &&
      sample.motion2DOpacity >= 0.99 &&
      sample.mandalaBackingSize > 0
  );
  let changes = 0;
  for (let index = 1; index < settledReturn.length; index += 1) {
    const current = settledReturn[index]!;
    const previous = settledReturn[index - 1]!;
    if (
      Math.abs(current.mandalaBackingSize - previous.mandalaBackingSize) > 0.5
    ) {
      changes += 1;
    }
  }
  return changes;
}

function preparationProgressRegressions(
  samples: TransitionGeometrySample[]
): number {
  let previous: number | null = null;
  let regressions = 0;
  for (const sample of samples) {
    if (!sample.sceneCurtainVisible || sample.scenePreparationProgress === null)
      continue;
    if (
      previous !== null &&
      sample.scenePreparationProgress < previous - 0.001
    ) {
      regressions += 1;
    }
    previous = sample.scenePreparationProgress;
  }
  return regressions;
}

function uniqueTunnelSurfacePath(
  samples: TransitionGeometrySample[]
): string[] {
  return uniqueValuePath(
    samples.map((sample) => {
      if (sample.tunnelOpacity >= 0.95) return "Tunnel";
      if (sample.tunnelOpacity >= 0.05) return "2D base + Tunnel layers";
      return sample.tunnelCanvasReady ? "2D base" : "Blank";
    })
  );
}

function identityChanges(
  samples: TransitionGeometrySample[],
  identity: (sample: TransitionGeometrySample) => number
): number {
  const path = uniqueValuePath(
    samples.map(identity).filter((candidate) => candidate > 0)
  );
  return Math.max(0, path.length - 1);
}

function tunnelHandoffLatency(trace: TransitionGeometryTrace): number | null {
  if (!trace.command.startsWith("tunnel")) return null;
  const request = trace.samples.find(
    (sample) => sample.selectedMode === "tunnel"
  );
  if (!request) return null;
  const reveal = trace.samples.find(
    (sample) =>
      sample.time >= request.time &&
      sample.tunnelPresented &&
      sample.tunnelCanvasReady &&
      sample.tunnelOpacity >= 0.05
  );
  return reveal ? Math.max(0, reveal.time - request.time) : null;
}

function lateTunnelBackingChanges(samples: TransitionGeometrySample[]): number {
  const settledTunnel = samples.filter(
    (sample) =>
      sample.tunnelPresented &&
      sample.tunnelCanvasReady &&
      sample.tunnelOpacity >= 0.99 &&
      sample.tunnelBackingWidth > 0 &&
      sample.tunnelBackingHeight > 0
  );
  let changes = 0;
  for (let index = 1; index < settledTunnel.length; index += 1) {
    const previous = settledTunnel[index - 1]!;
    const current = settledTunnel[index]!;
    if (
      Math.abs(current.tunnelBackingWidth - previous.tunnelBackingWidth) >
        0.5 ||
      Math.abs(current.tunnelBackingHeight - previous.tunnelBackingHeight) > 0.5
    ) {
      changes += 1;
    }
  }
  return changes;
}

function maximumSampleStep(
  samples: TransitionGeometrySample[],
  value: (sample: TransitionGeometrySample) => number
): number {
  let maximum = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]!;
    const previous = samples[index - 1]!;
    maximum = Math.max(maximum, Math.abs(value(current) - value(previous)));
  }
  return Math.round(maximum * 1000) / 1000;
}

function lateTunnelLayerArrivals(samples: TransitionGeometrySample[]): number {
  let arrivals = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (
      !previous.tunnelLayersReady &&
      current.tunnelLayersReady &&
      current.tunnelLayerOpacityMaximum > 0.05
    ) {
      arrivals += 1;
    }
  }
  return arrivals;
}

/**
 * Count frames where a Tunnel copy is travelling to its formation while its
 * trail recorder is still live. Formation travel is visible composition, not
 * performed motion; one such frame is enough to leave a stray connector behind.
 */
function unguardedTunnelFormationFrames(
  samples: TransitionGeometrySample[]
): number {
  return samples.filter(
    (sample) =>
      sample.tunnelMovingLayerCount > 0 &&
      sample.tunnelTrailSuppressedLayerCount < sample.tunnelMovingLayerCount
  ).length;
}

function firstTunnelReveal(
  samples: TransitionGeometrySample[]
): TransitionGeometrySample[] {
  let start = -1;
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]!;
    const previous = samples[index - 1]!;
    if (current.tunnelOpacity > previous.tunnelOpacity + 0.001) {
      start = index - 1;
      break;
    }
  }
  if (start < 0) return [];
  let end = samples.length - 1;
  for (let index = start + 1; index < samples.length; index += 1) {
    if (samples[index]!.tunnelOpacity >= 0.99) {
      end = index;
      break;
    }
  }
  return samples.slice(start, end + 1);
}

function closestTunnelSample(
  samples: TransitionGeometrySample[],
  target: number
): TransitionGeometrySample | null {
  if (samples.length === 0) return null;
  return samples.reduce((closest, sample) =>
    Math.abs(sample.tunnelOpacity - target) <
    Math.abs(closest.tunnelOpacity - target)
      ? sample
      : closest
  );
}

/** Grade the additional props the Canvas2D renderer actually drew. */
function tunnelPaintedArrival(
  samples: TunnelPaintSample[]
): TunnelPaintedArrival | null {
  const reveal: TunnelPaintSample[] = [];
  let started = false;
  let baseline: TunnelPaintSample | null = null;
  let previousProgress = 0;
  for (const sample of samples) {
    if (!started) {
      if (sample.progress <= 0) {
        baseline = sample;
        continue;
      }
      started = true;
      if (baseline) reveal.push(baseline);
    }
    if (sample.progress + 0.001 < previousProgress) break;
    reveal.push(sample);
    previousProgress = sample.progress;
    if (sample.progress >= 0.999) break;
  }
  if (reveal.length < 2) return null;
  const start = reveal[0]!;
  const end = reveal[reveal.length - 1]!;
  const peakProps = Math.max(
    0,
    ...reveal.map((sample) => sample.paintedPropCount)
  );
  const duration = Math.max(0, end.time - start.time);
  if (peakProps <= 0 || duration <= 0) return null;

  const atProgress = (progress: number): TunnelPaintSample =>
    reveal.reduce((closest, sample) =>
      Math.abs(sample.progress - progress) <
      Math.abs(closest.progress - progress)
        ? sample
        : closest
    );

  return {
    peakProps,
    allPropsPerceptibleProgress:
      reveal.find(
        (sample) =>
          sample.paintedPropCount >= peakProps &&
          sample.perceptiblePropCount >= peakProps
      )?.progress ?? null,
    quarterMeanAlpha: Math.round(atProgress(0.25).meanAlpha * 1000) / 1000,
    halfwayMeanAlpha: Math.round(atProgress(0.5).meanAlpha * 1000) / 1000,
    growthFrames: reveal.filter(
      (sample) => sample.meanAlpha >= 0.05 && sample.meanAlpha <= 0.95
    ).length,
    durationMs: Math.round(duration * 10) / 10,
  };
}

function uniquePerformanceSurfacePath(
  samples: TransitionGeometrySample[]
): string[] {
  return uniqueValuePath(
    samples.map((sample) => {
      if (
        sample.stageLayerOpacity >= 0.05 &&
        sample.performanceLayerOpacity >= 0.05
      ) {
        return "Motion stage + Performance stage";
      }
      if (sample.performanceLayerOpacity >= 0.05) return "Performance stage";
      if (sample.stageLayerOpacity >= 0.05) return "Motion stage";
      return "Blank";
    })
  );
}

function contentDrift(
  samples: TransitionGeometrySample[],
  isReadable: (sample: TransitionGeometrySample) => boolean,
  width: (sample: TransitionGeometrySample) => number,
  left: (sample: TransitionGeometrySample) => number,
  top: (sample: TransitionGeometrySample) => number
): TransitionContentDrift | null {
  const readable = samples.filter(
    (sample) => isReadable(sample) && width(sample) > 0
  );
  if (readable.length < 2) return null;

  const spread = (value: (sample: TransitionGeometrySample) => number) => {
    const values = readable.map(value);
    return Math.max(...values) - Math.min(...values);
  };

  return {
    width: spread(width),
    origin: spread(left),
    vertical: spread(top),
  };
}

const INSPECTOR_LAYER_IDS: InspectorLayerId[] = [
  "motion",
  "art",
  "card",
  "performance",
];

/**
 * Opacity below which a layer contributes nothing a person could see.
 *
 * A layer at exactly zero is still in the DOM with its geometry resolved, so
 * without this floor a fully faded-out surface would be counted as painting
 * the track it no longer contributes to.
 */
const PARTICIPATING_LAYER_OPACITY = 0.02;

/**
 * Measure the widest lighter strip the inspector track showed within a frame.
 *
 * Every layer is inset to the same track, so the track box is any layer's box.
 * The track is cut at every panel edge, and each band composites the layers
 * covering it: the layer's own fill everywhere, plus its panel's fill where
 * the panel reaches. Bands are then compared with the strongest band in the
 * same frame, so a crossfade that dims the whole track uniformly scores zero
 * and only a hard-edged step between neighbouring bands is reported.
 */
function summarizeInspectorSurfaceStep(
  samples: TransitionGeometrySample[]
): InspectorSurfaceStep | null {
  const summary: InspectorSurfaceStep = {
    widthPx: 0,
    alphaDrop: 0,
    ms: 0,
    frames: 0,
  };
  let measured = false;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    if (!sample.desktopInspectorExpected || !sample.inspectorReveal) continue;
    const layers = INSPECTOR_LAYER_IDS.map(
      (layer) => sample.inspectorReveal[layer]
    ).filter((reveal) => reveal && reveal.layerWidth > 0);
    if (!layers.length) continue;
    const firstLayer = layers[0]!;
    const trackLeft = firstLayer.layerLeft;
    const trackRight = trackLeft + firstLayer.layerWidth;
    if (trackRight - trackLeft <= 0) continue;
    measured = true;
    summary.frames += 1;

    // Every layer covers the whole track, so a layer contributes its own fill
    // everywhere and the panel's fill only where the panel reaches.
    const contributors = layers
      .filter((reveal) => reveal.opacity > PARTICIPATING_LAYER_OPACITY)
      .map((reveal) => ({
        opacity: Math.min(1, reveal.opacity),
        layerAlpha: reveal.layerSurfaceAlpha,
        panelAlpha: reveal.panelSurfaceAlpha,
        from: Math.max(trackLeft, reveal.panelLeft),
        to: Math.min(trackRight, reveal.panelLeft + reveal.panelWidth),
      }));

    const edges = new Set<number>([trackLeft, trackRight]);
    for (const contributor of contributors) {
      if (contributor.to <= contributor.from) continue;
      edges.add(contributor.from);
      edges.add(contributor.to);
    }
    const ordered = [...edges].sort((a, b) => a - b);

    const bands: { width: number; alpha: number }[] = [];
    for (let edge = 1; edge < ordered.length; edge += 1) {
      const from = ordered[edge - 1]!;
      const to = ordered[edge]!;
      if (to <= from) continue;
      const middle = (from + to) / 2;
      let transparency = 1;
      for (const contributor of contributors) {
        const onPanel = contributor.from <= middle && middle < contributor.to;
        const fill = onPanel
          ? 1 - (1 - contributor.layerAlpha) * (1 - contributor.panelAlpha)
          : contributor.layerAlpha;
        transparency *= 1 - contributor.opacity * fill;
      }
      bands.push({ width: to - from, alpha: 1 - transparency });
    }
    if (bands.length < 2) continue;

    const strongest = Math.max(...bands.map((band) => band.alpha));
    // A step this shallow is a rounding artefact of compositing, not an edge a
    // reader can see against a dark workspace.
    const visible = bands.filter((band) => strongest - band.alpha > 0.02);
    if (!visible.length) continue;
    const width = visible.reduce((total, band) => total + band.width, 0);
    const drop = Math.max(...visible.map((band) => strongest - band.alpha));
    summary.widthPx = Math.max(summary.widthPx, width);
    summary.alphaDrop = Math.max(summary.alphaDrop, drop);
    const previous = samples[index - 1];
    if (previous) summary.ms += sample.time - previous.time;
  }
  return measured ? summary : null;
}

/**
 * Grade one inspector layer's reveal across the frames a person could read it.
 *
 * Sub-pixel layout rounding routinely puts a fraction of a pixel outside the
 * clip box, so a band only counts once it exceeds one pixel. Durations are
 * accumulated from the real frame spacing rather than a frame count, because a
 * starved measurement host stretches frames and would otherwise understate how
 * long a hole was on screen.
 */
function summarizeInspectorReveal(
  samples: TransitionGeometrySample[],
  layer: InspectorLayerId
): InspectorRevealSummary {
  const summary: InspectorRevealSummary = {
    layer,
    readableFrames: 0,
    maxClippedLeft: 0,
    maxClippedRight: 0,
    maxUncovered: 0,
    clippedMs: 0,
    uncoveredMs: 0,
  };
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    if (!sample.desktopInspectorExpected) continue;
    const reveal = sample.inspectorReveal?.[layer];
    if (!reveal || reveal.layerWidth <= 0 || reveal.panelWidth <= 0) continue;
    if (reveal.opacity < VISIBLE_PANE_OPACITY) continue;
    summary.readableFrames += 1;
    const layerRight = reveal.layerLeft + reveal.layerWidth;
    const panelRight = reveal.panelLeft + reveal.panelWidth;
    const clippedLeft = Math.max(0, reveal.layerLeft - reveal.panelLeft);
    const clippedRight = Math.max(0, panelRight - layerRight);
    const uncovered =
      Math.max(0, reveal.panelLeft - reveal.layerLeft) +
      Math.max(0, layerRight - panelRight);
    summary.maxClippedLeft = Math.max(summary.maxClippedLeft, clippedLeft);
    summary.maxClippedRight = Math.max(summary.maxClippedRight, clippedRight);
    summary.maxUncovered = Math.max(summary.maxUncovered, uncovered);
    const previous = samples[index - 1];
    const span = previous ? sample.time - previous.time : 0;
    if (clippedLeft > 1 || clippedRight > 1) summary.clippedMs += span;
    if (uncovered > 1) summary.uncoveredMs += span;
  }
  return summary;
}

function longestSampleGap(samples: TransitionGeometrySample[]): number {
  let longest = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]!;
    const previous = samples[index - 1]!;
    longest = Math.max(longest, current.time - previous.time);
  }
  return longest;
}

/**
 * What the Card's contained box did after its size pin was released.
 *
 * The Card holds a pinned box while `data-contain-size-motion` is set, and only
 * that attribute carries the width/height transition. When the pin's timer
 * clears the attribute, the next measurement recomputes the box from the real
 * container with no transition left to carry it, so any distance still
 * outstanding at that moment is crossed in a single frame.
 */
/**
 * Where the Card started when it was committed back into the workspace, and how
 * far it had to travel to get to rest.
 *
 * The Card is centred in its column, so a Card whose box has collapsed sits on
 * that column's centre line with nothing to centre. When the column then grows
 * for the new mode, the collapsed box lands at the bottom of it and the size
 * transition sweeps the visible card up into place. Measuring the visible
 * card's centre against its own column tells the two apart: a Card composed at
 * its destination reports zero travel and nothing offstage, while a Card that
 * grew into place from below reports the distance it climbed.
 */
/**
 * How the stacked inspector dock gave its space back.
 *
 * A held panel -- flex-grow and flex-shrink both zero -- is sized entirely by
 * its flex-basis, so a basis that changes between a length and a keyword is a
 * discrete change CSS cannot interpolate. The group then re-lays out in one
 * frame and everything below the dock teleports. Measuring the dock's largest
 * single-frame change separates the two: an interpolated collapse moves it a
 * frame's worth at a time, while a snap moves its whole height at once.
 */
export interface DockCollapse {
  /** Largest single-frame change of the dock's own size. */
  stepPx: number;
  /** Total size the dock gave up. */
  travelPx: number;
  frames: number;
  ms: number;
}

export interface CardArrival {
  /** Largest single-frame movement of the visible card's centre. */
  stepPx: number;
  /** Total distance that centre covered before it settled. */
  travelPx: number;
  /** How far below its own column the centre started. Zero when on stage. */
  offstagePx: number;
  frames: number;
  ms: number;
}

export interface CardSizePinRelease {
  /** Largest single-frame width change after the pin was released. */
  stepPx: number;
  /** Total width the box still had to travel once the pin was released. */
  travelPx: number;
  /** Sampled frames that travel was spread across. */
  frames: number;
  /** How long after the pin released the box reached its final width. */
  ms: number;
  /** Fraction of the container the box filled when the pin released. */
  fillBefore: number;
  /** Fraction of the container the box filled once it settled. */
  fillAfter: number;
}

/**
 * Grade the frames that follow the Card's size pin.
 *
 * The pin's last frame is the baseline: everything the box does afterwards is
 * untransitioned by construction, so a large `stepPx` spread over one or two
 * frames is a visible jump rather than motion. Traces whose Card never pinned,
 * or that stop before the release, report nothing rather than a zero — an
 * absent measurement must not read as a passing one.
 */
function summarizeCardSizePinRelease(
  samples: TransitionGeometrySample[]
): CardSizePinRelease | null {
  let pinEnd = -1;
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index]!.cardContainSizeMotion) pinEnd = index;
  }
  if (pinEnd < 0 || pinEnd >= samples.length - 1) return null;

  const measured = samples
    .slice(pinEnd)
    .filter(
      (sample) => sample.cardContentWidth > 0 && sample.cardRootWidth > 0
    );
  if (measured.length < 2) return null;

  const first = measured[0]!;
  const last = measured[measured.length - 1]!;

  let stepPx = 0;
  let settledIndex = 0;
  for (let index = 1; index < measured.length; index += 1) {
    const current = measured[index]!;
    const previous = measured[index - 1]!;
    const delta = Math.abs(
      current.cardContentWidth - previous.cardContentWidth
    );
    if (delta > stepPx) stepPx = delta;
    if (delta > 0.5) settledIndex = index;
  }

  const settled = measured[settledIndex]!;
  return {
    stepPx: Math.round(stepPx * 10) / 10,
    travelPx:
      Math.round(
        Math.abs(last.cardContentWidth - first.cardContentWidth) * 10
      ) / 10,
    frames: settledIndex,
    ms: Math.round((settled.time - first.time) * 10) / 10,
    fillBefore:
      Math.round((first.cardContentWidth / first.cardRootWidth) * 1000) / 1000,
    fillAfter:
      Math.round((last.cardContentWidth / last.cardRootWidth) * 1000) / 1000,
  };
}

/**
 * Grade the Card's arrival into the workspace.
 *
 * Everything is measured from the last commit into card mode, because that is
 * the frame the user perceives as the start of the arrival. A trace that never
 * commits into card, or that stops before the Card is measurable, reports
 * nothing rather than a zero — an absent measurement must not read as a
 * passing one.
 */
function summarizeDockCollapse(
  samples: TransitionGeometrySample[]
): DockCollapse | null {
  const held = samples.filter(
    (sample) => sample.inspectorFlexGrow === 0 && sample.inspectorSize >= 0
  );
  if (held.length < 2) return null;

  let stepPx = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (let index = 1; index < held.length; index += 1) {
    // Either direction counts. A round trip opens the dock and closes it again,
    // and a snap on the way out is the same defect as a snap on the way in.
    const previousHeld = held[index - 1]!;
    const currentHeld = held[index]!;
    const delta = Math.abs(
      previousHeld.inspectorSize - currentHeld.inspectorSize
    );
    if (delta > stepPx) stepPx = delta;
    if (delta > 0.5) {
      if (firstIndex < 0) firstIndex = index - 1;
      lastIndex = index;
    }
  }
  if (firstIndex < 0) return null;

  // The dock's endpoints are equal after a round trip, so the distance that
  // matters is its full excursion rather than the difference between the ends.
  const moving = held
    .slice(firstIndex, lastIndex + 1)
    .map((s) => s.inspectorSize);
  return {
    stepPx: Math.round(stepPx * 10) / 10,
    travelPx: Math.round((Math.max(...moving) - Math.min(...moving)) * 10) / 10,
    frames: lastIndex - firstIndex,
    ms: Math.round((held[lastIndex]!.time - held[firstIndex]!.time) * 10) / 10,
  };
}

function summarizeCardArrival(
  samples: TransitionGeometrySample[]
): CardArrival | null {
  let commit = -1;
  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]!;
    const previous = samples[index - 1]!;
    if (current.selectedMode === "card" && previous.selectedMode !== "card") {
      commit = index;
    }
  }
  if (commit < 0) return null;

  // A collapsed panel is exactly where the card is parked before it climbs, so
  // filtering on panel height would drop every frame that carries the defect.
  // Only the card's own content has to be measurable.
  const measured = samples
    .slice(commit)
    .filter((sample) => sample.cardContentHeight > 0);
  if (measured.length < 2) return null;

  const first = measured[0]!;
  const last = measured[measured.length - 1]!;

  let stepPx = 0;
  let settledIndex = 0;
  for (let index = 1; index < measured.length; index += 1) {
    const current = measured[index]!;
    const previous = measured[index - 1]!;
    const delta = Math.abs(
      current.cardContentCenterY - previous.cardContentCenterY
    );
    if (delta > stepPx) stepPx = delta;
    if (delta > 0.5) settledIndex = index;
  }

  const columnBottom = first.cardPanelCenterY + first.cardPanelHeight / 2;
  const settled = measured[settledIndex]!;
  return {
    stepPx: Math.round(stepPx * 10) / 10,
    travelPx:
      Math.round(
        Math.abs(last.cardContentCenterY - first.cardContentCenterY) * 10
      ) / 10,
    offstagePx:
      Math.round(Math.max(0, first.cardContentCenterY - columnBottom) * 10) /
      10,
    frames: settledIndex,
    ms: Math.round((settled.time - first.time) * 10) / 10,
  };
}

export function summarizeTransitionGeometry(
  trace: TransitionGeometryTrace
): TransitionGeometrySummary {
  const isMotionTrace = trace.command.startsWith("3d");
  const isTunnelTrace = trace.command.startsWith("tunnel");
  const tunnelRevealSamples = isTunnelTrace
    ? firstTunnelReveal(trace.samples)
    : [];
  const isCardStageTrace = trace.command.startsWith("card-");
  const isPerformanceTrace = trace.command.startsWith("performances-");
  const tinyCardFrames = trace.samples.filter(
    (sample) =>
      !sample.dissolveActive &&
      sample.cardOpacity >= VISIBLE_PANE_OPACITY &&
      sample.cardContentWidth < READABLE_PANE_SIZE
  ).length;
  const tinyAnimationFrames = trace.samples.filter(
    (sample) =>
      !sample.dissolveActive &&
      sample.animationOpacity >= VISIBLE_PANE_OPACITY &&
      sample.animationSize < READABLE_PANE_SIZE
  ).length;
  const mandalaReturnSamples = trace.samples.filter(
    (sample) => sample.phase === "return-split" && sample.mandalaRasterScale > 0
  );
  const magnifiedMandalaReturnFrames = mandalaReturnSamples.filter(
    (sample) => sample.mandalaRasterScale > MAX_MANDALA_RASTER_SCALE
  ).length;
  const expectedCardSamples = trace.samples.filter(
    (sample) =>
      cardExpectedToRemainReadable(trace, sample) && !sample.dissolveActive
  );
  const cardAspectRatios = expectedCardSamples
    .filter(
      (sample) => sample.cardContentWidth > 0 && sample.cardContentHeight > 0
    )
    .map((sample) => sample.cardContentWidth / sample.cardContentHeight);
  const cardIsSquashed = (sample: TransitionGeometrySample): boolean => {
    const { cardContentWidth: width, cardContentHeight: height } = sample;
    if (width < READABLE_PANE_SIZE || height < READABLE_PANE_SIZE) return true;
    const aspectRatio = width / height;
    return (
      aspectRatio < MIN_CARD_ASPECT_RATIO || aspectRatio > MAX_CARD_ASPECT_RATIO
    );
  };
  const squashedCardFrames = expectedCardSamples.filter(cardIsSquashed).length;
  const dissolveCoveredCardFrames = trace.samples.filter(
    (sample) =>
      sample.dissolveActive &&
      cardExpectedToRemainReadable(trace, sample) &&
      cardIsSquashed(sample)
  ).length;
  const transformedCardCellSamples = expectedCardSamples.filter(
    (sample) => sample.cardTransformedCellCount > 0
  );
  const motionPreparationSamples = isMotionTrace
    ? trace.samples.filter(
        (sample) =>
          sample.phase === "prepare-3d" &&
          sample.motion3DPreparing &&
          sample.motion2DOpacity >= VISIBLE_PANE_OPACITY &&
          sample.mandalaMaximumRasterScale > 0
      )
    : [];
  const motionPreparationRasterBaseline = isMotionTrace
    ? (trace.samples.find(
        (sample) =>
          !sample.motion3DPreparing &&
          sample.motion2DPresented &&
          sample.motion2DOpacity >= VISIBLE_PANE_OPACITY &&
          sample.mandalaMaximumRasterScale > 0
      )?.mandalaMaximumRasterScale ??
      motionPreparationSamples[0]?.mandalaMaximumRasterScale ??
      null)
    : null;
  const magnifiedMotionPreparationSamples = motionPreparationSamples.filter(
    (sample) =>
      motionPreparationRasterBaseline !== null &&
      sample.mandalaMaximumRasterScale / motionPreparationRasterBaseline >
        MAX_MANDALA_RASTER_SCALE
  );

  return {
    cardExitMinimum: minimumVisibleSize(
      trace.samples,
      "focus-2d",
      (sample) => sample.cardContentWidth,
      (sample) => sample.cardOpacity
    ),
    cardEntryMinimum: minimumVisibleSize(
      trace.samples,
      "return-split",
      (sample) => sample.cardContentWidth,
      (sample) => sample.cardOpacity
    ),
    animationExitMinimum: minimumVisibleSize(
      trace.samples,
      "focus-card",
      (sample) => sample.animationSize,
      (sample) => sample.animationOpacity
    ),
    animationEntryMinimum: minimumVisibleSize(
      trace.samples,
      "return-split",
      (sample) => sample.animationSize,
      (sample) => sample.animationOpacity
    ),
    tinyCardFrames,
    tinyAnimationFrames,
    mandalaReturnRasterScaleMaximum:
      mandalaReturnSamples.length === 0
        ? null
        : Math.max(
            ...mandalaReturnSamples.map((sample) => sample.mandalaRasterScale)
          ),
    magnifiedMandalaReturnFrames,
    dissolveFrames: trace.samples.filter((sample) => sample.dissolveActive)
      .length,
    cardBoxMinimum:
      expectedCardSamples.length === 0
        ? null
        : {
            width: Math.min(
              ...expectedCardSamples.map((sample) => sample.cardContentWidth)
            ),
            height: Math.min(
              ...expectedCardSamples.map((sample) => sample.cardContentHeight)
            ),
          },
    cardAspectMinimum:
      cardAspectRatios.length === 0 ? null : Math.min(...cardAspectRatios),
    cardAspectMaximum:
      cardAspectRatios.length === 0 ? null : Math.max(...cardAspectRatios),
    squashedCardFrames,
    dissolveCoveredCardFrames,
    transformedCardCellFrames: transformedCardCellSamples.length,
    maximumTransformedCardCells:
      transformedCardCellSamples.length === 0
        ? 0
        : Math.max(
            ...transformedCardCellSamples.map(
              (sample) => sample.cardTransformedCellCount
            )
          ),
    modePath: uniqueModePath(trace.samples),
    panelDirectionPath: uniqueValuePath(
      trace.samples.map((sample) => sample.direction)
    ),
    outerDirectionPath: uniqueValuePath(
      trace.samples.map((sample) => sample.outerDirection)
    ),
    cardLayoutPath: uniqueCardLayoutPath(trace.samples),
    cardLayoutLockPath: uniqueCardLayoutLockPath(trace.samples),
    cardReturnPanelWidth: endpointUndershoot(
      trace.samples,
      (sample) => sample.cardPanelWidth
    ),
    cardReturnPanelHeight: endpointUndershoot(
      trace.samples,
      (sample) => sample.cardPanelHeight
    ),
    cardReturnRootWidth: endpointUndershoot(
      trace.samples,
      (sample) => sample.cardRootWidth
    ),
    cardReturnRootHeight: endpointUndershoot(
      trace.samples,
      (sample) => sample.cardRootHeight
    ),
    cardReturnVisualWidth: endpointUndershoot(
      trace.samples,
      (sample) => sample.cardContentWidth
    ),
    cardReturnVisualHeight: endpointUndershoot(
      trace.samples,
      (sample) => sample.cardContentHeight
    ),
    cardReturnTravel: travelSummary(
      trace.samples,
      (sample) => sample.cardContentCenterX
    ),
    animationReturnSizeTravel: travelSummary(
      trace.samples,
      (sample) => sample.animationSize
    ),
    cardSettingsFocusWidth: visiblePhaseRange(
      trace.samples,
      "focus-card",
      (sample) => sample.cardSettingsWidth
    ),
    cardSettingsFocusHeight: visiblePhaseRange(
      trace.samples,
      "focus-card",
      (sample) => sample.cardSettingsHeight
    ),
    cardSettingsFocusCenterY: visiblePhaseRange(
      trace.samples,
      "focus-card",
      (sample) => sample.cardSettingsCenterY
    ),
    cardSettingsReturnWidth: visiblePhaseRange(
      trace.samples,
      "return-split",
      (sample) => sample.cardSettingsWidth
    ),
    cardSettingsReturnHeight: visiblePhaseRange(
      trace.samples,
      "return-split",
      (sample) => sample.cardSettingsHeight
    ),
    cardSettingsReturnCenterY: visiblePhaseRange(
      trace.samples,
      "return-split",
      (sample) => sample.cardSettingsCenterY
    ),
    cardEffectsSeamGapMaximum: Math.max(
      0,
      ...trace.samples
        .filter(
          (sample) =>
            sample.phase === "focus-2d" &&
            sample.desktopInspectorExpected &&
            sample.cardPanelWidth > 0 &&
            sample.inspectorSize > 0
        )
        .map((sample) => sample.cardEffectsSeamGap)
    ),
    cardEffectsOpacityOnsetSkew: cardEffectsOpacityOnsetSkew(trace.samples),
    cardEffectsCrossfadeFrames: trace.samples.filter(
      (sample) =>
        sample.phase === "focus-2d" &&
        sample.desktopInspectorExpected &&
        !sample.dissolveActive &&
        sample.cardOpacity >= 0.05 &&
        sample.effectsInspectorOpacity >= 0.05
    ).length,
    cardEffectsBlankFrames: trace.samples.filter(
      (sample) =>
        sample.phase === "focus-2d" &&
        sample.desktopInspectorExpected &&
        !sample.dissolveActive &&
        sample.cardOpacity < 0.05 &&
        sample.effectsInspectorOpacity < 0.05
    ).length,
    motionBlankFrames: isMotionTrace
      ? trace.samples.filter(
          (sample) =>
            !sample.dissolveActive &&
            sample.motion2DOpacity < 0.05 &&
            sample.motion3DOpacity < 0.05
        ).length
      : 0,
    motionUnready3DFrames: isMotionTrace
      ? trace.samples.filter(
          (sample) =>
            sample.motion3DPresented &&
            !sample.motion3DReady &&
            !sample.sceneCurtainVisible
        ).length
      : 0,
    motionCurtainFrames: isMotionTrace
      ? trace.samples.filter(
          (sample) => sample.motion3DPresented && sample.sceneCurtainVisible
        ).length
      : 0,
    motionMisidentified3DFrames: isMotionTrace
      ? trace.samples.filter(
          (sample) =>
            !sample.dissolveActive &&
            sample.selectedMode === "animation-3d" &&
            sample.motion2DPresented
        ).length
      : 0,
    motionPreparationProgressRegressions: isMotionTrace
      ? preparationProgressRegressions(trace.samples)
      : 0,
    motionPreparationLabels: isMotionTrace
      ? uniqueValuePath(
          trace.samples
            .map((sample) => sample.scenePreparationLabel)
            .filter((label): label is string => Boolean(label))
        )
      : [],
    motionCrossfadeFrames: isMotionTrace
      ? trace.samples.filter(
          (sample) =>
            sample.motion2DOpacity >= 0.05 && sample.motion3DOpacity >= 0.05
        ).length
      : 0,
    motionPreparationFrames: isMotionTrace
      ? trace.samples.filter((sample) => sample.motion3DPreparing).length
      : 0,
    motionPreparationGeometryHeldFrames: isMotionTrace
      ? trace.samples.filter(
          (sample) => sample.motion3DPreparing && sample.motion2DPreparationHeld
        ).length
      : 0,
    motionPreparationRasterScaleMaximum:
      motionPreparationSamples.length === 0
        ? null
        : Math.max(
            ...motionPreparationSamples.map(
              (sample) => sample.mandalaMaximumRasterScale
            )
          ),
    motionPreparationRasterGrowthMaximum:
      motionPreparationSamples.length === 0 ||
      motionPreparationRasterBaseline === null
        ? null
        : Math.max(
            ...motionPreparationSamples.map(
              (sample) =>
                sample.mandalaMaximumRasterScale /
                motionPreparationRasterBaseline
            )
          ),
    motionMagnifiedPreparationFrames: magnifiedMotionPreparationSamples.length,
    motionLate2DBackingChanges: isMotionTrace
      ? late2DBackingChanges(trace.samples)
      : 0,
    motionSurfacePath: isMotionTrace
      ? uniqueMotionSurfacePath(trace.samples)
      : [],
    motionHandoffLatency: motionHandoffLatency(trace),
    motionStageSize: isMotionTrace
      ? valueRange(trace.samples, (sample) => sample.stageSize)
      : null,
    motionInspectorSize: isMotionTrace
      ? valueRange(trace.samples, (sample) => sample.inspectorSize)
      : null,
    tunnelUnreadyFrames: isTunnelTrace
      ? trace.samples.filter(
          (sample) => sample.tunnelOpacity >= 0.05 && !sample.tunnelCanvasReady
        ).length
      : 0,
    tunnelUnpreparedLayerFrames: isTunnelTrace
      ? trace.samples.filter(
          (sample) => sample.tunnelOpacity >= 0.05 && !sample.tunnelLayersReady
        ).length
      : 0,
    tunnelUnpreparedTextureFrames: isTunnelTrace
      ? trace.samples.filter(
          (sample) =>
            sample.tunnelOpacity >= 0.05 &&
            (!sample.tunnelTexturesReady ||
              sample.tunnelTextureLoaded < sample.tunnelPreparedLayerCount)
        ).length
      : 0,
    tunnelLateLayerArrivals: isTunnelTrace
      ? lateTunnelLayerArrivals(trace.samples)
      : 0,
    tunnelLayerOpacityStepMaximum: isTunnelTrace
      ? maximumSampleStep(
          trace.samples,
          (sample) => sample.tunnelLayerOpacityMaximum
        )
      : 0,
    tunnelGridOpacityStepMaximum: isTunnelTrace
      ? maximumSampleStep(trace.samples, (sample) => sample.tunnelGridOpacity)
      : 0,
    tunnelLayerOpacitySpreadMaximum: isTunnelTrace
      ? Math.round(
          Math.max(
            0,
            ...trace.samples.map(
              (sample) =>
                sample.tunnelLayerOpacityMaximum -
                sample.tunnelLayerOpacityMinimum
            )
          ) * 1000
        ) / 1000
      : 0,
    tunnelAllLayersPerceptibleProgress: isTunnelTrace
      ? (tunnelRevealSamples.find(
          (sample) =>
            sample.tunnelPreparedLayerCount > 0 &&
            sample.tunnelPerceptibleLayerCount >=
              sample.tunnelPreparedLayerCount
        )?.tunnelOpacity ?? null)
      : null,
    tunnelLayerMeanOpacityAtHalf: isTunnelTrace
      ? (closestTunnelSample(tunnelRevealSamples, 0.5)
          ?.tunnelLayerOpacityMean ?? null)
      : null,
    tunnelPaintedArrival: isTunnelTrace
      ? tunnelPaintedArrival(trace.tunnelPaintSamples ?? [])
      : null,
    tunnelFormationTrailCaptures: isTunnelTrace
      ? Math.max(
          0,
          ...trace.samples.map((sample) => sample.tunnelFormationTrailCaptures)
        )
      : 0,
    tunnelUnguardedFormationFrames: isTunnelTrace
      ? unguardedTunnelFormationFrames(trace.samples)
      : 0,
    tunnelPreparedLayerCountMaximum: isTunnelTrace
      ? Math.max(
          0,
          ...trace.samples.map((sample) => sample.tunnelPreparedLayerCount)
        )
      : 0,
    tunnelFormationPoseDriftMaximum: isTunnelTrace
      ? Math.round(
          Math.max(
            0,
            ...trace.samples.map((sample) => sample.tunnelFormationPoseDrift)
          ) * 1000
        ) / 1000
      : 0,
    tunnelFormationPoseDriftFrames: isTunnelTrace
      ? trace.samples.filter(
          (sample) =>
            sample.tunnelOpacity >= 0.05 &&
            sample.tunnelOpacity <= 0.95 &&
            sample.tunnelFormationPoseDrift > 0.001
        ).length
      : 0,
    tunnelCrossfadeFrames: isTunnelTrace
      ? trace.samples.filter(
          (sample) =>
            sample.tunnelOpacity >= 0.05 && sample.tunnelOpacity <= 0.95
        ).length
      : 0,
    tunnelDoubleFadeFrames: isTunnelTrace
      ? trace.samples.filter((sample) => {
          const stageOpacity = tunnelStageOpacity(sample);
          return (
            sample.tunnelOpacity >= 0.05 &&
            sample.tunnelOpacity <= 0.95 &&
            stageOpacity >= 0.05 &&
            stageOpacity <= 0.95
          );
        }).length
      : 0,
    tunnelBlankFrames: isTunnelTrace
      ? trace.samples.filter(
          (sample) =>
            !sample.dissolveActive &&
            !sample.tunnelCanvasReady &&
            tunnelStageOpacity(sample) < 0.05
        ).length
      : 0,
    tunnelLateBackingChanges: isTunnelTrace
      ? lateTunnelBackingChanges(trace.samples)
      : 0,
    tunnelInspectorIdentityChanges: isTunnelTrace
      ? identityChanges(
          trace.samples.filter((sample) => sample.desktopInspectorExpected),
          (sample) => sample.inspectorIdentity
        )
      : 0,
    tunnelAnimatorIdentityChanges: isTunnelTrace
      ? identityChanges(trace.samples, (sample) => sample.animatorIdentity)
      : 0,
    tunnelDuplicateCanvasFrames: isTunnelTrace
      ? trace.samples.filter((sample) => sample.animatorCanvasCount !== 1)
          .length
      : 0,
    tunnelDuplicateSettingsFrames: isTunnelTrace
      ? trace.samples.filter((sample) => sample.activeArtSettingsCount > 1)
          .length
      : 0,
    tunnelSurfacePath: isTunnelTrace
      ? uniqueTunnelSurfacePath(trace.samples)
      : [],
    tunnelHandoffLatency: tunnelHandoffLatency(trace),
    tunnelStageSize: isTunnelTrace
      ? valueRange(trace.samples, (sample) => sample.stageSize)
      : null,
    tunnelDisplaySize: isTunnelTrace
      ? visibleTunnelRange(trace.samples, (sample) =>
          Math.min(sample.tunnelDisplayWidth, sample.tunnelDisplayHeight)
        )
      : null,
    cardStageCardIdentityChanges: isCardStageTrace
      ? identityChanges(trace.samples, (sample) => sample.cardIdentity)
      : 0,
    cardStageAnimatorIdentityChanges: isCardStageTrace
      ? identityChanges(trace.samples, (sample) => sample.animatorIdentity)
      : 0,
    cardStageInspectorIdentityChanges: isCardStageTrace
      ? identityChanges(
          trace.samples.filter((sample) => sample.desktopInspectorExpected),
          (sample) => sample.inspectorIdentity
        )
      : 0,
    cardStageBlankFrames: isCardStageTrace
      ? trace.samples.filter(
          (sample) =>
            !sample.dissolveActive &&
            sample.cardOpacity < 0.05 &&
            sample.animationOpacity < 0.05
        ).length
      : 0,
    cardStageSplitFrames: isCardStageTrace
      ? trace.samples.filter((sample) => sample.selectedMode === "split").length
      : 0,
    cardStageSettingsBlankFrames: isCardStageTrace
      ? trace.samples.filter(
          (sample) =>
            sample.desktopInspectorExpected &&
            !sample.dissolveActive &&
            sample.cardSettingsOpacity < 0.05 &&
            sample.effectsInspectorOpacity < 0.05 &&
            sample.artSettingsOpacity < 0.05
        ).length
      : 0,
    cardStageSettingsCrossfadeFrames: isCardStageTrace
      ? trace.samples.filter(
          (sample) =>
            sample.desktopInspectorExpected &&
            sample.cardSettingsOpacity >= 0.05 &&
            Math.max(
              sample.effectsInspectorOpacity,
              sample.artSettingsOpacity
            ) >= 0.05
        ).length
      : 0,
    cardStageExitTravel: isCardStageTrace
      ? phaseTravelSummary(
          trace.samples,
          "card-to-stage",
          (sample) => sample.cardContentCenterX
        )
      : null,
    cardStageEntryTravel: isCardStageTrace
      ? phaseTravelSummary(
          trace.samples,
          "stage-to-card",
          (sample) => sample.cardContentCenterX
        )
      : null,
    cardStageExitAllocation: isCardStageTrace
      ? phaseTravelSummary(
          trace.samples,
          "card-to-stage",
          (sample) => sample.animationSize
        )
      : null,
    cardStageEntryAllocation: isCardStageTrace
      ? phaseTravelSummary(
          trace.samples,
          "stage-to-card",
          (sample) => sample.animationSize
        )
      : null,
    cardStageInspectorSize: isCardStageTrace
      ? valueRange(trace.samples, (sample) => sample.inspectorSize)
      : null,
    cardStageInspectorExit: isCardStageTrace
      ? phaseTravelSummary(
          trace.samples,
          "card-to-stage",
          (sample) => sample.inspectorSize
        )
      : null,
    cardStageInspectorEntry: isCardStageTrace
      ? phaseTravelSummary(
          trace.samples,
          "stage-to-card",
          (sample) => sample.inspectorSize
        )
      : null,
    artSettingsContentDrift: contentDrift(
      trace.samples,
      (sample) =>
        sample.desktopInspectorExpected &&
        sample.artSettingsOpacity >= VISIBLE_PANE_OPACITY,
      (sample) => sample.artSettingsWidth,
      (sample) => sample.artSettingsLeft,
      (sample) => sample.artSettingsContentTop
    ),
    cardSettingsContentDrift: contentDrift(
      trace.samples,
      (sample) =>
        sample.desktopInspectorExpected &&
        sample.cardSettingsOpacity >= VISIBLE_PANE_OPACITY,
      (sample) => sample.cardSettingsWidth,
      (sample) => sample.cardSettingsLeft,
      (sample) => sample.cardSettingsContentTop
    ),
    longestSampleGap: longestSampleGap(trace.samples),
    inspectorReveal: INSPECTOR_LAYER_IDS.map((layer) =>
      summarizeInspectorReveal(trace.samples, layer)
    ).filter((entry) => entry.readableFrames > 0),
    inspectorSurfaceStep: summarizeInspectorSurfaceStep(trace.samples),
    cardSizePinRelease: summarizeCardSizePinRelease(trace.samples),
    cardArrival: summarizeCardArrival(trace.samples),
    dockCollapse: summarizeDockCollapse(trace.samples),
    performanceStageIdentityChanges: isPerformanceTrace
      ? identityChanges(trace.samples, (sample) => sample.stageLayerIdentity)
      : 0,
    performanceGalleryIdentityChanges: isPerformanceTrace
      ? identityChanges(
          trace.samples,
          (sample) => sample.performanceLayerIdentity
        )
      : 0,
    performanceInspectorIdentityChanges: isPerformanceTrace
      ? identityChanges(
          trace.samples.filter((sample) => sample.desktopInspectorExpected),
          (sample) => sample.inspectorIdentity
        )
      : 0,
    performanceBlankFrames: isPerformanceTrace
      ? trace.samples.filter(
          (sample) =>
            !sample.dissolveActive &&
            sample.stageLayerOpacity < 0.05 &&
            sample.performanceLayerOpacity < 0.05
        ).length
      : 0,
    performanceDoubleOpaqueFrames: isPerformanceTrace
      ? trace.samples.filter(
          (sample) =>
            sample.stageLayerOpacity > 0.95 &&
            sample.performanceLayerOpacity > 0.95
        ).length
      : 0,
    performanceCrossfadeFrames: isPerformanceTrace
      ? trace.samples.filter(
          (sample) =>
            sample.stageLayerOpacity >= 0.05 &&
            sample.performanceLayerOpacity >= 0.05
        ).length
      : 0,
    performanceUnreadyFrames: isPerformanceTrace
      ? trace.samples.filter(
          (sample) =>
            sample.performanceLayerActive &&
            sample.performanceLayerOpacity >= 0.05 &&
            !sample.performanceGalleryReady
        ).length
      : 0,
    performanceLayoutChanges: isPerformanceTrace
      ? Math.max(
          0,
          uniqueValuePath(
            trace.samples
              .filter((sample) => sample.performanceLayerOpacity >= 0.05)
              .map((sample) => sample.performanceLayoutColumns)
              .filter((columns) => columns > 0)
          ).length - 1
        )
      : 0,
    performancePlayerCountMaximum: isPerformanceTrace
      ? Math.max(
          0,
          ...trace.samples.map((sample) => sample.performancePlayerCount)
        )
      : 0,
    performanceOpacityComplementDriftMaximum: isPerformanceTrace
      ? Math.max(
          0,
          ...trace.samples.map((sample) =>
            Math.abs(
              sample.stageLayerOpacity + sample.performanceLayerOpacity - 1
            )
          )
        )
      : 0,
    performanceLayerWidthMismatchMaximum: isPerformanceTrace
      ? Math.max(
          0,
          ...trace.samples.map((sample) =>
            Math.abs(sample.stageLayerWidth - sample.performanceLayerWidth)
          )
        )
      : 0,
    performanceSurfacePath: isPerformanceTrace
      ? uniquePerformanceSurfacePath(trace.samples)
      : [],
    performanceStageExit: isPerformanceTrace
      ? phaseTravelSummary(
          trace.samples,
          "stage-to-performances",
          (sample) => sample.stageSize
        )
      : null,
    performanceStageEntry: isPerformanceTrace
      ? phaseTravelSummary(
          trace.samples,
          "performances-to-stage",
          (sample) => sample.stageSize
        )
      : null,
    performanceInspectorExit: isPerformanceTrace
      ? phaseTravelSummary(
          trace.samples,
          "stage-to-performances",
          (sample) => sample.inspectorSize
        )
      : null,
    performanceInspectorEntry: isPerformanceTrace
      ? phaseTravelSummary(
          trace.samples,
          "performances-to-stage",
          (sample) => sample.inspectorSize
        )
      : null,
  };
}
