/**
 * Construct's phone tier: a stacked workspace narrower than the option
 * picker's wide (eight-column catalog) threshold. Phones and a folded Fold's
 * main screen land here; tablets and the unfolded Fold do not.
 *
 * Picking the next option is the task on that tier, so the picker gets the
 * height its 4-column grid can actually use, and the sequence keeps the rest.
 */

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
// The sequence never drops below this share: its rail, title row and at least
// a readable start card need it, and it hosts the settings popover. The
// tier's 40px controls made that chrome 8px shorter, which is where the two
// points under 40% come from.
const MIN_WORKSPACE_SHARE = 0.38;
// On a short screen that share can fall under the workspace's fixed chrome (a
// 72px title row and a 58px rail), so it also keeps room for a ~100px card
// there, though never more than the share it had before this tier existed.
const MIN_WORKSPACE_HEIGHT = 240;
const USUAL_WORKSPACE_SHARE = 5 / 9;

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
 */
export function constructPhoneSplit(params: {
  width: number;
  height: number;
  stacked: boolean;
}): [number, number] | null {
  const { width, height } = params;
  if (!isConstructPhoneTier(params) || height <= 0) return null;

  const optionSize = Math.min(
    MAX_OPTION_SIZE,
    (width - GRID_INLINE_PADDING - GRID_GAP * (GRID_COLUMNS - 1)) /
      GRID_COLUMNS
  );
  const pickerWanted =
    TYPE_NAVIGATION_HEIGHT +
    CAROUSEL_BOTTOM_PADDING +
    optionSize * GRID_ROWS +
    GRID_GAP * (GRID_ROWS - 1);
  const workspaceMin = Math.max(
    height * MIN_WORKSPACE_SHARE,
    Math.min(height * USUAL_WORKSPACE_SHARE, MIN_WORKSPACE_HEIGHT)
  );
  const pickerMax = height - workspaceMin;
  const picker = Math.round(Math.min(pickerWanted, pickerMax));
  return [height - picker, picker];
}
