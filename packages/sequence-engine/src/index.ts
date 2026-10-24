/**
 * @tka/sequence-engine
 * Platform-agnostic sequence engine for TKA letter transitions,
 * bridge finding, and orientation propagation.
 *
 * Both MCP server (Node.js) and browser app consume this package.
 * Browser-only extensions (BrowserDataProvider, constraints) stay in the app.
 */

// Domain types
export * from "./core/types/sequence-engine-types.js";

// Orientation
export type {
  IOrientationCalculator,
  IOrientationPropagator,
} from "./core/orientation/IOrientationPropagator.js";
export {
  OrientationCalculator,
  OrientationPropagator,
} from "./core/orientation/OrientationPropagator.js";
export {
  calculateEndOrientation,
  calculateOrientations,
} from "./core/orientation/OrientationCalculator.js";

// Transition graph
export type { ITransitionGraph } from "./core/transition-graph/ITransitionGraph.js";
export { TransitionGraph } from "./core/transition-graph/TransitionGraph.js";
export { setLetterTransitionGraph, getLetterTransitionGraph } from "./core/transition-graph/LetterTransitionGraph.js";

// Data provider contracts
export type {
  ISequenceDataProvider,
  LetterVariationData,
} from "./core/data/ISequenceDataProvider.js";

// Analysis
export {
  deriveReversals,
  type StepReversals,
  type ChannelReversals,
  type DeriveReversalsOptions,
  type ReversalStepLike,
} from "./analysis/deriveReversals.js";
export {
  handArcDirection,
  propRotationDirection,
  type ArcDirection,
  type PropRotation,
  type MotionSignalSource,
} from "./analysis/motion-signals.js";

// Centric placements (tau1-16, terra1): the one table of their hand locations
export { CENTRIC_PLACEMENT_LOCATIONS } from "./core/placements/centric-placement-locations.js";
