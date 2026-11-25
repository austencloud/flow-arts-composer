import { describe, expect, it } from "vitest";
import {
  buildTrajectoryIncrements,
  createExtendulumTrajectory,
  createPendulumTrajectory,
  hasValidReversalPositions,
  traceTrajectory,
  trajectoryFromKnobs,
  trajectoryHandIndexAt,
  trajectoryPosesAt,
  trajectoryPropIndexAt,
  trajectoryPropRateAt,
  trajectoryReversals,
  withTrajectoryPhase,
  type QftTrajectory,
} from "@tka/shape-domain";
import { generatePoiReversalCandidates } from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-candidates";
import {
  buildIncrements,
  type QftKnobs,
} from "../../src/lib/shared/notation/qft/qft-model";

const swing: QftTrajectory = {
  radius: 1,
  handDirection: 1,
  propPhase: 2,
  propRate: [1, 1, 1, 1, -1, -1, -1, -1],
};

describe("QFT per-step trajectory", () => {
  it("integrates whole steps and fractional remainders through a reversal", () => {
    expect(trajectoryPropIndexAt(swing, 0)).toBe(2);
    expect(trajectoryPropIndexAt(swing, 3.5)).toBe(5.5);
    expect(trajectoryPropIndexAt(swing, 4)).toBe(6);
    expect(trajectoryPropIndexAt(swing, 4.5)).toBe(5.5);
    expect(trajectoryPropIndexAt(swing, 8)).toBe(2);
    expect(trajectoryPropIndexAt(swing, -0.5)).toBe(2.5);
  });

  it("keeps the pose continuous at the reversal boundary", () => {
    const before = trajectoryPosesAt(swing, 4 - 1e-7);
    const after = trajectoryPosesAt(swing, 4 + 1e-7);

    expect(
      Math.hypot(before.hand.x - after.hand.x, before.hand.y - after.hand.y)
    ).toBeLessThan(1e-6);
    expect(
      Math.hypot(before.head.x - after.head.x, before.head.y - after.head.y)
    ).toBeLessThan(1e-6);
  });

  it("returns to the same hand and head pose after the closed cycle", () => {
    const start = trajectoryPosesAt(swing, 0);
    const end = trajectoryPosesAt(swing, 8);

    expect(end.hand.x).toBeCloseTo(start.hand.x, 10);
    expect(end.hand.y).toBeCloseTo(start.hand.y, 10);
    expect(end.head.x).toBeCloseTo(start.head.x, 10);
    expect(end.head.y).toBeCloseTo(start.head.y, 10);

    const trace = traceTrajectory(swing, 32);
    expect(trace.at(-1)?.x).toBeCloseTo(trace[0]!.x, 10);
    expect(trace.at(-1)?.y).toBeCloseTo(trace[0]!.y, 10);
  });

  it("locates both reversal departures and their hand and prop bearings", () => {
    expect(trajectoryReversals(swing)).toEqual([
      {
        step: 1,
        handPosition: 8,
        propPosition: 2,
        fromRate: -1,
        toRate: 1,
      },
      {
        step: 5,
        handPosition: 4,
        propPosition: 6,
        fromRate: 1,
        toRate: -1,
      },
    ]);
  });

  it("uses each side's rate for the direction at a shared reversal position", () => {
    const increments = buildTrajectoryIncrements(swing);

    expect(increments[3]?.propArrive).toBe(6);
    expect(increments[3]?.propDirArrive).toBe(8);
    expect(increments[4]?.propDepart).toBe(6);
    expect(increments[4]?.propDirDepart).toBe(4);
  });

  it("mirrors the drawn rate when the hand direction changes", () => {
    const mirrored: QftTrajectory = { ...swing, handDirection: -1 };
    expect(trajectoryPropRateAt(mirrored, 0)).toBe(-1);
    expect(trajectoryPropRateAt(mirrored, 4)).toBe(1);
  });

  it("keeps hand and prop phase together when the motion rotates", () => {
    const rotated = withTrajectoryPhase(swing, 2);

    expect(trajectoryHandIndexAt(rotated, 0)).toBe(2);
    expect(trajectoryPropIndexAt(rotated, 0)).toBe(4);
    expect(trajectoryPosesAt(rotated, 0).hand.x).toBeCloseTo(1, 10);
  });

  // Austen, sitting 1 (2026-11-22): a poi turns level and pointing out.
  it("accepts pendulum turns and rejects every other turn", () => {
    const outAtSide = { ...swing, handPhase: 2 };
    expect(hasValidReversalPositions(outAtSide)).toBe(true);
    // Turned over: level and pointing out, but swinging across the top.
    expect(hasValidReversalPositions(withTrajectoryPhase(outAtSide, 4))).toBe(
      false
    );
    expect(hasValidReversalPositions({ ...swing, radius: 0 })).toBe(true);
    // Quarter-turned: out at the top and bottom.
    expect(hasValidReversalPositions(withTrajectoryPhase(outAtSide, 2))).toBe(
      false
    );
    // Level, but sideways to a hand at the top (#4) or pointing in (#6).
    expect(hasValidReversalPositions(swing)).toBe(false);
    expect(hasValidReversalPositions({ ...swing, handPhase: 6 })).toBe(false);
    // Still hand, pointing down (#10).
    expect(
      hasValidReversalPositions(withTrajectoryPhase({ ...swing, radius: 0 }, 2))
    ).toBe(false);
  });

  it("accepts both turns he judged legal, as they were shown to him", () => {
    const shown = new Map(
      generatePoiReversalCandidates().map((c) => [c.id, c.trajectory])
    );
    for (const id of ["poi-r0-dcw-s1-p2", "poi-r1-dcw-s3-p2"]) {
      const trajectory = shown.get(id);
      expect(trajectory, id).toBeDefined();
      expect(hasValidReversalPositions(trajectory!), id).toBe(true);
    }
  });

  it("builds the extendulum with the hand at the side at both turns", () => {
    const extendulum = createExtendulumTrajectory(1);
    expect(hasValidReversalPositions(extendulum)).toBe(true);
  });
});

describe("QFT scalar-to-trajectory bridge", () => {
  const cases: QftKnobs[] = [
    { radius: 0, downbeats: 1, spin: "inspin" },
    { radius: 0.5, downbeats: 1, spin: "inspin", phase: 4 },
    { radius: 1, downbeats: 3, spin: "antispin" },
    {
      radius: 1,
      downbeats: 5,
      spin: "inspin",
      handPhase: 2,
      handDirection: -1,
    },
  ];

  it("reproduces every Drex notation row for scalar hands", () => {
    for (const knobs of cases) {
      expect(buildTrajectoryIncrements(trajectoryFromKnobs(knobs))).toEqual(
        buildIncrements(knobs, "drex")
      );
    }
  });

  it("uses one rate profile for pendulum and extendulum notation", () => {
    const pendulum = createPendulumTrajectory(0);
    const extendulum = createExtendulumTrajectory(1);
    const pendulumRows = buildTrajectoryIncrements(pendulum);
    const extendulumRows = buildTrajectoryIncrements(extendulum);

    expect(pendulumRows.map((row) => row.propDepart)).toEqual([
      2, 3, 4, 5, 6, 5, 4, 3,
    ]);
    expect(extendulumRows.map((row) => row.propDepart)).toEqual(
      pendulumRows.map((row) => row.propDepart)
    );
    expect(pendulumRows.every((row) => row.radius === 0)).toBe(true);
    expect(extendulumRows.every((row) => row.radius === 1)).toBe(true);
  });
});
