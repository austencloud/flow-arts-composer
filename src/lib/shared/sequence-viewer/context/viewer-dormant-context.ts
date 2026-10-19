import { getContext, setContext } from "svelte";

const VIEWER_DORMANT = Symbol("viewer-dormant");

/**
 * Whether the viewer around a component was built hidden ahead of an open and
 * has not been opened yet. Work that writes data, such as minting a card's QR
 * short code, waits for the open.
 */
export function setViewerDormantContext(isDormant: () => boolean): void {
  setContext(VIEWER_DORMANT, isDormant);
}

/** Reads false outside a viewer. */
export function isViewerDormant(): () => boolean {
  return (
    getContext<(() => boolean) | undefined>(VIEWER_DORMANT) ?? (() => false)
  );
}
