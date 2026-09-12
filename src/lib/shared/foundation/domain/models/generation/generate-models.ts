/**
 * Generation Service Interfaces - Complete interface definitions
 *
 * Complete interfaces for motion generation, sequence generation, and related algorithms.
 * Updated to match exact legacy generation parameters and options.
 */
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type {
  LOOPType,
  Period,
} from "./circular-models";
import type { LOOPSpec, LOOPSpecWire } from "@tka/sequence-engine/loop";
import type { TurnLanes } from "@tka/sequence-engine/generation";
import type { LoopRhythm } from "$lib/shared/create/services/loop-type-utils";
import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";

// Re-export LOOPType for convenience
export type { LOOPType };
import type {
  GridMode,
  GridPosition,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

// DATA CONTRACTS (Domain Models)

export interface GenerationOptions {
  mode?: GenerationMode | undefined;
  length: number;
  /**
   * Word to spell (e.g. "BOOK", "AΣ-B"). When provided, the engine parses
   * letters from the word instead of using `length` for freeform generation.
   * Used by spell mode to route through the same engine pipeline as freeform.
   */
  word?: string;
  gridMode: GridMode;
  propType: PropType;
  difficulty: DifficultyLevel;
  propContinuity?: PropContinuity | undefined;
  turnIntensity?: number | undefined;
  /**
   * An exact repeating turn figure, read at every step rather than rolled at
   * random. When set it replaces `turnIntensity` as the source of turns, and
   * the search sees it while it is still choosing letters — so it will not pick
   * a static letter at a step this figure leaves at zero turns.
   */
  turnPattern?: TurnLanes | undefined;
  period?: Period | undefined; // For circular generation
  loopType?: LOOPType | undefined; // LOOP type for circular generation
  loopSpec?: LOOPSpec | undefined;
  /**
   * Compositional wire-form LOOP spec (per-component periods + overlay mode).
   * When present, the orchestrator derives the seed length from
   * `expanderMultiplier` instead of the legacy halved/quartered period split,
   * and threads the runtime form through to the engine at `loop.loopSpec`.
   * Absent ⇒ byte-identical legacy behavior.
   */
  loopSpecWire?: LOOPSpecWire | undefined;
  /** Rhythm the UI used to build `loopSpecWire` — kept for provenance/UI echo. */
  loopRhythm?: LoopRhythm | undefined;

  // 3-axis constraint system
  constraintPreset?: "smooth" | "mixed" | "choppy" | undefined;
  handPathMode?: "smooth" | "mixed" | "choppy" | undefined;
  motionTypeFilter?: "no-dash" | "prefer-dash" | null | undefined;

  // Hand relationship: how the left hand relates to the right inside each
  // step. "free" or absent means unconstrained. Inverted is ignored for free.
  handRelationship?: HandRelationship | undefined;
  handRelationshipInverted?: boolean | undefined;
  /** Both hands take the same turn value every step. Absent means off. */
  matchHandTurns?: boolean | undefined;

  // Customize options - advanced constraints for generation
  /**
   * Pin the sequence to this start position. The orchestrator reads nothing
   * from `startPosition` but its grid position, so a caller that has the
   * position and no pictograph says it here instead of building a motionless
   * one to carry a single string.
   */
  startPositionId?: GridPosition;
  /** @deprecated Use blockedStartPositions for multi-select */
  startPosition?: PictographData | null; // Specific start position constraint
  /** @deprecated Use endPositions for multi-select */
  endPosition?: PictographData | null; // Specific end position constraint
  /**
   * Allowed end positions. The sequence must end at one of them.
   * Empty/undefined = unconstrained ("Any").
   */
  endPositions?: GridPosition[];
  mustContainLetters?: Letter[]; // Letters that must appear in the sequence
  mustNotContainLetters?: Letter[]; // Letters that must NOT appear in the sequence

  // Multi-select start position constraints (blocklist approach)
  blockedStartPositions?: GridPosition[]; // Positions that should NOT be used

  /**
   * Override the start orientation per hand ("in" | "out" | "clock" | "counter").
   * The engine rewrites beat 0 and reseeds orientation propagation from these.
   * Absent ⇒ the engine keeps the randomly-selected start variation's orientation
   * (default "in"). Threaded straight through to the engine's BuildOptions.
   */
  leftStartOrientation?: string;
  rightStartOrientation?: string;
}

export interface LetterDerivationResult {
  letter: Letter | null;
  confidence: "exact" | "partial" | "none";
  matchedParameters: string[];
}

export interface PictographOperation {
  type: "add" | "remove" | "modify" | "reorder";
  targetIndex?: number;
  data?: Record<string, unknown>;
}
// NOTE: Period and LOOPType are now in circular/domain/models/circular-models.ts
// Import from there if needed

import { LOOPComponent, RESERVED_ORIENTATION_PRIMITIVES } from "@tka/sequence-engine/loop";
export { LOOPComponent, RESERVED_ORIENTATION_PRIMITIVES };

/**
 * Domain of a LOOP transformation.
 *
 * A LOOP component can operate in one of three spaces:
 * - `location`: grid positions transform between passes (classic LOOPs)
 * - `orientation`: orientations transform between passes (positions stay pinned)
 * - `both`: detected in both spaces (e.g., a sequence that rotates in location
 *   AND accumulates an orientation cycle that matches the positional cycle)
 */
export type LOOPDomain = "location" | "orientation" | "both";

/**
 * A detected LOOP component with its operating domain.
 *
 * The detector emits one DetectedComponent per (component, domain) pair.
 * UI consumers consume a deduplicated Set<LOOPComponent> paired with a
 * Record<LOOPComponent, LOOPDomain> (see resolveLoopDisplay).
 */
export interface DetectedComponent {
  readonly component: LOOPComponent;
  readonly domain?: LOOPDomain;
}

/**
 * Display metadata for LOOP component UI
 * Short descriptions shown in-button, full descriptions handled by LOOPExplanationTextGenerator
 */
export interface LOOPComponentInfo {
  component: LOOPComponent;
  label: string;
  shortLabel: string;
  description: string; // Short description for in-button display
  icon: string;
  color: string;
}

export enum PositionSystem {
  ALPHA_TO_ALPHA = "alpha_to_alpha",
  ALPHA_TO_BETA = "alpha_to_beta",
  ALPHA_TO_GAMMA = "alpha_to_gamma",
  BETA_TO_ALPHA = "beta_to_alpha",
  BETA_TO_BETA = "beta_to_beta",
  BETA_TO_GAMMA = "beta_to_gamma",
  GAMMA_TO_ALPHA = "gamma_to_alpha",
  GAMMA_TO_BETA = "gamma_to_beta",
  GAMMA_TO_GAMMA = "gamma_to_gamma",
}

export enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
  SKEWED = "skewed",
}

export enum PropContinuity {
  CONTINUOUS = "continuous",
  RANDOM = "random",
}

export enum GenerationMode {
  FREEFORM = "freeform",
  SPELL = "spell",
  /** @internal Used by the generation orchestrator when loopEnabled=true + freeform mode */
  CIRCULAR = "circular",
}


/**
 * Rotation directions for blue and red props
 * Used during continuous prop generation to determine rotation behavior
 */
export interface RotationDirections {
  leftRotationDirection: string;
  rightRotationDirection: string;
}

// Re-exporting TurnAllocation for backwards compatibility
export type { TurnAllocation } from "$lib/shared/create/domain/generator-contract-types";
