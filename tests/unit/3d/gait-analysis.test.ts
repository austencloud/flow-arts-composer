import { describe, expect, it } from "vitest";

import {
  analyzeGait,
  DEFAULT_THRESHOLDS,
  extractStances,
  localGroundSeries,
  findJolts,
  findTwitches,
  latestArrivalFrames,
  latestTravelFrames,
  legSegmentSeparation,
  legOrderMargin,
  lateralOffsetOverSupport,
  resolveGroundY,
  supportOf,
  travelSpans,
} from "#lib/shared/3d/diagnostics/gait/gait-analysis.js";
import type {
  FootFrame,
  GaitFrame,
} from "#lib/shared/3d/diagnostics/gait/gait-frame.js";

const DT = 1 / 60;

interface LegSpec {
  x: number;
  y: number;
  z: number;
  kneeAngle?: number;
  /** Ankle-above-toe, which is how the analysis sees a lifted heel. */
  heelLift?: number;
}

function leg(spec: LegSpec): FootFrame {
  // A rising heel carries the ankle off the ball of the foot while the toe
  // stays on the floor. Sinking the toe instead pushed it through the ground
  // plane, and contact is read from the foot's lowest joint, so the local
  // floor followed the buried toe down and the first half of every stance
  // scored as flight, clipping the very lift this fixture exists to raise.
  const ankleY = spec.y + (spec.heelLift ?? 0);
  return {
    ankle: { x: spec.x, y: ankleY, z: spec.z },
    toe: { x: spec.x, y: spec.y, z: spec.z + 0.15 },
    knee: { x: spec.x, y: ankleY + 0.45, z: spec.z },
    hip: { x: spec.x, y: ankleY + 0.9, z: spec.z },
    kneeAngle: spec.kneeAngle ?? 175,
    claimedContact: -1,
  };
}

function frame(
  t: number,
  root: { x: number; z: number },
  left: LegSpec,
  right: LegSpec,
  hipsLateral = 0
): GaitFrame {
  return {
    t,
    dt: DT,
    root: { x: root.x, y: 0, z: root.z },
    // Forward is +Z, so the character's right is -X and its left is +X.
    // Lateral quantities therefore read on X with the sign inverted.
    facing: 0,
    hips: { x: root.x + hipsLateral, y: 0.95, z: root.z },
    left: leg(left),
    right: leg(right),
  };
}

/**
 * A walk built to order.
 *
 * Feet alternate: one pinned on the floor for a stance, the other lifted and
 * carried forward. `slipPerFrame` drags the planted foot, which is exactly the
 * skating the instrument exists to catch, and `weightShift` moves the pelvis
 * over whichever foot is down.
 */
function syntheticWalk(options: {
  steps: number;
  stepLength: number;
  framesPerStance: number;
  slipPerFrame?: number;
  weightShift?: number;
  heelLift?: number;
}): GaitFrame[] {
  const {
    steps,
    stepLength,
    framesPerStance,
    slipPerFrame = 0,
    weightShift = 0,
    heelLift = 0,
  } = options;
  const frames: GaitFrame[] = [];
  const LIFT = 0.2;
  let t = 0;
  let leftZ = 0;
  let rightZ = stepLength;
  let rootZ = 0;

  for (let step = 0; step < steps; step++) {
    const planted = step % 2 === 0 ? "left" : "right";
    for (let i = 0; i < framesPerStance; i++) {
      const progress = i / framesPerStance;
      if (planted === "left") leftZ += slipPerFrame;
      else rightZ += slipPerFrame;
      // The swinging foot travels two step lengths, from behind to ahead.
      const swingZ =
        (planted === "left" ? rightZ : leftZ) -
        stepLength +
        2 * stepLength * progress;
      rootZ += stepLength / framesPerStance;

      const down = {
        x: planted === "left" ? 0.1 : -0.1,
        y: 0,
        z: planted === "left" ? leftZ : rightZ,
        // Ramped across the stance, because a foot whose ankle sits
        // permanently above its toe is a raked rig, not a popping heel, and
        // the analysis is right to charge it nothing.
        heelLift: heelLift * progress,
      };
      const up = {
        x: planted === "left" ? -0.1 : 0.1,
        y: LIFT * Math.sin(Math.PI * progress) + 0.06,
        z: swingZ,
      };
      // Balancing on a leg brings the body over it: left foot down pulls the
      // pelvis toward the character's left, which is +X here.
      const lateral = planted === "left" ? weightShift : -weightShift;
      frames.push(
        planted === "left"
          ? frame(t, { x: 0, z: rootZ }, down, up, lateral)
          : frame(t, { x: 0, z: rootZ }, up, down, lateral)
      );
      t += DT;
    }
    if (planted === "left") rightZ = leftZ + stepLength;
    else leftZ = rightZ + stepLength;
  }

  return frames;
}

