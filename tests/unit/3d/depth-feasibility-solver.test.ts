import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  applyWallPlaneOverrides,
  solveSequenceWallFeasibility,
  solveStepDepth,
} from "#lib/shared/3d/services/depth-feasibility-solver.js";
import {
  SCAN_VERSION,
  scanStepPair,
} from "#lib/shared/3d/services/wall-feasibility-scanner.js";
import { REACH_FEASIBILITY_TOLERANCE } from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import { calculatePropState } from "#lib/shared/3d/services/prop-state-interpolator.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";

// Same shape as the scanner and concavity tests' helper.
function motion(overrides: Partial<MotionConfig3D>): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: "n" as GridLocation,
    endLocation: "e" as GridLocation,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    ...overrides,
  };
}

const at = (start: string, end: string, extra: Partial<MotionConfig3D> = {}) =>
  motion({
    motionType: MotionType.ANTI,
    startLocation: start as GridLocation,
    endLocation: end as GridLocation,
    startOrientation: Orientation.CLOCK,
    endOrientation: Orientation.CLOCK,
    ...extra,
  });

// Reachable crossing fixtures. Found by probing the scanner: at the default
// 1.7 m figure every crossing position starts out of reach (the grid sits
// 0.3 m forward at a 0.52 m hand distance), so these use a 1.9 m performer,
// where both grips are within the simulator's reach tolerance at z = 0 and
// the staffs genuinely cross (prop-through-prop) in the wall plane.
const TALL_M = 1.9;
const CROSSINGS: Array<{ name: string; left: MotionConfig3D; right: MotionConfig3D }> = [
  { name: "L ne→se × R w→s", left: at("ne", "se"), right: at("w", "s") },
  { name: "L se→ne × R s→w", left: at("se", "ne"), right: at("s", "w") },
  { name: "L e→s × R nw→sw", left: at("e", "s"), right: at("nw", "sw") },
  {
    name: "L s→e × R sw→nw (counter)",
    left: at("s", "e", { startOrientation: Orientation.COUNTER, endOrientation: Orientation.COUNTER }),
    right: at("sw", "nw", { startOrientation: Orientation.COUNTER, endOrientation: Orientation.COUNTER }),
  },
];

const shifted = (m: MotionConfig3D, z: number | null) =>
  z === null ? m : { ...m, depthOffset: z };

