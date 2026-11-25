import { getContext, setContext } from "svelte";
import type { LoopStepWorkshop } from "../services/loop-step-workshop";
import type { LoopGoalState } from "../state/loop-goal-state.svelte";

export interface LoopBuilderContext {
  state: LoopGoalState;
  workshop: LoopStepWorkshop;
}

const LOOP_BUILDER_CONTEXT_KEY = Symbol("loop-builder");

export function setLoopBuilderContext(context: LoopBuilderContext): void {
  setContext(LOOP_BUILDER_CONTEXT_KEY, context);
}

export function getLoopBuilderContext(): LoopBuilderContext {
  const context = getContext<LoopBuilderContext>(LOOP_BUILDER_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "LoopBuilderContext not found. getLoopBuilderContext() needs a LoopTab above it."
    );
  }
  return context;
}
