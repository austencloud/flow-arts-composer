import {
  isSidewaysViewport,
  SIDEWAYS_VIEWPORT_QUERY,
} from "#lib/shared/ui/sideways-viewport.js";

/**
 * Theater mode for the Create workspace's in-place preview.
 *
 * On a phone held sideways (the Fold's cover screen turned horizontal is
 * about 915x340 with Chrome's bar showing) the workspace's header, Undo/Redo,
 * Save and bottom bar left the player a box about 210px tall. While the
 * preview runs there, those controls step aside and the player takes the
 * whole workspace: canvas, then the notation rail, then Viewer, Share and
 * Stop in a column of their own beside it.
 *
 * The query is the sideways pass's breakpoint, owned by
 * `shared/ui/sideways-viewport.ts` and shared with the start placement
 * picker, the Create front door and the viewer. WorkspacePlayback's CSS
 * repeats it, so the script and the layout always agree. Portrait phones, the
 * unfolded Fold and desktops never match it.
 */
export const WORKSPACE_THEATER_QUERY = SIDEWAYS_VIEWPORT_QUERY;

/** Whether the viewport is short and wide enough for theater mode. */
export function isTheaterViewport(): boolean {
  return isSidewaysViewport();
}

/**
 * Whether the workspace is in theater mode. It starts as soon as Play is
 * pressed, so the player builds its engine at its final size rather than
 * resizing after its first frame. A preparation that failed brings the bar
 * back, because Retry lives there.
 */
export function workspaceTheaterActive({
  theaterViewport,
  playing,
  preparing,
  preparationFailed,
}: {
  theaterViewport: boolean;
  /** The preview is showing (panelState.workspacePlayback). */
  playing: boolean;
  /** Play was pressed and the player is still loading. */
  preparing: boolean;
  /** The loading player reported an error; the bar offers Retry. */
  preparationFailed: boolean;
}): boolean {
  if (!theaterViewport) return false;
  if (playing) return true;
  return preparing && !preparationFailed;
}
