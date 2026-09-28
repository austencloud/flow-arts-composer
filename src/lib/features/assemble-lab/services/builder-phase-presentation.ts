import type { BuilderPhase } from "../state/assemble-state.svelte";

export interface BuilderControlVisibility {
  readonly orientation: boolean;
  readonly motionSettings: boolean;
}

export function getBuilderControlVisibility(
  phase: BuilderPhase
): BuilderControlVisibility {
  return {
    orientation: phase === "placing",
    motionSettings:
      phase === "placing" || phase === "building" || phase === "animating",
  };
}
