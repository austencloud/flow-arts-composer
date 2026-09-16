import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/**
 * Toggle one allowed placement while keeping the picker usable. The final
 * enabled placement stays enabled because generation always needs somewhere to
 * start or end.
 */
export function toggleBlockedPlacement(
  allPlacements: readonly GridPlacement[],
  blockedPlacements: GridPlacement[],
  placement: GridPlacement
): GridPlacement[] {
  const blocked = new Set(blockedPlacements);
  if (blocked.has(placement)) {
    return blockedPlacements.filter((candidate) => candidate !== placement);
  }

  const enabledCount = allPlacements.filter(
    (candidate) => !blocked.has(candidate)
  ).length;
  if (enabledCount <= 1) return blockedPlacements;

  return [...blockedPlacements, placement];
}

/** Keep one chosen placement enabled and block every other visible placement. */
export function blockAllExcept(
  allPlacements: readonly GridPlacement[],
  placement: GridPlacement
): GridPlacement[] {
  return allPlacements.filter((candidate) => candidate !== placement);
}

/** Compare two blocklists as sets so preset order never affects active styling. */
export function hasSameBlockedPlacements(
  first: readonly GridPlacement[],
  second: readonly GridPlacement[]
): boolean {
  if (first.length !== second.length) return false;
  const secondSet = new Set(second);
  return first.every((placement) => secondSet.has(placement));
}
