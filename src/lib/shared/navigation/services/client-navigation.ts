/**
 * Whether this document has moved between pages inside the app.
 *
 * The root layout reports every client navigation here. A page that needs to
 * know whether it was reached from inside the app, or is the first page of
 * the visit (a shared link, a scan, a reload), reads it while it initializes:
 * on a client navigation the report arrives before the new page mounts.
 * Writes within one page (shallow URL updates, query changes) do not count.
 */

let navigatedBetweenPages = false;

export function noteClientNavigation(
  fromPath: string | null | undefined,
  toPath: string | null | undefined
): void {
  if (fromPath && toPath && fromPath !== toPath) navigatedBetweenPages = true;
}

export function hasNavigatedBetweenPages(): boolean {
  return navigatedBetweenPages;
}

/** Tests only. */
export function _resetClientNavigation(): void {
  navigatedBetweenPages = false;
}
