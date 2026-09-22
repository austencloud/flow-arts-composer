/** Decides whether one explicit card-download request can still be delivered. */
export function pendingCardDownloadOutcome(input: {
  pendingRevision: string | null;
  sheetOpen: boolean;
  artifact: "card" | "video";
  currentRevision: string | null;
  hasBlob: boolean;
  hasError: boolean;
}): "waiting" | "deliver" | "cancel" | "failed" {
  if (!input.pendingRevision) return "cancel";
  if (
    !input.sheetOpen ||
    input.artifact !== "card" ||
    input.currentRevision !== input.pendingRevision
  )
    return "cancel";
  if (input.hasError) return "failed";
  return input.hasBlob ? "deliver" : "waiting";
}
