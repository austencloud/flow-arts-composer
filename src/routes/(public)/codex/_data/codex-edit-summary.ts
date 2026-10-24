// One line saying what the reader has done to the pictures, for the chip on
// the Home, Type and Letter screens. Null when nothing is changed.
import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { LetterExplorerEdits } from "../../atlas/_components/codex-boards/letter-explorer-url";
import type { ExplorerTransformOp } from "../../atlas/_components/codex-boards/letter-explorer-transforms";
import type { CodexTransformOp } from "./codex-view";
import { CODEX_DEFAULT_ORIENTATIONS, type CodexStartOrientations } from "./codex-orientation";

export interface CodexEditSummaryInput {
  transforms: readonly CodexTransformOp[];
  /** The explorer's own presses, on the Letter screen. */
  explorerTransforms?: readonly ExplorerTransformOp[];
  edits: LetterExplorerEdits;
  start: CodexStartOrientations;
}

function count<T>(ops: readonly T[], op: T): number {
  return ops.filter((o) => o === op).length;
}

function turnsWord(hand: "blue" | "red", turns: TurnValue, spin: RotationDirection): string | null {
  if (turns === "fl") return `float ${hand}`;
  if (turns === 0) return null;
  const amount = turns === 0.5 ? "½ turn" : turns === 1 ? "1 turn" : `${turns} turns`;
  const ccw = spin === RotationDirection.COUNTER_CLOCKWISE ? " CCW" : "";
  return `${amount} ${hand}${ccw}`;
}

export function describeCodexEdits(input: CodexEditSummaryInput): string | null {
  const ops: readonly (CodexTransformOp | ExplorerTransformOp)[] = [
    ...input.transforms,
    ...(input.explorerTransforms ?? []),
  ];
  const parts: string[] = [];
  const eighths = (((count(ops, "rotate") - count(ops, "rotate-ccw")) % 8) + 8) % 8;
  if (eighths) parts.push(`Rotated ${eighths * 45}°`);
  if (count(ops, "mirror") % 2) parts.push("Mirrored");
  if (count(ops, "flip") % 2) parts.push("Flipped");
  if (count(ops, "swap") % 2) parts.push("Hands swapped");
  if (count(ops, "invert") % 2) parts.push("Inverted");
  const blue = turnsWord("blue", input.edits.leftTurns, input.edits.leftRotation);
  const red = turnsWord("red", input.edits.rightTurns, input.edits.rightRotation);
  if (blue) parts.push(blue);
  if (red) parts.push(red);
  if (input.start.left !== CODEX_DEFAULT_ORIENTATIONS.left) parts.push(`blue starts ${input.start.left}`);
  if (input.start.right !== CODEX_DEFAULT_ORIENTATIONS.right) parts.push(`red starts ${input.start.right}`);
  return parts.length ? parts.join(", ") : null;
}
