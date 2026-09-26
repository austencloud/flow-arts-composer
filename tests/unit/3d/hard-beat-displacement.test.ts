import { beforeAll, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { Plane, PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
  type StanceYawTrack,
} from "$lib/shared/3d/collision/stance-yaw-track";
import {
  planUpperBodyStanceYawTarget,
  stanceSideBlend,
  stanceTargetsForPropStates,
} from "$lib/shared/3d/collision/upper-body-stance-planner";
import {
  HARD_BEAT_MIN_RADIUS_M,
  LANE_KINDS,
  HARD_BEAT_RAMP_STEPS,
  buildHardBeatTrack,
  describeHardBeatTrack,
  displaceProp,
  sampleHardBeatTrack,
  type HardBeatProp,
  type HardBeatSample,
  type HardBeatScoreSource,
  type HardBeatTrack,
} from "$lib/shared/3d/collision/hard-beat-displacement";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

/**
 * The rules for moving a staff so the hand can hold it: only along its own
 * radial line out of the grid centre, and in depth; never around the grid. The
 * corpus checks run the whole prop-continuity corpus on the wall plane without
 * rigs, so they pin what the planner hands the renderers, not what an arm
 * solve does with it.
 */

const HEIGHT_M = 1.905;
/** Finer than both the dense track (48) and the scoreboard (60). */
const CHECK_SAMPLES_PER_STEP = 240;
/** The animator's pair-routing rule (`ElbowPoleComputer.computePairRouting`). */
const SHOULDER_HALF_WIDTH_M = 0.2;
const PAIRED_CROSS_ENGAGE = 0.25;
const LAYER_HEIGHT_DEAD_ZONE_M = 0.04;
const REPORT_EPS_M = 0.001;
/** The approved caps, pinned here so a change to the planner's defaults
 *  cannot loosen the checks that police them. */
const APPROVED_LIMITS = {
  radialInMaxM: 0.25,
  radialOutMaxM: 0,
  laneDepthMaxM: 0.1,
};
/** The planner's point of no return for the chest turning side-on. */
const COMMITTED_SIDE_BLEND = 0.5;
/** Crossed corpus frames (authored crossing >= 0.35, 240 samples per step)
 *  whose routing kind the displacement changes. */
const ROUTING_CHANGED_FRAMES_MAX = 368;

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];

interface Movement {
  radialInM: number;
  depthM: number;
  /** Whatever part of the move is neither radial nor depth. */
  offAxisM: number;
}

/** Split a displacement into its radial, depth and off-axis parts. */
function decompose(authored: Vector3, displaced: Vector3): Movement {
  const delta = displaced.clone().sub(authored);
  const radius = authored.length();
  if (radius < 1e-9)
    return {
      radialInM: 0,
      depthM: delta.z,
      offAxisM: Math.hypot(delta.x, delta.y),
    };
  const unit = authored.clone().divideScalar(radius);
  const zOffUnit = new Vector3(0, 0, 1).addScaledVector(unit, -unit.z);
  const along = delta.dot(unit);
  const rest = delta.clone().addScaledVector(unit, -along);
  const zSq = zOffUnit.lengthSq();
  const depthM = zSq > 1e-12 ? rest.dot(zOffUnit) / zSq : 0;
  const offAxis = rest.addScaledVector(zOffUnit, -depthM);
  return {
    radialInM: -(along - depthM * unit.z),
    depthM,
    offAxisM: offAxis.length(),
  };
}

type RoutingKind = "natural" | "left-over" | "right-over";

function routing(
  left: Vector3,
  right: Vector3
): { crossing: number; kind: RoutingKind } {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  // Grid +x is the performer's left; the animator's lateral points right.
  const crossing = Math.min(
    clamp01(-left.x / SHOULDER_HALF_WIDTH_M),
    clamp01(right.x / SHOULDER_HALF_WIDTH_M)
  );
  if (crossing < PAIRED_CROSS_ENGAGE) return { crossing, kind: "natural" };
  return {
    crossing,
    kind:
      left.y - right.y >= -LAYER_HEIGHT_DEAD_ZONE_M
        ? "left-over"
        : "right-over",
  };
}

interface Frame {
  t: number;
  step: number;
  sample: HardBeatSample;
  authored: Record<Side, HardBeatProp | null>;
  displaced: Record<Side, HardBeatProp | null>;
}

interface CorpusCase {
  id: string;
  source: ReturnType<typeof createCharacterInstanceState>;
  stanceTrack: StanceYawTrack | null;
  build: () => HardBeatTrack | null;
  track: HardBeatTrack;
  frames: Frame[];
}

