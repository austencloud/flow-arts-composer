/**
 * Locomotion anatomy
 *
 * The second anatomy layer. `rig-anatomy-contract.test.ts` reads a bind pose;
 * this drives one and grades the legs it produces, with `FootPlanter` in the
 * loop. That is the whole point of it: foot IK is where a leg is finally
 * posed, so the animator-only suite next door structurally cannot see an IK
 * defect, and the defect that prompted all of this lived exactly there.
 *
 * ## Why the existing rows could not catch it
 *
 * Measured, not argued. Rotating one knee's IK hinge 84 degrees off sagittal
 * on `ch01` at 3.9 m/s and re-reading the whole report:
 *
 * | injected tilt | knee bend plane | peak foot slip | knee jerk |
 * | ------------- | --------------- | -------------- | --------- |
 * | 0 deg         | 8.6 deg         | 9.2 cm         | 11187.982 |
 * | 45 deg        | 37.0 deg        | 9.2 cm         | 11187.982 |
 * | 84 deg        | 69.7 deg        | 9.2 cm         | 11187.982 |
 *
 * Not a coincidence, and not merely an empirical gap -- each of those rows is
 * structurally incapable of seeing this fault. The foot rows describe the path
 * the feet traced, and the fault does not move the feet; it folds the leg
 * between them. `kneeJerkRms` looks like it should notice, since it is about
 * the knee, but it is the second derivative of `kneeAngle`, and `kneeAngle` is
 * the unsigned interior angle at the joint. Turning the plane a knee bends in
 * leaves how far it bends exactly where it was. The two readings differ in
 * their eighth significant figure, which is the arithmetic taking a different
 * route to the same answer.
 *
 * `the report is blind without the anatomy rows` below pins all of that, so
 * the day one of those rows does start responding, this stops claiming a
 * blindness it no longer has.
 *
 * ## Where the bands came from
 *
 * All twelve shipped characters, walk and run, planter on: worst-side mean
 * plane tilt measured 7.5 to 12.1 degrees, which is also where the clinical
 * figure sits -- a healthy knee moves 8 to 12 degrees in the frontal plane
 * across a gait cycle. The warn line is 16 and the fail line 25.
 *
 * ## The floor, stated rather than implied
 *
 * The fault response is close to linear, about 0.88 degrees of reading per
 * degree of hinge error at a walk and 0.72 at a run, on a baseline that is
 * itself around 10. So a 20 degree miscalibration is caught at a walk and a 30
 * degree one anywhere, while a 10 degree one is inside the spread between
 * healthy characters and this layer will not see it. That is what the static
 * contract is for: it reads the axis directly, where 10 degrees is enormous.
 * Neither layer covers the other's range, and both are cheap.
 */

import { Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { BoneChain, FootPlanter } from "@austencloud/scene-3d";

import type { GaitReport } from "#lib/shared/3d/diagnostics/gait/gait-analysis.js";
import {
  verdictRows,
  type GaitManeuverProfile,
  type VerdictRow,
} from "#lib/shared/3d/diagnostics/gait/gait-verdicts.js";

import {
  ALL_RIGS,
  avatar,
  avatarAssetsPresent,
  driveRig,
  loadPackClips,
} from "./locomotion-harness";

const present = avatarAssetsPresent();

beforeAll(loadPackClips, 120_000);

/** Either side of the band the animator derives from the clips' own speeds. */
const WALK_SPEED = 1.4;
const RUN_SPEED = 3.9;

const ANATOMY_ROWS = [
  "Knee bend plane",
  "Knee sideways offset",
  "Knee bends backward",
];

/** The planter's private state, reached the way the clip seam next door is. */
interface PlanterSeam {
  leftKneeHingeAxis: Vector3;
  rightKneeHingeAxis: Vector3;
  leftLegChain: BoneChain | null;
  rightLegChain: BoneChain | null;
}

/**
 * Turn both knees' bend planes by `deg`, leaving every other input alone.
 *
 * Rotating about the femur keeps the hinge square to the thigh, so the knee
 * still bends through its full range in a single plane -- it is the same
 * healthy motion, aimed somewhere a knee cannot aim. That isolates the one
 * property under test instead of also breaking reach or contact.
 */
function tiltHinge(planter: FootPlanter, deg: number) {
  const seam = planter as unknown as PlanterSeam;
  for (const side of ["left", "right"] as const) {
    const chain = seam[`${side}LegChain`];
    if (!chain) continue;
    // The axis is expressed in the hip bone's local space, and in that space
    // the knee's own position is the femur.
    const femur = chain.middle.position.clone().normalize();
    seam[`${side}KneeHingeAxis`].applyAxisAngle(femur, (deg * Math.PI) / 180);
  }
}

function walkRig(rig: string, hingeTiltDeg = 0) {
  return driveRig({
    speedAt: () => WALK_SPEED,
    seconds: 4,
    rig,
    planting: true,
    onPlanter: hingeTiltDeg ? (p) => tiltHinge(p, hingeTiltDeg) : undefined,
  });
}

function runRig(rig: string, hingeTiltDeg = 0) {
  return driveRig({
    speedAt: () => RUN_SPEED,
    seconds: 4,
    rig,
    planting: true,
    onPlanter: hingeTiltDeg ? (p) => tiltHinge(p, hingeTiltDeg) : undefined,
  });
}

const rowsOf = (report: GaitReport, maneuver: GaitManeuverProfile) =>
  new Map(
    verdictRows(report, "gait", maneuver).map((row) => [row.name, row])
  );

const anatomyOf = (report: GaitReport, maneuver: GaitManeuverProfile) => {
  const rows = rowsOf(report, maneuver);
  return ANATOMY_ROWS.map((name) => {
    const row = rows.get(name);
    expect(row, `${name} is reported for a ${maneuver}`).toBeTruthy();
    return row!;
  });
};

const describeRow = (row: VerdictRow) =>
  `${row.name} ${row.value}${row.unit} (${row.verdict})`;

describe.skipIf(!present)("locomotion anatomy", () => {
  describe("every shipped character bends its knees like knees", () => {
    for (const id of ALL_RIGS) {
      it(`${id} walks and runs inside the anatomical bands`, async () => {
        for (const [maneuver, drive] of [
          ["walk", walkRig],
          ["run", runRig],
        ] as const) {
          const { report } = await drive(avatar(id));
          for (const row of anatomyOf(report, maneuver)) {
            expect(
              row.verdict,
              `${id} at a ${maneuver}: ${describeRow(row)}`
            ).not.toBe("bad");
          }
          // Bones are rigid and the solver only rotates them, so this reads
          // zero on a healthy pipeline by construction. It fires when
          // something starts translating a joint or stretching a chain toward
          // a target it cannot reach, which has no other signature here.
          expect(report.anatomy.worstSegmentDrift, `${id} ${maneuver} drift`)
            .toBeLessThan(0.01);
        }
      }, 180_000);
    }
  });

  describe("the check responds to a knee that is actually wrong", () => {
    it("fails a hinge turned 45 degrees, at both speeds", async () => {
      for (const [maneuver, drive] of [
        ["walk", walkRig],
        ["run", runRig],
      ] as const) {
        const { report } = await drive(avatar("ch01"), 45);
        const plane = rowsOf(report, maneuver).get("Knee bend plane")!;
        expect(plane.verdict, `${maneuver}: ${describeRow(plane)}`).toBe("bad");
      }
    }, 180_000);

    it("still fails at 20 degrees on a walk, which is the floor", async () => {
      // Named rather than merely asserted: below roughly this the fault sits
      // inside the spread between healthy characters, and the static contract
      // is the layer that covers it.
      const { report } = await walkRig(avatar("ch01"), 20);
      const plane = rowsOf(report, "walk").get("Knee bend plane")!;
      expect(plane.verdict, describeRow(plane)).toBe("bad");
    }, 120_000);

    it("reports the fault on the sideways offset too", async () => {
      // A second detector over the same defect, computed from the knee's
      // distance off the hip-ankle line rather than from a bend plane. Two
      // independent routes to the same finding is what keeps a single
      // arithmetic slip from quietly disarming the whole layer.
      const { report } = await runRig(avatar("ch01"), 60);
      const offset = rowsOf(report, "run").get("Knee sideways offset")!;
      expect(offset.verdict, describeRow(offset)).toBe("bad");
    }, 120_000);
  });

  it("the report is blind to the fault without the anatomy rows", async () => {
    const healthy = await runRig(avatar("ch01"));
    const folded = await runRig(avatar("ch01"), 84);

    // The fault is severe and unmistakable to the new rows.
    expect(folded.report.anatomy.worstMeanPlaneTilt).toBeGreaterThan(
      healthy.report.anatomy.worstMeanPlaneTilt * 3
    );

    // And invisible to every row that existed before them. This is the
    // measurement that justifies the layer: if one of these ever starts
    // moving, the claim in this file's header is stale and should be rewritten
    // rather than have this test relaxed.
    //
    // Relative rather than absolute, because these quantities span centimetres
    // to five-figure degrees per second squared and a tolerance that means
    // "unchanged" for one would demand eleven significant figures of another.
    // A part in a million is still four orders of magnitude below any real
    // response -- the anatomy row moved by a factor of eight over the same
    // input.
    for (const [name, value] of [
      ["mean slip", (r: GaitReport) => r.meanSlip],
      ["peak slip", (r: GaitReport) => r.peakSlip],
      ["knee jerk", (r: GaitReport) => r.kneeJerkRms],
      ["peak jolt", (r: GaitReport) => r.peakJolt],
      ["cadence", (r: GaitReport) => r.cadence],
      ["duty factor", (r: GaitReport) => r.dutyFactor],
    ] as const) {
      const before = value(healthy.report);
      const after = value(folded.report);
      const relative = Math.abs(after - before) / Math.max(1e-9, Math.abs(before));
      expect(relative, `${name} moved: ${before} -> ${after}`).toBeLessThan(1e-6);
    }
  }, 180_000);
});
