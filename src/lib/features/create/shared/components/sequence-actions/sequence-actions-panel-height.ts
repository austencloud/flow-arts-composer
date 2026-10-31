const DRILLDOWN_HEIGHT_BONUS = 48;
const MAXIMUM_MINIMUM_WORKSPACE_HEIGHT = 280;
const MINIMUM_WORKSPACE_RATIO = 0.42;

interface PanelHeightInput {
  basePanelHeight: number;
  viewportHeight: number;
  workspaceContext: boolean;
  hasDrilldown: boolean;
}

/**
 * A drill-down gets one additional control row while the sequence keeps a
 * useful workspace band above it. The base height is already the product's
 * measured controls footprint, so constrained viewports never shrink below it.
 */
export function getSequenceActionsPanelHeight({
  basePanelHeight,
  viewportHeight,
  workspaceContext,
  hasDrilldown,
}: PanelHeightInput): number {
  if (!workspaceContext || !hasDrilldown) return basePanelHeight;

  const minimumWorkspaceHeight = Math.min(
    MAXIMUM_MINIMUM_WORKSPACE_HEIGHT,
    viewportHeight * MINIMUM_WORKSPACE_RATIO
  );
  const maximumDrawerHeight = Math.max(
    basePanelHeight,
    viewportHeight - minimumWorkspaceHeight
  );

  return Math.min(
    basePanelHeight + DRILLDOWN_HEIGHT_BONUS,
    maximumDrawerHeight
  );
}

/**
 * The drawer's grab handle footprint (height plus vertical margins), which
 * CreatePanelDrawer takes off the combined height to size its body. Keep in
 * sync with SheetDragHandle's variables.
 */
export const DRAWER_HANDLE_FOOTPRINT = 29;

interface FittedToolPanelInput {
  /** The root actions' header plus toolbar at their natural height. */
  contentHeight: number;
  navigationBarHeight: number;
}

/**
 * Tool panel height that leaves the open drawer's body exactly as tall as the
 * root actions. The drawer copies the tool panel's height, so on a tall
 * stacked screen (the unfolded Fold in portrait, a tablet) it kept the
 * option picker's share and left a strip of empty drawer under two rows of
 * actions while the step grid above stayed squeezed (2026-10-29). Shrinking
 * the tool panel to this height hands that strip to the workspace. One pixel
 * of slack keeps measurement rounding from squeezing the tiles, which would
 * report a shorter toolbar and shrink the drawer again.
 */
export function fittedToolPanelHeight({
  contentHeight,
  navigationBarHeight,
}: FittedToolPanelInput): number {
  if (contentHeight <= 0) return 0;
  return Math.max(
    0,
    Math.ceil(contentHeight + DRAWER_HANDLE_FOOTPRINT - navigationBarHeight) + 1
  );
}
