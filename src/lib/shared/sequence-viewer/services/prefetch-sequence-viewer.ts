/**
 * The sequence viewer's content is a lazy chunk. Loading it on the tap meant
 * its download and evaluation ran during the drawer's opening slide, so
 * surfaces that offer the viewer warm it while the page is idle instead.
 * The drawer host loads through the same function, so both share one module
 * promise.
 */

type ViewerContentModule =
  typeof import("../components/SequenceViewerDrawerContent.svelte");

let pending: Promise<ViewerContentModule> | null = null;

export function loadSequenceViewerContent(): Promise<ViewerContentModule> {
  pending ??= import("../components/SequenceViewerDrawerContent.svelte").catch(
    (error: unknown) => {
      // Let the next open (or LazyMount's retry) try the download again.
      pending = null;
      throw error;
    }
  );
  return pending;
}

export function prefetchSequenceViewerWhenIdle(): void {
  if (pending || typeof window === "undefined") return;
  const run = () => {
    loadSequenceViewerContent().catch(() => {
      // A failed warm-up just means the viewer loads on open as before.
    });
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}
