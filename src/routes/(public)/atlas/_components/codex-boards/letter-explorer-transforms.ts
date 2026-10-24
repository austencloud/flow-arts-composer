/**
 * The letter explorer's transforms: the board's rotations, mirror, flip and
 * swap, plus invert. Those keep every letter what it was; invert trades
 * pro for anti, so it turns one letter into another (U into V). The explorer
 * applies them to every variation in the order pressed, and an odd number of
 * inverts shows the inverted letter. They ride in the URL (?xf=) so a copied
 * link opens the same view.
 */
import { invertMotion } from "#lib/shared/create/services/motion-transforms.js";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import type { PictographEdit } from "#lib/shared/pictograph/shared/services/pictograph-edit-travel.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  transformCodexPictograph,
  type CodexTransformOp,
} from "../../../codex/_data/codex-view";

export type ExplorerTransformOp = CodexTransformOp | "invert";

const OP_CODES: Record<ExplorerTransformOp, string> = {
  rotate: "r",
  "rotate-ccw": "l",
  mirror: "m",
  flip: "f",
  swap: "s",
  invert: "i",
};

/** Long enough for any real sequence of presses; a hand-edited URL with more
 *  is cut rather than costing every variation a slow redraw. */
const MAX_TRANSFORMS = 16;

export function parseExplorerTransforms(
  value: string | null
): ExplorerTransformOp[] {
  if (!value) return [];
  const ops: ExplorerTransformOp[] = [];
  for (const code of value.slice(0, MAX_TRANSFORMS)) {
    const op = (Object.keys(OP_CODES) as ExplorerTransformOp[]).find(
      (candidate) => OP_CODES[candidate] === code
    );
    if (op) ops.push(op);
  }
  return ops;
}

/** The URL value for a transform list, or null when there is none. */
export function formatExplorerTransforms(
  ops: readonly ExplorerTransformOp[]
): string | null {
  return ops.length === 0
    ? null
    : ops
        .slice(-MAX_TRANSFORMS)
        .map((op) => OP_CODES[op])
        .join("");
}

/** Pro becomes anti and back on both hands. The end orientations are left to
 *  the turns pass that follows (applyTurnsToVariations), which recomputes them
 *  from the new motion type. */
function invertPictograph(pictograph: PictographData): PictographData {
  const { left, right } = pictograph.motions;
  return {
    ...pictograph,
    motions: {
      ...pictograph.motions,
      left: left ? invertMotion(left) : left,
      right: right ? invertMotion(right) : right,
    },
  };
}

/** Apply the transforms in the order they were pressed. */
export function transformVariation(
  pictograph: PictographData,
  ops: readonly ExplorerTransformOp[]
): PictographData {
  let result = pictograph;
  let pending: CodexTransformOp[] = [];
  for (const op of ops) {
    if (op !== "invert") {
      pending.push(op);
      continue;
    }
    if (pending.length > 0) result = transformCodexPictograph(result, pending);
    pending = [];
    result = invertPictograph(result);
  }
  return pending.length > 0
    ? transformCodexPictograph(result, pending)
    : result;
}

/** True when the transforms leave the letter inverted. */
export function invertsLetter(ops: readonly ExplorerTransformOp[]): boolean {
  return ops.filter((op) => op === "invert").length % 2 === 1;
}

/** How the pictographs travel for one press (pictograph-edit-motion). Each
 *  rotation is an eighth; mirror swaps sides and flip swaps top and bottom. */
export function editForTransform(op: ExplorerTransformOp): PictographEdit {
  switch (op) {
    case "rotate":
      return { kind: "rotate", direction: "clockwise", steps: 1 };
    case "rotate-ccw":
      return { kind: "rotate", direction: "counterclockwise", steps: 1 };
    case "mirror":
      return { kind: "reflect", axis: "vertical" };
    case "flip":
      return { kind: "reflect", axis: "horizontal" };
    case "swap":
      return { kind: "swap" };
    case "invert":
      return { kind: "spin" };
  }
}

/** The letter a variation becomes once inverted, looked up in the dataset as
 *  the Composer's own invert does. Null when the dataset has no match. */
export async function invertedLetterOf(
  pictograph: PictographData
): Promise<string | null> {
  const inverted = invertPictograph(pictograph);
  const { left, right } = inverted.motions;
  if (!left || !right) return null;
  const letter = await motionQueryHandler.findLetterByMotionConfiguration(
    left,
    right,
    pictograph.gridMode ?? left.gridMode ?? GridMode.DIAMOND
  );
  return letter ? String(letter) : null;
}
