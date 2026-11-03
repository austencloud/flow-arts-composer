import { MediaQuery } from "svelte/reactivity";

/**
 * A phone held sideways: the Fold's cover screen turned horizontal is about
 * 915x412, or 915x340 with Chrome's bar showing. On a screen that short and
 * that wide, stacking chrome above and below the content leaves the content a
 * strip, so the sideways layouts move the chrome into a column beside it.
 *
 * Every sideways layout uses this one breakpoint (the Create theater mode,
 * the start placement picker, Browse's side column, the guide's two-column
 * screens, the sequence viewer). CSS can't import a string, so stylesheets
 * repeat it literally; keep them in step with this value. Portrait phones,
 * the unfolded Fold (707x772), tablets and desktops never match it.
 */
export const SIDEWAYS_VIEWPORT_QUERY =
  "(max-height: 480px) and (min-width: 700px)";

// MediaQuery's constructor calls window.matchMedia, so it is built on first
// use in the browser and never during server rendering. One instance serves
// every caller; it is reactive, so a rotation re-runs whatever read it.
let query: MediaQuery | null = null;

/** Whether the viewport is a phone held sideways. False during SSR. */
export function isSidewaysViewport(): boolean {
  if (typeof window === "undefined") return false;
  query ??= new MediaQuery(SIDEWAYS_VIEWPORT_QUERY);
  return query.current;
}
