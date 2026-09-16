/**
 * Orientation translation between SpiroAnim's pattern-rotation axis and the
 * transcribed TKA positions.
 *
 * The transcription (`tka-transcription.json`, captured 2026-08-09) was
 * generated when SpiroAnim's default pattern orientation was a universal -90.
 * SpiroAnim has since moved to a per-ratio default (`getDefaultVtgPatternOrientation`
 * in his `vtg/types.ts`): 0 for the odd-denominator one-cycle ratios (1:1, 1:3,
 * 1:5) and -90 for the even-denominator and two-cycle ratios (1:2, 1:4, 2:3,
 * 2:5), vtg and qtr alike. So a plain 1:3 key renders the transcription 90°
 * clockwise of its capture while a plain 1:4 key renders it as captured.
 * Verified against his own compiler on 2026-08-30: compiling cells at
 * orientation -90 reproduces the transcription's position vocabulary exactly,
 * and each +45° of orientation moves every hand one compass step clockwise
 * (n → ne → e → …). Both apps label the compass from the same screen frame —
 * the transcription's grid points came from the same `closestPoint` mapping —
 * so that clockwise convention carries over verbatim.
 *
 * Translation: rotate every transcribed position clockwise by
 * `(requested − (−90)) / 45` compass steps, where a key without an `o` token
 * requests SpiroAnim's default view for its ratio. 8stp has no orientation axis and is
 * never rotated. The rotation itself goes through the canonical
 * position ↔ hand-location owner (`grid-placement-deriver`), so a 45° step that
 * lands on intercardinal points produces the real box-grid position names.
 */

import {
  type BridgeSpeedRatio,
  type ParsedCellKey,
  type SpiroAnimOrientation,
} from "./cell-key";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  getGridLocationsFromPlacement,
  getGridPlacementFromLocations,
} from "$lib/shared/pictograph/grid/services/grid-placement-deriver";

/** The orientation the whole transcription corpus was captured at. */
export const TRANSCRIPTION_BASELINE_ORIENTATION: SpiroAnimOrientation = -90;

/**
 * What SpiroAnim shows for a ratio when no orientation is selected. Mirrors
 * his `getDefaultVtgPatternOrientation`: -90 when the ratio is two-cycle or
 * has an even denominator, 0 otherwise.
 */
export function defaultSpiroAnimOrientation(
  ratio: BridgeSpeedRatio
): SpiroAnimOrientation {
  const [numerator, denominator] = ratio.split(":").map(Number) as [
    number,
    number,
  ];
  return numerator === 2 || denominator % 2 === 0 ? -90 : 0;
}

const CLOCKWISE: readonly GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
];

/** The orientation a parsed key asks the Composer to render. */
export function effectiveOrientation(key: ParsedCellKey): SpiroAnimOrientation {
  if (key.concept === "8stp") return TRANSCRIPTION_BASELINE_ORIENTATION;
  return key.orientation ?? defaultSpiroAnimOrientation(key.speedRatio);
}

/** Clockwise 45° compass steps between the transcription and the request. */
export function rotationStepsFor(key: ParsedCellKey): number {
  const delta = effectiveOrientation(key) - TRANSCRIPTION_BASELINE_ORIENTATION;
  return (((delta / 45) % 8) + 8) % 8;
}

function rotateLocation(location: GridLocation, steps: number): GridLocation | null {
  const index = CLOCKWISE.indexOf(location);
  if (index === -1) return null;
  return CLOCKWISE[(index + steps) % 8] ?? null;
}

/**
 * Rotate one transcribed position name clockwise by `steps` × 45°. Returns
 * null for a name the deriver does not know or a hand off the compass —
 * upstream treats that as an unresolvable key, never a guess.
 */
export function rotatePositionName(position: string, steps: number): string | null {
  if (steps === 0) return position;
  let left: GridLocation;
  let right: GridLocation;
  try {
    [left, right] = getGridLocationsFromPlacement(position as GridPlacement);
  } catch {
    return null;
  }
  const rotatedLeft = rotateLocation(left, steps);
  const rotatedRight = rotateLocation(right, steps);
  if (!rotatedLeft || !rotatedRight) return null;
  try {
    return getGridPlacementFromLocations(rotatedLeft, rotatedRight);
  } catch {
    return null;
  }
}
