/**
 * Depth-first wall-plane feasibility solver (Phase 3). For a flagged step,
 * search a per-hand world-z offset that lets the two staffs pass each other in
 * depth, the way real spinners pull a staff off the wall plane. Concavity k is
 * only a tiebreak when depth alone leaves a residue. Offline-only, like the
 * scanner it drives; the collision model itself is unchanged.
 *
 * Search bound: each movable hand's offset lives on a 5 cm lattice in
 * ±Z_SEARCH_BOUND. Lattice points are tried in order of total offset, so the
 * first one that clears is the lattice-minimal answer; a bisection then pulls
 * it toward zero. Worst case per step: 1 baseline + 168 lattice + 8 bisection
 * + 4 tiebreak scans, under MAX_EVALUATIONS. Everything is deterministic.
 */
import { REACH_FEASIBILITY_TOLERANCE } from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import { bisectToThreshold } from "./concavity-solver";
import {
  applyWallPlaneOverrides,
  concaveEligible,
  withDepth,
  withZ,
} from "./wall-plane-policy";
import {
  SCAN_VERSION,
  scanStepPair,
  type StepMotionPair,
  type StepScanResult,
} from "./wall-feasibility-scanner";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";
import type {
  WallFeasibilityMetadata,
  WallPlaneStepOverride,
} from "../domain/models/wall-feasibility";

/** Lattice spacing for the coarse depth search, meters. */
const Z_STEP = 0.05;
/**
 * Evaluation bound, not a comfort cap: reach rejects real over-pulls long
 * before this. 30 cm is past where any reachable fixture has needed to go.
 */
const Z_SEARCH_BOUND = 0.3;
/** Bisection stops once the offset is resolved to 5 mm. */
const Z_TOLERANCE = 0.005;
const TIEBREAK_K = [0.25, 0.5, 0.75, 1];
const MAX_EVALUATIONS = 200;

export interface DepthSolveResult {
  cleared: boolean;
  /** Per-hand z-offset in meters, StanceSimulator world z (+ = toward the audience). Blue = left. null = untouched. */
  zBlue: number | null;
  zRed: number | null;
  /** Concavity tiebreak depth actually applied, per hand. null = Phase-0 default. */
  kBlue: number | null;
  kRed: number | null;
  /** Collision depth left at the returned offsets (0 when cleared). */
  worstDepthAtSolution: number;
  /** scanStepPair calls spent on this step. */
  evaluations: number;
}

interface Candidate {
  zLeft: number;
  zRight: number;
  scan: StepScanResult;
  reachOk: boolean;
}

function torsoDepth(scan: StepScanResult): number {
  return scan.collisions
    .filter((c) => c.zone === "prop-through-torso")
    .reduce((worst, c) => Math.max(worst, c.depth), 0);
}

function latticeOffsets(): number[] {
  const steps = Math.round(Z_SEARCH_BOUND / Z_STEP);
  const offsets: number[] = [];
  for (let i = -steps; i <= steps; i++) offsets.push(i * Z_STEP);
  return offsets;
}

/**
 * Lattice points for the movable hands, cheapest first: total |z|, then
 * single-hand before two-hand (fewer moving parts reads more natural), then
 * toward-the-body before away, left before right.
 */
function orderedLattice(
  leftMovable: boolean,
  rightMovable: boolean
): Array<[number, number]> {
  const offsets = latticeOffsets();
  const lefts = leftMovable ? offsets : [0];
  const rights = rightMovable ? offsets : [0];
  const points: Array<[number, number]> = [];
  for (const zl of lefts) {
    for (const zr of rights) {
      if (zl !== 0 || zr !== 0) points.push([zl, zr]);
    }
  }
  const handsMoved = ([zl, zr]: [number, number]) =>
    (zl !== 0 ? 1 : 0) + (zr !== 0 ? 1 : 0);
  return points.sort(
    (a, b) =>
      Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])) ||
      handsMoved(a) - handsMoved(b) ||
      a[0] + a[1] - (b[0] + b[1]) ||
      a[0] - b[0]
  );
}

