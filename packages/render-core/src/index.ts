/**
 * Unified Rendering Core
 *
 * Pure TypeScript calculation module for pictograph rendering.
 * Shared between the browser Canvas2D renderer and MCP Node.js renderer.
 *
 * This module contains NO browser APIs, NO Svelte, NO DI dependencies.
 * Just pure functions that can run in any JavaScript environment.
 */

export type {
  GridLocation,
  GridMode,
  MotionType,
  Orientation,
  RotationDirection,
  HandSide,
  Coordinates,
  PropPlacement,
  ArrowPlacement,
  HandPath,
  VectorDirection,
} from "./types.js";

export {
  CARDINAL_LOCATIONS,
  INTERCARDINAL_LOCATIONS,
  isCardinal,
} from "./types.js";

// SVG color transforms
export {
  ACCENT_COLORS_TO_PRESERVE,
  HAND_COLOR_MAP,
  SELECTIVE_COLOR_PROP_TYPES,
  getMotionColor,
  shouldPreserveColor,
  applyColorToSvg,
  applyMotionColorToSvg,
} from "./svg-color.js";
export type {
  ThemeMode,
  SvgColorOptions,
  MotionSvgColorOptions,
} from "./svg-color.js";

export {
  applyFanFrameColor,
  applyFanPaperContrast,
  FAN_PAPER_CONTRAST,
} from "./fan-appearance.js";

// Viewbox constants
export {
  VIEWBOX_SIZE,
  CENTER,
  BLUE_COLOR_DARK,
  BLUE_COLOR_LIGHT,
  RED_COLOR_DARK,
  RED_COLOR_LIGHT,
  SVG_OVERFLOW_RATIO,
  GRID_POINT_COLOR_LIGHT,
  GRID_POINT_COLOR_DARK,
} from "./constants/viewbox.js";

// Glyph position constants
export {
  TKA_GLYPH,
  STEP_NUMBER,
  DIRECTION_DOT,
  TURN_NUMBER,
  DASH_SUFFIX,
  VTG_GLYPH,
  ELEMENTAL_GLYPH,
  POSITION_GLYPH,
  REVERSAL_INDICATOR,
} from "./constants/glyph-positions.js";

// Grid coordinates
export {
  DIAMOND_HAND_POINTS,
  DIAMOND_LAYER2_POINTS,
  BOX_HAND_POINTS,
  BOX_LAYER2_POINTS,
  DIAMOND_OUTER_POINTS,
  BOX_OUTER_POINTS,
  CENTER_POINT,
  FALLBACK_HAND_POINTS,
  FALLBACK_LAYER2_POINTS,
} from "./constants/grid-coordinates.js";

// Rotation maps
export {
  DIAMOND_PROP_ANGLES,
  BOX_PROP_ANGLES,
  PRO_CLOCKWISE_MAP,
  PRO_COUNTER_CLOCKWISE_MAP,
  ANTI_CLOCKWISE_MAP,
  ANTI_COUNTER_CLOCKWISE_MAP,
  STATIC_RADIAL_CLOCKWISE_MAP,
  STATIC_RADIAL_COUNTER_CLOCKWISE_MAP,
  STATIC_NON_RADIAL_CLOCKWISE_MAP,
  STATIC_NON_RADIAL_COUNTER_CLOCKWISE_MAP,
  DASH_CLOCKWISE_MAP,
  DASH_COUNTER_CLOCKWISE_MAP,
  DASH_NO_ROTATION_MAP,
  FLOAT_CLOCKWISE_MAP,
  FLOAT_COUNTER_CLOCKWISE_MAP,
} from "./constants/rotation-maps.js";

// Direction maps (for beta offset)
export {
  DIAMOND_RADIAL_MAP,
  DIAMOND_NON_RADIAL_MAP,
  BOX_RADIAL_MAP,
  BOX_NON_RADIAL_MAP,
  SHIFT_RADIAL_MAP,
  SHIFT_NON_RADIAL_MAP,
  LETTER_I_RADIAL_MAP,
  LETTER_I_NON_RADIAL_MAP,
  OPPOSITE_DIRECTIONS,
} from "./constants/direction-maps.js";

// Prop classification
export {
  getBetaOffsetSize,
  isUnilateralProp,
  isBuugengFamilyProp,
  isStrictPlacedProp,
  pictographRequiresStrictHandpoints,
} from "./constants/prop-classification.js";

// Dash location maps
export {
  PHI_DASH_PSI_DASH_LOCATION_MAP,
  LAMBDA_ZERO_TURNS_LOCATION_MAP,
  DEFAULT_ZERO_TURNS_DASH_LOCATION_MAP,
  NON_ZERO_TURNS_DASH_LOCATION_MAP,
  DIAMOND_DASH_LOCATION_MAP,
  BOX_DASH_LOCATION_MAP,
  PHI_DASH_LETTERS,
  PSI_DASH_LETTERS,
  LAMBDA_LETTERS,
  LAMBDA_DASH_LETTERS,
  TYPE3_LETTERS,
  OPPOSITE_LOCATION_MAP,
} from "./constants/dash-location-maps.js";

// Grid position
export {
  getHandPointCoordinates,
  getNormalHandPointCoordinates,
  getLayer2PointCoordinates,
} from "./calculations/grid-position.js";

// Prop placement
export {
  calculatePropPlacement,
  calculatePropPosition,
  calculatePropRotation,
} from "./calculations/prop-placement.js";

// Arrow placement
export {
  calculateArrowPlacement,
  calculateArrowPosition,
  calculateArrowLocation,
} from "./calculations/arrow-placement.js";

// Arrow rotation
export { calculateArrowRotation } from "./calculations/arrow-rotation.js";

// Arrow asset paths
export { resolveFullArrowAssetPath } from "./calculations/arrow-asset-path.js";
export type { FullArrowAssetPathInput } from "./calculations/arrow-asset-path.js";

// Dash location
export { calculateDashLocation } from "./calculations/dash-location.js";
export type { DashLocationInput } from "./calculations/dash-location.js";

// Beta offset
export { calculateBetaOffset } from "./calculations/beta-offset.js";
export type {
  BetaMotionInput,
  BetaOffsetInput,
} from "./calculations/beta-offset.js";

// Orientation
export {
  calculateEndOrientation,
  calculateOrientations,
} from "./calculations/orientation.js";
export type { OrientationInput } from "./calculations/orientation.js";

// Reversal positions
export {
  calculateReversalPositions,
  getReversalColors,
} from "./calculations/reversal-positions.js";
export type {
  ReversalDotPosition,
  ReversalPositions,
} from "./calculations/reversal-positions.js";

// Start-position hand colour key
export {
  HAND_COLOR_KEY,
  calculateHandColorKeyLayout,
} from "./calculations/hand-color-key.js";
export type {
  HandColorKeyEntry,
  HandColorKeyLayout,
} from "./calculations/hand-color-key.js";