function sampleTimes(track: HardBeatTrack): number[] {
  const total = track.stepCount * CHECK_SAMPLES_PER_STEP;
  const times: number[] = [];
  for (let k = 0; k < total; k++) times.push(k / CHECK_SAMPLES_PER_STEP);
  if (!track.loop) times.push(track.stepCount - 1e-6);
  return times;
}

let corpus: CorpusCase[] = [];

beforeAll(() => {
  corpus = propContinuityCorpus().map((entry) => {
    const state = createCharacterInstanceState(
      { id: `hard-beat-${entry.id}`, positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    state.setPlaneMode(PlaneMode.WALL);
    state.loadSequence(entry.sequence);
    const stanceTrack = buildStanceYawTrackForSource(state, PlaneMode.WALL);
    const build = () =>
      buildHardBeatTrack({
        source: state,
        stanceTrack: buildStanceYawTrackForSource(state, PlaneMode.WALL),
        heightM: HEIGHT_M,
        planeMode: PlaneMode.WALL,
      });
    const track = build();
    if (!track) throw new Error(`${entry.id}: no hard-beat track`);
    const frames = sampleTimes(track).map((t) => {
      const { left, right } = state.propStatesAtScoreTime(t);
      const sample = sampleHardBeatTrack(track, t);
      return {
        t,
        step: Math.floor(t),
        sample,
        authored: { left, right },
        displaced: {
          left: displaceProp(left, sample.left),
          right: displaceProp(right, sample.right),
        },
      };
    });
    return { id: entry.id, source: state, stanceTrack, build, track, frames };
  });
}, 600_000);

describe("hard-beat displacement over the corpus", () => {
  it("moves a staff only along its radial line and in depth", () => {
    let worstOffAxis = 0;
    let worstAngle = 0;
    let moved = 0;
    for (const c of corpus) {
      for (const frame of c.frames) {
        for (const side of SIDES) {
          const authored = frame.authored[side];
          const displaced = frame.displaced[side];
          if (!authored || !displaced) continue;
          const a = authored.worldPosition;
          const d = displaced.worldPosition;
          const m = decompose(a, d);
          worstOffAxis = Math.max(worstOffAxis, m.offAxisM);
          if (authored.plane !== Plane.WALL) {
            expect(
              Math.abs(m.depthM),
              `${c.id} t=${frame.t} ${side}`
            ).toBeLessThan(1e-12);
          }
          if (displaced !== authored) moved++;
          // The staff's angle in the wall plane, which is what an audience reads.
          if (authored.plane === Plane.WALL && Math.hypot(a.x, a.y) > 1e-3) {
            const turn = Math.abs(
              Math.atan2(a.x * d.y - a.y * d.x, a.x * d.x + a.y * d.y)
            );
            worstAngle = Math.max(worstAngle, turn);
          }
        }
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(worstOffAxis).toBeLessThan(1e-9);
    expect(worstAngle).toBeLessThan(1e-9);
  });

  it("holds the caps and the minimum radius", () => {
    const limits = APPROVED_LIMITS;
    for (const c of corpus) {
      for (const frame of c.frames) {
        for (const side of SIDES) {
          const hand = frame.sample[side];
          const where = `${c.id} t=${frame.t} ${side}`;
          expect(hand.radialInM, where).toBeGreaterThanOrEqual(0);
          expect(hand.radialInM, where).toBeLessThanOrEqual(
            limits.radialInMaxM + 1e-12
          );
          expect(Math.abs(hand.depthM), where).toBeLessThanOrEqual(
            limits.laneDepthMaxM + 1e-12
          );

          const authored = frame.authored[side];
          const displaced = frame.displaced[side];
          if (!authored || !displaced) continue;
          const radius = authored.worldPosition.length();
          const m = decompose(authored.worldPosition, displaced.worldPosition);
          // Inward only: nothing moves outward yet.
          expect(m.radialInM, where).toBeGreaterThanOrEqual(
            -limits.radialOutMaxM - 1e-12
          );
          expect(m.radialInM, where).toBeLessThanOrEqual(
            limits.radialInMaxM + 1e-12
          );
          expect(radius - m.radialInM, where).toBeGreaterThanOrEqual(
            Math.min(radius, HARD_BEAT_MIN_RADIUS_M) - 1e-9
          );
        }
      }
    }
  });

  it("keeps each staff on its side and never adds elbow routing the score lacks", () => {
    let crossedFrames = 0;
    let routingChanged = 0;
    for (const c of corpus) {
      for (const frame of c.frames) {
        for (const side of SIDES) {
          const a = frame.authored[side]?.worldPosition;
          const d = frame.displaced[side]?.worldPosition;
          if (!a || !d || Math.abs(a.x) < 1e-9) continue;
          expect(Math.sign(d.x), `${c.id} t=${frame.t} ${side}`).toBe(
            Math.sign(a.x)
          );
        }
        const { left, right } = frame.authored;
        if (!left || !right) continue;
        const before = routing(left.worldPosition, right.worldPosition);
        const after = routing(
          frame.displaced.left!.worldPosition,
          frame.displaced.right!.worldPosition
        );
        // Radial moves only shrink lateral offsets, so crossing can only drop.
        expect(after.crossing, `${c.id} t=${frame.t}`).toBeLessThanOrEqual(
          before.crossing + 1e-12
        );
        if (before.crossing < 0.35) continue;
        crossedFrames++;
        if (after.kind !== before.kind) routingChanged++;
      }
    }
    expect(crossedFrames).toBeGreaterThan(0);
    // The goal is 0. Each hand's radial move scales its lateral and height
    // offsets by its own factor, so a crossed hand near north or south can drop
    // inside the animator's 5 cm engage band, and near-equal heights can swap
    // which hand routes over. The planner cuts back the needier hand's move
    // where that holds the routing, sample by sample, before ramping; holding
    // it again after ramping, with a 5 mm margin, put more forearms in contact
    // on the scoreboard. This count is an open deviation from the plan and a
    // ratchet: lower it, never raise it.
    expect(routingChanged).toBeLessThanOrEqual(ROUTING_CHANGED_FRAMES_MAX);
  });

  it("ramps in and out no faster than its kernel allows, across the loop seam too", () => {
    // Max over smoothstep kernels of half-width RAMP: slope <= 1.5 / RAMP
    // times the curve's own peak, per step.
    const slope = 1.5 / HARD_BEAT_RAMP_STEPS;
    for (const c of corpus) {
      const curves = {
        leftRadialIn: c.track.leftRadialIn,
        rightRadialIn: c.track.rightRadialIn,
        leftDepth: c.track.leftDepth,
        rightDepth: c.track.rightDepth,
      };
      const read: Record<keyof typeof curves, (s: HardBeatSample) => number> = {
        leftRadialIn: (s) => s.left.radialInM,
        rightRadialIn: (s) => s.right.radialInM,
        leftDepth: (s) => s.left.depthM,
        rightDepth: (s) => s.right.depthM,
      };
      for (const key of Object.keys(curves) as (keyof typeof curves)[]) {
        const peak = Math.max(0, ...Array.from(curves[key], Math.abs));
        const bound = (slope * peak) / CHECK_SAMPLES_PER_STEP + 1e-12;
        const values = c.frames.map((frame) => read[key](frame.sample));
        if (c.track.loop) values.push(values[0]!);
        for (let i = 1; i < values.length; i++) {
          expect(
            Math.abs(values[i]! - values[i - 1]!),
            `${c.id} ${key} at t=${c.frames[i % c.frames.length]!.t}`
          ).toBeLessThanOrEqual(bound);
        }
      }
    }
  });

  it("rebuilds the same track from the same score", () => {
    for (const c of corpus) {
      const again = c.build();
      expect(again, c.id).toEqual(c.track);
    }
  });

  it("lists every displaced sample in its report", () => {
    let displacedSamples = 0;
    for (const c of corpus) {
      const beats = new Map(
        c.track.report.map((beat) => [`${beat.step}|${beat.hand}`, beat])
      );
      for (const frame of c.frames) {
        for (const side of SIDES) {
          const authored = frame.authored[side];
          const displaced = frame.displaced[side];
          if (!authored || !displaced) continue;
          const m = decompose(authored.worldPosition, displaced.worldPosition);
          if (m.radialInM <= REPORT_EPS_M && Math.abs(m.depthM) <= REPORT_EPS_M)
            continue;
          displacedSamples++;
          const where = `${c.id} t=${frame.t} ${side}`;
          const beat = beats.get(`${frame.step}|${side}`);
          expect(beat, where).toBeDefined();
          expect(beat!.radialInMaxM, where).toBeGreaterThanOrEqual(
            m.radialInM - 1e-9
          );
          expect(beat!.laneTowardAudienceMaxM, where).toBeGreaterThanOrEqual(
            m.depthM - 1e-9
          );
          expect(beat!.laneAwayMaxM, where).toBeGreaterThanOrEqual(
            -m.depthM - 1e-9
          );
          if (m.radialInM > REPORT_EPS_M)
            expect(beat!.causes, where).toContain("reach");
          if (Math.abs(m.depthM) > REPORT_EPS_M)
            expect(beat!.laneRule, where).not.toBeNull();
        }
      }
      expect(describeHardBeatTrack(c.track)).not.toBe("no hard-beat track");
    }
    expect(displacedSamples).toBeGreaterThan(0);
  });

  it("never sends a lane against the stance corridor once the chest is side-on", () => {
    let committed = 0;
    let crossedLanes = 0;
    const against: string[] = [];
    const crossedKind = LANE_KINDS.indexOf("crossed-lane");
    for (const c of corpus) {
      const perStep = c.track.samplesPerStep;
      for (let i = 0; i < c.track.leftDepth.length; i++) {
        const t = i / perStep;
        const { left, right } = c.source.propStatesAtScoreTime(t);
        if (!left || !right) continue;
        const stance = resolveTrackedUpperBodyStance(
          c.stanceTrack,
          t,
          PlaneMode.WALL,
          left,
          right,
          null
        );
        const sideBlend = stanceSideBlend(
          stance.segments.chestRad,
          planUpperBodyStanceYawTarget(
            stanceTargetsForPropStates(PlaneMode.WALL, left, right)
          )
        );
        const corridor = stance.leftDepthOffsetM - stance.rightDepthOffsetM;
        if (sideBlend < COMMITTED_SIDE_BLEND || corridor === 0) continue;
        committed++;
        // Positive when the corridor already puts the left hand downstage.
        const sample = sampleHardBeatTrack(c.track, t);
        const lane = sample.left.depthM - sample.right.depthM;
        // Arms crossed in front of the chest keep their lane side-on.
        if (c.track.laneKind[i] === crossedKind && Math.abs(lane) > 0.01)
          crossedLanes++;
        if (
          Math.sign(corridor) * sample.left.depthM < -1e-12 ||
          Math.sign(corridor) * sample.right.depthM > 1e-12 ||
          Math.sign(corridor) * lane < -1e-12
        ) {
          against.push(`${c.id} t=${t.toFixed(3)} lane ${lane.toFixed(4)}`);
        }
      }
    }
    expect(committed).toBeGreaterThan(0);
    expect(crossedLanes).toBeGreaterThan(0);
    expect(against.slice(0, 10)).toEqual([]);
  });

  it("reports pairs whose arm lines cross as crossed lanes", () => {
    const causes = new Set(
      corpus.flatMap((c) => c.track.report.flatMap((beat) => beat.causes))
    );
    expect(causes).toContain("crossed-lane");
    expect(causes).toContain("beta-lane");
  });
});

function wallProp(x: number, y: number): HardBeatProp {
  return { worldPosition: new Vector3(x, y, 0), plane: Plane.WALL };
}

/** A pair held still for the whole score. */
function heldPair(
  left: HardBeatProp | null,
  right: HardBeatProp | null,
  steps = 4
): HardBeatScoreSource {
  return {
    motionStepCount: steps,
    loop: true,
    propStatesAtScoreTime: () => ({ left, right }),
  };
}

function build(source: HardBeatScoreSource, laneForwardShare?: number) {
  const track = buildHardBeatTrack({
    source,
    stanceTrack: null,
    heightM: HEIGHT_M,
    planeMode: PlaneMode.WALL,
    laneForwardShare,
  });
  expect(track).not.toBeNull();
  return track!;
}

describe("hard-beat lanes", () => {
  it("sends the left hand of a beta pair downstage, splits the lane, and reports the rule", () => {
    const track = build(heldPair(wallProp(0, 0.3), wallProp(0, 0.3)));
    const sample = sampleHardBeatTrack(track, 1.5);
    expect(sample.downstageHand).toBe("left");
    expect(sample.left.depthM).toBeCloseTo(0.06, 9);
    expect(sample.right.depthM).toBeCloseTo(-0.06, 9);

    for (const hand of ["left", "right"] as const) {
      const beats = track.report.filter((beat) => beat.hand === hand);
      expect(beats.map((beat) => beat.step)).toEqual([0, 1, 2, 3]);
      for (const beat of beats) {
        expect(beat.laneRule).toBe("default-left-downstage");
        expect(beat.causes).toContain("beta-lane");
        if (hand === "left")
          expect(beat.laneTowardAudienceMaxM).toBeCloseTo(0.06, 9);
        else expect(beat.laneAwayMaxM).toBeCloseTo(0.06, 9);
      }
    }
    expect(describeHardBeatTrack(track)).toContain("default-left-downstage");
  });

  it("gives the whole beta lane to the downstage hand when asked to, up to the cap", () => {
    const track = build(heldPair(wallProp(0, 0.3), wallProp(0, 0.3)), 1);
    const sample = sampleHardBeatTrack(track, 0.5);
    // The 0.12 m beta lane, stopped at one hand's 0.10 m cap.
    expect(sample.left.depthM).toBeCloseTo(APPROVED_LIMITS.laneDepthMaxM, 9);
    expect(sample.right.depthM).toBe(0);
  });

  it("gives a north/south pair no lane", () => {
    for (const [left, right] of [
      [wallProp(0, 0.3), wallProp(0, -0.3)],
      [wallProp(0, -0.3), wallProp(0, 0.3)],
    ] as const) {
      const track = build(heldPair(left, right));
      expect(Array.from(track.downstage).every((v) => v === 0)).toBe(true);
      expect(Array.from(track.leftDepth).every((v) => v === 0)).toBe(true);
      expect(Array.from(track.rightDepth).every((v) => v === 0)).toBe(true);
      expect(sampleHardBeatTrack(track, 2.25).downstageHand).toBeNull();
      for (const beat of track.report) {
        expect(beat.laneRule).toBeNull();
        expect(beat.causes).not.toContain("beta-lane");
        expect(beat.causes).not.toContain("crossed-lane");
        expect(beat.causes).not.toContain("adjacent-lane");
      }
    }
  });

  it("sends the over hand of a crossed pair downstage, as elbow routing does", () => {
    // Both hands across and above the shoulders, so the arm lines cross in the
    // audience view; the left is higher, so it routes over.
    const track = build(heldPair(wallProp(-0.3, 0.1), wallProp(0.3, 0)));
    const sample = sampleHardBeatTrack(track, 0.75);
    expect(sample.downstageHand).toBe("left");
    expect(sample.left.depthM).toBeGreaterThan(0);
    const beat = track.report.find((b) => b.hand === "left" && b.step === 0);
    expect(beat?.laneRule).toBe("over-hand-downstage");
    expect(beat?.causes).toContain("crossed-lane");
  });

  it("keeps a crossed pair's elbow routing when one hand needs more reach", () => {
    // Level and mirrored, so the left routes over on the tie, and its lane
    // takes it toward the audience, further from its shoulder than the right.
    const left = wallProp(-0.3, 0.4);
    const right = wallProp(0.3, 0.4);
    const track = build(heldPair(left, right));
    const sample = sampleHardBeatTrack(track, 1.5);
    expect(sample.left.depthM).toBeGreaterThan(0);
    expect(sample.left.radialInM).toBeGreaterThan(sample.right.radialInM);
    const l = displaceProp(left, sample.left)!.worldPosition;
    const r = displaceProp(right, sample.right)!.worldPosition;
    expect(l.y - r.y).toBeGreaterThanOrEqual(-LAYER_HEIGHT_DEAD_ZONE_M);
    // The move was cut back to hold the routing; the palm is left short.
    const beat = track.report.find((b) => b.hand === "left" && b.step === 1);
    expect(beat?.shortfallMaxM).toBeGreaterThan(0);
  });

  it("leaves a performer without a score, or off the wall mode, untracked", () => {
    const pair = heldPair(wallProp(0, 0.3), wallProp(0, 0.3));
    for (const motionStepCount of [0, Number.NaN]) {
      expect(
        buildHardBeatTrack({
          source: { ...pair, motionStepCount },
          stanceTrack: null,
          heightM: HEIGHT_M,
        })
      ).toBeNull();
    }
    expect(
      buildHardBeatTrack({
        source: pair,
        stanceTrack: null,
        heightM: HEIGHT_M,
        planeMode: PlaneMode.DUAL_WHEEL,
      })
    ).toBeNull();
    const prop = wallProp(0.2, 0.2);
    expect(displaceProp(prop, sampleHardBeatTrack(null, 1).left)).toBe(prop);
  });

  it("moves a prop at the grid centre in depth only", () => {
    const centred = displaceProp(wallProp(0, 0), {
      radialInM: 0.1,
      depthM: 0.05,
    })!.worldPosition;
    expect(centred.toArray()).toEqual([0, 0, 0.05]);
  });
});
