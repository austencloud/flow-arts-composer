/**
 * How a stacked Create layout divides its height between the sequence
 * workspace (above) and the tool panel (below).
 *
 * The step pictures are what every tool works on, so the workspace is given
 * its chrome plus MIN_VISIBLE_ROWS whole rows of legible pictographs before
 * the tool panel gets the rest. Before this floor a 16-step sequence on an
 * unfolded Fold shrank to 48px cells under a picker that kept 62% of the
 * height (2026-10-28).
 *
 * Where the tool panel's controls can compact (Generate's settings cards),
 * the workspace may go further and take every row the sequence fills, so a
 * 16-step sequence shows whole without scrolling. Two legible rows alone left
 * its last rows under the rail and off screen (2026-10-29).
 */
import { MIN_LEGIBLE_PICTOGRAPH_SIZE } from "#lib/shared/pictograph/shared/domain/constants/pictograph-legibility.js";
import {
  legibleGridHostHeight,
  WORKBENCH_EDGE_RESERVE,
} from "#lib/shared/create/utils/grid-calculations.js";

/** The workspace frame's 1px border, top and bottom (.workspace-container). */
const WORKSPACE_FRAME = 2;

/**
 * The floor never takes more than the workspace's usual 5:4 share, so a very
 * short screen still leaves the tool panel the 4/9 it always had.
 */
export const USUAL_WORKSPACE_SHARE = 5 / 9;

/**
 * The whole-sequence floor stops where the tool panel would drop below this
 * share: 223px on the unfolded Fold, where Generate's cards take their
 * compact one-line layout and the Generate button stays on screen.
 */
export const MIN_TOOL_PANEL_SHARE = 2 / 7;

/** Steps in one workspace row: a full row is four steps beside the start. */
const STEPS_PER_ROW = 4;

/** Rows a sequence of `stepCount` steps fills in the workspace grid. */
export function sequenceRowCount(stepCount: number): number {
  return Math.max(1, Math.ceil(stepCount / STEPS_PER_ROW));
}

/**
 * Height the workspace needs for its chrome (sequence header and button
 * rail) plus `rows` whole rows of legible step pictures at this width (two
 * by default).
 */
export function workspaceFloorHeight(params: {
  width: number;
  chromeHeight: number;
  rows?: number;
}): number {
  const { width, chromeHeight, rows } = params;
  if (width <= 0) return 0;
  return (
    WORKSPACE_FRAME +
    chromeHeight +
    legibleGridHostHeight({
      hostWidth: width - WORKSPACE_FRAME,
      legibleCellSize: MIN_LEGIBLE_PICTOGRAPH_SIZE,
      edgeReserve: WORKBENCH_EDGE_RESERVE,
      rows,
    })
  );
}

/**
 * Pixel sizes for [workspace, tool panel]. The workspace gets the largest of
 * the share the view prefers, the legible floor (capped at the usual 5:4
 * share) and, when given, the whole-sequence floor (capped where the tool
 * panel would drop below MIN_TOOL_PANEL_SHARE).
 */
export function stackedWorkspaceSplit(params: {
  height: number;
  preferredWorkspace: number;
  workspaceFloor: number;
  sequenceFloor?: number;
}): [number, number] {
  const { height, preferredWorkspace, workspaceFloor, sequenceFloor = 0 } =
    params;
  const floor = Math.min(workspaceFloor, height * USUAL_WORKSPACE_SHARE);
  const wholeSequence = Math.min(
    sequenceFloor,
    height * (1 - MIN_TOOL_PANEL_SHARE)
  );
  const workspace = Math.round(
    Math.min(height, Math.max(0, preferredWorkspace, floor, wholeSequence))
  );
  return [workspace, height - workspace];
}
