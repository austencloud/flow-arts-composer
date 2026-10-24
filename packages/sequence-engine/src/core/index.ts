/**
 * Core Layer - Stable primitives that rarely change
 *
 * Types, orientation calculation, transition graph, and data provider contracts.
 */

// Types
export * from "./types/sequence-engine-types.js";

// Orientation
export {
  calculateEndOrientation,
  calculateOrientations,
  getHandpathDirection,
  switchOrientation,
  RADIAL_CW_CYCLE,
} from "./orientation/OrientationCalculator.js";
export type { Orientation, OrientationInput } from "./orientation/OrientationCalculator.js";
export type {
  IOrientationCalculator,
  IOrientationPropagator,
} from "./orientation/IOrientationPropagator.js";
export { OrientationCalculator, OrientationPropagator } from "./orientation/OrientationPropagator.js";

// Centric placements (tau1-16, terra1): the one table of their hand locations
export { CENTRIC_PLACEMENT_LOCATIONS } from "./placements/centric-placement-locations.js";

// Layer signature — the radial/non-radial reading of both props, step by step
export {
  orientationClass,
  isRadialOrientation,
  layerOf,
  collapseLayer,
  layerClassDelta,
  flipsLayer,
  flipVectorOf,
  applyFlip,
  flipBetween,
  layerSignature,
  layerPatternOf,
  signatureFromPattern,
  patternFromSignature,
  isLayerClosed,
  mirrorPattern,
  layerMetrics,
  signaturePeriod,
  formatSignature,
  formatPattern,
  parsePattern,
  parseSignature,
} from "./orientation/layer-signature.js";
export type {
  LayerId,
  CollapsedLayerId,
  FlipVector,
  LayerPattern,
  LayerMetrics,
  LayerMotionInput,
  LayerStepInput,
} from "./orientation/layer-signature.js";

// Transition graph
export type { ITransitionGraph } from "./transition-graph/ITransitionGraph.js";
export { TransitionGraph } from "./transition-graph/TransitionGraph.js";
export { setLetterTransitionGraph, getLetterTransitionGraph } from "./transition-graph/LetterTransitionGraph.js";

// Letters
export { LetterParser } from "./letters/LetterParser.js";
export { LetterClassifier } from "./letters/LetterClassifier.js";

// Data provider contracts
export type { ISequenceDataProvider, LetterVariationData } from "./data/ISequenceDataProvider.js";