/**
 * A walk with no discontinuities anywhere in it.
 *
 * `syntheticWalk` is built to exercise contact and slip, and its swing foot
 * jumps a few centimetres at each swap - it appears at a lifted height and
 * vanishes mid-arc. That is invisible to a stance-and-slip measurement and
 * fatal to a teleport measurement, so the jolt tests get their own walk whose
 * swing height and swing travel both start and end with zero value and zero
 * slope. Anything this one flags came from the test, not from the fixture.
 */
function smoothWalk(
  steps: number,
  stepLength: number,
  framesPerStance: number
): GaitFrame[] {
  const LIFT = 0.16;
  const TAU = Math.PI * 2;
  const frames: GaitFrame[] = [];
  const foot = { left: 0, right: stepLength };
  let t = 0;
  let rootZ = 0;

  for (let step = 0; step < steps; step++) {
    const swinging = step % 2 === 0 ? "right" : "left";
    const from = foot[swinging];
    for (let i = 0; i < framesPerStance; i++) {
      const u = i / framesPerStance;
      const swing = {
        // Raised cosine: zero height and zero vertical speed at both ends.
        y: LIFT * 0.5 * (1 - Math.cos(TAU * u)),
        // Its integral, so the foot also leaves and lands at zero speed.
        z: from + 2 * stepLength * (u - Math.sin(TAU * u) / TAU),
      };
      const up = { x: swinging === "left" ? -0.1 : 0.1, ...swing };
      const down = {
        x: swinging === "left" ? 0.1 : -0.1,
        y: 0,
        z: foot[swinging === "left" ? "right" : "left"],
      };
      frames.push(
        swinging === "left"
          ? frame(t, { x: 0, z: rootZ }, up, down)
          : frame(t, { x: 0, z: rootZ }, down, up)
      );
      rootZ += stepLength / framesPerStance;
      t += DT;
    }
    foot[swinging] = from + 2 * stepLength;
  }

  return frames;
}

