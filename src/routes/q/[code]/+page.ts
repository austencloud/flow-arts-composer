import { browser } from "$app/env";
import type { PageLoad } from "./$types";
import { loadSequenceViewerPage } from "../../sequence/[id]/load-sequence-viewer-page.js";

/**
 * Preserve the server payload without importing scan analytics into the
 * initial route graph. The neutral loading gate stays up while the lazy scan
 * ingress validates the code and hands off to the canonical /sequence route.
 *
 * Both lazy graphs start here, before the page hydrates. The scan ingress
 * used to start the viewer import from its own onMount, so a phone fetched
 * the ingress graph (~2.5 s) and only then the viewer graph (~3 s) in a
 * second, serial pass. Started together they share the connection, and the
 * later imports in +page.svelte and QScanPage resolve from the module cache.
 */
export const load: PageLoad = ({ data }) => {
  if (browser) {
    void import("./QScanPage.svelte").catch(() => {});
    void loadSequenceViewerPage().catch(() => {});
  }
  return data;
};
