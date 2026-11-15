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

/**
 * The least distance from the option picker's left or right edge to any
 * option tile on the phone tier: the inset of the letter-type row above it,
 * so the grid's outer edges line up with that row's. Beside a type rail the
 * grid keeps its old 4px inset; the rail is the edge there.
 */
export const CONSTRUCT_PHONE_GRID_GUTTER = 14;
const RAIL_SIDE_GRID_INSET = 4;

/** The option grid's [start, end] side gutters on the phone tier. */
export function constructPhoneGridGutter(typeRail: boolean): {
  start: number;
  end: number;
} {
  return {
    start: typeRail ? RAIL_SIDE_GRID_INSET : CONSTRUCT_PHONE_GRID_GUTTER,
    end: CONSTRUCT_PHONE_GRID_GUTTER,
  };
}

// The picker's own rows, measured at 375px: the letter-type navigation (the
// tier's 40px target in its 52px shell) and the carousel's bottom padding. On
// this tier the tabs name the group, so the split reserves no height for a type
// heading, and the arrows are gone, so the grid spans the width less its side
// gutters.
const TYPE_NAVIGATION_HEIGHT = 52;
const CAROUSEL_BOTTOM_PADDING = 10;
const GRID_GAP = 8;
const GRID_COLUMNS = 4;
const GRID_ROWS = 4;
// The picker's largest option card. Past it, extra height is only empty space.
const MAX_OPTION_SIZE = 120;

/**
 * Rows of step pictures the workspace floor keeps on a phone-width Construct
 * (narrower than the type rail tier): two whole rows and a quarter of the
 * third, so a longer sequence shows that it scrolls.
 *
 * The quarter row is how the height the slim bars gave back is shared. The
 * floor is measured from the real header and button bar, so on its own a
 * shorter bar would hand every pixel to the picker and the sequence window
 * would stay where it was. Measured at 392x739 with 18 steps (2026-11-13):
 * the bars went from 135px to about 92px; with this quarter row the sequence
 * window goes from 180px to about 197px and the picker's tiles from 73px to
 * about 79px. Wider tiers keep the usual two rows.
 */
export const CONSTRUCT_PHONE_SEQUENCE_ROWS = 2.25;

/**
 * The smallest option tile the phone-width picker's Type 1 page should show
 * while the sequence still has rows to give: under 68px a prop stops reading.
 */
export const CONSTRUCT_PHONE_OPTION_FLOOR = 68;

/** The fewest rows of step pictures the sequence yields down to. */
export const CONSTRUCT_PHONE_MIN_SEQUENCE_ROWS = 1.25;

/**
 * The phone-width workspace floor once it yields to the picker.
 *
 * The workspace keeps its 2.25-row floor (fullFloor) unless that would leave
 * the Type 1 page's 4x4 grid under CONSTRUCT_PHONE_OPTION_FLOOR. Then it
 * gives height back, down to 1.25 rows (minFloor):
 *
 *   workspace = max(minFloor, min(fullFloor, height - pickerHeightFor(68)))
 *
 * where pickerHeightFor(68) is the type tabs, the carousel's padding and four
 * 68px rows with their gaps: 52 + 10 + 4 x 68 + 3 x 8 = 358.
 *
 * Measured with 18 steps (2026-11-13): at 360x640 (layout height 595) the
 * floor was 275 and the tiles 58 with 52px empty at each side; it is now
 * about 237, with 68px tiles and about 32px at each side. At 360x591 (546)
 * the floor stops at 1.25 rows (212) and the tiles reach about 62.
 * 360x689, 375x667, 392x735 and 412x915 already leave 68px or more, so they
 * keep the full floor. Only the phone-width tier (under
 * CONSTRUCT_TYPE_RAIL_MIN_WIDTH) uses this; the rail tier keeps two rows.
 */
export function constructPhoneWorkspaceFloor(params: {
  height: number;
  fullFloor: number;
  minFloor: number;
}): number {
  const { height, fullFloor, minFloor } = params;
  const pickerForOptionFloor =
    TYPE_NAVIGATION_HEIGHT +
    CAROUSEL_BOTTOM_PADDING +
    CONSTRUCT_PHONE_OPTION_FLOOR * GRID_ROWS +
    GRID_GAP * (GRID_ROWS - 1);
  return Math.max(minFloor, Math.min(fullFloor, height - pickerForOptionFloor));
}

export function constructPhoneSequenceRows(width: number): number | undefined {
  return width > 0 && width < CONSTRUCT_TYPE_RAIL_MIN_WIDTH
    ? CONSTRUCT_PHONE_SEQUENCE_ROWS
    : undefined;
}

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
 * A side-by-side picker this short is a phone held sideways (the Fold's
 * cover screen on its side, often under 360px tall with the browser bar).
 * A tab row there costs a sixth of the grid's height, so the tabs take the
 * rail instead.
 */
export const CONSTRUCT_SHORT_LANDSCAPE_MAX_HEIGHT = 480;

/**
 * The phone tier at a width that gives its letter-type tabs a left rail, or
 * a short side-by-side picker on a phone held sideways.
 */
export function isConstructTypeRailTier(params: {
  width: number;
  stacked: boolean;
  height?: number;
}): boolean {
  if (!params.stacked) {
    const height = params.height ?? 0;
    return (
      height > 0 &&
      height <= CONSTRUCT_SHORT_LANDSCAPE_MAX_HEIGHT &&
      params.width > 0 &&
      params.width < CONSTRUCT_PHONE_MAX_WIDTH
    );
  }
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
  const gutter = constructPhoneGridGutter(typeRail);
  const optionSize = Math.min(
    MAX_OPTION_SIZE,
    (gridWidth - gutter.start - gutter.end - GRID_GAP * (GRID_COLUMNS - 1)) /
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
