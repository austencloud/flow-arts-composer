/**
 * The Create front door's Assemble preview: the steps it builds, the crop of
 * Assemble's grid it shows, and where the grid's points sit in the card
 * (spec: Scenes, Assemble).
 *
 * The hops come from Assemble's own sequence loader, so a float reads as
 * Assemble's float (-0.5 turns) and the props move exactly as they do on
 * Assemble's grid. They are the demo's N and M steps: in the opening steps
 * red stands still (Y), so it would add no points.
 */
import { sequenceToBuilderHydration } from "$lib/features/assemble-lab/services/builder-step-converter";
import type { BuilderStep } from "$lib/features/assemble-lab/state/assemble-state-types";
import { getHitTargets } from "$lib/shared/assemble-lab/services/grid-hit-target-calculator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridMode,
  type GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { CellRect } from "./method-preview-compositions";

/** The demo steps Assemble builds: N and M (steps 4 and 5). */
export const ASSEMBLE_STEPS = Object.freeze({ from: 3, count: 2 });

/** The center of Assemble's 950-unit grid space (SvgPropAnimator, the hit targets). */
const GRID_CENTER = 475;
/** The grid's outer points sit 300 units out with a 25-unit radius; 15 more is margin. */
const CROP_HALF = 340;

/** The square of Assemble's grid space the card shows. */
export const ASSEMBLE_CROP = Object.freeze({
  origin: GRID_CENTER - CROP_HALF,
  size: CROP_HALF * 2,
});

export const ASSEMBLE_VIEW_BOX = `${ASSEMBLE_CROP.origin} ${ASSEMBLE_CROP.origin} ${ASSEMBLE_CROP.size} ${ASSEMBLE_CROP.size}`;

/** One hand's hops over the steps Assemble builds, as Assemble loads them. */
export function assembleHops(
  sequence: SequenceData,
  hand: HandSide
): BuilderStep[] {
  const { leftSteps, rightSteps } = sequenceToBuilderHydration(sequence);
  const steps = hand === HandSide.LEFT ? leftSteps : rightSteps;
  return steps.slice(
    ASSEMBLE_STEPS.from,
    ASSEMBLE_STEPS.from + ASSEMBLE_STEPS.count
  );
}

/** A hop that stays on its start point with no turns: the prop's start pose. */
export function standingHop(hop: BuilderStep): BuilderStep {
  return {
    ...hop,
    endLocation: hop.startLocation,
    endOrientation: hop.startOrientation,
    turnCount: 0,
  };
}

/**
 * Where a diamond point sits in the card, given the box the grid fills. Null
 * when the diamond has no such point.
 */
export function assemblePoint(
  box: CellRect,
  location: GridLocation
): { x: number; y: number } | null {
  const target = getHitTargets(GridMode.DIAMOND).find(
    (candidate) => candidate.location === location
  );
  if (!target) return null;
  const scale = box.size / ASSEMBLE_CROP.size;
  return {
    x: box.x + (target.x - ASSEMBLE_CROP.origin) * scale,
    y: box.y + (target.y - ASSEMBLE_CROP.origin) * scale,
  };
}
