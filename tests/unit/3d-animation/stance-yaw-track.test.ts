import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { PlaneMode } from "@austencloud/scene-3d";
import {
  LANE_RATE_M_PER_STEP,
  MAX_HEAD_LAG_RAD,
  MAX_SPINE_STAGGER_RAD,
  SPINE1_SHARE,
  buildStanceYawTrack,
  describeStanceYawTrack,
  resolveTrackedUpperBodyStance,
  sampleStanceYawTrack,
  sampleStanceYawTrackDetail,
  stanceLaneFloorAt,
  stanceYawAngularVelocity,
  type StanceYawTrack,
  type StanceYawTrackOptions,
} from "$lib/shared/3d/collision/stance-yaw-track";
import {
  MAX_STANCE_YAW_RAD,
  planUpperBodyStanceYawTarget,
  stanceSideBlend,
  type UpperBodyStanceTargets,
} from "$lib/shared/3d/collision/upper-body-stance-planner";

/**
 * The planner's yaw is a memoryless function of this frame's grips: it cannot
 * start before the props are lateral, its speed is whatever the props' sweep
 * through the assist band happens to be, and it has no memory across a step
 * boundary. These tests pin the three properties the score-time track adds.
 *
 * The fixture sweeps a coherent pair from square to a full side hold across
 * score time 3.0 to 6.0. The assist band turns that into a yaw ramp spanning
 * roughly 4.0 to 5.1, so the step boundary at 5.0 lands mid-turn, which is
 * exactly where a stop-and-restart would be visible.
 */
const TURN_START = 3;
const TURN_END = 6;
const HOLD_END = 7;
const RETURN_END = 7.9;
const FULL_LATERAL_M = 0.35;

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Lateral mean of the two grips at a score time, metres. */
function lateralAt(scoreTime: number): number {
  if (scoreTime <= TURN_START) return 0;
  if (scoreTime < TURN_END) {
    return (
      FULL_LATERAL_M *
      smoothstep((scoreTime - TURN_START) / (TURN_END - TURN_START))
    );
  }
  if (scoreTime <= HOLD_END) return FULL_LATERAL_M;
  if (scoreTime < RETURN_END) {
    return (
      FULL_LATERAL_M *
      (1 - smoothstep((scoreTime - HOLD_END) / (RETURN_END - HOLD_END)))
    );
  }
  return 0;
}

function targetsAt(scoreTime: number): UpperBodyStanceTargets {
  const x = lateralAt(scoreTime);
  return { left: { x, z: 0.5 }, right: { x, z: 0.5 } };
}

function makeTrack(overrides: { loop?: boolean } = {}): StanceYawTrack {
  const track = buildStanceYawTrack({
    targetsAtScoreTime: targetsAt,
    motionStepCount: 8,
    loop: overrides.loop ?? false,
  });
  expect(track).not.toBeNull();
  return track!;
}

/** First score time at which `read` reaches `fraction` of its own final value. */
function crossingTime(
  read: (scoreTime: number) => number,
  fraction: number,
  from = 0,
  to = 8,
  finalValue = MAX_STANCE_YAW_RAD
): number {
  const threshold = fraction * finalValue;
  const step = 0.001;
  for (let t = from; t <= to; t += step) {
    if (Math.abs(read(t)) >= threshold) return t;
  }
  return Number.NaN;
}