export function solveStepDepth(
  blue: MotionConfig3D,
  red: MotionConfig3D,
  heightM?: number
): DepthSolveResult {
  let evaluations = 0;
  const scan = (left: MotionConfig3D, right: MotionConfig3D) => {
    evaluations++;
    return scanStepPair(left, right, heightM);
  };
  const result = (
    partial: Partial<DepthSolveResult> & Pick<DepthSolveResult, "cleared">
  ): DepthSolveResult => ({
    zBlue: null,
    zRed: null,
    kBlue: null,
    kRed: null,
    worstDepthAtSolution: 0,
    ...partial,
    evaluations,
  });

  const base = scan(blue, red);
  if (base.clean) return result({ cleared: true });

  const leftMovable = concaveEligible(blue);
  const rightMovable = concaveEligible(red);
  if (!leftMovable && !rightMovable) {
    return result({ cleared: false, worstDepthAtSolution: base.worstDepth });
  }

  // Reach is the only limit: an offset may not leave either hand less
  // reachable than the simulator's own tolerance, or than the unshifted wall
  // pose already is (the default figure starts several cm short overhead).
  const reachCapLeft = Math.max(REACH_FEASIBILITY_TOLERANCE, base.reachShortfall.left);
  const reachCapRight = Math.max(REACH_FEASIBILITY_TOLERANCE, base.reachShortfall.right);
  const evaluate = (zLeft: number, zRight: number, k?: number): Candidate => {
    const shift = (m: MotionConfig3D, z: number) =>
      k === undefined ? withZ(m, z) : withDepth(withZ(m, z), k);
    const s = scan(shift(blue, zLeft), shift(red, zRight));
    return {
      zLeft,
      zRight,
      scan: s,
      reachOk:
        s.reachShortfall.left <= reachCapLeft &&
        s.reachShortfall.right <= reachCapRight,
    };
  };
  const passes = (c: Candidate) => c.scan.clean && c.reachOk;

  let best: Candidate = { zLeft: 0, zRight: 0, scan: base, reachOk: true };
  for (const [zl, zr] of orderedLattice(leftMovable, rightMovable)) {
    if (evaluations >= MAX_EVALUATIONS) {
      return result({ cleared: false, worstDepthAtSolution: best.scan.worstDepth });
    }
    const c = evaluate(zl, zr);
    if (passes(c)) {
      // Pull the clearing offset toward zero along its own ray.
      const span = Math.max(Math.abs(zl), Math.abs(zr));
      const t = bisectToThreshold(
        0,
        1,
        (scale) => passes(evaluate(zl * scale, zr * scale)),
        Z_TOLERANCE / span
      );
      return result({
        cleared: true,
        zBlue: zl !== 0 ? zl * t : null,
        zRed: zr !== 0 ? zr * t : null,
      });
    }
    if (c.reachOk && c.scan.worstDepth < best.scan.worstDepth) best = c;
  }

  // Depth alone left a residue: try the smallest concavity on the eligible
  // hands at the best reachable offset, refusing any k that buys arm
  // clearance with torso penetration.
  const torsoBefore = torsoDepth(best.scan);
  for (const k of TIEBREAK_K) {
    const c = evaluate(best.zLeft, best.zRight, k);
    if (passes(c) && torsoDepth(c.scan) <= torsoBefore) {
      return result({
        cleared: true,
        zBlue: best.zLeft !== 0 ? best.zLeft : null,
        zRed: best.zRight !== 0 ? best.zRight : null,
        kBlue: leftMovable ? k : null,
        kRed: rightMovable ? k : null,
      });
    }
  }
  return result({ cleared: false, worstDepthAtSolution: best.scan.worstDepth });
}

function stepOverride(z: number | null, k: number | null): WallPlaneStepOverride | undefined {
  if (z === null && k === null) return undefined;
  return { ...(z !== null && { depthOffset: z }), ...(k !== null && { k }) };
}

export interface SequenceSolveReport {
  metadata: WallFeasibilityMetadata;
  flaggedSteps: number[];
  /** Solver outcome per flagged step index (only with solve). */
  solved: Record<number, DepthSolveResult>;
}

/**
 * Scan a sequence and, with `solve`, run the depth solver on each flagged
 * step. Every flagged step clearing → "withCheat" with per-hand overrides;
 * any step left colliding → false (dual-wheel fallback), overrides dropped.
 */
export function solveSequenceWallFeasibility(
  steps: StepMotionPair[],
  options: { solve?: boolean; heightM?: number } = {}
): SequenceSolveReport {
  const flaggedSteps: number[] = [];
  steps.forEach((s, i) => {
    if (!scanStepPair(s.left, s.right, options.heightM).clean) flaggedSteps.push(i);
  });
  if (flaggedSteps.length === 0) {
    return {
      metadata: { wallFeasible: true, scanVersion: SCAN_VERSION },
      flaggedSteps,
      solved: {},
    };
  }
  if (!options.solve) {
    return {
      metadata: { wallFeasible: false, scanVersion: SCAN_VERSION },
      flaggedSteps,
      solved: {},
    };
  }

  const solved: Record<number, DepthSolveResult> = {};
  const overrides: NonNullable<WallFeasibilityMetadata["wallPlaneOverrides"]> = {};
  let allCleared = true;
  for (const i of flaggedSteps) {
    const step = steps[i]!;
    const r = solveStepDepth(step.left, step.right, options.heightM);
    solved[i] = r;
    if (!r.cleared) {
      allCleared = false;
      continue;
    }
    const left = stepOverride(r.zBlue, r.kBlue);
    const right = stepOverride(r.zRed, r.kRed);
    if (left || right) overrides[i] = { ...(left && { left }), ...(right && { right }) };
  }
  return {
    metadata: allCleared
      ? { wallFeasible: "withCheat", wallPlaneOverrides: overrides, scanVersion: SCAN_VERSION }
      : { wallFeasible: false, scanVersion: SCAN_VERSION },
    flaggedSteps,
    solved,
  };
}

// The viewer seam lives in wall-plane-policy so playback never loads the
// collision model; re-exported here for offline callers.
export { applyWallPlaneOverrides };
