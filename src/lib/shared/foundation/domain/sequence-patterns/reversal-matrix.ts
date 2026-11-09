/**
 * Reversal Matrix: the one reversal model.
 *
 * A reversal is relative: a step reverses a hand when its spin differs from that
 * hand's previous spinning step (the `reversal-detector` rule). The matrix holds
 * exactly that, one "reverses here" flag per step per hand, already tiled to the
 * sequence length. It is what `applyReversalMatrix` writes and what the detector
 * reads back, so every other reversal shape converts into it here:
 *
 * - P/R/B/- symbol strings (deck `ResolvedReversalPattern.sequence`, the named
 *   `REVERSAL_PATTERNS`, saved card variations) tile into a matrix losslessly.
 * - Absolute per-step spins (sequence-actions `RotationDirectionPattern` entries)
 *   collapse into a matrix by spin change. That direction is lossy: the matrix
 *   drops which way the first spinning step turns, so a saved spin pattern keeps
 *   its own apply path until that anchor has a home in the shared write path.
 */

export interface ReversalMatrix {
  readonly left: readonly boolean[];
  readonly right: readonly boolean[];
}

/**
 * Tile a P/R/B/- string across `stepCount` steps. P reverses both hands, B the
 * left (blue), R the right (red); any other symbol reverses neither.
 */
export function matrixFromSymbols(sequence: string, stepCount: number): ReversalMatrix {
  const left: boolean[] = [];
  const right: boolean[] = [];
  for (let i = 0; i < stepCount; i++) {
    const sym = sequence[i % sequence.length];
    left.push(sym === "P" || sym === "B");
    right.push(sym === "P" || sym === "R");
  }
  return { left, right };
}

/** The P/R/B/- string for a matrix, one symbol per step. */
export function matrixToSymbols(matrix: ReversalMatrix): string {
  let out = "";
  for (let i = 0; i < matrix.left.length; i++) {
    const b = matrix.left[i] === true;
    const r = matrix.right[i] === true;
    out += b && r ? "P" : r ? "R" : b ? "B" : "-";
  }
  return out;
}

/** One step's absolute spin per hand; "none"/null = not spinning (inert). */
export interface StepSpins {
  readonly left: "cw" | "ccw" | "none" | null;
  readonly right: "cw" | "ccw" | "none" | null;
}

function handReversals(spins: readonly (string | null)[], loop: boolean): boolean[] {
  const flags = new Array<boolean>(spins.length).fill(false);
  const spinning = spins
    .map((s, i) => (s === "cw" || s === "ccw" ? i : -1))
    .filter((i) => i >= 0);
  for (let k = 1; k < spinning.length; k++) {
    const i = spinning[k]!;
    flags[i] = spins[i] !== spins[spinning[k - 1]!];
  }
  // On a loop the first spinning step follows the last one.
  if (loop && spinning.length > 1) {
    const first = spinning[0]!;
    flags[first] = spins[first] !== spins[spinning[spinning.length - 1]!];
  }
  return flags;
}

/**
 * Collapse absolute per-step spins into the reversals they imply. Lossy: the
 * first spinning step's direction is not kept.
 */
export function matrixFromSpins(
  steps: readonly StepSpins[],
  options: { loop?: boolean } = {},
): ReversalMatrix {
  const loop = options.loop ?? false;
  return {
    left: handReversals(steps.map((s) => s.left), loop),
    right: handReversals(steps.map((s) => s.right), loop),
  };
}
