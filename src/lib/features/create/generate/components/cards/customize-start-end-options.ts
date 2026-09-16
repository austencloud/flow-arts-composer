import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

/** The start/end fields the customize overlay edits, held as live local state. */
export interface CustomizeStartEndLocalState {
  blockedStartPlacements: GridPlacement[];
  /** Allowed end placements. Empty = unconstrained ("Any"). */
  endPlacements: GridPlacement[];
  leftStartOrientation: Orientation;
  rightStartOrientation: Orientation;
}

/**
 * Build a complete, internally-consistent StartEndOptions from the overlay's
 * live local state.
 *
 * Why this exists: the overlay edits start placements, end placement, and both
 * start orientations independently, but the engine's setOptions() does a full
 * REPLACE (not a merge). The overlay used to spread its frozen open-time
 * snapshot per handler (`{ ...startEndOptions, leftStartOrientation }`), so
 * each single-field change reset every field the user wasn't currently
 * touching back to its open-time value — change right and left silently reverted,
 * change a placement and the orientations reverted, etc. The overlay's own
 * display read separate local mirrors that did NOT revert, so the overlay
 * showed the picked value while the card summary and the generated sequence
 * used the stale one ("wrong orientation in the panel" / "didn't take").
 *
 * Emitting the FULL local state on every edit keeps the engine state in lockstep
 * with what the overlay shows. `base` supplies only the fields the overlay does
 * not manage (mustContain/mustNotContain letters); those never change while the
 * overlay is open. startPlacement is legacy/deprecated — the blocked-placement
 * list supersedes it — so it is always cleared.
 */
export function buildStartEndOptions(
  base: StartEndOptions,
  local: CustomizeStartEndLocalState
): StartEndOptions {
  return {
    ...base,
    blockedStartPlacements: local.blockedStartPlacements,
    startPlacement: null,
    // Legacy single end placement is always cleared — endPlacements supersedes
    // it, and leaving both set would union two goals in the engine.
    endPlacement: null,
    endPlacements: local.endPlacements,
    leftStartOrientation: local.leftStartOrientation,
    rightStartOrientation: local.rightStartOrientation,
  };
}
