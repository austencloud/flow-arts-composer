/**
 * Pins the severity rule.
 *
 * The whole value of a red/amber/green matrix is that the colours mean the
 * same thing every run and can be argued with. These tests hold each criterion
 * at its warn and fail boundary, so a threshold cannot drift silently and
 * repaint a hundred cells.
 */

import { describe, it, expect } from "vitest";
import type { CollisionEvent } from "@austencloud/scene-3d";
import {
  collisionMetrics,
  deriveSweepPhaseSample,
  gripAxisErrorDeg,
  reachMetrics,
  type SweepPhaseSample,
  type SweepReading,
} from "#lib/shared/3d/diagnostics/sweep/sweep-sample.js";
import {
  bodyClipRatio,
  scoreSweepConfiguration,
  scoreSweepSample,
  SWEEP_THRESHOLDS,
} from "#lib/shared/3d/diagnostics/sweep/sweep-scoring.js";
import {
  aggregateConfiguration,
  rollUpByAxis,
  selectWorstMoment,
} from "#lib/shared/3d/diagnostics/sweep/sweep-aggregation.js";
import type { SweepConfiguration } from "#lib/shared/3d/diagnostics/sweep/sweep-space.js";

/** A body that measures cleanly and can hold an ordinary staff. */
const HEALTHY_POSE = {
  requestedStanceYawRad: 0,
  achievedShoulderYawRad: 0,
  shoulderWidth: 0.38,
  leftUpperArmLength: 0.28,
  leftForearmLength: 0.26,
  rightUpperArmLength: 0.28,
  rightForearmLength: 0.26,
};

function sample(overrides: Partial<SweepPhaseSample> = {}): SweepPhaseSample {
  const base: SweepPhaseSample = {
    phase: 0,
    stepNumber: 1,
    beatProgress: 0,
    collisions: {
      eventCount: 0,
      deepestPenetrationMm: 0,
      deepestBodyPenetrationMm: 0,
      deepestPropPenetrationMm: 0,
      worstSeverity: null,
      worstBodySeverity: null,
      zones: [],
      kinds: [],
      worstDescription: null,
    },
    grip: {
      axisErrorDeg: 1,
      contactOffsetMm: 2,
      gripSeparationMm: 200,
      renderedPropLengthMm: 810,
    },
    stance: { requestedYawDeg: 0, achievedYawDeg: 0, yawErrorDeg: 0 },
    reach: {
      measurements: null,
      reachMm: 540,
      shoulderWidthMm: 380,
      maxHoldableLengthCm: 100,
      propOverrunCm: -19,
      reachTooShort: false,
    },
    convergence: {
      gripSeparationSpreadMm: 0.4,
      penetrationSpreadMm: 0,
      kindsAgree: true,
    },
  };
  return {
    ...base,
    ...overrides,
    collisions: { ...base.collisions, ...overrides.collisions },
    grip: { ...base.grip, ...overrides.grip },
    stance: { ...base.stance, ...overrides.stance },
    reach: { ...base.reach, ...overrides.reach },
    convergence: { ...base.convergence, ...overrides.convergence },
  };
}

