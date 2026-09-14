// src/lib/shared/shape-matrix/app/state/shape-matrix-customize.ts
/**
 * Whether the customize workspace is open, decided in one place for the
 * workspace itself, the grid panes it covers (they go inert under it) and the
 * shell (it rebalances the split for it).
 */
import type { PillId } from "$lib/shared/animation-panel/pill-nav/pill-types";
import type { ShapeMatrixAnimationState } from "./shape-matrix-animation-state.svelte";
import type { ShapeMatrixAppState } from "./shape-matrix-app-state.svelte";

/**
 * The page asked for: the open section, or the Props page while the prop
 * picker is open. Prop mode left open on a compact host arrives as the
 * Props page when the host widens, so the request is honoured rather than
 * stranded.
 */
export function customizeRequest(
  app: ShapeMatrixAppState,
  animation: ShapeMatrixAnimationState
): PillId | null {
  return animation.activeSection ?? (app.propPickerOpen ? "props" : null);
}

/** Whether the surface that is showing has a pair to customize. */
export function surfaceHasPair(app: ShapeMatrixAppState): boolean {
  return app.surface === "theory"
    ? app.theoryPair !== null
    : app.selectedPair !== null;
}

/**
 * The page the workspace shows, or null while it is closed: wide hosts only,
 * a requested page, and a pair on the surface that is showing. A surface with
 * no pair yet shows its empty stage, and there is nothing to customize over
 * it.
 */
export function customizeSection(
  app: ShapeMatrixAppState,
  animation: ShapeMatrixAnimationState
): PillId | null {
  if (app.compact || !surfaceHasPair(app)) return null;
  return customizeRequest(app, animation);
}
