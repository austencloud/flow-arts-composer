/**
 * Guide Companion v2, P3 - pure staging logic for inline pictograph editing.
 * The companion stages edits to a flat strip (start box + numbered steps)
 * locally ($state in GuideCompanion), only calling saveOverride() on commit.
 * Kept pure/testable: no Firestore, no Svelte runes here.
 */
import { deriveWordFromBeats } from "#lib/shared/foundation/services/word-deriver.js";
import { isStartBox } from "./guide-sequence-adapter";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

/** Non-start steps of a strip, in order. */
export function stepsOf(strip: StepData[]): StepData[] {
  return strip.filter((b) => !isStartBox(b));
}

/**
 * Truncates a strip to keep the start box plus steps 1..stepNumber (drops
 * everything after). Tapping step N in the mini strip calls this with N so
 * the picker resumes building from that point.
 */
export function truncateStripAt(strip: StepData[], stepNumber: number): StepData[] {
  return strip.filter((b) => isStartBox(b) || (b.stepNumber ?? 0) <= stepNumber);
}

/**
 * Appends a picked option (from OptionPicker, a PictographData) as the next
 * numbered step. Renumbers defensively off the current step count rather than
 * trusting the option's own stepNumber (OptionPicker options don't carry one).
 */
export function appendStep(strip: StepData[], option: PictographData): StepData[] {
  const nextNumber = stepsOf(strip).length + 1;
  const step = { ...(option as object), stepNumber: nextNumber } as unknown as StepData;
  return [...strip, step];
}

/** Word recomputed from the edited strip's step letters (start box excluded -
 *  it never carries a letter). Matches deriveWordFromBeats used elsewhere. */
export function deriveWordFromStrip(strip: StepData[]): string {
  return deriveWordFromBeats(stepsOf(strip) as unknown as Parameters<typeof deriveWordFromBeats>[0]);
}