describe("sweep scoring — criterion boundaries", () => {
  it("passes a clean sample", () => {
    expect(scoreSweepSample(sample()).severity).toBe("pass");
  });

  it("treats a graze as not a failure", () => {
    const grazed = scoreSweepSample(
      sample({
        collisions: {
          eventCount: 1,
          deepestPenetrationMm: 1.2,
          deepestBodyPenetrationMm: 1.2,
          deepestPropPenetrationMm: 0,
          worstSeverity: "graze",
          worstBodySeverity: "graze",
          zones: ["prop-through-arm"],
          kinds: ["prop-through-arm:graze"],
          worstDescription: "brushed the forearm",
        },
      })
    );
    expect(grazed.severity).toBe("pass");
  });

  it("warns on a clip and fails on a penetration, at the same depth", () => {
    const collisions = {
      eventCount: 1,
      deepestPenetrationMm: 1,
      deepestBodyPenetrationMm: 1,
      deepestPropPenetrationMm: 0,
      zones: ["prop-through-torso" as const],
      kinds: ["prop-through-torso:clip"],
      worstDescription: null,
    };
    expect(
      scoreSweepSample(
        sample({
          collisions: {
            ...collisions,
            worstSeverity: "clip",
            worstBodySeverity: "clip",
          },
        })
      ).severity
    ).toBe("warn");
    expect(
      scoreSweepSample(
        sample({
          collisions: {
            ...collisions,
            worstSeverity: "penetrate",
            worstBodySeverity: "penetrate",
          },
        })
      ).severity
    ).toBe("fail");
  });

  it.each([
    ["body-penetration", (mm: number) => sample({ collisions: { eventCount: 1, deepestPenetrationMm: mm, deepestBodyPenetrationMm: mm, deepestPropPenetrationMm: 0, worstSeverity: "graze" as const, worstBodySeverity: "graze" as const, zones: [], kinds: [], worstDescription: null } })],
    ["prop-overlap", (mm: number) => sample({ collisions: { eventCount: 1, deepestPenetrationMm: mm, deepestBodyPenetrationMm: 0, deepestPropPenetrationMm: mm, worstSeverity: "graze" as const, worstBodySeverity: null, zones: [], kinds: [], worstDescription: null } })],
    ["grip-axis-error", (v: number) => sample({ grip: { axisErrorDeg: v, contactOffsetMm: 2, gripSeparationMm: 200, renderedPropLengthMm: 810 } })],
    ["grip-contact-offset", (v: number) => sample({ grip: { axisErrorDeg: 1, contactOffsetMm: v, gripSeparationMm: 200, renderedPropLengthMm: 810 } })],
    ["stance-yaw-error", (v: number) => sample({ stance: { requestedYawDeg: v, achievedYawDeg: 0, yawErrorDeg: v } })],
    ["grip-convergence", (v: number) => sample({ convergence: { gripSeparationSpreadMm: v, penetrationSpreadMm: 0, kindsAgree: true } })],
  ] as const)("%s crosses pass → warn → fail exactly at its thresholds", (id, build) => {
    const threshold = SWEEP_THRESHOLDS[id];
    expect(scoreSweepSample(build(threshold.warn - 0.001)).severity).toBe("pass");
    expect(scoreSweepSample(build(threshold.warn)).severity).toBe("warn");
    expect(scoreSweepSample(build(threshold.fail - 0.001)).severity).toBe("warn");
    expect(scoreSweepSample(build(threshold.fail)).severity).toBe("fail");
  });

  it("warns on any prop overrun and fails once the overrun is large", () => {
    const overrun = (cm: number) =>
      scoreSweepSample(
        sample({
          reach: {
            measurements: null,
            reachMm: 480,
            shoulderWidthMm: 380,
            maxHoldableLengthCm: 81 - cm,
            propOverrunCm: cm,
            reachTooShort: false,
          },
        })
      ).severity;
    expect(overrun(0)).toBe("pass");
    expect(overrun(1)).toBe("warn");
    expect(overrun(SWEEP_THRESHOLDS["prop-overrun"].fail)).toBe("fail");
  });

  it("fails a body that cannot hold the shortest supported prop", () => {
    const scored = scoreSweepSample(
      sample({
        reach: {
          measurements: null,
          reachMm: 300,
          shoulderWidthMm: 300,
          maxHoldableLengthCm: 20,
          propOverrunCm: 61,
          reachTooShort: true,
        },
      })
    );
    expect(scored.severity).toBe("fail");
  });

  it("names the criterion most responsible for the verdict", () => {
    const scored = scoreSweepSample(
      sample({
        grip: {
          axisErrorDeg: 12,
          contactOffsetMm: 90,
          gripSeparationMm: 200,
          renderedPropLengthMm: 810,
        },
      })
    );
    expect(scored.dominant).toBe("grip-contact-offset");
    expect(scored.score).toBeCloseTo(90 / SWEEP_THRESHOLDS["grip-contact-offset"].fail);
  });
});