describe("gait analysis", () => {
  it("takes the floor from the data rather than being told", () => {
    const frames = syntheticWalk({
      steps: 2,
      stepLength: 0.7,
      framesPerStance: 20,
    });
    // Every planted ankle sits at y=0, so that is the floor even though the
    // swinging one spends most of its time well above it.
    expect(resolveGroundY(frames)).toBeCloseTo(0, 5);
  });

  it("reads support off the geometry, never off what the animator claims", () => {
    const f = frame(
      0,
      { x: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
      { x: -0.1, y: 0.3, z: 0.7 }
    );
    // claimedContact is -1 on both feet here; the answer comes from height.
    expect(supportOf(f, 0, DEFAULT_THRESHOLDS.contactBand)).toBe("left");

    const both = frame(
      0,
      { x: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
      { x: -0.1, y: 0.01, z: 0.7 }
    );
    expect(supportOf(both, 0, DEFAULT_THRESHOLDS.contactBand)).toBe("both");

    const air = frame(
      0,
      { x: 0, z: 0 },
      { x: 0.1, y: 0.3, z: 0 },
      { x: -0.1, y: 0.3, z: 0.7 }
    );
    expect(supportOf(air, 0, DEFAULT_THRESHOLDS.contactBand)).toBe("flight");
  });

  it("charges a pinned foot no slip and a dragged one all of it", () => {
    const clean = syntheticWalk({
      steps: 4,
      stepLength: 0.7,
      framesPerStance: 24,
    });
    const cleanReport = analyzeGait(clean);
    expect(cleanReport.stances.length).toBeGreaterThanOrEqual(3);
    expect(cleanReport.meanSlip).toBeLessThan(0.005);

    // 3mm per frame over a 24-frame stance is about 7cm of skate per step.
    const skating = syntheticWalk({
      steps: 4,
      stepLength: 0.7,
      framesPerStance: 24,
      slipPerFrame: 0.003,
    });
    const skatingReport = analyzeGait(skating);
    expect(skatingReport.meanSlip).toBeGreaterThan(0.05);
    expect(skatingReport.slipRatio).toBeGreaterThan(0.05);
  });

  it("measures step length between alternating footfalls", () => {
    const frames = syntheticWalk({
      steps: 6,
      stepLength: 0.68,
      framesPerStance: 22,
    });
    const report = analyzeGait(frames);
    expect(report.meanStepLength).toBeGreaterThan(0.6);
    expect(report.meanStepLength).toBeLessThan(0.78);
  });

  it("separates a heel that lifts from one that stays flat", () => {
    const flat = analyzeGait(
      syntheticWalk({ steps: 4, stepLength: 0.7, framesPerStance: 24 })
    );
    expect(flat.hasToes).toBe(true);
    expect(flat.peakHeelLift).toBeLessThan(0.005);

    const popping = analyzeGait(
      syntheticWalk({
        steps: 4,
        stepLength: 0.7,
        framesPerStance: 24,
        heelLift: 0.09,
      })
    );
    expect(popping.peakHeelLift).toBeGreaterThan(0.05);
  });

  it("reports no toes rather than inventing a ball of the foot", () => {
    const frames = syntheticWalk({
      steps: 3,
      stepLength: 0.7,
      framesPerStance: 20,
    }).map((f) => ({
      ...f,
      left: { ...f.left, toe: null },
      right: { ...f.right, toe: null },
    }));
    const report = analyzeGait(frames);
    expect(report.hasToes).toBe(false);
    expect(report.peakHeelLift).toBe(0);
  });

  it("calls a knee that reverses in one frame a twitch, and a smooth one not", () => {
    const smooth: GaitFrame[] = [];
    for (let i = 0; i < 60; i++) {
      const angle = 175 - 35 * Math.sin((i / 60) * Math.PI * 2);
      smooth.push(
        frame(
          i * DT,
          { x: 0, z: i * 0.01 },
          { x: 0.1, y: 0, z: 0, kneeAngle: angle },
          { x: -0.1, y: 0.2, z: 0.5, kneeAngle: angle }
        )
      );
    }
    expect(findTwitches(smooth, DEFAULT_THRESHOLDS).twitches).toHaveLength(0);

    // One frame where the knee snaps 20 degrees and snaps back.
    const popped = smooth.map((f, i) =>
      i === 30
        ? { ...f, left: { ...f.left, kneeAngle: f.left.kneeAngle - 20 } }
        : f
    );
    const { twitches, jerkRms } = findTwitches(popped, DEFAULT_THRESHOLDS);
    expect(twitches.length).toBeGreaterThan(0);
    expect(twitches[0]!.foot).toBe("left");
    expect(jerkRms).toBeGreaterThan(1000);
  });

  it("catches feet still cycling after the body has stopped", () => {
    const frames: GaitFrame[] = [];
    for (let i = 0; i < 90; i++) {
      // The root never moves. The legs keep swinging anyway.
      const swing = 0.35 * Math.sin((i / 30) * Math.PI * 2);
      frames.push(
        frame(
          i * DT,
          { x: 0, z: 0 },
          { x: 0.1, y: Math.max(0, swing) * 0.5, z: swing },
          { x: -0.1, y: Math.max(0, -swing) * 0.5, z: -swing }
        )
      );
    }
    const report = analyzeGait(frames);
    expect(report.inPlaceCyclingSeconds).toBeGreaterThan(0.4);
    expect(report.inPlaceCyclingFraction).toBeGreaterThan(0.3);

    // A body that is genuinely walking is never charged for it.
    const walking = analyzeGait(
      syntheticWalk({ steps: 4, stepLength: 0.7, framesPerStance: 24 })
    );
    expect(walking.inPlaceCyclingSeconds).toBeLessThan(0.05);
  });

  it("keeps standing time out of a completed walk report", () => {
    const before = Array.from({ length: 60 }, (_, i) =>
      frame(
        i * DT,
        { x: 0, z: 0 },
        { x: 0.1, y: 0, z: 0 },
        { x: -0.1, y: 0, z: 0 }
      )
    );
    const walk = syntheticWalk({
      steps: 8,
      stepLength: 0.7,
      framesPerStance: 24,
    }).map((sample) => ({ ...sample, t: sample.t + 1 }));
    const end = walk.at(-1)!;
    const after = Array.from({ length: 180 }, (_, i) => ({
      ...end,
      t: end.t + (i + 1) * DT,
      dt: DT,
    }));
    const maneuver = [...before, ...walk, ...after];

    const spans = travelSpans(maneuver);
    expect(spans).toHaveLength(1);

    const moving = latestTravelFrames(maneuver);
    expect(moving.length).toBeGreaterThan(100);
    expect(moving.at(-1)!.t).toBeLessThan(after[0]!.t);
    expect(analyzeGait(moving).cadence).toBeGreaterThan(90);

    const arrival = latestArrivalFrames(maneuver);
    expect(arrival[0]!.t).toBeLessThanOrEqual(spans[0]!.to);
    expect(arrival.at(-1)!.t).toBeLessThanOrEqual(spans[0]!.to + 0.75);
    expect(arrival.at(-1)!.t).toBeGreaterThan(spans[0]!.to);
  });

  it("tells weight transfer apart from a pelvis riding the centreline", () => {
    const railed = analyzeGait(
      syntheticWalk({
        steps: 6,
        stepLength: 0.7,
        framesPerStance: 22,
        weightShift: 0,
      })
    );
    expect(railed.weightShiftAlternates).toBe(false);

    const transferring = analyzeGait(
      syntheticWalk({
        steps: 6,
        stepLength: 0.7,
        framesPerStance: 22,
        weightShift: 0.045,
      })
    );
    expect(transferring.weightShiftAlternates).toBe(true);
    expect(transferring.weightShiftAmplitude).toBeGreaterThan(0.05);

    // Leaning the same way regardless of which leg is under the body is a
    // list, not a transfer, and must not read as one.
    const listing = analyzeGait(
      syntheticWalk({ steps: 6, stepLength: 0.7, framesPerStance: 22 }).map(
        (f) => ({
          ...f,
          hips: { ...f.hips, x: f.root.x + 0.05 },
        })
      )
    );
    expect(listing.weightShiftAlternates).toBe(false);
  });

  it("follows the supporting footprint across the body during a crossover", () => {
    const crossed = syntheticWalk({
      steps: 6,
      stepLength: 0.7,
      framesPerStance: 22,
      weightShift: 0.045,
    }).map((f) => ({
      ...f,
      // The supporting foot and the pelvis both cross the body's centreline.
      // Anatomical left/right names therefore say the opposite of which side
      // is actually carrying the avatar in this part of the grapevine.
      hips: { ...f.hips, x: -f.hips.x },
      left: {
        ...f.left,
        ankle: { ...f.left.ankle, x: -f.left.ankle.x },
        toe: f.left.toe ? { ...f.left.toe, x: -f.left.toe.x } : null,
        hip: { ...f.left.hip, x: 0.1 },
      },
      right: {
        ...f.right,
        ankle: { ...f.right.ankle, x: -f.right.ankle.x },
        toe: f.right.toe ? { ...f.right.toe, x: -f.right.toe.x } : null,
        hip: { ...f.right.hip, x: -0.1 },
      },
    }));

    const report = analyzeGait(crossed);
    expect(report.weightShiftAlternates).toBe(true);
    expect(report.weightShiftAmplitude).toBeGreaterThan(0.05);
  });

  it("signs the lateral offset by the character's own right", () => {
    // Forward +Z puts the character's left at +X. Standing on the left foot
    // with the hips on the centreline leaves the body 10cm to the character's
    // right of the foot carrying it, which is where a real pelvis sits.
    const f = frame(
      0,
      { x: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
      { x: -0.1, y: 0.3, z: 0.7 }
    );
    expect(lateralOffsetOverSupport(f, "left")).toBeCloseTo(0.1, 5);
    expect(lateralOffsetOverSupport(f, "both")).toBeNull();
    expect(lateralOffsetOverSupport(f, "flight")).toBeNull();
  });

  it("detects feet crossing sides under the thighs", () => {
    const clear = frame(
      0,
      { x: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
      { x: -0.1, y: 0, z: 0 }
    );
    const crossed = {
      ...clear,
      left: { ...clear.left, ankle: { ...clear.left.ankle, x: -0.08 } },
      right: { ...clear.right, ankle: { ...clear.right.ankle, x: 0.08 } },
    };

    expect(legOrderMargin(clear)).toBeGreaterThan(0);
    expect(legOrderMargin(crossed)).toBeLessThan(0);

    const frames = Array.from({ length: 20 }, (_, index) => ({
      ...(index < 10 ? clear : crossed),
      t: index * DT,
    }));
    const report = analyzeGait(frames);
    expect(report.legCrossingSeconds).toBeGreaterThan(0);
    expect(report.legCrossingFraction).toBeGreaterThan(0.4);
    expect(report.minimumLegOrderMargin).toBeLessThan(0);
    expect(report.maximumLegOrderMargin).toBeGreaterThan(0);
    expect(report.legOrderAlternates).toBe(true);
  });

  it("distinguishes a depth-cleared crossover from intersecting leg paths", () => {
    const base = frame(
      0,
      { x: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
      { x: -0.1, y: 0, z: 0 }
    );
    const colliding = {
      ...base,
      left: { ...base.left, ankle: { ...base.left.ankle, x: -0.08 } },
      right: { ...base.right, ankle: { ...base.right.ankle, x: 0.08 } },
    };
    const cleared = {
      ...colliding,
      right: {
        ...colliding.right,
        hip: { ...colliding.right.hip, z: 0.12 },
        knee: { ...colliding.right.knee, z: 0.12 },
        ankle: { ...colliding.right.ankle, z: 0.12 },
      },
    };

    expect(
      Math.hypot(
        colliding.left.ankle.x - colliding.right.ankle.x,
        colliding.left.ankle.y - colliding.right.ankle.y,
        colliding.left.ankle.z - colliding.right.ankle.z
      )
    ).toBeGreaterThan(0.1);
    expect(legSegmentSeparation(colliding)).toBeLessThan(0.01);
    expect(legSegmentSeparation(cleared)).toBeGreaterThan(0.05);
  });

  it("throws away stance runs too short to be a step", () => {
    const frames = syntheticWalk({
      steps: 4,
      stepLength: 0.7,
      framesPerStance: 24,
    });
    // One stray frame of contact in the middle of a swing is sampling noise.
    frames[10] = {
      ...frames[10]!,
      right: {
        ...frames[10]!.right,
        ankle: { ...frames[10]!.right.ankle, y: 0 },
      },
    };
    const stances = extractStances(frames, 0, DEFAULT_THRESHOLDS);
    expect(
      stances.every(
        (s) => s.endT - s.startT >= DEFAULT_THRESHOLDS.minStanceDuration
      )
    ).toBe(true);
  });

  it("finds the floor under a standing pose parked above the walking one", () => {
    // The real rig does this: its idle leaves both ankles about 11cm higher
    // than mid-stride, so one floor for the whole session calls every standing
    // frame flight and the walk comes back with two footfalls in half a minute.
    const standing: GaitFrame[] = [];
    for (let i = 0; i < 120; i++) {
      standing.push(
        frame(
          i * DT,
          { x: 0, z: 0 },
          { x: 0.1, y: 0.11, z: 0 },
          { x: -0.1, y: 0.11, z: 0 }
        )
      );
    }
    const walking = syntheticWalk({
      steps: 6,
      stepLength: 0.7,
      framesPerStance: 22,
    });
    const shifted = walking.map((f) => ({ ...f, t: f.t + 2 }));
    const frames = [...standing, ...shifted];

    const ground = localGroundSeries(frames);
    expect(ground[0]).toBeCloseTo(0.11, 3);
    expect(ground[ground.length - 1]).toBeCloseTo(0, 3);

    // The bug, reproduced: one floor for the whole session loses the standing
    // period entirely, because those ankles sit 11cm above the walking floor.
    const scalar = extractStances(
      frames,
      resolveGroundY(frames),
      DEFAULT_THRESHOLDS
    );
    const scalarStanding = scalar.filter((st) => st.startT < 2).length;
    expect(scalarStanding).toBe(0);

    // The local floor keeps both: the stand and every step of the walk.
    const local = extractStances(frames, ground, DEFAULT_THRESHOLDS);
    expect(local.filter((st) => st.startT < 2).length).toBeGreaterThan(0);
    expect(local.length).toBeGreaterThan(scalar.length);

    const report = analyzeGait(frames);
    // Two seconds of both feet flat is double support, not flight.
    expect(report.doubleSupportFraction).toBeGreaterThan(0.25);
    expect(report.stances.length).toBeGreaterThanOrEqual(5);
  });

  it("does not call an honest swing a teleport", () => {
    const frames = smoothWalk(4, 0.7, 30);
    const found = findJolts(frames, DEFAULT_THRESHOLDS);
    expect(found.jolts).toEqual([]);
    // A foot turning around at the end of its swing is the fastest thing a
    // leg does honestly, and the threshold has to clear it with room to spare
    // or every stride would read as a fault.
    expect(found.peak).toBeLessThan(DEFAULT_THRESHOLDS.joltAccel / 2);
  });

  it("names the joint that arrived instead of travelling there", () => {
    const frames = smoothWalk(4, 0.7, 30);
    const at = 45;
    frames[at]!.right.ankle.y += 0.15;

    const found = findJolts(frames, DEFAULT_THRESHOLDS);
    expect(found.jolts.length).toBeGreaterThan(0);
    expect(found.peakJoint).toBe("right ankle");
    expect(found.peakStep).toBeCloseTo(0.15, 2);
    for (const jolt of found.jolts) {
      expect(jolt.joint).toBe("right ankle");
      // A one-frame displacement shows up in the three second-difference
      // windows that span it, and nowhere else.
      expect(jolt.t).toBeGreaterThanOrEqual(frames[at]!.t - 1e-9);
      expect(jolt.t).toBeLessThanOrEqual(frames[at + 2]!.t + 1e-9);
    }
  });

  it("measures in the character's own frame, so a fast body is not a jumping one", () => {
    // The pose never changes; only the world position does, and it does so
    // hard enough that a world-space measurement would flag every frame.
    const frames: GaitFrame[] = [];
    for (let i = 0; i < 30; i++) {
      const t = i * DT;
      const z = 40 * t * t;
      frames.push(
        frame(
          t,
          { x: 0, z },
          { x: 0.1, y: 0, z: z + 0.3 },
          { x: -0.1, y: 0, z: z - 0.3 }
        )
      );
    }
    expect(findJolts(frames, DEFAULT_THRESHOLDS).jolts).toEqual([]);
  });

  it("returns an empty report rather than dividing by an empty buffer", () => {
    const report = analyzeGait([]);
    expect(report.frameCount).toBe(0);
    expect(report.cadence).toBe(0);
    expect(report.slipRatio).toBe(0);
    expect(report.stances).toEqual([]);
  });
});
