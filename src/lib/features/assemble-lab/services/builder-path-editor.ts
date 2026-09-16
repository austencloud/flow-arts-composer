import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type {
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { BuilderStep } from "../state/assemble-state.svelte";
import {
  calculateBuilderEndOrientation,
  deriveBuilderMotionGeometry,
} from "./builder-motion-geometry";

export interface BuilderPose {
  readonly location: GridLocation;
  readonly orientation: Orientation;
}

export function createBuilderStep(
  startPose: BuilderPose,
  endPlacement: GridLocation,
  rotationDirection: RotationDirection,
  turnCount: number
): BuilderStep {
  const geometry = deriveBuilderMotionGeometry(
    startPose.location,
    endPlacement,
    startPose.orientation,
    rotationDirection,
    turnCount
  );
  const effectiveTurns =
    turnCount < 0 && (geometry.isSamePoint || geometry.isStraightPath)
      ? 0
      : turnCount;
  const endOrientation = calculateBuilderEndOrientation(
    startPose.orientation,
    startPose.location,
    endPlacement,
    rotationDirection,
    effectiveTurns
  );

  return {
    startPlacement: startPose.location,
    endPlacement,
    rotationDirection,
    turnCount: effectiveTurns,
    startOrientation: startPose.orientation,
    endOrientation,
  };
}

/** Reconnect every motion after a delete, replacement, or reorder. */
export function reflowBuilderPath(
  steps: readonly BuilderStep[],
  startPose: BuilderPose
): BuilderStep[] {
  let cursor = startPose;
  const reflowed: BuilderStep[] = [];

  for (const step of steps) {
    const next = createBuilderStep(
      cursor,
      step.endPlacement,
      step.rotationDirection,
      step.turnCount
    );
    reflowed.push(next);
    cursor = {
      location: next.endPlacement,
      orientation: next.endOrientation,
    };
  }

  return reflowed;
}

export function removeBuilderStep(
  steps: readonly BuilderStep[],
  index: number,
  startPose: BuilderPose
): BuilderStep[] {
  if (index < 0 || index >= steps.length) return [...steps];
  return reflowBuilderPath(
    steps.filter((_, candidateIndex) => candidateIndex !== index),
    startPose
  );
}

export function replaceBuilderStepDestination(
  steps: readonly BuilderStep[],
  index: number,
  destination: GridLocation,
  startPose: BuilderPose
): BuilderStep[] {
  if (index < 0 || index >= steps.length) return [...steps];
  const replaced = steps.map((step, candidateIndex) =>
    candidateIndex === index ? { ...step, endPlacement: destination } : step
  );
  return reflowBuilderPath(replaced, startPose);
}

export function moveBuilderStep(
  steps: readonly BuilderStep[],
  fromIndex: number,
  toIndex: number,
  startPose: BuilderPose
): BuilderStep[] {
  if (
    fromIndex < 0 ||
    fromIndex >= steps.length ||
    toIndex < 0 ||
    toIndex >= steps.length ||
    fromIndex === toIndex
  ) {
    return [...steps];
  }

  const reordered = [...steps];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) return [...steps];
  reordered.splice(toIndex, 0, moved);
  return reflowBuilderPath(reordered, startPose);
}

/** Find the other hand's motion at the beat currently being previewed. */
export function getBuilderComparisonStep(
  activeSteps: readonly BuilderStep[],
  inactiveSteps: readonly BuilderStep[],
  editIndex: number | null = null
): BuilderStep | null {
  const previewIndex = editIndex ?? activeSteps.length;
  if (previewIndex < 0) return null;
  return inactiveSteps[previewIndex] ?? null;
}