describe("sweep scoring — configuration level", () => {
  it("blocks a configuration with too few settled phases", () => {
    const scored = scoreSweepConfiguration([sample(), sample()], 4);
    expect(scored.severity).toBe("blocked");
  });

  it("counts only clip-or-worse body contacts in the clip ratio", () => {
    const clipping = sample({
      collisions: {
        eventCount: 1,
        deepestPenetrationMm: 3,
        deepestBodyPenetrationMm: 3,
        deepestPropPenetrationMm: 0,
        worstSeverity: "clip",
        worstBodySeverity: "clip",
        zones: [],
        kinds: [],
        worstDescription: null,
      },
    });
    const grazing = sample({
      collisions: {
        eventCount: 1,
        deepestPenetrationMm: 1,
        deepestBodyPenetrationMm: 1,
        deepestPropPenetrationMm: 0,
        worstSeverity: "graze",
        worstBodySeverity: "graze",
        zones: [],
        kinds: [],
        worstDescription: null,
      },
    });
    expect(bodyClipRatio([clipping, grazing, sample(), sample()])).toBe(0.25);
  });

  it("fails a configuration that clips constantly even when no single frame is deep", () => {
    const shallowClip = sample({
      collisions: {
        eventCount: 1,
        deepestPenetrationMm: 1,
        deepestBodyPenetrationMm: 1,
        deepestPropPenetrationMm: 0,
        worstSeverity: "clip",
        worstBodySeverity: "clip",
        zones: [],
        kinds: [],
        worstDescription: null,
      },
    });
    const samples = [shallowClip, shallowClip, shallowClip, sample(), sample()];
    expect(bodyClipRatio(samples)).toBeGreaterThanOrEqual(
      SWEEP_THRESHOLDS["body-clip-ratio"].fail
    );
    expect(scoreSweepConfiguration(samples, 4).severity).toBe("fail");
  });
});

const CONFIGURATION: SweepConfiguration = {
  key: "ch07|staff|seq-1",
  character: { id: "ch07" as never, label: "ch07" },
  prop: { id: "staff" as never, label: "Staff", lengthCm: 81 },
  sequence: { id: "seq-1", label: "FALG", stepCount: 4, data: {} as never },
};

describe("worst moment", () => {
  it("addresses the phase that drove the verdict", () => {
    const samples = [
      sample({ phase: 0, stepNumber: 1, beatProgress: 0 }),
      sample({
        phase: 2.25,
        stepNumber: 3,
        beatProgress: 0.25,
        grip: {
          axisErrorDeg: 40,
          contactOffsetMm: 5,
          gripSeparationMm: 200,
          renderedPropLengthMm: 810,
        },
      }),
      sample({ phase: 3, stepNumber: 4, beatProgress: 0 }),
    ];
    const worst = selectWorstMoment(CONFIGURATION, samples);
    expect(worst?.coordinate).toMatchObject({
      characterId: "ch07",
      propId: "staff",
      sequenceId: "seq-1",
      phase: 2.25,
      stepNumber: 3,
      beatProgress: 0.25,
    });
    expect(worst?.score.dominant).toBe("grip-axis-error");
  });

  it("returns null when no phase settled", () => {
    expect(selectWorstMoment(CONFIGURATION, [])).toBeNull();
  });
});

describe("aggregation", () => {
  it("reports an unmeasured configuration as blocked, never as passing", () => {
    const result = aggregateConfiguration(CONFIGURATION, [], {
      unsettledPhases: 16,
      blockedReason: "configuration could not be mounted",
    });
    expect(result.severity).toBe("blocked");
    expect(result.worstMoment).toBeNull();
    expect(result.blockedReason).toBe("configuration could not be mounted");
  });

  it("carries the maxima and distinct collision kinds forward", () => {
    const result = aggregateConfiguration(CONFIGURATION, [
      sample({
        collisions: {
          eventCount: 1,
          deepestPenetrationMm: 4,
          deepestBodyPenetrationMm: 4,
          deepestPropPenetrationMm: 0,
          worstSeverity: "graze",
          worstBodySeverity: "graze",
          zones: ["prop-through-arm"],
          kinds: ["prop-through-arm:graze"],
          worstDescription: "brush",
        },
      }),
      sample({
        collisions: {
          eventCount: 1,
          deepestPenetrationMm: 9,
          deepestBodyPenetrationMm: 0,
          deepestPropPenetrationMm: 9,
          worstSeverity: "clip",
          worstBodySeverity: null,
          zones: ["prop-through-prop"],
          kinds: ["prop-through-prop:clip"],
          worstDescription: "staffs crossed",
        },
      }),
      sample({ stance: { requestedYawDeg: 30, achievedYawDeg: 21, yawErrorDeg: 9 } }),
      sample(),
    ]);
    expect(result.deepestBodyPenetrationMm).toBe(4);
    expect(result.deepestPropPenetrationMm).toBe(9);
    expect(result.maxStanceYawErrorDeg).toBe(9);
    expect(result.collisionKinds).toEqual([
      "prop-through-arm:graze",
      "prop-through-prop:clip",
    ]);
    expect(result.collisionPhases).toBe(2);
  });

  it("rolls results up so a matrix can say which body is carrying the failures", () => {
    const bad = aggregateConfiguration(
      { ...CONFIGURATION, key: "ch07|staff|a" },
      [sample({ grip: { axisErrorDeg: 40, contactOffsetMm: 1, gripSeparationMm: 200, renderedPropLengthMm: 810 } }), sample(), sample(), sample()]
    );
    const good = aggregateConfiguration(
      {
        ...CONFIGURATION,
        key: "ch01|staff|a",
        character: { id: "ch01" as never, label: "ch01" },
      },
      [sample(), sample(), sample(), sample()]
    );
    const rollup = rollUpByAxis([good, bad], "character");
    expect(rollup[0].id).toBe("ch07");
    expect(rollup[0].counts.fail).toBe(1);
    expect(rollup[1].counts.pass).toBe(1);
  });
});

