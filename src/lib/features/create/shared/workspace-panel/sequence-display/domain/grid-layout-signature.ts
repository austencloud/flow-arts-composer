/**
 * The step grid's arrangement, reduced to a string.
 *
 * When this value changes, cells have moved and the grid should glide from its
 * old layout to its new one. When it does not change, whatever else happened
 * was not a recomposition.
 *
 * Cell SIZE is deliberately excluded. A live panel or window drag fires the
 * ResizeObserver every frame; animating that would make the cells lag the
 * handle they are supposed to be following. Proportional resizing tracks the
 * container instantly, and only a genuine recomposition glides: a column or row
 * count change, the timeline toggle, a membership or ordering change, the start
 * tile appearing or leaving.
 */

export interface GridLayoutSignatureInput {
  isTimelineMode: boolean;
  /** Columns available to steps. */
  columns: number;
  /** Columns including the start-placement column. */
  totalColumns: number;
  rows: number;
  hasStartPlacement: boolean;
  /** Steps per timeline row. Empty in grid mode. */
  timelineRowSizes: readonly number[];
  /** Stable step identities, in presentation order. */
  stepIdentities: readonly string[];
}

export function computeGridLayoutSignature(
  input: GridLayoutSignatureInput
): string {
  return [
    input.isTimelineMode ? "timeline" : "grid",
    input.columns,
    input.totalColumns,
    input.rows,
    input.hasStartPlacement ? "start" : "no-start",
    // Row sizes catch a timeline reflow that leaves the row COUNT unchanged —
    // deleting a step can move one cell up a row without changing either total.
    input.timelineRowSizes.join("-"),
    // Identities catch reordering and mid-sequence insertion, where the step
    // count alone is unchanged or uninformative about which cells moved.
    input.stepIdentities.join(","),
  ].join("|");
}
