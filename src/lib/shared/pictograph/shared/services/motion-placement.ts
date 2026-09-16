/**
 * Motion placement invariants.
 *
 * `MotionData` declares `arrowPlacementData` and `propPlacementData` as
 * non-optional, and the render pipeline enforces that with two hard guards:
 *
 *   - `PictographPreparer.calculateProps` early-returns on a missing
 *     `propPlacementData` (pictograph-preparer.ts) — no prop rendered
 *   - `ArrowLifecycleManager.loadArrowAssets` throws on a missing
 *     `arrowPlacementData`, and the throw is swallowed upstream — no arrow
 *     rendered
 *
 * Both failures are SILENT. A cell missing these fields renders as grid +
 * label with nothing in it, and nothing anywhere says why.
 *
 * Stored data does not always satisfy the invariant. Shortcode/URL-resolved
 * sequences are stored lean, and older Firestore documents carry a
 * `startPlacement` that was serialized before the fields existed. Anything read
 * from storage and handed to the renderer has to be re-run through
 * `createMotionData`, which restores the default placement objects (the placers
 * recompute them downstream anyway).
 *
 * WHY THIS MODULE EXISTS: this backfill was written once, inside
 * `navigation/services/sequence-hydrator.ts`, to fix propless cells on /q scan
 * cards (fc1ad42df8). It was never ported to the near-identically-named
 * `foundation/services/sequence-hydrator.ts`, which is the hydrator the
 * browse / library / thumbnail path actually runs — so the same silent bug
 * resurfaced months later as start-placement cells rendering with no props
 * across the browse grid, ProfileTabs, the watch feed and the local library.
 * Two copies drifted once; one copy cannot. Import it, do not re-derive it.
 */

import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";

/** Guarantee a single motion carries the render-required placement data. */
export function ensureMotionPlacement(
  motion: MotionData | undefined
): MotionData | undefined {
  if (!motion) return motion;
  if (motion.arrowPlacementData && motion.propPlacementData) return motion;
  return createMotionData(motion);
}

/**
 * Guarantee both motions of a step-shaped record carry placement data.
 *
 * Deliberately generic over anything with a `motions` pair rather than typed to
 * `StepData`: the same shape covers steps, `startPlacement` and
 * `startingPlacement`, and keeping it structural lets this live in the
 * pictograph layer without importing a sequence model.
 *
 * Takes a non-optional argument on purpose. An `T | undefined` overload made
 * `steps.map(ensureStepPlacement)` infer `(T | undefined)[]` and poison every
 * caller's element type; optional fields are cheaper to guard at the call site.
 */
export function ensureStepPlacement<
  T extends { motions?: { left?: MotionData; right?: MotionData } },
>(step: T): T {
  if (!step?.motions) return step;
  return {
    ...step,
    motions: {
      ...step.motions,
      left: ensureMotionPlacement(step.motions.left),
      right: ensureMotionPlacement(step.motions.right),
    },
  };
}
