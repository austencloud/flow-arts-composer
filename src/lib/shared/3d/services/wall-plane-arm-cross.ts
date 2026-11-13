/**
 * Wall-plane arm pass-through: the narrow "definitely impossible" rule.
 *
 * In wall plane both hands trace circles in one flat plane in front of the
 * body. When the left hand is all the way over on the performer's right while
 * the right hand is all the way over on their left, the arms lie across each
 * other. If the hands then keep going the way they came in a straight X (both
 * rising, or both falling, as in DJDJ), one arm can simply stay in front. But
 * if one hand rises while the other falls through that crossed spot, as in
 * AAAA, the arms have to swap which one is on top while lying across each
 * other, and no body can do that: they pass through each other. The viewer
 * refuses wall plane for these sequences and shows them in dual wheel.
 *
 * The broad collision scanner (wall-feasibility-scanner.ts) flags these too,
 * but it also flags prop sweeps a performer can dodge, so it can't be
 * enforced. This rule only fires on the arm swap. It is the hand-checked seed
 * for the algorithmic version: every sequence it flags should fail the scanner.
 */
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { LOCATION_ANGLES, locationUnitPoint } from "#lib/shared/foundation/domain/math-constants.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/** The bits of a motion this rule reads. */
interface HandPath {
  readonly startLocation: GridLocation;
  readonly endLocation: GridLocation;
  readonly motionType: MotionType;
}

interface HandPair {
  readonly motions: Partial<Record<"left" | "right", HandPath | undefined>>;
}

/** Structural so tests and the viewer can both hand it a sequence. */
export interface ArmCrossInput {
  readonly steps: readonly HandPair[];
  readonly startPlacement?: HandPair | null;
}

export interface WallPlaneArmCross {
  /** 1-based beat where the arms would pass through each other. */
  readonly beat: number;
}

// Grid x runs east-positive. In wall plane east lands on the performer's left
// (they face the camera), so x = +1 is the left hand's home side and x = -1
// the right hand's. 0.95 keeps this to the full cross: only e and w
// themselves, or a box-grid shift passing through them, get that far over.
const FULL_CROSS = 0.95;

// Sixteen slices per beat puts several samples inside the ±18° window around
// e and w that FULL_CROSS allows, so a pass through it is never stepped over.
const SAMPLES_PER_BEAT = 16;

// Height gaps under this count as level, neither hand above the other.
const LEVEL = 1e-6;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where the hand is on the unit grid a fraction `t` of the way through its beat. */
function pointAt(path: HandPath, t: number): Point {
  const start = locationUnitPoint(path.startLocation);
  const end = locationUnitPoint(path.endLocation);
  const straight =
    path.motionType === MotionType.DASH ||
    path.motionType === MotionType.STATIC ||
    path.startLocation === path.endLocation ||
    path.startLocation === GridLocation.CENTER ||
    path.endLocation === GridLocation.CENTER;
  if (straight) return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };

  // Shifts (pro, anti, float) run the short quarter arc between neighbours.
  const from = LOCATION_ANGLES[path.startLocation];
  let delta = LOCATION_ANGLES[path.endLocation] - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const angle = from + delta * t;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

interface Sample {
  readonly beat: number;
  readonly left: Point;
  readonly right: Point;
}

function samplesFor(pair: HandPair, beat: number, slices: number): Sample[] {
  const left = pair.motions.left;
  const right = pair.motions.right;
  if (!left || !right) return [];
  const samples: Sample[] = [];
  for (let i = 0; i <= slices; i++) {
    const t = slices === 0 ? 0 : i / slices;
    samples.push({ beat, left: pointAt(left, t), right: pointAt(right, t) });
  }
  return samples;
}

/** The first beat where wall plane would push the arms through each other, or null. */
export function findWallPlaneArmCross(sequence: ArmCrossInput | null | undefined): WallPlaneArmCross | null {
  if (!sequence || sequence.steps.length === 0) return null;

  // One continuous timeline, because the swap usually straddles two beats
  // (AAAA's hands reach the crossed spot exactly as beat 1 ends). Words loop,
  // so beat 1 goes on again at the end to catch a swap across the seam.
  const timeline: Sample[] = [];
  if (sequence.startPlacement) timeline.push(...samplesFor(sequence.startPlacement, 1, 0));
  sequence.steps.forEach((step, index) => timeline.push(...samplesFor(step, index + 1, SAMPLES_PER_BEAT)));
  timeline.push(...samplesFor(sequence.steps[0]!, 1, SAMPLES_PER_BEAT));

  // Walk each stretch where both arms are fully across. Inside one, the hand
  // that's higher may not change: that change is the arms passing through.
  let higher = 0;
  for (const sample of timeline) {
    const crossed = sample.left.x <= -FULL_CROSS && sample.right.x >= FULL_CROSS;
    if (!crossed) {
      higher = 0;
      continue;
    }
    const gap = sample.left.y - sample.right.y;
    if (Math.abs(gap) < LEVEL) continue;
    const now = Math.sign(gap);
    if (higher !== 0 && now !== higher) return { beat: sample.beat };
    higher = now;
  }
  return null;
}
