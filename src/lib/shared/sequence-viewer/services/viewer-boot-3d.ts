/**
 * Does this page load open the sequence viewer straight into 3D?
 *
 * Read from the URL alone, before the viewer exists, by two boot paths that
 * must agree: the route starts the 3D code early (`sequence/[id]/+page.svelte`)
 * and analytics holds back session recording until the scene is up
 * (`analytics/replay-hold.ts`). It mirrors how the viewer picks its first pane:
 * `pane` owns the mode when present (`initialViewerModeForUrl`), a pane-less
 * `render=3d` permalink opens 3D, and a `split` pane opens 3D when either side
 * is `animation-3d`. A viewport too small for 3D shows 2D instead
 * (`coerce3DContent`), so it never counts.
 *
 * A `/q` scan always lands on the card, but scan links do not carry these
 * params; if one ever did, the cases above would over-report 3D, and both
 * callers treat that as harmless (an early chunk download, a capped hold).
 */
import { viewerModeForRenderMode } from "./viewer-modes";
import { fits3DViewport } from "#lib/shared/3d/capabilities/viewport-3d-gate.svelte.js";

export function urlOpens3DViewer(params: URLSearchParams): boolean {
  const pane = params.get("pane");
  if (pane === "split") {
    return (params.get("split") ?? "").split(",").includes("animation-3d");
  }
  if (pane) return pane === "animation-3d";
  const render = params.get("render");
  return (
    viewerModeForRenderMode(render === "3d" || render === "2d" ? render : null) ===
    "animation-3d"
  );
}

/** `urlOpens3DViewer` for a live page, with the viewport gate applied. */
export function pageBootsInto3D(
  location: Pick<Location, "search"> | null = typeof window === "undefined"
    ? null
    : window.location,
  viewport: { width: number; height: number } | null = typeof window ===
  "undefined"
    ? null
    : { width: window.innerWidth, height: window.innerHeight }
): boolean {
  if (!location || !viewport) return false;
  if (!fits3DViewport(viewport.width, viewport.height)) return false;
  return urlOpens3DViewer(new URLSearchParams(location.search));
}
