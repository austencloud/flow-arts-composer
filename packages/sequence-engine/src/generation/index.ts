/**
 * Generation Layer - Active pipeline for constrained sequence building
 *
 * Constraints, parsing, presets, builder, analysis, and reporting.
 */

// Constraint types
export type {
  IConstraint,
  IVariationConstraint,
  ISequenceConstraint,
  ConstraintContext,
  ConstraintScore,
  ConstraintSet,
  VariationScore,
  SearchState,
  ConstraintReport,
  ConstraintDetail,
  PictographData,
  MotionData,
} from "./constraints/types.js";

export {
  ConstraintType,
  ConstraintCategory,
  type ConstraintMode,
} from "./constraints/constraint-types.js";

// Style constraints
export {
  ContinuityConstraint,
  type ContinuityMode,
} from "./constraints/style/continuity-constraint.js";
export {
  MotionTypeConstraint,
  type MotionTypeConstraintOptions,
  type MotionTypeMode,
  type HandTarget,
  allProMotions,
  allAntiMotions,
  noDashMotions,
  noStaticMotions,
  preferProMotions,
  preferAntiMotions,
} from "./constraints/style/motion-type-constraint.js";
export {
  RotationDirectionConstraint,
  type RotationDirectionConstraintOptions,
  type RotationDirectionMode,
  type RotationDirection,
  leftClockwise,
  leftCounterClockwise,
  rightClockwise,
  rightCounterClockwise,
  allClockwise,
  allCounterClockwise,
} from "./constraints/style/rotation-direction-constraint.js";
export {
  ReversalConstraint,
  type ReversalMode,
} from "./constraints/style/reversal-constraint.js";
export {
  HandPathReversalConstraint,
  type HandPathMode,
  HandPath,
  getHandpathDirection,
  maximizeHandPathContinuity,
  enforceHandPathContinuity,
  handReversalEveryStep,
} from "./constraints/style/hand-path-constraint.js";
export {
  DashPreferenceConstraint,
  type DashPreferenceMode,
  maximizeDashes,
  requireDashes,
  preferDashes,
  DashAvoidanceConstraint,
  type DashAvoidanceMode,
  minimizeDashes,
  avoidDashes,
  forbidDashes,
} from "./constraints/style/dash-preference-constraint.js";
export {
  PerHandDashConstraint,
  type HandTarget as PerHandTarget,
  type HandDashMode,
  leftHandMaximizeDash,
  leftHandMinimizeDash,
  leftHandRequireDash,
  leftHandForbidDash,
  rightHandMaximizeDash,
  rightHandMinimizeDash,
  rightHandRequireDash,
  rightHandForbidDash,
  perHandDash,
} from "./constraints/style/per-hand-dash-constraint.js";
export {
  HandRelationshipConstraint,
  handRelationshipHolds,
  relatedRotationDirection,
  HAND_RELATIONSHIP_LOCATION_MAPS,
  type HandRelationshipMap,
  type HandRelationshipOptions,
} from "./constraints/style/hand-relationship-constraint.js";

// Parsing
export {
  parseConstraints,
  parseConstraintSet,
  getAvailablePatterns,
  getAvailableSynonyms,
  type ParseResult,
} from "./constraints/parsing/constraint-parser.js";

// Presets
export {
  getPreset,
  getPresetConstraintSet,
  getPresetOptions,
  listPresetNames,
  listPresets,
  type PresetName,
  type PresetDefinition,
} from "./constraints/presets/preset-constraints.js";

// Composition
export { buildConstraintSet } from "./constraints/composition/build-constraint-set.js";
export type { ConstraintOptions } from "./constraints/composition/constraint-options.js";

// Builder (legacy)
export {
  buildConstrainedSequence,
  emptyConstraintSet,
  type ConstrainedSequenceResult,
  type ConstrainedBuilderOptions,
} from "./builder/constrained-builder.js";

// Unified builder (preferred entry point)
export {
  SequenceBuilder,
  type BuildOptions,
  type BuildResult,
  type LoopOptions,
} from "./builder/SequenceBuilder.js";

// Minimum length calculator — UI length-chip feasibility gate
export {
  minLength,
  type MinLengthArgs,
  type LOOPDomain,
} from "./capacity/minimum-length-calculator.js";

// LOOP closure constraints
export {
  MirroredClosureConstraint,
  FlippedClosureConstraint,
  SwappedClosureConstraint,
  InvertedClosureConstraint,
} from "./constraints/closure/per-type-closure-constraints.js";

// Beam search (used internally by SequenceBuilder)
export { BeamSearch, type BeamSearchResult } from "./builder/BeamSearch.js";

// Turn allocation
export {
  allocateTurns,
  getDefaultMaxTurnIntensity,
  getTurnPool,
  type TurnAllocation,
} from "./turns/TurnAllocator.js";
export {
  allocationSource,
  patternSource,
  type TurnHand,
  type TurnLanes,
  type TurnSource,
} from "./turns/TurnSource.js";
export {
  materializeTurn,
  type MaterializedTurn,
  type TurnMaterializationOptions,
  type TurnMaterializationSource,
  type TurnValue,
} from "./turns/TurnMaterializer.js";
export {
  applyLayerPattern,
  enforceHandFlipParity,
  retargetMotionFlip,
  type LayerTargetOptions,
  type LayerTargetMiss,
  type LayerTargetResult,
} from "./turns/layer-targeting.js";

// Reporting
export {
  generateConstraintReport,
  formatConstraintReport,
} from "./constraints/reporting/report-generator.js";

// Scoring
export {
  scoreVariation,
  scoreAndRankVariations,
  filterViableVariations,
  calculateSequenceScore,
} from "./builder/variation-scorer.js";

// Search state
export {
  createInitialState,
  extendState,
  pruneBeam,
  getBestState,
  countReversals,
  calculateContinuityPercentage,
  type BeamSearchConfig,
  DEFAULT_BEAM_CONFIG,
} from "./builder/search-state.js";

// Bridge scoring
export {
  scoreBridgeOptions,
  selectBestBridge,
  generateOptimalBridgeSelections,
  isDashLetter,
  getDashScore,
  getPerHandDashScore,
  getCombinedPerHandDashScore,
} from "./builder/bridge-scorer.js";

// Domain constraints (always-on hard constraints)
export { Type6Constraint } from "./constraints/domain/Type6Constraint.js";
export { PropTypeConstraint } from "./constraints/domain/PropTypeConstraint.js";
export { PositionContinuityConstraint } from "./constraints/domain/PositionContinuityConstraint.js";
export { FloatConstraint } from "./constraints/domain/FloatConstraint.js";

// Data provider contracts
export type { IVariationProvider } from "./data/IVariationProvider.js";

// Feasibility analysis
export {
  analyzeTransition,
  analyzeWord,
  analyzeWordFeasibility,
  buildTransitionMatrix,
  getTransitionMatrix,
  clearTransitionMatrixCache,
  suggestAlternatives,
  explainConstraintImpossibility,
  type TransitionAnalysis,
  type WordAnalysis,
  type TransitionFeasibility,
  type TransitionMatrix,
  type WordFeasibility,
} from "./constraints/analysis/index.js";

// Reachability analysis (backward arc consistency for LOOP targeting)
export {
  PositionReachabilityAnalyzer,
  type ReachabilityResult,
} from "./reachability/PositionReachabilityAnalyzer.js";
export { PositionTransitionGraph } from "./reachability/PositionTransitionGraph.js";
