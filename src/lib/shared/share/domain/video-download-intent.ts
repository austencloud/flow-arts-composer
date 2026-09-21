export interface PendingVideoDownload {
  pending: boolean;
  sheetOpen: boolean;
  requestVersion: number;
  pendingRequestVersion: number | null;
  currentSettingsKey: string;
  requestedSettingsKey: string | null;
  currentSourceKey: string;
  requestedSourceKey: string | null;
  status: "idle" | "rendering" | "ready" | "canceled" | "failed";
  hasBlob: boolean;
}

export function shouldDeliverPendingVideo(
  value: PendingVideoDownload
): boolean {
  return (
    value.pending &&
    value.sheetOpen &&
    value.status === "ready" &&
    value.hasBlob &&
    value.pendingRequestVersion === value.requestVersion &&
    value.currentSettingsKey === value.requestedSettingsKey &&
    value.currentSourceKey === value.requestedSourceKey
  );
}

export type PendingVideoDownloadOutcome = "waiting" | "deliver" | "retry";

/**
 * A render can finish after the person changes its settings or leaves the
 * captured view. The finished bytes are then useful for previewing, but they
 * are no longer the file they asked to download. Surface that distinction so
 * the original Download action never appears to have vanished.
 */
export function pendingVideoDownloadOutcome(
  value: PendingVideoDownload
): PendingVideoDownloadOutcome {
  if (!value.pending) return "waiting";
  if (shouldDeliverPendingVideo(value)) return "deliver";

  const requestFinished =
    value.sheetOpen &&
    value.status === "ready" &&
    value.hasBlob &&
    value.pendingRequestVersion === value.requestVersion;
  const requestChanged =
    value.currentSettingsKey !== value.requestedSettingsKey ||
    value.currentSourceKey !== value.requestedSourceKey;

  return requestFinished && requestChanged ? "retry" : "waiting";
}

export function videoDownloadSettingsKey(value: {
  resolution: number;
  fps: number;
  repeats: number;
  quality: string;
  is3DExport: boolean;
  /** The chosen opener image; omitted by hosts whose renders cannot take one. */
  opener?: string;
}): string {
  return [
    value.resolution,
    value.fps,
    value.repeats,
    value.is3DExport ? value.quality : "",
    value.opener ?? "",
  ].join("|");
}

export type FileRequestPlan = "deliver" | "render" | "request-account";

/**
 * One Download click resolves to exactly one outcome. The take-it-home account
 * gate is decided here, before any render is requested, so a guest never sees
 * a render start and then read "canceled" while a sign-in shell sits painted
 * underneath the sheet.
 */
export function planFileRequest(value: {
  needsAccount: boolean;
  hasFreshFile: boolean;
}): FileRequestPlan {
  if (value.needsAccount) return "request-account";
  return value.hasFreshFile ? "deliver" : "render";
}
