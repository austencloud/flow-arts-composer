import { logActivity } from "#lib/shared/analytics/services/posthog-activity-logger.js";

export function trackChoreoSheetSaved(properties: {
  sheetId: string;
  sequenceCount: number;
  orientation: string;
  columns: number;
}): void {
  void logActivity("choreo_sheet_saved", "sequence", {
    sheet_id: properties.sheetId,
    sequence_count: properties.sequenceCount,
    orientation: properties.orientation,
    columns: properties.columns,
  });
}

export function trackChoreoSheetDeleted(sheetId: string): void {
  void logActivity("choreo_sheet_deleted", "sequence", {
    sheet_id: sheetId,
  });
}

export function trackChoreoSheetExported(properties: {
  sheetId: string;
  pageCount: number;
  sequenceCount: number;
}): void {
  void logActivity("choreo_sheet_exported", "share", {
    sheet_id: properties.sheetId,
    page_count: properties.pageCount,
    sequence_count: properties.sequenceCount,
    export_format: "pdf",
  });
}
