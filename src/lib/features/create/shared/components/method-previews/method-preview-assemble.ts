/**
 * The Create front door's Assemble preview: the steps it builds, the crop of
 * Assemble's grid it shows, where the grid's points sit in the card, and the
 * beats its taps write (spec: Scenes, Assemble).
 *
 * The hops come from Assemble's own sequence loader, so a float reads as
 * Assemble's float (-0.5 turns) and the props move exactly as they do on
 * Assemble's grid. They are an N and an M from the demo: in a Y or an Ω one
 * hand stands still, so it would add no points.
 */
import { sequenceToBuilderHydration } from "#lib/features/assemble-lab/services/builder-step-converter.js";
import type { BuilderStep } from "#lib/features/assemble-lab/state/assemble-state-types.js";
import { getHitTargets } from "#lib/shared/assemble-lab/services/grid-hit-target-calculator.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  GridMode,
  type GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { CellRect } from "./method-preview-compositions";
import { DEMO_STEP_START } from "./method-preview-demo";

/** The demo steps Assemble builds: an N and an M. */
export const ASSEMBLE_STEPS = Object.freeze({
  from: DEMO_STEP_START.assemble,
  count: 2,
});

/**
 * How a beat is written. A blue tap pops in a blue-only beat; a red tap
 * fades the whole beat in over it while blue glides to its two-hand place;
 * the clear at a turn's start fades the beats out.
 */
export const ASSEMBLE_BEAT_TIMING = Object.freeze({
  popMs: 200,
  fillMs: 240,
  clearMs: 150,
});

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

/** The steps the beats show, one per hop, as the sequence holds them. */
export function assembleBeats(sequence: SequenceData): StepData[] {
  return sequence.steps.slice(
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
