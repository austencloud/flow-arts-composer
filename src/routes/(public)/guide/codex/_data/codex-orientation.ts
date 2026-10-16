/**
 * The Codex's start orientations. Every letter canonically begins with both
 * thumbs in; the reader can start either hand in any radial orientation. The
 * pictograph still shows where the props end, so each end orientation is
 * recalculated from the chosen start (a 0-turn anti ends with the thumb out).
 *
 * The shared letter data keeps its stored end orientations for the Level 1
 * and Level 2 guide pages; only the Codex board and its explorer draw from
 * here.
 */
import { calculateEndOrientation } from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import {
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { codexData } from "./codex-groups";

/** Left is the blue hand, right the red. */
export interface CodexStartOrientations {
  left: Orientation;
  right: Orientation;
}

export const CODEX_DEFAULT_ORIENTATIONS: CodexStartOrientations = {
  left: Orientation.IN,
  right: Orientation.IN,
};

const RADIAL: readonly Orientation[] = [
  Orientation.IN,
  Orientation.CLOCK,
  Orientation.OUT,
  Orientation.COUNTER,
];

/** The pictograph begun from these orientations, its ends recalculated. */
export function withStartOrientations(
  pictograph: PictographData,
  start: CodexStartOrientations
): PictographData {
  const { left, right } = pictograph.motions;
  if (!left || !right) return pictograph;
  const begin = (hand: HandSide, motion: typeof left) => {
    const started = createMotionData({
      ...motion,
      startOrientation: start[hand === HandSide.LEFT ? "left" : "right"],
    });
    return createMotionData({
      ...started,
      endOrientation: calculateEndOrientation(started, hand),
    });
  };
  return {
    ...pictograph,
    motions: {
      ...pictograph.motions,
      left: begin(HandSide.LEFT, left),
      right: begin(HandSide.RIGHT, right),
    },
  };
}

/** A codex letter at 0 turns, begun from these orientations. */
export function codexDataFrom(
  id: string,
  start: CodexStartOrientations
): PictographData | null {
  const base = codexData(id);
  return base ? withStartOrientations(base, start) : null;
}

/** `?ori=out,in` (blue, then red); anything else is the default. */
export function parseCodexOrientations(
  value: string | null
): CodexStartOrientations {
  const [left, right] = (value ?? "").split(",") as Orientation[];
  return left && right && RADIAL.includes(left) && RADIAL.includes(right)
    ? { left, right }
    : CODEX_DEFAULT_ORIENTATIONS;
}

export function formatCodexOrientations(
  start: CodexStartOrientations
): string | null {
  return start.left === CODEX_DEFAULT_ORIENTATIONS.left &&
    start.right === CODEX_DEFAULT_ORIENTATIONS.right
    ? null
    : `${start.left},${start.right}`;
}
