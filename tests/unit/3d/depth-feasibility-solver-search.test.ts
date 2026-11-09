import { describe, it, expect, vi, beforeEach } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";
import type { StepScanResult } from "#lib/shared/3d/services/wall-feasibility-scanner.js";

/**
 * The search itself, against a synthetic collision world. No reachable real
 * fixture forces an opposite-sign pass or a k tiebreak yet (the real
 * crossings all clear with a single-hand pull), so these pin the search
 * logic with a scanner stand-in whose clearance rule is known exactly.
 */
const world = vi.hoisted(() => ({
  scan: (_l: MotionConfig3D, _r: MotionConfig3D): StepScanResult => {
    throw new Error("set world.scan in the test");
  },
}));

vi.mock(
  "#lib/shared/3d/services/wall-feasibility-scanner.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("#lib/shared/3d/services/wall-feasibility-scanner.js")
      >();
    return {
      ...actual,
      scanStepPair: (l: MotionConfig3D, r: MotionConfig3D) => world.scan(l, r),
    };
  }
);

const { solveStepDepth } =
  await import("#lib/shared/3d/services/depth-feasibility-solver.js");

function anti(extra: Partial<MotionConfig3D> = {}): MotionConfig3D {
  return {
    plane: Plane.WALL,
    startLocation: "ne" as GridLocation,
    endLocation: "se" as GridLocation,
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.CLOCK,
    endOrientation: Orientation.CLOCK,
    ...extra,
  };
}

const z = (m: MotionConfig3D) => m.depthOffset ?? 0;
const k = (m: MotionConfig3D) => m.concaveDepth ?? 0;

function result(
  worstDepth: number,
  reach: { left: number; right: number }
): StepScanResult {
  return {
    clean: worstDepth === 0,
    collisions:
      worstDepth === 0
        ? []
        : [
            {
              zone: "prop-through-prop",
              depth: worstDepth,
            } as StepScanResult["collisions"][number],
          ],
    worstDepth,
    reachShortfall: reach,
  };
}

describe("solveStepDepth search (synthetic world)", () => {
  beforeEach(() => {
    world.scan = () => {
      throw new Error("set world.scan in the test");
    };
  });

  it("finds an opposite-sign pass when a single-hand pull would need more reach than the arm has", () => {
    // The staffs clear once 19 cm apart in depth, but either hand can only
    // travel 12 cm before it runs out of reach. A single hand alone can never
    // make the gap; one forward and one back can.
    const REACH = 0.12;
    const GAP = 0.19;
    const shortfall = (m: MotionConfig3D) =>
      Math.abs(z(m)) > REACH + 1e-9 ? 0.1 : 0;
    world.scan = (l, r) => {
      const gap = Math.abs(z(l) - z(r));
      return result(gap >= GAP ? 0 : GAP - gap, {
        left: shortfall(l),
        right: shortfall(r),
      });
    };

    const r = solveStepDepth(anti(), anti());
    expect(r.cleared).toBe(true);
    expect(r.zBlue).not.toBeNull();
    expect(r.zRed).not.toBeNull();
    expect(Math.sign(r.zBlue!)).toBe(-Math.sign(r.zRed!));
    // Reach rejected every over-pull: neither returned offset exceeds it.
    expect(Math.abs(r.zBlue!)).toBeLessThanOrEqual(REACH);
    expect(Math.abs(r.zRed!)).toBeLessThanOrEqual(REACH);
    expect(r.kBlue).toBeNull();
    expect(r.kRed).toBeNull();
    // The returned pair must really clear in the same world.
    const rescan = world.scan(
      anti({ depthOffset: r.zBlue! }),
      anti({ depthOffset: r.zRed! })
    );
    expect(rescan.clean).toBe(true);
    expect(r.evaluations).toBeLessThanOrEqual(200);
  });

  it("prefers a single-hand pull when it clears as cheaply as a two-hand pass", () => {
    // Same 19 cm gap rule with unlimited reach: (±0.2, 0) and (±0.1, ∓0.1)
    // cost the same total offset, and fewer moving hands wins the tie.
    world.scan = (l, r) => {
      const gap = Math.abs(z(l) - z(r));
      return result(gap >= 0.19 ? 0 : 0.19 - gap, { left: 0, right: 0 });
    };
    const r = solveStepDepth(anti(), anti());
    expect(r.cleared).toBe(true);
    expect([r.zBlue, r.zRed].filter((v) => v !== null)).toHaveLength(1);
  });

  it("uses the smallest clearing k as a tiebreak when depth alone leaves a residue", () => {
    // Depth shrinks the collision but never removes it; concavity of at
    // least 0.5 on top of the best offset finishes the job.
    world.scan = (l, r) => {
      const gap = Math.abs(z(l) - z(r));
      const residue = Math.max(0.01, 0.1 - 0.2 * gap);
      const concave = Math.min(k(l), k(r));
      return result(concave >= 0.5 ? 0 : residue, { left: 0, right: 0 });
    };
    const r = solveStepDepth(anti(), anti());
    expect(r.cleared).toBe(true);
    expect(r.kBlue).toBe(0.5);
    expect(r.kRed).toBe(0.5);
    // k rides on the best reachable offset, which moved at least one hand.
    expect(r.zBlue !== null || r.zRed !== null).toBe(true);
  });

  it("stamps the tiebreak k only on concave-eligible hands", () => {
    world.scan = (l, _r) => {
      const residue = Math.max(0.01, 0.1 - 0.2 * Math.abs(z(l)));
      return result(k(l) >= 0.25 ? 0 : residue, { left: 0, right: 0 });
    };
    const pro = anti({ motionType: MotionType.PRO });
    const r = solveStepDepth(anti(), pro);
    expect(r.cleared).toBe(true);
    expect(r.kBlue).toBe(0.25);
    expect(r.kRed).toBeNull();
    expect(r.zRed).toBeNull();
  });

  it("bails when neither depth nor any tiebreak k clears", () => {
    world.scan = () => result(0.05, { left: 0, right: 0 });
    const r = solveStepDepth(anti(), anti());
    expect(r).toMatchObject({
      cleared: false,
      zBlue: null,
      zRed: null,
      kBlue: null,
      kRed: null,
    });
    expect(r.worstDepthAtSolution).toBe(0.05);
    expect(r.evaluations).toBeLessThanOrEqual(200);
  });
});
