/**
 * Foot contact
 *
 * A foot bearing weight is not necessarily a foot whose ankle is near the
 * floor. Sprinting, dancing, wearing a heel, or landing on a hill all put the
 * whole body over the ball of the foot with the ankle at rest height, and the
 * probe used to test the ankle alone against a floor pooled from both ankles.
 *
 * That is not a hypothetical. `ch07` running a circle at 3.9 m/s registered
 * zero right-foot contacts across sixty-two seconds -- its right foot lands
 * forefoot-first and its ankle sits 14.5cm up, three times the 4.5cm band --
 * while its toe was two and a half centimetres off the floor the whole time.
 * Nine downstream rows went red (cadence 83 against a 155-185 band, step
 * length 0.0cm, duty factor 0.15) for a reason that had nothing to do with the
 * gait, which is worse than reporting nothing: it sends the next person to
 * debug a limp that is not there.
 *
 * The fixtures below are hand-built rather than driven, so they hold the one
 * property under test still. The driven suites cannot: at 3.9 m/s the run
 * clip's own ground contact lands within a few milliseconds of
 * `minStanceDuration`, so a rig's stance count there moves for reasons that
 * have nothing to do with which joint is being measured.
 */

import { describe, expect, it } from "vitest";

import {
  analyzeGait,
  DEFAULT_THRESHOLDS,
  footFloorY,
  localGroundSeries,
} from "#lib/shared/3d/diagnostics/gait/gait-analysis.js";
import { verdictRows } from "#lib/shared/3d/diagnostics/gait/gait-verdicts.js";
import type {
  FootFrame,
  GaitFrame,
  Vec3,
} from "#lib/shared/3d/diagnostics/gait/gait-frame.js";

const FPS = 60;
const DT = 1 / FPS;
/** Long enough that every stance clears `minStanceDuration` several times over. */
const STANCE_FRAMES = 18;
const SWING_FRAMES = 18;
const CYCLE = STANCE_FRAMES + SWING_FRAMES;
const SPEED = 2.4;

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

interface FootShape {
  /** Ankle height while bearing weight, metres above the floor. */
  stanceAnkle: number;
  /** Ball height while bearing weight. */
  stanceToe: number;
}

/** A foot that rolls through a flat stance: heel and ball both down. */
const FLAT: FootShape = { stanceAnkle: 0.02, stanceToe: 0.012 };
/**
 * A foot that lands on the ball and never lowers its heel. The ankle stays at
 * rest height, far outside the contact band, exactly as `ch07`'s right foot
 * did on the circle.
 */
const FOREFOOT: FootShape = { stanceAnkle: 0.145, stanceToe: 0.012 };

/**
 * One foot through a cycle, given where it is in that cycle.
 *
 * Stance pins the foot in place and holds it at its landing height; swing
 * lifts and carries it forward. Only the heights matter to contact detection,
 * but the horizontal travel has to be right or the report reads a planted foot
 * skating and every slip row goes red for the wrong reason.
 */
function foot(shape: FootShape, phase: number, strideZ: number): FootFrame {
  const stance = phase < STANCE_FRAMES;
  const lift = stance
    ? 0
    : Math.sin(((phase - STANCE_FRAMES) / SWING_FRAMES) * Math.PI) * 0.14;
  const advance = stance
    ? 0
    : ((phase - STANCE_FRAMES) / SWING_FRAMES) * SPEED * (CYCLE * DT);
  const ankleY = shape.stanceAnkle + lift;
  const toeY = shape.stanceToe + lift;
  const z = strideZ + advance;
  return {
    ankle: v(0, ankleY, z),
    toe: v(0, toeY, z + 0.16),
    knee: v(0, ankleY + 0.42, z - 0.02),
    hip: v(0, ankleY + 0.86, z - 0.04),
    // Deep enough that the knee-anatomy pass has a bend direction to read.
    kneeAngle: stance ? 172 : 130,
    claimedContact: stance ? 1 : 0,
  };
}

