/**
 * The pieces the front-page stage plays, in order: the tunnels first (list
 * order, at most two), then mandalas in list order, five in all. Fewer when
 * fewer exist.
 */
export const STAGE_PLAYLIST_SIZE = 5;
export const STAGE_MAX_TUNNELS = 2;

export function buildStagePlaylist<T>(
  tunnels: readonly T[],
  mandalas: readonly T[],
  size: number = STAGE_PLAYLIST_SIZE
): T[] {
  const lead = tunnels.slice(0, Math.min(STAGE_MAX_TUNNELS, size));
  return [...lead, ...mandalas].slice(0, size);
}
