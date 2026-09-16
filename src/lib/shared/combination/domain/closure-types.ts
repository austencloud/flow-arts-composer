/**
 * Stage 3 (Closure) and Stage 4 (Present) domain model for the LOOP combinator.
 *
 * The 2026-08-04 engine emitted freeform closed walks: it found walks that
 * returned to their own start seam, classified them, and never once asked
 * whether the result was a **LOOP**. There is no reference to
 * `isLOOPValidForPlacementPair` anywhere in the shipped `combination/` tree —
 * which is exactly why the output was rejected ("not a single one of these
 * sequences is a LOOP and I don't want freeform crap sequences", 2026-08-05).
 *
 * This file names the vocabulary the missing stage speaks:
 *
 *   - a **candidate unit** is a realized walk (Stage 2's output);
 *   - a **closure** is one admissible way that unit becomes a LOOP;
 *   - the **circle count** is the unit length times the closure's multiplier;
 *   - a **count bucket** groups every result that plays the same number of
 *     steps, which is what a performer actually thinks in.
 *
 * Spec: `docs/superpowers/specs/2026-08-05-sequence-combinator-redesign-design.md`.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { LOOPType, Period } from "@tka/sequence-engine/loop";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/**
 * Which family a closure came from.
 *
 * `loop` is the only one the app's validator answers for. The other two exist
 * because the shipped LOOP catalogue does not cover the whole closing group and
 * pretending otherwise would silently delete real results:
 *
 * - `plain` — the unit already ends where it started. The app has no LOOP type
 *   for the identity (its `INVERTED` is the nearest thing, and that is a
 *   two-pass transform), so a 4-step unit that closes in 4 steps would have
 *   nowhere to live. Every word in A+G's 4-count bucket is one of these.
 * - `reflection` — a reflection across one of the two DIAGONAL axes. TKA canon
 *   holds all four axes equally valid (`.claude/rules/tka-domain.md`, "LOOP
 *   Reflection Guardrails") and the engine ships their location maps, but its
 *   placement-pair validation sets cover only north-south (MIRRORED) and
 *   east-west (FLIPPED). Dropping the diagonals costs A+G's 8-count bucket 12
 *   of its 32 words — the mixed-crossing units, the whole point of the feature.
 */
export type ClosureFamily = "plain" | "loop" | "reflection";

/** The four reflection axes, mirroring the engine's `ReflectionAxis`. */
export type ClosureReflectionAxis =
  | "north-south"
  | "east-west"
  | "northeast-southwest"
  | "northwest-southeast";

/**
 * One admissible way a candidate unit closes into a full circle.
 *
 * `circleMultiplier` is the number of PASSES of the unit the closing transform
 * needs before the material returns to itself — the app's own
 * `getLOOPSpecExpansionMultiplier` for a LOOP, 1 for a plain closure, 2 for a
 * reflection. Circle length = unit length x this.
 */
export interface AdmissibleClosure {
  /**
   * Stable identity: `plain`, `rotated@quartered`, `mirrored:northeast-southwest`.
   *
   * `loopType` is the ENGINE's `LOOPType` — the enum the validator itself
   * speaks. The app-side copy in
   * `foundation/domain/models/generation/circular-models` is NOT value-identical
   * (it spells rewound `strict_rewound`), so a consumer translating between the
   * two must map rather than cast.
   */
  readonly id: string;
  readonly family: ClosureFamily;
  /** Present only for `family: "loop"`. */
  readonly loopType: LOOPType | null;
  /**
   * The period the validator was asked at. Only meaningful for LOOP types
   * carrying a ROTATED component — for every other type the validator ignores
   * the argument entirely (see `loop-closure.ts`).
   */
  readonly period: Period | null;
  /** Present only for `family: "reflection"`. */
  readonly reflectionAxis: ClosureReflectionAxis | null;
  /** Human label for a badge. */
  readonly label: string;
  /** Passes of the unit per full circle. */
  readonly circleMultiplier: number;
}

/**
 * A realized closed-walk candidate: Stage 2's output, Stage 3's input.
 *
 * REALIZED is the load-bearing word. A word does not determine its closure —
 * from alpha7, Psi's blue-dash variation lands beta7 and its red-dash variation
 * lands beta3, 180 degrees apart from the same start. So the closure question is
 * asked of the actual step list's `startPlacement`/`endPlacement` and never of the
 * letters (`redesign-design.md`, "A word does not determine its closure").
 */
export interface CandidateUnit {
  readonly steps: readonly StepData[];
  readonly startPlacement: GridPlacement;
  readonly endPlacement: GridPlacement;
  /** Letters as walked, unsimplified. Display goes through `simplifyRepeatedWord`. */
  readonly word: string;
  /** Steps drawn from neither card — the bridge material. */
  readonly connectorCount: number;
  /**
   * The unit's SHAPE: its run structure written as origin+length, wrap-merged
   * and phase-canonical. `A1C1B1C1` is "one step of card A, cross out, one step
   * of card B, cross back" — the shape every 4-step A+G result shares.
   *
   * Which specific connector was chosen is deliberately absent: J, K, L and Psi
   * crossing out are four realizations of one idea, and counting them as four
   * ideas is what made the old output feel like noise.
   *
   * PROVISIONAL. The design flags the altitude of this abstraction as the one
   * open question only Austen can settle (redesign spec, Open Question 1), so
   * both altitudes are carried: this one keeps run lengths, `shapeFamily` drops
   * them. Neither is load-bearing for the bucket counts.
   */
  readonly shape: string;
  /** The same skeleton with run lengths dropped: `ACBC`. */
  readonly shapeFamily: string;
}

/** A unit plus one of its admissible closures: one row of the result list. */
export interface LOOPCombination {
  readonly unit: CandidateUnit;
  readonly closure: AdmissibleClosure;
  /** unit.steps.length * closure.circleMultiplier. */
  readonly circleCount: number;
  /** Smallest repeating unit of `unit.word`, for display. */
  readonly displayWord: string;
}

/** Every combination that plays the same number of steps, grouped by LOOP type. */
export interface CountBucket {
  readonly count: number;
  readonly combinations: readonly LOOPCombination[];
  /** Closure id -> the combinations that close that way, insertion-ordered. */
  readonly byClosure: ReadonlyMap<string, readonly LOOPCombination[]>;
  /** Distinct display words in this bucket. */
  readonly words: readonly string[];
}
