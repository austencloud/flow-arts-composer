import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SeamState } from "../domain/types";

const GROUPS = new Set<string>(Object.values(GridPlacementGroup));

/**
 * "beta5" → "beta". Null when the prefix is not a known family.
 *
 * At least 4 partial placement→group implementations already exist in this
 * codebase — `foundation/domain/models/generation/circular-placement-maps.ts`
 * `getPlacementGroup` (throws on zeta/eta/tau/terra), plus copies in
 * `create/generate/circular` constants, choreo-card `card-back-data.ts`, and
 * the landing `endless-spinner-orchestrator.ts`. This util supersedes them
 * for combination-engine use (handles the full GridPlacementGroup set, never
 * throws). Consolidating the existing call sites onto this one is deferred
 * deliberately — not in scope here.
 */
export function placementGroup(placement: string): GridPlacementGroup | null {
  const match = /^([a-z]+)\d+$/.exec(placement);
  if (!match) return null;
  const group = match[1] ?? "";
  return GROUPS.has(group) ? (group as GridPlacementGroup) : null;
}

/** The seam a step starts at, or null when the step carries no placement.
 * Always use this instead of casting step.startPlacement. */
export function seamOf(step: StepData): SeamState | null {
  return step.startPlacement ?? null;
}

/** The seam a step ends at, or null. */
export function seamEndOf(step: StepData): SeamState | null {
  return step.endPlacement ?? null;
}

/**
 * Does a step's own motion locations actually produce the placements it is
 * labelled with?
 *
 * `startPlacement`/`endPlacement` are DERIVED data — `getGridPlacementFromLocations`
 * of the two hands — and the whole walk is stitched on those labels alone. A
 * mislabelled `endPlacement` is therefore the worst thing a provider can hand
 * over: the seam graph joins two steps whose props are nowhere near each other,
 * and the result passes every downstream check (it closes, it letters, it
 * hashes) while being physically unperformable. Teleporting props, silently.
 *
 * So both labels are re-derived here and compared. The deriver throws on a
 * location pair that names no placement at all, which is the same failure and is
 * treated the same way.
 *
 * It lives HERE, next to `seamOf`/`seamEndOf`, rather than inside the search:
 * it is the same "read a step's seams safely" concern, and BOTH the engine (as
 * its hard gate on provider material) and `runtime-ambient-provider` (which
 * counts what it rejects so a silent drop stays observable) must apply the
 * identical predicate. Two copies of it could drift into an engine that
 * discards exactly what the provider swore it had filtered.
 *
 * Verified against the shipped dataframes in `facade.test.ts`: 1,152 rows
 * (576 diamond + 576 box), zero disagreements.
 */
export function placementLabelsMatchLocations(step: StepData): boolean {
  const left = step.motions[HandSide.LEFT];
  const right = step.motions[HandSide.RIGHT];
  if (!left || !right) return false;

  try {
    return (
      getGridPlacementFromLocations(left.startLocation, right.startLocation) ===
        step.startPlacement &&
      getGridPlacementFromLocations(left.endLocation, right.endLocation) ===
        step.endPlacement
    );
  } catch {
    return false;
  }
}
