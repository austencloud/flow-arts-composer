/**
 * StepLike — the structural step shape shared by the app's `StepData` and the
 * canonical `@tka/tka-types` `Step`.
 *
 * Consumers that only read structural fields (motions, placements, letter)
 * should accept this instead of `StepData` so they are already typed for the
 * StepData->Step migration: `StepData` (optional fat motions) and canonical
 * `Step` (required lean motions) are BOTH assignable to it, because
 * `MotionData` and lean `Motion` are both assignable to `MotionWithView`.
 *
 * Hands stay optional here — one-hand/blank steps are real at the edit and
 * render layers (see docs/superpowers/specs/active/
 * 2026-07-01-presence-as-signal-register.md). Consumers keep their presence
 * guards.
 */
import type { Letter } from "./letter";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { MotionWithView } from "$lib/shared/pictograph/shared/domain/models/motion-view";

export interface StepLikeMotions {
  readonly left?: MotionWithView;
  readonly right?: MotionWithView;
}

export interface StepLike {
  readonly letter?: Letter | null;
  readonly startPlacement?: GridPlacement | null;
  readonly endPlacement?: GridPlacement | null;
  readonly motions: StepLikeMotions;
}

// Compile-time proof: both the app StepData and the canonical Step satisfy
// StepLike. If either stops being assignable, these lines fail the build.
type Assert<T extends true> = T;
type _StepDataIsStepLike = Assert<
  import("./step-data").StepData extends StepLike ? true : false
>;
type _CanonicalStepIsStepLike = Assert<
  import("@tka/tka-types").Step extends StepLike ? true : false
>;