describe("solveStepDepth", () => {
  it.each(CROSSINGS)("$name collides flat and clears in depth within reach", ({ left, right }) => {
    const flat = scanStepPair(left, right, TALL_M);
    expect(flat.clean).toBe(false);
    expect(flat.collisions.some((c) => c.zone === "prop-through-prop")).toBe(true);
    expect(flat.reachShortfall.left).toBeLessThanOrEqual(REACH_FEASIBILITY_TOLERANCE);
    expect(flat.reachShortfall.right).toBeLessThanOrEqual(REACH_FEASIBILITY_TOLERANCE);

    const r = solveStepDepth(left, right, TALL_M);
    expect(r.cleared).toBe(true);
    expect(r.kBlue).toBeNull();
    expect(r.kRed).toBeNull();
    const offsets = [r.zBlue, r.zRed].filter((z): z is number => z !== null);
    expect(offsets.length).toBeGreaterThan(0);
    for (const z of offsets) expect(Math.abs(z)).toBeLessThanOrEqual(0.3);
    expect(r.evaluations).toBeLessThanOrEqual(200);

    // Every cheat claim is re-scanned: the returned offsets must be clean and
    // reachable.
    const rescan = scanStepPair(shifted(left, r.zBlue), shifted(right, r.zRed), TALL_M);
    expect(rescan.clean).toBe(true);
    expect(rescan.reachShortfall.left).toBeLessThanOrEqual(REACH_FEASIBILITY_TOLERANCE);
    expect(rescan.reachShortfall.right).toBeLessThanOrEqual(REACH_FEASIBILITY_TOLERANCE);
  });

  it("is deterministic", () => {
    const { left, right } = CROSSINGS[0]!;
    expect(solveStepDepth(left, right, TALL_M)).toEqual(solveStepDepth(left, right, TALL_M));
  });

  it("leaves an already-clean step untouched", () => {
    const left = motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const right = motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const r = solveStepDepth(left, right);
    expect(r).toMatchObject({ cleared: true, zBlue: null, zRed: null, kBlue: null, kRed: null });
    expect(r.evaluations).toBe(1);
  });

  it("does not route pro or dash conflicts to the depth search", () => {
    const dashL = motion({ motionType: MotionType.DASH, startLocation: "w" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    const dashR = motion({ motionType: MotionType.DASH, startLocation: "e" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION });
    // The pro twin of the first crossing fixture.
    const proL = { ...CROSSINGS[0]!.left, motionType: MotionType.PRO };
    const proR = { ...CROSSINGS[0]!.right, motionType: MotionType.PRO };
    for (const [left, right, h] of [[dashL, dashR, undefined], [proL, proR, TALL_M]] as const) {
      expect(scanStepPair(left, right, h).clean).toBe(false);
      const r = solveStepDepth(left, right, h);
      expect(r).toMatchObject({ cleared: false, zBlue: null, zRed: null, kBlue: null, kRed: null });
      expect(r.evaluations).toBe(1);
    }
  });
});

describe("solveSequenceWallFeasibility", () => {
  const clean = {
    left: motion({ motionType: MotionType.STATIC, startLocation: "e" as GridLocation, endLocation: "e" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
    right: motion({ motionType: MotionType.STATIC, startLocation: "w" as GridLocation, endLocation: "w" as GridLocation, rotationDirection: RotationDirection.NO_ROTATION }),
  };
  const cheatable = { left: CROSSINGS[0]!.left, right: CROSSINGS[0]!.right };
  const pro = {
    left: { ...cheatable.left, motionType: MotionType.PRO },
    right: { ...cheatable.right, motionType: MotionType.PRO },
  };

  it("writes withCheat with depthOffset overrides when every flagged step clears", () => {
    const { metadata } = solveSequenceWallFeasibility([clean, cheatable], { solve: true, heightM: TALL_M });
    expect(metadata.wallFeasible).toBe("withCheat");
    expect(metadata.scanVersion).toBe(SCAN_VERSION);
    const step = metadata.wallPlaneOverrides?.[1];
    expect(step?.left?.depthOffset ?? step?.right?.depthOffset).toBeTypeOf("number");
    expect(metadata.wallPlaneOverrides?.[0]).toBeUndefined();
  });

  it("falls back to false when any step stays colliding, or without solve", () => {
    expect(solveSequenceWallFeasibility([cheatable, pro], { solve: true, heightM: TALL_M }).metadata).toEqual({ wallFeasible: false, scanVersion: SCAN_VERSION });
    expect(solveSequenceWallFeasibility([cheatable], { heightM: TALL_M }).metadata.wallFeasible).toBe(false);
    expect(solveSequenceWallFeasibility([clean]).metadata.wallFeasible).toBe(true);
  });

  it("the viewer seam stamps overrides only for the current scan version", () => {
    const { metadata } = solveSequenceWallFeasibility([cheatable], { solve: true, heightM: TALL_M });
    const stamped = applyWallPlaneOverrides(cheatable, 0, metadata);
    expect(scanStepPair(stamped.left, stamped.right, TALL_M).clean).toBe(true);

    const stale = { ...metadata, scanVersion: SCAN_VERSION - 1 };
    expect(applyWallPlaneOverrides(cheatable, 0, stale)).toBe(cheatable);
    expect(applyWallPlaneOverrides(cheatable, 0, undefined)).toBe(cheatable);
  });
});

describe("depthOffset in calculatePropState", () => {
  it("shifts only world z, and absent means no shift", () => {
    const m = at("ne", "se");
    const flat = calculatePropState(m, 0.4);
    const deep = calculatePropState({ ...m, depthOffset: -0.12 }, 0.4);
    expect(deep.worldPosition.x).toBeCloseTo(flat.worldPosition.x, 9);
    expect(deep.worldPosition.y).toBeCloseTo(flat.worldPosition.y, 9);
    expect(deep.worldPosition.z).toBeCloseTo(flat.worldPosition.z - 0.12, 9);
  });
});
