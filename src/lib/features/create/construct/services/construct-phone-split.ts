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

/**
 * From this picker width up (still on the phone tier), the letter-type tabs
 * stand in a rail down the picker's left edge instead of a row on top. The
 * unfolded Fold (707 wide) qualifies; 375 and 412 phones keep the row. The
 * picker there is wide and short, so the row's height is worth more to the
 * grid than the rail's width.
 */
export const CONSTRUCT_TYPE_RAIL_MIN_WIDTH = 600;
/**
 * The rail's width: the tier's 40px tabs in the same 52px shell the tab row
 * stands in (the tab strip's 4px and the shell's 2px on each side).
 */
export const CONSTRUCT_TYPE_RAIL_WIDTH = 52;
/**
 * Grid columns the option grid may choose on the rail tier. Four keeps a
 * position's 16 Type 1 options as one 4x4 block; [4, 6] lets it pick six
 * wider-than-tall columns again, for comparison.
 */
export const CONSTRUCT_TYPE_RAIL_COLUMN_OPTIONS: readonly number[] = [4];

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

/** The phone tier at a width that gives its letter-type tabs a left rail. */
export function isConstructTypeRailTier(params: {
  width: number;
  stacked: boolean;
}): boolean {
  return (
    isConstructPhoneTier(params) &&
    params.width >= CONSTRUCT_TYPE_RAIL_MIN_WIDTH
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

  // With the tabs in a left rail, the grid loses the rail's width and the
  // picker no longer spends a row of height on them.
  const typeRail = isConstructTypeRailTier(params);
  const gridWidth = width - (typeRail ? CONSTRUCT_TYPE_RAIL_WIDTH : 0);
  const optionSize = Math.min(
    MAX_OPTION_SIZE,
    (gridWidth - GRID_INLINE_PADDING - GRID_GAP * (GRID_COLUMNS - 1)) /
      GRID_COLUMNS
  );
  // An upper bound: the picker lays out four to eight columns, and four is
  // the most height it can ask for.
  const pickerWanted =
    (typeRail ? 0 : TYPE_NAVIGATION_HEIGHT) +
    CAROUSEL_BOTTOM_PADDING +
    optionSize * GRID_ROWS +
    GRID_GAP * (GRID_ROWS - 1);
  return stackedWorkspaceSplit({
    height,
    preferredWorkspace: height - pickerWanted,
    workspaceFloor,
  });
}
