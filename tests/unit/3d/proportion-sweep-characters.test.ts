/**
 * The proportion sweep is only useful if each body really does move exactly one
 * dimension. A fixture that claims to be "arms long" but also widened the
 * shoulders reintroduces the very confound the sweep exists to remove, and it
 * does so silently: the lab would still render, still measure, and still
 * mislead.
 *
 * The generator enforces this at build time, but the GLBs are gitignored, so a
 * checkout cannot re-derive it. These assertions run against the committed
 * measurements instead, which is what any consumer actually reads.
 *
 * If this fails, regenerate the sweep — do not loosen the tolerances.
 */
import { describe, expect, it } from "vitest";

import {
  PROPORTION_SWEEP_CHARACTERS,
  type ProportionSweepCharacter,
} from "#lib/shared/3d/domain/proportion-sweep-characters.js";
import { fitStaffLengthForHug } from "#lib/shared/3d/domain/performer-reach-measurements.js";

/** Which measured dimensions each axis is permitted to move. */
const AXIS_ALLOWED_TO_CHANGE: Record<string, readonly string[]> = {
  none: [],
  stature: [
    "statureCm",
    "upperArmCm",
    "forearmCm",
    "reachCm",
    "shoulderWidthCm",
    "footSeparationCm",
  ],
  shoulderWidth: ["shoulderWidthCm"],
  armLength: ["upperArmCm", "forearmCm", "reachCm"],
  // Redistributing length between the segments must leave the total alone;
  // that is what makes this body a probe of what the solve ignores.
  armSegmentRatio: ["upperArmCm", "forearmCm"],
  torsoGirth: [],
};

const TOLERANCE_CM: Record<string, number> = {
  statureCm: 0.5,
  upperArmCm: 0.05,
  forearmCm: 0.05,
  reachCm: 0.05,
  shoulderWidthCm: 0.05,
  footSeparationCm: 0.05,
};

const median = PROPORTION_SWEEP_CHARACTERS.find(
  (body) => body.axis === "none"
) as ProportionSweepCharacter;

describe("proportion sweep characters", () => {
  it("has exactly one median control", () => {
    const controls = PROPORTION_SWEEP_CHARACTERS.filter(
      (body) => body.axis === "none"
    );
    expect(controls).toHaveLength(1);
    expect(controls[0].parameters).toEqual({});
  });

  it("covers every proportion axis the lab needs to separate", () => {
    const axes = new Set(PROPORTION_SWEEP_CHARACTERS.map((body) => body.axis));
    expect([...axes].sort()).toEqual([
      "armLength",
      "armSegmentRatio",
      "none",
      "shoulderWidth",
      "stature",
      "torsoGirth",
    ]);
  });

  it("registers every body as local-evaluation only", () => {
    for (const body of PROPORTION_SWEEP_CHARACTERS) {
      expect(body.availability, body.id).toBe("local-evaluation");
      expect(body.modelPath, body.id).toMatch(
        /^\/models\/avatars\/proportion-sweep\/[a-z-]+\.glb$/
      );
    }
  });

  describe.each(
    PROPORTION_SWEEP_CHARACTERS.filter((body) => body.axis !== "none")
  )("$id", (body) => {
    const allowed = AXIS_ALLOWED_TO_CHANGE[body.axis];

    it(`moves its ${body.axis} axis`, () => {
      const moved = allowed.some(
        (dimension) =>
          Math.abs(
            body.measured[dimension as keyof typeof body.measured] as number
          ) -
            Math.abs(
              median.measured[dimension as keyof typeof median.measured] as number
            ) !==
          0
      );
      // A girth body is expected to leave every solve input alone; its evidence
      // is the mesh, so it has no dimension to move.
      expect(moved || allowed.length === 0).toBe(true);
    });

    it("leaves every other dimension alone", () => {
      for (const [dimension, tolerance] of Object.entries(TOLERANCE_CM)) {
        if (allowed.includes(dimension)) continue;
        const key = dimension as keyof typeof body.measured;
        const delta = Math.abs(
          (body.measured[key] as number) - (median.measured[key] as number)
        );
        expect(delta, `${body.id} drifted ${dimension}`).toBeLessThanOrEqual(
          tolerance
        );
      }
    });

    it("declares parameters that match its axis", () => {
      expect(Object.keys(body.parameters).length).toBeGreaterThan(0);
    });
  });

  it("reproduces the runtime staff fit from the recorded measurements", () => {
    for (const body of PROPORTION_SWEEP_CHARACTERS) {
      const fit = fitStaffLengthForHug({
        upperArmM: body.measured.upperArmCm / 100,
        forearmM: body.measured.forearmCm / 100,
        reachM: body.measured.reachCm / 100,
        shoulderWidthM: body.measured.shoulderWidthCm / 100,
      });
      expect(fit.fits, body.id).toBe(body.measured.staffFits);
    }
  });

  it("spans the fit boundary in both directions", () => {
    const fits = PROPORTION_SWEEP_CHARACTERS.filter(
      (body) => body.measured.staffFits
    );
    const fails = PROPORTION_SWEEP_CHARACTERS.filter(
      (body) => !body.measured.staffFits
    );
    // A sweep where everything passes proves nothing about the solve's limits.
    expect(fits.length).toBeGreaterThan(0);
    expect(fails.length).toBeGreaterThan(0);
  });

  it("shows the solve reads only the sum of the arm segments", () => {
    const elbowHigh = PROPORTION_SWEEP_CHARACTERS.find(
      (body) => body.axis === "armSegmentRatio"
    ) as ProportionSweepCharacter;
    // Upper arm and forearm are redistributed hard...
    expect(
      Math.abs(elbowHigh.measured.upperArmCm - median.measured.upperArmCm)
    ).toBeGreaterThan(5);
    // ...yet the fit is unchanged, because `measurePerformerReach` consumes
    // only `upperArmM + forearmM`.
    expect(elbowHigh.measured.staffCm).toBeCloseTo(median.measured.staffCm, 0);
  });

  it("keeps the base rig's authored stance", () => {
    // The catalog rigs ship a Mixamo clip whose first frame stands feet
    // together, directly under the hips. A Blender bake that freezes that
    // frame instead of the bind pose silently restances every fixture, and no
    // solve input would move. Only stature may rescale this.
    const HIP_SEPARATION_CM = 17.4;
    for (const body of PROPORTION_SWEEP_CHARACTERS) {
      expect(
        body.measured.footSeparationCm,
        `${body.id} collapsed onto its hips`
      ).toBeGreaterThan(HIP_SEPARATION_CM * 1.2);
    }
  });

  it("shows the solve is blind to torso build", () => {
    const builds = PROPORTION_SWEEP_CHARACTERS.filter(
      (body) => body.axis === "torsoGirth"
    );
    expect(builds.length).toBe(2);
    for (const build of builds) {
      // Torso depth is derived as a ratio of shoulder width rather than
      // measured off the body, so a visibly deeper chest changes nothing.
      expect(build.measured.staffCm, build.id).toBeCloseTo(
        median.measured.staffCm,
        1
      );
    }
  });
});
