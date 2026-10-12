import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackCompositionSaved(properties: {
  compositionId: string;
  cellCount: number;
  rows: number;
  columns: number;
}): void {
  void logActivity("composition_saved", "sequence", {
    composition_id: properties.compositionId,
    cell_count: properties.cellCount,
    rows: properties.rows,
    columns: properties.columns,
  });
}

export function trackCompositionDeleted(compositionId: string): void {
  void logActivity("composition_deleted", "sequence", {
    composition_id: compositionId,
  });
}

export function trackCompositionFavoriteChanged(
  compositionId: string,
  favorite: boolean
): void {
  void logActivity("composition_favorite_changed", "sequence", {
    composition_id: compositionId,
    favorite,
  });
}
