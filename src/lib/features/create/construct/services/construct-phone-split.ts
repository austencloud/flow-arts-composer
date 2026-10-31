/**
 * Construct's phone tier: a stacked workspace narrower than the option
 * picker's wide (eight-column catalog) threshold. Phones and a folded Fold's
 * main screen land here; tablets and the unfolded Fold do not.
 *
 * Picking the next option is the task on that tier, so the picker gets the
 * height its grid can use once the sequence has its legible floor.
 */
import { stackedWorkspaceSplit } from "../../shared/services/workspace-split";

/** Below this picker width the option grid swipes between letter types. */
export const CONSTRUCT_PHONE_MAX_WIDTH = 750;

// The picker's own rows, measured at 375px: the letter-type navigation (the
// tier's 40px target in its 52px shell) and the carousel's bottom padding. On
// this tier the tabs name the group, so the grid carries no type heading, and
// the arrows are gone, so the grid spans the width less its 4px insets.
const TYPE_NAVIGATION_HEIGHT = 52;
const CAROUSEL_BOTTOM_PADDING = 10;
const GRID_INLINE_PADDING = 8;
const GRID_GAP = 8;
const GRID_COLUMNS = 4;
const GRID_ROWS = 4;
// The picker's largest option card. Past it, extra height is only empty space.
const MAX_OPTION_SIZE = 120;

export function isConstructPhoneTier(params: {
  width: number;
  stacked: boolean;
}): boolean {
  return (
    params.stacked &&
    params.width > 0 &&
    params.width < CONSTRUCT_PHONE_MAX_WIDTH
  );
}

/**
 * Pixel sizes for [workspace, option picker] on the phone tier, or null when
 * the layout is not on that tier (the caller keeps its usual split).
 *
 * The picker may take up to the height its grid can use, but never the
 * workspace's legible floor (workspaceFloorHeight): two whole rows of
 * readable step pictures come first, and the picker's tiles shrink to fit
 * what remains.
 */
export function constructPhoneSplit(params: {
  width: number;
  height: number;
  stacked: boolean;
  workspaceFloor: number;
}): [number, number] | null {
  const { width, height, workspaceFloor } = params;
  if (!isConstructPhoneTier(params) || height <= 0) return null;

  const optionSize = Math.min(
    MAX_OPTION_SIZE,
    (width - GRID_INLINE_PADDING - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
  );
  // An upper bound: the picker lays out four to eight columns, and four is
  // the most height it can ask for.
  const pickerWanted =
    TYPE_NAVIGATION_HEIGHT +
    CAROUSEL_BOTTOM_PADDING +
    optionSize * GRID_ROWS +
    GRID_GAP * (GRID_ROWS - 1);
  return stackedWorkspaceSplit({
    height,
    preferredWorkspace: height - pickerWanted,
    workspaceFloor,
  });
}
