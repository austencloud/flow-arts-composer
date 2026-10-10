/**
 * The Create front door's Construct preview: the choices each box offers and
 * where the real one sits. Each box shows three choices, the demo sequence's
 * real step and two other moves Construct really offers there. The start box
 * offers the start position picker's own placements; each step box offers
 * moves from the option picker's list after the steps before it.
 *
 * The other moves are baked into method-preview-construct-choices.json from
 * the production pipeline, so the front door never loads the pictograph
 * dataset. method-preview-construct.test.ts rebuilds them and fails if the
 * file drifts; `vitest -u` on that test rewrites it.
 */
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { CONSTRUCT_CHOICE_COUNT } from "./method-preview-compositions";
import choicesJson from "./method-preview-construct-choices.json";

/** How long a picked choice takes to grow into its box. */
export const CONSTRUCT_GROW_MS = 300;

/** Each box's other two moves, by slot. */
export const CONSTRUCT_DECOYS =
  choicesJson as unknown as readonly (readonly PictographData[])[];

/**
 * The choice spot (0, 1, or 2) holding the real step in `slot` on a scene's
 * `play`th turn. Neighboring boxes never use the same spot, and the spots
 * shift each turn, so the pick reads as a choice.
 */
export function constructPick(slot: number, play: number): number {
  return (slot + play) % CONSTRUCT_CHOICE_COUNT;
}

/** The spots a box's other moves take, in order, around the real pick. */
export function decoySpots(pick: number): number[] {
  return Array.from(
    { length: CONSTRUCT_CHOICE_COUNT },
    (_, spot) => spot
  ).filter((spot) => spot !== pick);
}