describe("stance yaw track", () => {
  it("starts the turn before the props ask for it", () => {
    const track = makeTrack();
    const desireOnset = crossingTime(
      (t) => planUpperBodyStanceYawTarget(targetsAt(t)),
      0.02
    );
    const trackOnset = crossingTime(
      (t) => sampleStanceYawTrack(track, t).chestRad,
      0.02
    );

    const lead = desireOnset - trackOnset;
    // Anticipation, not a filter: the curve is already moving while the
    // memoryless planner still reads square. Measured 0.134 steps here, which
    // at an ordinary two-thirds-of-a-second step is about 90 ms of lead.
    expect(lead).toBeGreaterThan(0.05);
    // Deliberately modest, and bounded here so it stays that way. The shoulder
    // line is the segment the arms are solved against, so leading it far enough
    // to read on its own drives the torso into a shaft the props have not swung
    // clear of yet; the ch18 sweep numbers behind that bound are recorded on
    // ANTICIPATION_LEAD_STEPS. The next test pins where the anticipation
    // actually lives.
    expect(lead).toBeLessThan(0.2);
  });

  it("anticipates from the lower spine, which the arms do not hang from", () => {
    const track = makeTrack();
    const desireAt = (fraction: number) =>
      crossingTime((t) => planUpperBodyStanceYawTarget(targetsAt(t)), fraction);
    const spine1Final = SPINE1_SHARE * MAX_STANCE_YAW_RAD;

    const chestLeads: number[] = [];
    const spine1Leads: number[] = [];
    for (let fraction = 0.1; fraction <= 0.9001; fraction += 0.1) {
      const desire = desireAt(fraction);
      chestLeads.push(
        desire -
          crossingTime((t) => sampleStanceYawTrack(track, t).chestRad, fraction)
      );
      spine1Leads.push(
        desire -
          crossingTime(
            (t) => sampleStanceYawTrack(track, t).spine1Rad,
            fraction,
            0,
            8,
            spine1Final
          )
      );
    }
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    // Measured 0.148 steps of mean lead for the lower spine against 0.018 for
    // the shoulder line: an eightfold split, which is the design. The stagger
    // that produces it is equal and opposite about the shoulder line, so none
    // of that lead reaches the yaw the grips are solved against.
    expect(mean(spine1Leads)).toBeGreaterThan(0.1);
    expect(mean(spine1Leads)).toBeGreaterThan(4 * mean(chestLeads));

    // The lead is anticipation, not a permanent offset: the ease-out settles
    // the chest onto the geometry's own arrival rather than overshooting past
    // it and holding early.
    const desireArrival = desireAt(0.98);
    const trackArrival = crossingTime(
      (t) => sampleStanceYawTrack(track, t).chestRad,
      0.98
    );
    expect(Math.abs(trackArrival - desireArrival)).toBeLessThan(0.1);
  });

  it("keeps angular velocity continuous across a step boundary", () => {
    const track = makeTrack();
    // The turn is in flight here, so this is a real carry-through, not a hold.
    expect(Math.abs(stanceYawAngularVelocity(track, 5))).toBeGreaterThan(0.4);
    const before = stanceYawAngularVelocity(track, 5 - 1e-3);
    const after = stanceYawAngularVelocity(track, 5 + 1e-3);
    expect(Math.abs(after - before)).toBeLessThan(0.02);

    // And no jump anywhere across the whole turn.
    let worst = 0;
    let previous = stanceYawAngularVelocity(track, TURN_START - 0.5);
    for (let t = TURN_START - 0.5; t <= TURN_END + 0.5; t += 0.002) {
      const velocity = stanceYawAngularVelocity(track, t);
      worst = Math.max(worst, Math.abs(velocity - previous));
      previous = velocity;
    }
    expect(worst).toBeLessThan(0.05);
    // A turn actually happened, so continuity is not trivially satisfied.
    expect(Math.abs(stanceYawAngularVelocity(track, 4.6))).toBeGreaterThan(0.5);
  });

  it("breaks the torso successively rather than all at once", () => {
    const track = makeTrack();
    const spine1Final = SPINE1_SHARE * MAX_STANCE_YAW_RAD;
    const spine1Arrival = crossingTime(
      (t) => sampleStanceYawTrack(track, t).spine1Rad,
      0.9,
      0,
      8,
      spine1Final
    );
    const chestArrival = crossingTime(
      (t) => sampleStanceYawTrack(track, t).chestRad,
      0.9
    );
    const headArrival = crossingTime(
      (t) => sampleStanceYawTrack(track, t).headRad,
      0.9
    );

    expect(spine1Arrival).toBeLessThan(chestArrival);
    expect(chestArrival).toBeLessThan(headArrival);
    // Measured spread 0.260 steps, roughly 170 ms: a real separation the eye
    // can read, not a rounding artefact.
    expect(headArrival - spine1Arrival).toBeGreaterThan(0.15);
  });

  it("holds the historical split and no head lag at a settled facing", () => {
    const track = makeTrack();
    const held = sampleStanceYawTrack(track, 6.5);
    // 5e-4 rad is 0.03 degrees: the plateau epsilon lets a settled hold drift
    // by less than the planner's own numerical wobble, which is the point of
    // having an epsilon at all.
    expect(Math.abs(held.headLagRad)).toBeLessThan(5e-4);
    expect(held.spine1Rad / held.chestRad).toBeCloseTo(SPINE1_SHARE, 3);
    expect(held.chestRad).toBeCloseTo(MAX_STANCE_YAW_RAD, 3);
  });

  it("never overshoots the shoulder limit", () => {
    const track = makeTrack();
    let peak = 0;
    for (let t = 0; t <= 8; t += 0.002) {
      peak = Math.max(peak, Math.abs(sampleStanceYawTrack(track, t).chestRad));
    }
    // Monotone Hermite cannot ring past its keys, which is why the 87-degree
    // limit stays three degrees clear of the 90-degree shoulder degeneracy.
    expect(peak).toBeLessThanOrEqual(MAX_STANCE_YAW_RAD + 1e-9);
  });

  it("exposes the prop signal alongside the curve for the same score time", () => {
    const track = makeTrack();
    const sample = sampleStanceYawTrackDetail(track, 3.75);
    expect(sample.lateralM).toBeCloseTo(lateralAt(3.75), 2);
    expect(sample.desireRad).toBeCloseTo(
      planUpperBodyStanceYawTarget(targetsAt(3.75)),
      2
    );
  });

  it("summarises the turn in the units the acceptance criteria are written in", () => {
    const track = makeTrack();
    const summary = describeStanceYawTrack(track);

    // Anticipation: positive means the body moved before the geometry asked.
    expect(summary.onsetLeadSteps).not.toBeNull();
    expect(summary.onsetLeadSteps!).toBeGreaterThan(0.1);

    // Successive breaking, read as arrival order through the largest turn.
    const { hips, spine1, chest, spine2, head } = summary.arrivals;
    // The animator rotates no hip bone, so there is no arrival to report and
    // the summary says so rather than inventing a zero.
    expect(hips).toBeNull();
    expect(spine1).not.toBeNull();
    expect(head).not.toBeNull();
    expect(spine1!).toBeLessThan(chest!);
    expect(chest!).toBeLessThan(spine2!);
    expect(spine2!).toBeLessThan(head!);
    expect(head! - spine1!).toBeGreaterThan(0.15);

    // Both timing offsets are real and neither escapes its ceiling. The head
    // drag saturates rather than clipping, so even this fixture's nine-tenths
    // -of-a-step unwind stays strictly inside the bound instead of sitting on
    // it with a flat top.
    expect(summary.peakSpineStaggerRad).toBeGreaterThan(0.02);
    expect(summary.peakSpineStaggerRad).toBeLessThan(MAX_SPINE_STAGGER_RAD);
    expect(summary.peakHeadLagRad).toBeGreaterThan(0.05);
    expect(summary.peakHeadLagRad).toBeLessThan(MAX_HEAD_LAG_RAD);
    expect(summary.turnWindow).not.toBeNull();
  });

  it("carries velocity through the loop seam", () => {
    // A turn that runs across the loop point must not stop and restart there.
    const track = buildStanceYawTrack({
      targetsAtScoreTime: (t) => {
        // Ramp centred on the seam: square mid-sequence, side-on at the wrap.
        const x = FULL_LATERAL_M * smoothstep(Math.abs(t - 4) / 3.5);
        return { left: { x, z: 0.5 }, right: { x, z: 0.5 } };
      },
      motionStepCount: 8,
      loop: true,
    });
    expect(track).not.toBeNull();
    const before = stanceYawAngularVelocity(track!, 7.99);
    const after = stanceYawAngularVelocity(track!, 0.01);
    expect(Math.abs(after - before)).toBeLessThan(0.2);
  });
});

