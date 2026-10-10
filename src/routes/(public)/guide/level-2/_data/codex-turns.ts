/**
 * Level 2 turn-codex cell builder.
 *
 * The Level 2 codex pages (old p17–34) are grids of every letter of a type, each
 * shown with a specific turn tuple applied - e.g. p17 is "1|0": one turn on one
 * hand. Rather than hand-author 32 pictographs per page, we reuse the same data
 * path the interactive codex reader uses:
 *
 *   codexData(id)                      → canonical 0-turn PictographData (home orient.)
 *   applyPendingTurnsToOption(...)     → the canonical turn transform (correct end
 *                                        orientation + correct `*_N.0.svg` turn arrows)
 *
 * Slot → hand mapping follows PADS (get_domain_topic "glyph-anatomy"): the HIGH
 * slot is Pro (for a pro/anti hybrid) or the left hand (when both hands share
 * a motion type); the LOW slot is Anti / the right hand. So a `¹` cell = turn
 * on the high-slot hand, a `₁` cell = turn on the low-slot hand.
 *
 * Known gap (flag for the accuracy pass): S and T are pro|pro / anti|anti with a
 * leader/follower asymmetry, so their true high slot is the LEADER, not simply
 * left. We treat them as left-high here; confirm S/T slot assignment against the
 * original artboard.
 */
import { codexData } from "../../codex/_data/codex-groups";
import { applyPendingTurnsToOption } from "#lib/shared/create/services/apply-turns-to-motion.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  MotionType,
  HandSide,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const CW = RotationDirection.CLOCKWISE;

// PADS priority: Pro > Anti > Dash > Static (lower index = higher slot).
const PADS: MotionType[] = [
  MotionType.PRO,
  MotionType.ANTI,
  MotionType.DASH,
  MotionType.STATIC,
];

/** Which hand owns the high slot for this pictograph (PADS; else left). */
function highSlotHand(base: PictographData): HandSide {
  const b = base.motions?.left?.motionType;
  const r = base.motions?.right?.motionType;
  if (b && r && b !== r) {
    return PADS.indexOf(b) < PADS.indexOf(r) ? HandSide.LEFT : HandSide.RIGHT;
  }
  return HandSide.LEFT; // matching-type: left high (S/T leader exception - see header)
}

const otherHand = (hand: HandSide) =>
  hand === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT;

export type Slot = "high" | "low";

/**
 * Build a turn-annotated codex cell.
 * @param letter   base letter id WITHOUT the variation suffix, e.g. "A", "Σ", "Θ-"
 * @param highTurns turns placed on the HIGH slot
 * @param lowTurns  turns placed on the LOW slot
 */
export function codexTurnData(
  letter: string,
  highTurns: number,
  lowTurns: number
): PictographData | null {
  const base = codexData(`${letter}-0`);
  if (!base) return null;
  const high = highSlotHand(base);
  const highIsLeft = high === HandSide.LEFT;
  const leftTurns = highIsLeft ? highTurns : lowTurns;
  const rightTurns = highIsLeft ? lowTurns : highTurns;
  return applyPendingTurnsToOption(base, leftTurns, rightTurns, CW, CW);
}

/** Single-slot convenience for the 1|0-style pages: turn on high (`¹`) or low (`₁`). */
export function codexSlotData(
  letter: string,
  slot: Slot,
  turns = 1
): PictographData | null {
  return codexTurnData(
    letter,
    slot === "high" ? turns : 0,
    slot === "low" ? turns : 0
  );
}

const flipDir = (d: RotationDirection) =>
  d === RotationDirection.CLOCKWISE
    ? RotationDirection.COUNTER_CLOCKWISE
    : RotationDirection.CLOCKWISE;

export type Rel = "same" | "opp";

/**
 * Same/Opp-aware codex cell (Type 2–6 pages). When one hand is a shift (pro/anti)
 * and the other carries a turn (static/dash), the two props' rotational
 * relationship is Same or Opp. The shift keeps its intrinsic spin direction; the
 * turning hand's direction is set to MATCH (same) or OPPOSE (opp) it. Shifts
 * ignore the direction arg, so only the turning (static/dash) hand is steered.
 *
 * Accuracy-pass flag: the same↔CW / opp↔CCW mapping here assumes the shift's stored
 * `rotationDirection` is the correct reference sense; confirm against the artboard.
 */
export function codexRelData(
  letter: string,
  highTurns: number,
  lowTurns: number,
  rel: Rel
): PictographData | null {
  const base = codexData(`${letter}-0`);
  if (!base) return null;
  const high = highSlotHand(base);
  const highIsLeft = high === HandSide.LEFT;
  const highMotion = highIsLeft ? base.motions?.left : base.motions?.right;
  const highDir = highMotion?.rotationDirection ?? CW;
  const lowDir = rel === "opp" ? flipDir(highDir) : highDir;
  const leftTurns = highIsLeft ? highTurns : lowTurns;
  const rightTurns = highIsLeft ? lowTurns : highTurns;
  const leftDir = highIsLeft ? highDir : lowDir;
  const rightDir = highIsLeft ? lowDir : highDir;
  return applyPendingTurnsToOption(
    base,
    leftTurns,
    rightTurns,
    leftDir,
    rightDir
  );
}

export type OpenClose = "open" | "close";

/**
 * Open/Close-aware codex cell for Lambda (Λ, Type 4 dash+static), Lambda-Dash
 * (Λ-, Type 5 dual-dash) and Gamma (Γ, Type 6 static). These letters use
 * opening/closing instead of same/opp: the turning hand's spin direction resolves
 * its trajectory toward alpha (open) or beta (close). We set the turning hand's
 * rotation direction to encode it - CW = open, CCW = close by convention.
 *
 * Accuracy-pass flag: the open↔CW / close↔CCW mapping is a convention here; the
 * true assignment is geometry-dependent (PropRotationStateTracker lookup tables).
 * Confirm each Λ/Γ cell against the original artboard.
 */
export function codexOpenCloseData(
  letter: string,
  highTurns: number,
  lowTurns: number,
  oc: OpenClose
): PictographData | null {
  const base = codexData(`${letter}-0`);
  if (!base) return null;
  const high = highSlotHand(base);
  const highIsLeft = high === HandSide.LEFT;
  const turningHand = highTurns > 0 ? high : otherHand(high);
  const dir = oc === "open" ? CW : RotationDirection.COUNTER_CLOCKWISE;
  const leftTurns = highIsLeft ? highTurns : lowTurns;
  const rightTurns = highIsLeft ? lowTurns : highTurns;
  const leftDir = turningHand === HandSide.LEFT ? dir : CW;
  const rightDir = turningHand === HandSide.RIGHT ? dir : CW;
  return applyPendingTurnsToOption(
    base,
    leftTurns,
    rightTurns,
    leftDir,
    rightDir
  );
}
