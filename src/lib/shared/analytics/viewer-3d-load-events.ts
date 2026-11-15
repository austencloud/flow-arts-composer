/**
 * The record of one wait for 3D: an event when the scene becomes visible, or
 * one when the visitor leaves before it does. Exactly one of the two per
 * wait. The existing `system_3d_loading` pause and play stay as they are;
 * these add how long the wait was and what had been warmed before it.
 *
 * Payloads are built here, from plain numbers and flags, so the viewer cannot
 * add sequence content to them.
 */
import { captureEvent } from "#lib/shared/analytics/services/posthog.js";

export type Viewer3DEntry = "switch" | "direct_open";
export type Viewer3DWaitStage = "preparing" | "revealing";

export interface Viewer3DLoadRecord {
  readonly startedAt: number;
  readonly entry: Viewer3DEntry;
  readonly codeWarm: boolean;
  readonly assetsWarm: boolean;
  readonly workerCapable: boolean;
  settled: boolean;
}

export function startViewer3DLoadRecord(
  init: Omit<Viewer3DLoadRecord, "settled">
): Viewer3DLoadRecord {
  return { ...init, settled: false };
}

function baseProperties(record: Viewer3DLoadRecord, now: number) {
  return {
    viewer_3d_wait_ms: Math.max(0, Math.round(now - record.startedAt)),
    viewer_3d_entry: record.entry,
    viewer_3d_code_warm: record.codeWarm,
    viewer_3d_assets_warm: record.assetsWarm,
    // The page cannot see which renderer Viewer3DCanvas picked without
    // loading it; this is whether the worker renderer was available.
    viewer_3d_worker_capable: record.workerCapable,
  };
}

/** Properties for `viewer_3d_visible`, or null if this wait already ended. */
export function viewer3DVisibleProperties(
  record: Viewer3DLoadRecord,
  now: number
): Record<string, unknown> | null {
  if (record.settled) return null;
  record.settled = true;
  return baseProperties(record, now);
}

/** Properties for `viewer_3d_abandoned`, or null if this wait already ended. */
export function viewer3DAbandonedProperties(
  record: Viewer3DLoadRecord,
  now: number,
  stage: Viewer3DWaitStage
): Record<string, unknown> | null {
  if (record.settled) return null;
  record.settled = true;
  return { ...baseProperties(record, now), viewer_3d_stage_reached: stage };
}

export function captureViewer3DVisible(
  record: Viewer3DLoadRecord,
  now: number
): void {
  const properties = viewer3DVisibleProperties(record, now);
  if (properties) captureEvent("viewer_3d_visible", properties);
}

export function captureViewer3DAbandoned(
  record: Viewer3DLoadRecord,
  now: number,
  stage: Viewer3DWaitStage
): void {
  const properties = viewer3DAbandonedProperties(record, now, stage);
  // Leaving the page is the common way to abandon; beacon so it survives.
  if (properties)
    captureEvent("viewer_3d_abandoned", properties, {
      send_instantly: true,
      transport: "sendBeacon",
    });
}

export function workerRendererAvailable(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype
  );
}
