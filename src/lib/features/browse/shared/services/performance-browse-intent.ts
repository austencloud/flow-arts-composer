import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
import type { ViewerMode } from "#lib/shared/sequence-viewer/state/viewer-state.svelte.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";

/**
 * Someone who chose to browse by performances should arrive at the
 * performance, not lose that choice at the sequence-viewer boundary. Other
 * filters keep the viewer's normal opening surface.
 */
export function resolveBrowseInitialViewerMode(
  activeFilters: BrowseEngine["activeFilters"]
): ViewerMode | undefined {
  const performanceIntent = [...activeFilters.values()].some(
    (filter) =>
      filter.type === BrowseFilterType.PERFORMANCE_AVAILABILITY ||
      filter.type === BrowseFilterType.RECENT_PERFORMANCE
  );

  return performanceIntent ? "videos" : undefined;
}
