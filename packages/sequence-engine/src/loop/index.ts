/**
 * LOOP Module Index
 *
 * Exports all LOOP-related functionality for the MCP server.
 */

// Types and enums
export {
  LOOPType,
  Period,
  LOOP_TYPE_LABELS,
  LOOP_TYPE_DESCRIPTIONS,
  ALL_LOOP_TYPES,
  ROTATED_LOOP_TYPES,
  type LOOPOption,
  type LOOPValidationResult,
  type LOOPGenerationOptions,
} from "./loop-types.js";

// LOOPSpec compositional types
export {
  LOOPComponent,
  RESERVED_ORIENTATION_PRIMITIVES,
  type LOOPDomain,
  type ComponentSpec,
  type PropLOOPSpec,
  type LOOPSpec,
  type ComponentSpecWire,
  type PropLOOPSpecWire,
  type LOOPSpecWire,
  loopSpecToWire,
  loopSpecFromWire,
  loopSpecPeriod,
  PERIOD_HALVED,
  PERIOD_QUARTERED,
  PERIOD_OCTAVED,
  singleComponent,
  symmetricSpec,
  allActiveComponents,
  isEmptySpec,
  specsAreEqual,
  getReflectionAxis,
  EMPTY_PROP_SPEC,
  loopSpecFromLegacy,
  loopSpecFromLegacyRhythm,
  loopSpecWithReflectionAxis,
  validateLOOPSpec,
  type LOOPSpecValidationError,
} from "./loop-spec.js";

// Validator
export {
  isLOOPValidForPlacementPair,
  isLOOPValidForSpec,
  getLOOPOptionsForPlacementPair,
  getExpectedEndPlacement,
  getValidEndPlacementsForLoop,
  findBridgeLettersForLoop,
  HALVED_LOOPS,
  QUARTERED_LOOPS,
} from "./validation/LOOPValidator.js";

// Placement maps - circular (rotation-based)
export {
  HALF_PLACEMENT_MAP,
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
  LOCATION_MAP_EIGHTH_CW,
  LOCATION_MAP_CLOCKWISE,
  LOCATION_MAP_COUNTER_CLOCKWISE,
  LOCATION_MAP_DASH,
  LOCATION_MAP_STATIC,
  HAND_ROTATION_DIRECTION_MAP,
  getHandRotationDirection,
  getLocationMapForHandRotation,
  getPlacementZone,
  getPlacementGroup,
  analyzeZoneCoverage,
  type PlacementZone,
  type ZoneCoverageAnalysis,
} from "./placement-maps/circular-placement-maps.js";

// Placement maps - strict (mirror/swap/invert transformations)
export {
  REFLECTION_AXES,
  DEFAULT_MIRRORED_AXIS,
  DEFAULT_FLIPPED_AXIS,
  REFLECTION_LOCATION_MAPS,
  NORTHEAST_SOUTHWEST_REFLECTION_LOCATION_MAP,
  NORTHWEST_SOUTHEAST_REFLECTION_LOCATION_MAP,
  isReflectionAxis,
  reflectLocation,
  type ReflectionAxis,
  VERTICAL_MIRROR_PLACEMENT_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
  HORIZONTAL_MIRROR_LOCATION_MAP,
  SWAPPED_PLACEMENT_MAP,
  INVERTED_LETTER_MAP,
  ALPHA_BETA_COUNTERPART_LETTER_MAP,
  COMPOUND_LETTER_MAP,
  LetterTransformationType,
  getInvertedLetter,
  getAlphaBetaCounterpart,
  getCompoundLetter,
  hasTransformationRelationship,
  getLetterRelationships,
  getRelatedLetters,
  analyzeStepPairTransformation,
  MIRRORED_LOOP_VALIDATION_SET,
  FLIPPED_LOOP_VALIDATION_SET,
  SWAPPED_LOOP_VALIDATION_SET,
  MIRRORED_SWAPPED_VALIDATION_SET,
  INVERTED_LOOP_VALIDATION_SET,
  MIRRORED_INVERTED_VALIDATION_SET,
  ROTATED_SWAPPED_QUARTERED_VALIDATION_SET,
  ROTATED_SWAPPED_HALVED_VALIDATION_SET,
} from "./placement-maps/strict-loop-placement-maps.js";

// Detection (analyzes sequence steps to identify LOOP patterns)
export {
  detectLOOPFromSteps,
  hasRewoundStructure,
  isSequenceCircular,
  LOOPDetectorClass,
  loopDetectorClass,
  type LOOPComponentId,
  type LOOPDetectionResult,
  type RichLOOPDetectionResult,
  type CompoundPattern,
  type DetectionConfidence,
} from "./detection/LOOPDetector.js";

