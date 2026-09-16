/**
 * Step — one beat of sequence content.
 *
 * Canonical replacement for:
 *   - `SequenceStep` in packages/sequence-engine/src/core/types/sequence-engine-types.ts
 *   - `StepData` in src/lib/shared/pictograph/** (app copy)
 *
 * Design notes:
 *   - `letter` is a Letter enum or null; start-placement steps have null.
 *   - `motions` is a performer-relative keyed record (left/right).
 *     Hand-iterating algorithms become one loop instead of duplicated blocks.
 *   - `stepNumber` is required; 0 marks the start-placement step.
 *   - Reversal state (`leftReversal`/`rightReversal`) is derived on read via
 *     `deriveReversals(steps)` in `@tka/sequence-engine`, not stored here.
 *   - Selection state (`isSelected`) is UI state; it lives in a selection
 *     store in the app layer, keyed by step `id`.
 *   - `id` is required — enables stable keying for selection + diffing.
 *
 * All fields readonly. Builders (see `./builders.ts`) enforce immutability
 * and runtime-validate required fields.
 */
import type { Motion } from "./motion.js";
import type { Letter } from "./letter.js";
import type { GridPlacement, GridMode } from "./grid.js";

export interface StepMotions {
  readonly left: Motion;
  readonly right: Motion;
}

export interface Step {
  readonly id: string;
  readonly letter: Letter | null;
  readonly startPlacement: GridPlacement | null;
  readonly endPlacement: GridPlacement | null;
  readonly motions: StepMotions;
  readonly gridMode?: GridMode;
  readonly stepNumber: number;
  /** Choreographic duration in musical beats (positive finite number). */
  readonly duration: number;
  /** Variation index within a letter's pictograph set. */
  readonly variation?: number;
  /** True when this step was inserted as a placement-continuity bridge. */
  readonly isBridge?: boolean;
  /** True when this step is an intentional blank (no pictograph). */
  readonly isBlank?: boolean;
}
