/**
 * Shift-click range selection on the workspace step grid.
 *
 * The grid lays beats out in rows, so a shift-click selects the box between
 * the anchor and the clicked beat: click the fourth beat of the first row,
 * then the last beat of the last row, and the fourth column is selected. Two
 * beats in the same row select the run between them.
 */

/** How the step grid currently lays out its beats. */
export interface StepGridShape {
  /** Beats per row. The start placement sits in its own column and is not counted. */
  columns: number;
  /** Number of beats in the grid. */
  stepCount: number;
}

export interface StepClickModifiers {
  range: boolean;
  toggle: boolean;
  /** Present when the click came from a grid, so a range can be a box. */
  grid?: StepGridShape;
}

/**
 * Beat numbers (1-based) inside the box spanned by `anchor` and `target`.
 * Without a usable grid shape, falls back to the contiguous run between them.
 */
export function stepsInGridRange(
  anchor: number,
  target: number,
  grid?: StepGridShape
): number[] {
  const columns = grid ? Math.floor(grid.columns) : 0;
  if (!grid || columns < 1) {
    const lo = Math.min(anchor, target);
    const hi = Math.max(anchor, target);
    const run: number[] = [];
    for (let n = lo; n <= hi; n++) run.push(n);
    return run;
  }

  const rowOf = (n: number) => Math.floor((n - 1) / columns);
  const columnOf = (n: number) => (n - 1) % columns;
  const top = Math.min(rowOf(anchor), rowOf(target));
  const bottom = Math.max(rowOf(anchor), rowOf(target));
  const left = Math.min(columnOf(anchor), columnOf(target));
  const right = Math.max(columnOf(anchor), columnOf(target));

  const steps: number[] = [];
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) {
      const n = row * columns + column + 1;
      // A short last row has no beat under every column.
      if (n <= grid.stepCount) steps.push(n);
    }
  }
  return steps;
}