// Orientation cycle detection
export {
  detectOrientationCycle,
  type OrientationCycleResult,
} from "./detection/OrientationCycleDetector.js";
export {
  analyzeOrientationCycle,
  closeOrientationCycle,
  MAX_ORIENTATION_CYCLE_REPETITIONS,
  type OrientationCycleAnalysis,
  type OrientationCycleClosure,
  type OrientationCycleCount,
  type OrientationCycleOptions,
} from "./execution/orientation-cycle.js";

// Pair-relation algebra — the canonical per-step-pair transform tuples.
// Additive export (2026-07-19, /notation/loops explorer): app-side consumers
// (loop-explorer's relation-extractor) need the (stepA, stepB, transform)
// data that already powers LOOPDetector internally, rather than re-deriving
// the algebra app-side.
export {
  relationsForPair,
  uniformRelationAtInterval,
  uniformHalvedRelation,
  detectRewoundPattern,
  detectsInnerRotation,
  type PairComponentId,
  type RotationAngle,
  type PairMotion,
  type PairMotions,
  type PairRelation,
  type UniformRelation,
} from "./detection/pair-relation.js";

// Executor
export {
  executeLOOP,
  type LOOPExecutionResult,
  type PictographData,
} from "./execution/LOOPExecutor.js";

// Executor interface
export type { ILOOPExecutor } from "./execution/ILOOPExecutor.js";

// Orientation helpers for executors
export { updateStepOrientations } from "./execution/orientation-helpers.js";

// Class-based LOOP executors (kept — spec-executor delegates to these)
export {
  StrictRotatedExecutor,
  strictRotatedExecutor,
} from "./execution/StrictRotatedExecutor.js";
export {
  RewoundExecutor,
  rewoundExecutor,
} from "./execution/RewoundExecutor.js";

// Spec-based execution
export {
  executeLOOPSpec,
  executeSymmetricSpec,
  getLOOPSpecExpansionMultiplier,
} from "./execution/spec-executor.js";
export { applyOverlayInversion } from "./execution/overlay-inversion.js";
export {
  FusedExecutor,
  type FusedTransformFlags,
} from "./execution/FusedExecutor.js";

// LOOP executor selector
export {
  LOOPExecutorSelector,
  loopExecutorSelector,
} from "./execution/LOOPExecutorSelector.js";

// Grid placement deriver
export {
  GridPlacementDeriver,
  gridPlacementDeriver,
} from "../core/placements/GridPlacementDeriver.js";

// Letter lookup
export { findLetterByMotions } from "./LetterLookup.js";

// Targeting (end placement selection for LOOP generation)
export {
  RotatedEndPlacementSelector,
  rotatedEndPlacementSelector,
} from "./targeting/RotatedEndPlacementSelector.js";
export {
  LOOPEndPlacementSelector,
  loopEndPlacementSelector,
  determineEndPlacementForSpec,
  determineEndPlacementsForSpec,
} from "./targeting/LOOPEndPlacementSelector.js";
export {
  PartialSequenceGenerator,
  partialSequenceGenerator,
  type IPartialSequenceGenerator,
  type PartialSequenceOptions,
} from "./targeting/PartialSequenceGenerator.js";

// Extension (extending sequences with LOOP patterns)
export {
  SequenceExtender,
  sequenceExtender,
  type ExtensionType,
  type ExtensionAnalysis,
  type ExtensionOptions,
} from "./extension/SequenceExtender.js";

export {
  completeLOOPExtension,
  isLegacyLOOPSeedValid,
  isSupportedLegacyLOOPType,
  type LOOPCompletionRequest,
  type LOOPCompletionResult,
} from "./execution/complete-loop-extension.js";

export {
  extendForOrientationCycle,
  type OrientationCycleExtensionResult,
} from "./extension/OrientationCycleExtender.js";

// Reduction (collapse redundant literal-repeat loops to their minimal form)
export {
  reduceToMinimalLoop,
  type MinimalLoopResult,
} from "./reduction/minimal-loop-reducer.js";

// Hand-neutral, one-prop LOOP ownership. This is the canonical seam for
// generators and pickers that must not invent a left/right relationship.
export {
  buildRewoundSoloLoop,
  buildRotatedSoloLoop,
  buildReflectedSoloLoop,
  buildInvertedSoloLoop,
  detectSoloLOOP,
  rewindSoloMotion,
  type SoloLOOPDetectionResult,
} from "./solo/solo-loop.js";
