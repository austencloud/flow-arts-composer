/**
 * Constraint Type Definitions
 *
 * Enum and categorization for all supported constraint types.
 */

/**
 * All supported constraint types in the system.
 */
export enum ConstraintType {
  // Motion constraints
  MOTION_TYPE = "motionType",
  ROTATION_DIRECTION = "rotationDirection",
  TURN = "turn",

  // Sequence-level constraints
  CONTINUITY = "continuity",
  REVERSAL = "reversal",
  HAND_PATH = "handPath",
  /** Left hand related to the right hand inside one step (mirror, unison, ...). */
  HAND_RELATIONSHIP = "handRelationship",
  /** The two props spin in a requested relation (same or opposite, and a timing). */
  PROP_RELATIONSHIP = "propRelationship",

  // Placement constraints
  PLACEMENT_GROUP = "placementGroup",

  // Timing constraints
  VTG_TIMING = "vtgTiming",

  // Pattern constraints
  ALTERNATING = "alternating",

  // Domain constraints (always-on)
  TYPE_6 = "type6",
  PROP_TYPE = "propType",
  PLACEMENT_CONTINUITY = "placementContinuity",
  FLOAT = "float",

  // LOOP closure constraints (Phase 4)
  TURN_PARITY = "turnParity",
  MIRRORED_CLOSURE = "mirroredClosure",
  FLIPPED_CLOSURE = "flippedClosure",
  SWAPPED_CLOSURE = "swappedClosure",
  INVERTED_CLOSURE = "invertedClosure",
}

/**
 * Whether a constraint is hard (must satisfy) or soft (best-effort).
 */
export type ConstraintMode = "hard" | "soft";

/**
 * Categories for organizing constraints.
 */
export enum ConstraintCategory {
  MOTION = "motion",
  SEQUENCE = "sequence",
  PLACEMENT = "placement",
  TIMING = "timing",
  PATTERN = "pattern",
  DOMAIN = "domain",
}

/**
 * Map constraint types to their categories.
 */
export const CONSTRAINT_CATEGORIES: Record<ConstraintType, ConstraintCategory> =
  {
    [ConstraintType.MOTION_TYPE]: ConstraintCategory.MOTION,
    [ConstraintType.ROTATION_DIRECTION]: ConstraintCategory.MOTION,
    [ConstraintType.TURN]: ConstraintCategory.MOTION,
    [ConstraintType.CONTINUITY]: ConstraintCategory.SEQUENCE,
    [ConstraintType.REVERSAL]: ConstraintCategory.SEQUENCE,
    [ConstraintType.HAND_PATH]: ConstraintCategory.SEQUENCE,
    [ConstraintType.HAND_RELATIONSHIP]: ConstraintCategory.MOTION,
    [ConstraintType.PROP_RELATIONSHIP]: ConstraintCategory.MOTION,
    [ConstraintType.PLACEMENT_GROUP]: ConstraintCategory.PLACEMENT,
    [ConstraintType.VTG_TIMING]: ConstraintCategory.TIMING,
    [ConstraintType.ALTERNATING]: ConstraintCategory.PATTERN,
    [ConstraintType.TYPE_6]: ConstraintCategory.DOMAIN,
    [ConstraintType.PROP_TYPE]: ConstraintCategory.DOMAIN,
    [ConstraintType.PLACEMENT_CONTINUITY]: ConstraintCategory.DOMAIN,
    [ConstraintType.FLOAT]: ConstraintCategory.DOMAIN,
    [ConstraintType.TURN_PARITY]: ConstraintCategory.DOMAIN,
    [ConstraintType.MIRRORED_CLOSURE]: ConstraintCategory.DOMAIN,
    [ConstraintType.FLIPPED_CLOSURE]: ConstraintCategory.DOMAIN,
    [ConstraintType.SWAPPED_CLOSURE]: ConstraintCategory.DOMAIN,
    [ConstraintType.INVERTED_CLOSURE]: ConstraintCategory.DOMAIN,
  };
