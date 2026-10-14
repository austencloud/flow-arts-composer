/**
 * One shared import of the standalone viewer.
 *
 * The viewer's module graph is the slowest part of opening a sequence on a
 * phone: on a cold visit it is ~70 chained chunks plus seconds of evaluation.
 * The /q scan ingress starts this the moment it mounts and waits on it before
 * handing off, so its own loader covers the download instead of the route's
 * bare background. /sequence awaits the same promise, so a scan arrives with
 * the module already evaluated and a share link still gets one import.
 */
type SequenceViewerPageModule = typeof import("./SequenceViewerPage.svelte");

let pending: Promise<SequenceViewerPageModule> | null = null;

export function loadSequenceViewerPage(): Promise<SequenceViewerPageModule> {
  if (!pending) {
    pending = import("./SequenceViewerPage.svelte");
    // A failed chunk fetch must not be cached; the next caller retries it.
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
