import { getContext, setContext } from "svelte";

import type { ShapeMatrixAppState } from "../state/shape-matrix-app-state.svelte";

const SHAPE_MATRIX_APP_CONTEXT = Symbol("shape-matrix-app-context");

export function setShapeMatrixAppContext(state: ShapeMatrixAppState): void {
  setContext(SHAPE_MATRIX_APP_CONTEXT, state);
}

export function getShapeMatrixAppContext(): ShapeMatrixAppState {
  const state = getOptionalShapeMatrixAppContext();
  if (!state) throw new Error("Shape Matrix app context is unavailable");
  return state;
}

export function getOptionalShapeMatrixAppContext(): ShapeMatrixAppState | null {
  return (
    getContext<ShapeMatrixAppState | undefined>(SHAPE_MATRIX_APP_CONTEXT) ??
    null
  );
}
