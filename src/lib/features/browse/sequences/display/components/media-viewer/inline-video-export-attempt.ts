/** A canvas export can be cancelled before its lazy-loaded encoder is ready. */
export function createInlineVideoExportAttempt() {
  let cancelled = false;
  let stopActiveExport: (() => void) | null = null;

  return {
    get cancelled() {
      return cancelled;
    },
    /** Attach only after the exporter is ready; false means startup was cancelled. */
    attach(stop: () => void): boolean {
      if (cancelled) return false;
      stopActiveExport = stop;
      return true;
    },
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      stopActiveExport?.();
    },
  };
}
