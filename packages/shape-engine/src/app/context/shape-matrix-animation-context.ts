import { getContext, setContext } from "svelte";
import type { ShapeMatrixAnimationState } from "../state/shape-matrix-animation-state.svelte";

const SHAPE_MATRIX_ANIMATION_CONTEXT = Symbol("shape-matrix-animation");

export function setShapeMatrixAnimationContext(
  state: ShapeMatrixAnimationState
): ShapeMatrixAnimationState {
  setContext(SHAPE_MATRIX_ANIMATION_CONTEXT, state);
  return state;
}

export function getShapeMatrixAnimationContext(): ShapeMatrixAnimationState {
  const state = getContext<ShapeMatrixAnimationState | null>(
    SHAPE_MATRIX_ANIMATION_CONTEXT
  );
  if (!state) {
    throw new Error("Shape Matrix animation context is not available");
  }
  return state;
}
