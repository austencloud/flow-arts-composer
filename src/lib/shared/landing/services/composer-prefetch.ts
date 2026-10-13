/**
 * Warms Flow Arts Composer's code while a visitor is still reaching for an
 * "Open Flow Arts Composer" link.
 *
 * Public pages open the app with a full reload (data-sveltekit-reload): they
 * boot without Firebase, and the app shell needs its own document. The reload
 * still asks for the same immutable /_app/ chunks the public page can fetch
 * now, so the first hover, focus or touch starts that download and the boot
 * screen afterwards reads them from the HTTP cache.
 *
 * Once per document: the code stays cached across the public pages' soft
 * navigations. Data saver opts out, as it does for the homepage's other
 * speculative loads.
 */
import { preloadCode } from "$app/navigation";
import { prefersReducedData } from "#lib/shared/platform/network-conditions.js";

/**
 * SvelteKit 3 preloads by route id, not pathname. /create and every other
 * app path are served by the catch-all app shell route.
 */
const COMPOSER_ROUTE_ID = "/[...appPath]";

const INTENT_EVENTS = ["pointerenter", "focus", "touchstart"] as const;

let requested = false;

export function prefetchComposer(): void {
  if (requested || prefersReducedData()) return;
  requested = true;
  preloadCode(COMPOSER_ROUTE_ID).catch(() => {
    // A failed warm-up costs nothing: the reload fetches the code itself.
    // Let the next intent try again.
    requested = false;
  });
}

/** Svelte action for a link into the app: warm its code on first intent. */
export function composerIntent(node: HTMLElement): { destroy(): void } {
  for (const type of INTENT_EVENTS) {
    node.addEventListener(type, prefetchComposer, { passive: true });
  }
  return {
    destroy() {
      for (const type of INTENT_EVENTS) {
        node.removeEventListener(type, prefetchComposer);
      }
    },
  };
}