/** A gait where the two feet land in different postures. */
function gait(left: FootShape, right: FootShape, seconds = 4): GaitFrame[] {
  const frames: GaitFrame[] = [];
  const total = Math.round(seconds * FPS);
  for (let i = 0; i < total; i++) {
    const t = i * DT;
    const travel = SPEED * t;
    const lPhase = i % CYCLE;
    const rPhase = (i + STANCE_FRAMES) % CYCLE;
    // Each foot is pinned where it last touched down.
    const lPlant = Math.floor(i / CYCLE) * SPEED * (CYCLE * DT);
    const rPlant =
      Math.floor((i + STANCE_FRAMES) / CYCLE) * SPEED * (CYCLE * DT) - 0.6;
    frames.push({
      t,
      dt: DT,
      root: v(0, 0, travel),
      facing: 0,
      hips: v(0, 0.92, travel),
      left: foot(left, lPhase, lPlant),
      right: foot(right, rPhase, rPlant),
    });
  }
  return frames;
}

const stancesPerFoot = (frames: GaitFrame[]) => {
  const report = analyzeGait(frames);
  return {
    left: report.stances.filter((s) => s.foot === "left").length,
    right: report.stances.filter((s) => s.foot === "right").length,
    cadence: report.cadence,
    duty: report.dutyFactor,
  };
};

describe("foot contact", () => {
  it("counts a forefoot strike, whose ankle never enters the band", () => {
    const frames = gait(FLAT, FOREFOOT);

    // The fixture has to actually encode the defect, or the assertion below
    // passes for free. Measured against the same floor the analysis uses.
    const ground = localGroundSeries(frames);
    const rightAnkleRise = frames.map((f, i) => f.right.ankle.y - ground[i]!);
    expect(Math.min(...rightAnkleRise)).toBeGreaterThan(
      DEFAULT_THRESHOLDS.contactBand
    );

    const counted = stancesPerFoot(frames);
    expect(counted.right).toBeGreaterThan(0);
    expect(counted.right).toBe(counted.left);
  });

  it("reads the same gait whichever posture each foot lands in", () => {
    const flat = stancesPerFoot(gait(FLAT, FLAT));
    const mixed = stancesPerFoot(gait(FLAT, FOREFOOT));
    const both = stancesPerFoot(gait(FOREFOOT, FOREFOOT));

    for (const measured of [mixed, both]) {
      expect(measured.left).toBe(flat.left);
      expect(measured.right).toBe(flat.right);
      expect(measured.cadence).toBeCloseTo(flat.cadence, 5);
      // Raising a heel changes nothing about how long the foot is down.
      expect(measured.duty).toBeCloseTo(flat.duty, 2);
    }
  });

  it("measures a foot by its lowest tracked joint", () => {
    const heelDown: FootFrame = {
      ankle: v(0, 0.02, 0),
      toe: v(0, 0.3, 0.16),
      knee: v(0, 0.44, 0),
      hip: v(0, 0.88, 0),
      kneeAngle: 175,
      claimedContact: 1,
    };
    expect(footFloorY(heelDown)).toBeCloseTo(0.02, 6);

    const ballDown: FootFrame = { ...heelDown, toe: v(0, 0.012, 0.16) };
    expect(footFloorY(ballDown)).toBeCloseTo(0.012, 6);

    // A rig with no toe bone still reports, on the only joint it has.
    expect(footFloorY({ ...heelDown, toe: null })).toBeCloseTo(0.02, 6);
  });

  it("still reports knee anatomy when no footfall was found at all", () => {
    // Every footfall discarded as too brief to be weight-bearing, which is
    // how this happens in practice: at a run the clip's own ground contact
    // lands within a few milliseconds of the minimum, and four of the twelve
    // shipped characters lost their knee rows to a stance window falling the
    // wrong side of it. Raising the floor is not an alternative construction —
    // the floor is read from the feet, so lifting them lifts it too.
    const report = analyzeGait(gait(FLAT, FLAT), {
      ...DEFAULT_THRESHOLDS,
      minStanceDuration: 2,
    });
    expect(report.stances).toHaveLength(0);

    for (const maneuver of ["walk", "run"] as const) {
      const names = verdictRows(report, "gait", maneuver).map((r) => r.name);
      expect(names, maneuver).toContain("Knee bend plane");
      expect(names, maneuver).toContain("Knee sideways offset");
      expect(names, maneuver).toContain("Knee bends backward");
      // and nothing that describes a footfall it never saw
      expect(names, maneuver).not.toContain("Foot slip per step");
      expect(names, maneuver).not.toContain("Cadence");
    }
  });
});