describe("sample derivation", () => {
  it("measures the angle between a hand's grip axis and the shaft it holds", () => {
    const shaft = { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 } };
    expect(gripAxisErrorDeg({ x: 1, y: 0, z: 0 }, shaft)).toBeCloseTo(0);
    expect(gripAxisErrorDeg({ x: -1, y: 0, z: 0 }, shaft)).toBeCloseTo(0);
    expect(gripAxisErrorDeg({ x: 0, y: 1, z: 0 }, shaft)).toBeCloseTo(90);
    expect(gripAxisErrorDeg(null, shaft)).toBeNull();
  });

  it("separates body zones from prop-through-prop", () => {
    const events: CollisionEvent[] = [
      {
        zone: "prop-through-prop",
        severity: "penetrate",
        stepNumber: 2,
        beatProgress: 0.5,
        penetrationDepth: 0.03,
        description: "staffs overlapped 30cm",
      },
      {
        zone: "prop-through-torso",
        severity: "graze",
        stepNumber: 2,
        beatProgress: 0.5,
        penetrationDepth: 0.002,
        description: "brushed torso",
      },
    ];
    const metrics = collisionMetrics(events);
    expect(metrics.deepestPropPenetrationMm).toBeCloseTo(30);
    expect(metrics.deepestBodyPenetrationMm).toBeCloseTo(2);
    expect(metrics.worstBodySeverity).toBe("graze");
    expect(metrics.worstSeverity).toBe("penetrate");
  });

  it("reports no reach numbers for a rig whose skeleton has not loaded", () => {
    const metrics = reachMetrics(
      { ...HEALTHY_POSE, leftUpperArmLength: 0, rightForearmLength: 0 },
      81
    );
    expect(metrics.measurements).toBeNull();
    expect(metrics.propOverrunCm).toBeNull();
    expect(metrics.reachTooShort).toBe(false);
  });

  it("keeps the disagreement between two confirmation reads as the convergence metric", () => {
    const reading = (separation: number): SweepReading => ({
      collisionEvents: [],
      pose: HEALTHY_POSE,
      grip: {
        stepNumber: 3,
        beatProgress: 0.25,
        leftPalm: { x: 0, y: 1, z: 0 },
        rightPalm: { x: separation, y: 1, z: 0 },
        leftGripAxis: { x: 1, y: 0, z: 0 },
        rightGripAxis: { x: 1, y: 0, z: 0 },
        renderedBlueGrip: { x: 0, y: 1, z: 0 },
        renderedRedGrip: { x: separation, y: 1, z: 0 },
        blueStaffSegment: { a: { x: -0.4, y: 1, z: 0 }, b: { x: 0.4, y: 1, z: 0 } },
        redStaffSegment: { a: { x: -0.4, y: 1, z: 0 }, b: { x: 0.4, y: 1, z: 0 } },
      },
    });
    const derived = deriveSweepPhaseSample(2.25, reading(0.2), reading(0.23), 81);
    expect(derived.convergence.gripSeparationSpreadMm).toBeCloseTo(30);
    expect(derived.grip.gripSeparationMm).toBeCloseTo(230);
    expect(derived.stepNumber).toBe(3);
  });
});
