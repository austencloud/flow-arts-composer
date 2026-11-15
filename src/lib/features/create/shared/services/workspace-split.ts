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

/**
 * Nor does it take the tool panel below the height Generate's compact cards
 * need: the slim Level bar, three 45px card rows and the Generate button
 * (a stepper card's label over its value needs 44px).
 * The installed app on the unfolded Fold has 728px, not Chrome's 779, and
 * 2/7 of that (208px) squeezed the Length, Setups and Turns cards to 31px
 * rows that cut their labels in half (2026-11-02). The step grid shrinks its
 * cells to fit the rest (fitTimelineRows in grid-calculations.ts).
 */
export const MIN_TOOL_PANEL_HEIGHT = 260;

/**
 * What Generate's settings cards need on a narrow short phone, from the
 * narrow compact rule in CardBasedSettingsContainer.svelte
 * (`@container settings-grid (width < 630px) and (height < 560px)`): the
 * 56px Level row, three 44px card rows (Length/Setups, Grid/Customize,
 * Turns/LOOP), the 56px Generate row, four 4px gaps, and the panel's 8px of
 * padding. A 360 x 591 phone gave the panel 243px of its usual 4/9 and the
 * Generate button ended under the bottom bar (2026-11-14). Change both
 * together; workspace-split.test.ts reads the CSS to keep them in step.
 */
export const GENERATE_PHONE_ROW_FLOORS = {
  level: 56,
  cardRow: 44,
  cardRows: 3,
  generate: 56,
  gap: 4,
  padding: 8,
} as const;

export const GENERATE_PHONE_PANEL_NEED =
  GENERATE_PHONE_ROW_FLOORS.level +
  GENERATE_PHONE_ROW_FLOORS.cardRow * GENERATE_PHONE_ROW_FLOORS.cardRows +
  GENERATE_PHONE_ROW_FLOORS.generate +
  GENERATE_PHONE_ROW_FLOORS.gap * (GENERATE_PHONE_ROW_FLOORS.cardRows + 1) +
  GENERATE_PHONE_ROW_FLOORS.padding;

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
 * panel would drop below MIN_TOOL_PANEL_SHARE or MIN_TOOL_PANEL_HEIGHT).
 *
 * `toolPanelNeed`, when given, is what the tool panel's controls need
 * (GENERATE_PHONE_PANEL_NEED on a narrow phone in Generate): the workspace
 * gives up part of its share so the panel gets it, but never goes below its
 * own floor, so on a window too short for both the workspace floor wins.
 */
export function stackedWorkspaceSplit(params: {
  height: number;
  preferredWorkspace: number;
  workspaceFloor: number;
  sequenceFloor?: number;
  toolPanelNeed?: number;
}): [number, number] {
  const {
    height,
    preferredWorkspace,
    workspaceFloor,
    sequenceFloor = 0,
    toolPanelNeed = 0,
  } = params;
  const floor = Math.min(workspaceFloor, height * USUAL_WORKSPACE_SHARE);
  const wholeSequence = Math.min(
    sequenceFloor,
    height * (1 - MIN_TOOL_PANEL_SHARE),
    height - MIN_TOOL_PANEL_HEIGHT
  );
  const usual = Math.min(
    height,
    Math.max(0, preferredWorkspace, floor, wholeSequence)
  );
  const yielded =
    toolPanelNeed > 0
      ? Math.min(usual, Math.max(height - toolPanelNeed, workspaceFloor))
      : usual;
  const workspace = Math.round(yielded);
  return [workspace, height - workspace];
}
