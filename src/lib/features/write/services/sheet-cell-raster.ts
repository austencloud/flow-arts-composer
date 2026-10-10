/**
 * Raster identity and join stamping for choreo sheet cells, shared by the
 * preview and the PDF so both draw the same pictures.
 */
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { gridJoinCellResolver, gridJoinKey, isGridJoin } from "@tka/render-core";
import type { SheetCell } from "./sheet-row-planner";

/**
 * The cell's step drawn on the grids its sequence is joined on: the join the
 * planner put on the cell is stamped on a copy of the step (display-only,
 * never stored). One-grid cells give back the very same step.
 */
export function joinedCellStep(
  cell: Pick<SheetCell, "step" | "join">
): StepData | null {
  if (!cell.step) return null;
  return gridJoinCellResolver({ conjoined: cell.join })(cell.step);
}

// Identity key for raster de-dup: identical letter + blue/red motion + reversals
// + prop types render to identical pixels, so they share one embedded PNG. This
// mirrors what the preparer's own cache keys on. When step numbers are shown they
// are baked into the pixels, so the number joins the identity (`bakedNumber` is
// null when the sheet hides numbers, keeping full de-dup in that mode).
export function cellRasterKey(
  step: StepData & { readonly conjoined?: unknown },
  leftProp: PropType,
  rightProp: PropType,
  bakedNumber: number | null
): string {
  const motions = step.motions ?? {};
  const fingerprint = (m: (typeof motions)["left"]): string =>
    m
      ? [
          m.motionType,
          m.startLocation,
          m.endLocation,
          m.rotationDirection,
          m.turns,
          m.startOrientation,
          m.endOrientation,
        ].join(",")
      : "none";
  return [
    step.letter ?? "none",
    step.gridMode ?? "",
    fingerprint(motions.left),
    fingerprint(motions.right),
    step.leftReversal ? "B" : "",
    step.rightReversal ? "R" : "",
    // Joined cells draw on two grids, so they never share pixels with one-grid
    // cells (empty for one grid, which keeps one-grid keys as they were).
    isGridJoin(step.conjoined) ? gridJoinKey(step.conjoined) : "",
    leftProp,
    rightProp,
    bakedNumber ?? "",
  ].join("|");
}
