/**
 * Whether the option picker should still hold its placeholder instead of the
 * grid.
 *
 * The grid can only speak truthfully once a load has resolved AND its tiles
 * have been prepared. Both steps are async: between the load reporting
 * "ready" and the first prepared frame the list is still empty, and drawing
 * the grid then makes every type group announce it has no pictographs, a
 * confident wrong answer that flashes before the real tiles land.
 *
 * Only the first fill is held. Once a frame has landed, later refilters keep
 * the current tiles on screen rather than blinking back to the placeholder.
 */
export function isAwaitingFirstOptionFrame({
  preparedCount,
  loadState,
  firstFrameSettled,
}: {
  preparedCount: number;
  loadState: string | undefined;
  firstFrameSettled: boolean;
}): boolean {
  if (preparedCount > 0) return false;
  return loadState === "idle" || loadState === "loading" || !firstFrameSettled;
}