describe("stance yaw track lane floors", () => {
  const BASE = 0.16;
  const NEED = 0.24;
  const NEED_FROM = 6;
  const NEED_TO = 6.5;

  /** The fixture turn, with the left hand's staff needing a wider lane
   *  through part of the side hold. Records every check it is asked for. */
  function trackWithNeed() {
    const checks: { scoreTime: number; chestRad: number; desireRad: number }[] =
      [];
    const track = buildStanceYawTrack({
      targetsAtScoreTime: targetsAt,
      motionStepCount: 8,
      loop: false,
      sideOnLaneFloorAt: (scoreTime, pose, desireRad) => {
        checks.push({ scoreTime, chestRad: pose.chestRad, desireRad });
        const needed = scoreTime >= NEED_FROM && scoreTime <= NEED_TO;
        return { leftM: needed ? NEED : BASE, rightM: BASE };
      },
    });
    expect(track).not.toBeNull();
    return { track: track!, checks };
  }

  it("checks only where the corridor is open, against the chest the track poses", () => {
    const { track, checks } = trackWithNeed();
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.length).toBeLessThan(track.rawTimes.length);
    for (const check of checks) {
      expect(check.chestRad).toBe(
        sampleStanceYawTrack(track, check.scoreTime).chestRad
      );
      expect(stanceSideBlend(check.chestRad, check.desireRad)).toBeGreaterThan(
        0
      );
    }
  });

  it("opens a lane ahead of the moment that needs it and holds it through", () => {
    const { track } = trackWithNeed();
    const leftAt = (t: number) => stanceLaneFloorAt(track, t)!.leftM;
    for (let t = NEED_FROM; t <= NEED_TO; t += 0.05) {
      expect(leftAt(t)).toBeGreaterThanOrEqual(NEED - 1e-9);
    }
    expect(leftAt(NEED_FROM - 0.1)).toBeGreaterThan(BASE);
    expect(leftAt(NEED_FROM - 0.1)).toBeLessThan(NEED);
    // The other hand never needed more than the body's lane.
    expect(Math.max(...track.laneFloorRight!)).toBeCloseTo(BASE, 9);
    // Far from any need the floor asks for nothing past the body's lane.
    expect(leftAt(1)).toBeLessThanOrEqual(BASE);
  });

  it("opens and closes a lane no faster than the lane rate", () => {
    const { track } = trackWithNeed();
    const perStep = track.rawTimes.length / track.stepCount;
    const rate = LANE_RATE_M_PER_STEP / perStep;
    for (const floor of [track.laneFloorLeft!, track.laneFloorRight!]) {
      for (let i = 1; i < floor.length; i++) {
        expect(Math.abs(floor[i]! - floor[i - 1]!)).toBeLessThanOrEqual(
          rate + 1e-12
        );
      }
    }
  });

  it("hands the planned lane to the frame's corridor", () => {
    const { track } = trackWithNeed();
    const t = 6.25;
    const prop = { worldPosition: new Vector3(FULL_LATERAL_M, 0, 0) };
    const sized = resolveTrackedUpperBodyStance(
      track,
      t,
      PlaneMode.WALL,
      prop,
      prop
    );
    const bodyLane = resolveTrackedUpperBodyStance(
      makeTrack(),
      t,
      PlaneMode.WALL,
      prop,
      prop
    );
    expect(sized.sideBlend).toBeGreaterThan(0);
    // The chest turns toward the performer's left, so the left grip goes
    // upstage by the extra lane.
    expect(sized.leftDepthOffsetM - bodyLane.leftDepthOffsetM).toBeCloseTo(
      -sized.sideBlend * (NEED - BASE),
      9
    );
    expect(sized.rightDepthOffsetM).toBeCloseTo(bodyLane.rightDepthOffsetM, 12);
  });

  it("plans no floors without a check or when the chest never turns side-on", () => {
    expect(makeTrack().laneFloorLeft).toBeNull();
    expect(stanceLaneFloorAt(makeTrack(), 6.25)).toBeNull();
    expect(stanceLaneFloorAt(null, 6.25)).toBeNull();
    const square = buildStanceYawTrack({
      // Opposed grips keep the chest square throughout.
      targetsAtScoreTime: () => ({
        left: { x: 0.3, z: 0.5 },
        right: { x: -0.3, z: 0.5 },
      }),
      motionStepCount: 8,
      loop: false,
      sideOnLaneFloorAt: () => {
        throw new Error("checked a lane with the chest square");
      },
    });
    expect(square?.laneFloorLeft).toBeNull();
    expect(square?.laneFloorRight).toBeNull();
  });

  it("opens a lane across the loop seam", () => {
    // Side-on throughout, with the need just after the seam.
    const held = (loop: boolean) => {
      const options: StanceYawTrackOptions = {
        targetsAtScoreTime: () => ({
          left: { x: FULL_LATERAL_M, z: 0.5 },
          right: { x: FULL_LATERAL_M, z: 0.5 },
        }),
        motionStepCount: 8,
        loop,
        sideOnLaneFloorAt: (scoreTime) => ({
          leftM: scoreTime <= 0.5 ? NEED : BASE,
          rightM: BASE,
        }),
      };
      return buildStanceYawTrack(options)!;
    };
    expect(stanceLaneFloorAt(held(true), 7.9)!.leftM).toBeGreaterThan(BASE);
    expect(stanceLaneFloorAt(held(true), 8.25)!.leftM).toBeCloseTo(NEED, 9);
    expect(stanceLaneFloorAt(held(false), 7.9)!.leftM).toBeCloseTo(BASE, 9);
  });
});
