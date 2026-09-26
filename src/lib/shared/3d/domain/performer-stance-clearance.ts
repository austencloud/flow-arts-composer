import { cmToUnits, userProportionsState } from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import {
  DEFAULT_STANCE_CLEARANCE,
  type StanceClearance,
} from "../collision/stance-side-lane";

/**
 * The length of the staff the performer is drawn holding, in scene units: its
 * own setting, or the user's staff when it has none. Both renderers draw the
 * prop at this length, so anything checked against the staff reads it here.
 */
export function resolvePerformerStaffLength(
  performer: Pick<CharacterInstanceState, "settings">
): number {
  const staffLengthCm = performer.settings.staffLengthCm;
  return staffLengthCm == null
    ? userProportionsState.staffLength
    : cmToUnits(staffLengthCm);
}

/** One clearance per staff length, so a plan keyed on it replans only when the
 *  length changes. */
const clearanceByLength = new Map<number, Readonly<StanceClearance>>([
  [DEFAULT_STANCE_CLEARANCE.body.staffLengthM, DEFAULT_STANCE_CLEARANCE],
]);

/**
 * The body the stance checks the performer's staffs against: the default body
 * holding the staff the performer is drawn with. A longer staff reaches
 * further into the turned chest, so lanes sized for the default staff would
 * leave its ends in the body.
 */
export function performerStanceClearance(
  performer: Pick<CharacterInstanceState, "settings">
): Readonly<StanceClearance> {
  const staffLengthM = resolvePerformerStaffLength(performer);
  let clearance = clearanceByLength.get(staffLengthM);
  if (!clearance) {
    clearance = Object.freeze({
      body: Object.freeze({ ...DEFAULT_STANCE_CLEARANCE.body, staffLengthM }),
      measurements: null,
    });
    clearanceByLength.set(staffLengthM, clearance);
  }
  return clearance;
}
