import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { Plane, PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
} from "#lib/shared/3d/collision/stance-yaw-track.js";
import {
  buildHardBeatTrack,
  displaceProp,
  sampleHardBeatTrack,
} from "#lib/shared/3d/collision/hard-beat-displacement.js";
import {
  BODY_CLEARANCE_TORSO,
  buildBodyClearanceTrack,
  DEFAULT_BODY_CLEARANCE_MAX_M,
  defaultBodyClearanceModel,
  type BodyClearanceModel,
  type BodyClearanceProp,
  type BodyClearanceScoreSource,
  type StaffLine,
} from "#lib/shared/3d/collision/body-clearance.js";
import {
  BODY_DUCK_MAX_M,
  BODY_RESPONSE_HEAD,
  buildBodyResponseTrack,
  describeBodyResponseTrack,
  NO_BODY_RESPONSE,
  residualChestYaw,
  sampleBodyResponseTrack,
  STEP_LIFT_M,
  STEP_REST_BEATS,
  type BodyResponseTrack,
  type BodyResponseTrackOptions,
  type FootTrack,
} from "#lib/shared/3d/collision/body-response.js";
import { propStateToStaffTarget } from "#lib/shared/3d/services/swept-volume/swept-volume-builder.js";
import { fixedHandDistance } from "#lib/shared/3d/domain/performer-hand-distance.js";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

/**
 * The whole body answering its staffs: reach pulls it toward a grip, a
 * crossing turns it side-on, a staff through the head ducks it, and the feet
 * step under the hips without sliding. Synthetic staffs check each answer; the
 * corpus check runs the prop-continuity corpus at 67 cm (Jade's hug fit) in
 * wall, dual wheel and floor without rigs, measuring with geometry written
 * here rather than the planner's own.
 */

const DEG = Math.PI / 180;
const MODEL: BodyClearanceModel = defaultBodyClearanceModel({
  heightM: 1.905,
  shoulderHalfWidthM: 0.2,
});
/** `propStateToStaffTarget` puts the grid centre this far in front of the
 *  body's axis. */
const GRID_DEPTH_M = 0.3;
const ALONG_Z = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI / 2
);
const ACROSS = new Quaternion();

type Point = { x: number; y: number; z: number };

interface HandSpec {
  /** Grip in the performer frame (the body's axis at x = z = 0). */
  at: Point;
  rotation?: Quaternion;
}

/** A score whose staffs sit where `hands(step)` puts them, per whole step. */
function source(
  steps: number,
  loop: boolean,
  hands: (step: number) => { left: HandSpec | null; right: HandSpec | null }
): BodyClearanceScoreSource {
  const prop = (spec: HandSpec | null): BodyClearanceProp | null =>
    spec && {
      worldPosition: new Vector3(
        spec.at.x,
        spec.at.y,
        spec.at.z - GRID_DEPTH_M
      ),
      worldRotation: spec.rotation ?? ACROSS,
      plane: Plane.WALL,
    };
  return {
    motionStepCount: steps,
    loop,
    propStatesAtScoreTime(scoreTime: number) {
      const step = loop
        ? Math.floor(scoreTime) % steps
        : Math.min(Math.floor(scoreTime), steps - 1);
      const { left, right } = hands(step);
      return { left: prop(left), right: prop(right) };
    },
  };
}

function options(
  src: BodyClearanceScoreSource,
  extra: Partial<BodyResponseTrackOptions> = {}
): BodyResponseTrackOptions {
  return {
    source: src,
    stanceTrack: null,
    heightM: 1.905,
    staffLengthM: 0.6,
    model: MODEL,
    ...extra,
  };
}

/** The shoulder as the model places it, turned by the chest and moved. */
function shoulder(
  model: BodyClearanceModel,
  side: 1 | -1,
  chestRad: number,
  dx = 0,
  dz = 0
): Point {
  const h = model.shoulderHalfWidthM;
  return {
    x: side * h * Math.cos(chestRad) + dx,
    y: model.shoulderDyM,
    z: model.shoulderDzM - side * h * Math.sin(chestRad) + dz,
  };
}

function grip(line: StaffLine): Point {
  return {
    x: (line.a.x + line.b.x) / 2,
    y: (line.a.y + line.b.y) / 2,
    z: (line.a.z + line.b.z) / 2,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** The staffs and chest the planner saw at dense sample i (no hard beat). */
function seenAt(
  src: BodyClearanceScoreSource,
  track: BodyResponseTrack,
  i: number,
  planeMode: PlaneMode = PlaneMode.WALL,
  stanceTrack: Parameters<typeof resolveTrackedUpperBodyStance>[0] = null,
  hardBeatTrack: Parameters<typeof sampleHardBeatTrack>[0] = null
) {
  const t = i / track.samplesPerStep;
  const { left, right } = src.propStatesAtScoreTime(t);
  const wall = planeMode === PlaneMode.WALL;
  const stance = wall
    ? resolveTrackedUpperBodyStance(
        stanceTrack,
        t,
        PlaneMode.WALL,
        left,
        right,
        null
      )
    : null;
  const shift = sampleHardBeatTrack(hardBeatTrack, t);
  const staffs = (
    [
      [displaceProp(left, shift.left), stance?.leftDepthOffsetM ?? 0],
      [displaceProp(right, shift.right), stance?.rightDepthOffsetM ?? 0],
    ] as const
  ).map(([prop, depth]): StaffLine | null => {
    if (!prop) return null;
    const line = propStateToStaffTarget(prop, track.staffHalfLengthM);
    return {
      a: { ...line.tipAWorld, z: line.tipAWorld.z + depth },
      b: { ...line.tipBWorld, z: line.tipBWorld.z + depth },
    };
  });
  return {
    staffs,
    stanceChest: stance?.segments.chestRad ?? 0,
    stanceSpine1: stance?.segments.spine1Rad ?? 0,
  };
}

/** Grip beyond reach, per hand, for a body moved by (dx, dz) with its chest
 *  at `chestRad`. */
function deficits(
  staffs: readonly (StaffLine | null)[],
  model: BodyClearanceModel,
  chestRad: number,
  dx = 0,
  dz = 0
): number[] {
  return staffs.flatMap((line, index) => {
    if (!line) return [];
    const s = shoulder(model, index === 0 ? 1 : -1, chestRad, dx, dz);
    return [Math.max(0, distance(grip(line), s) - model.gripReachM)];
  });
}

/** Hands whose grip sits more than 10 cm behind their shoulder, along the
 *  chest's facing: an arm cannot hold a staff round its back. */
function gripsBehind(
  staffs: readonly (StaffLine | null)[],
  model: BodyClearanceModel,
  chestRad: number,
  dx = 0,
  dz = 0
): number {
  let count = 0;
  staffs.forEach((line, index) => {
    if (!line) return;
    const s = shoulder(model, index === 0 ? 1 : -1, chestRad, dx, dz);
    const g = grip(line);
    const forward =
      (g.x - s.x) * Math.sin(chestRad) + (g.z - s.z) * Math.cos(chestRad);
    if (forward < -0.1) count++;
  });
  return count;
}

function pointsOf(staff: StaffLine, step = 0.01): Point[] {
  const { a, b } = staff;
  const count = Math.max(2, Math.ceil(distance(a, b) / step));
  return Array.from({ length: count + 1 }, (_, k) => ({
    x: a.x + ((b.x - a.x) * k) / count,
    y: a.y + ((b.y - a.y) * k) / count,
    z: a.z + ((b.z - a.z) * k) / count,
  }));
}

/** Into a part's own frame: u across it, v along its facing. */
function turned(p: Point, yaw: number): { u: number; v: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { u: p.x * c - p.z * s, v: p.x * s + p.z * c };
}

/** Inside test straight from the table, each part at its own yaw. */
function insideTorso(
  p: Point,
  yaws: { chest: number; waist: number; pelvis: number },
  model: BodyClearanceModel
): boolean {
  const row = p.y / model.heightScale;
  for (const part of BODY_CLEARANCE_TORSO) {
    const rows = part.rows;
    if (row < rows[0]![0] || row > rows[rows.length - 1]![0]) continue;
    let k = 0;
    while (k < rows.length - 2 && row > rows[k + 1]![0]) k++;
    const lo = rows[k]!;
    const hi = rows[k + 1]!;
    const t = (row - lo[0]) / (hi[0] - lo[0]);
    const half = lo[1] + (hi[1] - lo[1]) * t;
    const front = lo[2] + (hi[2] - lo[2]) * t;
    const back = lo[3] + (hi[3] - lo[3]) * t;
    const { u, v } = turned(p, yaws[part.turn]);
    const sh = model.shoulderHalfWidthM;
    const a = half * sh + model.staffRadiusM;
    const v0 = ((front + back) / 2) * sh;
    const b = ((front - back) / 2) * sh + model.staffRadiusM;
    if ((u / a) ** 2 + ((v - v0) / b) ** 2 < 1 - 1e-6) return true;
  }
  return false;
}

function insideHead(
  p: Point,
  chestRad: number,
  model: BodyClearanceModel
): boolean {
  const s = model.heightScale;
  const r = model.staffRadiusM;
  const { u, v } = turned(p, chestRad);
  const q =
    (u / (BODY_RESPONSE_HEAD.halfWidthM * s + r)) ** 2 +
    ((v - BODY_RESPONSE_HEAD.centreZM * s) /
      (BODY_RESPONSE_HEAD.halfDepthM * s + r)) **
      2 +
    ((p.y - BODY_RESPONSE_HEAD.centreYM * s) /
      (BODY_RESPONSE_HEAD.halfHeightM * s + r)) **
      2;
  return q < 1 - 1e-6;
}

interface BodyPose {
  dx: number;
  dy: number;
  dz: number;
  yaw: number;
  chest: number;
  waist: number;
}

/** Staff points inside the torso and head for a body in `pose`. */
function insideCounts(
  staffs: readonly (StaffLine | null)[],
  pose: BodyPose,
  model: BodyClearanceModel
): { torso: number; head: number } {
  let torso = 0;
  let head = 0;
  for (const staff of staffs) {
    if (!staff) continue;
    for (const p of pointsOf(staff)) {
      const q = { x: p.x - pose.dx, y: p.y - pose.dy, z: p.z - pose.dz };
      if (
        insideTorso(
          q,
          { chest: pose.chest, waist: pose.waist, pelvis: pose.yaw },
          model
        )
      )
        torso++;
      if (insideHead(q, pose.chest, model)) head++;
    }
  }
  return { torso, head };
}

/** The body the track renders at dense sample i. */
function renderedPose(
  track: BodyResponseTrack,
  i: number,
  stanceChest: number,
  stanceSpine1: number
): BodyPose {
  const yaw = track.yaw[i]!;
  const residual = track.chestYaw[i]!;
  const share =
    Math.abs(stanceChest) > 1e-6 ? stanceSpine1 / stanceChest : 0.45;
  return {
    dx: track.offsetX[i]!,
    dy: track.offsetY[i]!,
    dz: track.offsetZ[i]!,
    yaw,
    chest: yaw + residual,
    waist: yaw + residual * share,
  };
}

function restPose(stanceChest: number, stanceSpine1: number): BodyPose {
  return {
    dx: 0,
    dy: 0,
    dz: 0,
    yaw: 0,
    chest: stanceChest,
    waist: stanceSpine1,
  };
}

/** No foot moves while it is down. */
function expectNoSlide(foot: FootTrack) {
  for (let i = 0; i + 1 < foot.lift.length; i++) {
    if (foot.lift[i] === 0 && foot.lift[i + 1] === 0) {
      // Exactly still; a signed zero against a zero is still.
      expect(Math.abs(foot.x[i + 1]! - foot.x[i]!)).toBe(0);
      expect(Math.abs(foot.z[i + 1]! - foot.z[i]!)).toBe(0);
      expect(Math.abs(foot.yaw[i + 1]! - foot.yaw[i]!)).toBe(0);
    }
  }
}

const mid = (track: BodyResponseTrack, step: number) =>
  Math.round(step * track.samplesPerStep);

describe("residual chest yaw", () => {
  it("lets a body turn take over the twist, and follows the body past it", () => {
    const stance = -80 * DEG;
    expect(residualChestYaw(stance, 0)).toBeCloseTo(stance, 12);
    expect(residualChestYaw(stance, -30 * DEG)).toBeCloseTo(-50 * DEG, 12);
    expect(residualChestYaw(stance, -80 * DEG)).toBeCloseTo(0, 12);
    // Past the stance, or against it, the chest goes with the body.
    expect(residualChestYaw(stance, -100 * DEG)).toBeCloseTo(0, 12);
    expect(residualChestYaw(stance, 40 * DEG)).toBeCloseTo(stance, 12);
    expect(residualChestYaw(0, 70 * DEG)).toBe(0);
  });
});

describe("body response track", () => {
  it("plans nothing without a score or a staff length", () => {
    const src = source(4, true, () => ({ left: null, right: null }));
    expect(
      buildBodyResponseTrack({ ...options(src), source: null })
    ).toBeNull();
    expect(
      buildBodyResponseTrack({ ...options(src), staffLengthM: 0 })
    ).toBeNull();
    expect(sampleBodyResponseTrack(null, 1.5)).toEqual(NO_BODY_RESPONSE);
    const still = buildBodyResponseTrack(options(src))!;
    expect(still.steps).toEqual([]);
    expect(describeBodyResponseTrack(still)).toBe("no beats move the body");
  });

  it("moves toward a grip beyond reach on the performer's left", () => {
    const reach = MODEL.gripReachM;
    // Level with the shoulder, 15 cm past reach, staff running front to back.
    const far: HandSpec = {
      at: { x: 0.2 + reach + 0.15, y: MODEL.shoulderDyM, z: MODEL.shoulderDzM },
      rotation: ALONG_Z,
    };
    const src = source(4, false, () => ({ left: far, right: null }));
    const track = buildBodyResponseTrack(options(src))!;
    const i = mid(track, 2);
    const { staffs } = seenAt(src, track, i);
    const chest = track.yaw[i]! + track.chestYaw[i]!;
    expect(deficits(staffs, MODEL, 0)[0]).toBeCloseTo(0.15, 6);
    const after = deficits(
      staffs,
      MODEL,
      chest,
      track.offsetX[i]!,
      track.offsetZ[i]!
    )[0]!;
    expect(track.offsetX[i]!).toBeGreaterThan(0.12);
    expect(after < 0.005 || track.clearance[i]! >= track.maxM - 1e-9).toBe(
      true
    );
    expect(describeBodyResponseTrack(track).split("\n")[1]).toMatch(
      /^step 1: .*left/
    );
  });

  it("turns side-on to a crossing, the body taking over the chest twist", () => {
    // Both grips on the performer's right; the left one 0.5 m right of the
    // left shoulder, across the body.
    const cross: HandSpec = { at: { x: 0.2 - 0.5, y: 0, z: GRID_DEPTH_M } };
    const right: HandSpec = { at: { x: -0.4, y: 0, z: GRID_DEPTH_M } };
    const src = source(6, false, (step) =>
      step >= 1 ? { left: cross, right } : { left: null, right: null }
    );
    const track = buildBodyResponseTrack(options(src))!;
    const i = mid(track, 3.5);
    const { stanceChest } = seenAt(src, track, i);
    expect(stanceChest).toBeLessThan(-60 * DEG);
    expect(track.yaw[i]!).toBeLessThan(-45 * DEG);
    expect(track.clearance[i]!).toBeLessThan(track.maxM - 0.01);
    // Twist plus body stays the stance wherever the body turns no further
    // than it, so the residual shrinks as the yaw grows.
    let checked = 0;
    for (let k = 0; k < track.yaw.length; k++) {
      const seen = seenAt(src, track, k);
      const yaw = track.yaw[k]!;
      if (yaw < seen.stanceChest || yaw > 0) continue;
      expect(yaw + track.chestYaw[k]!).toBeCloseTo(seen.stanceChest, 9);
      checked++;
    }
    // Samples where the body turned past the stance are left out by design.
    expect(checked).toBeGreaterThan(40);
  });

  it("ducks under a staff through the head that no floor move clears", () => {
    const y = BODY_RESPONSE_HEAD.centreYM;
    const z = BODY_RESPONSE_HEAD.centreZM;
    // A cross of two staffs at head height, each longer than the cap: no
    // move within it clears both.
    const src = source(4, false, (step) =>
      step === 2
        ? {
            left: { at: { x: 0, y, z }, rotation: ACROSS },
            right: { at: { x: 0, y, z }, rotation: ALONG_Z },
          }
        : { left: null, right: null }
    );
    const track = buildBodyResponseTrack(options(src, { staffLengthM: 0.67 }))!;
    const i = mid(track, 2.5);
    const { staffs, stanceChest, stanceSpine1 } = seenAt(src, track, i);
    expect(
      insideCounts(staffs, restPose(stanceChest, stanceSpine1), MODEL).head
    ).toBeGreaterThan(0);
    const pose = renderedPose(track, i, stanceChest, stanceSpine1);
    expect(insideCounts(staffs, pose, MODEL).head).toBe(0);
    expect(-pose.dy).toBeGreaterThan(0.1);
    expect(-pose.dy).toBeLessThanOrEqual(BODY_DUCK_MAX_M);
    expect(track.clearance[i]!).toBeLessThan(0.02);
    expect(describeBodyResponseTrack(track)).toMatch(
      /step 2: .*duck \d+\.\d cm/
    );
  });

  it("clears a staff through the head with one answer when one suffices", () => {
    // One staff across the face at head height: stepping back clears it.
    const src = source(4, false, (step) =>
      step === 2
        ? {
            left: {
              at: {
                x: 0,
                y: BODY_RESPONSE_HEAD.centreYM,
                z: BODY_RESPONSE_HEAD.centreZM,
              },
            },
            right: null,
          }
        : { left: null, right: null }
    );
    const track = buildBodyResponseTrack(options(src))!;
    const i = mid(track, 2.5);
    const { staffs, stanceChest, stanceSpine1 } = seenAt(src, track, i);
    const pose = renderedPose(track, i, stanceChest, stanceSpine1);
    expect(insideCounts(staffs, pose, MODEL).head).toBe(0);
    const answers = [
      -pose.dy > 0.005,
      Math.hypot(pose.dx, pose.dz) > 0.005,
      Math.abs(pose.yaw) > 5 * DEG,
    ].filter(Boolean).length;
    expect(answers).toBe(1);
  });

  it("steps once to a sustained move, the leading foot first, without sliding", () => {
    const reach = MODEL.gripReachM;
    const near: HandSpec = {
      at: { x: 0.2 + reach - 0.05, y: MODEL.shoulderDyM, z: MODEL.shoulderDzM },
      rotation: ALONG_Z,
    };
    const far: HandSpec = {
      at: { x: 0.2 + reach + 0.25, y: MODEL.shoulderDyM, z: MODEL.shoulderDzM },
      rotation: ALONG_Z,
    };
    const src = source(8, false, (step) => ({
      left: step >= 2 ? far : near,
      right: null,
    }));
    const track = buildBodyResponseTrack(options(src))!;
    const last = track.yaw.length - 1;
    expect(track.offsetX[last]!).toBeCloseTo(0.25, 2);
    expect(track.steps.map((s) => s.foot)).toEqual(["left", "right"]);
    for (const foot of [track.feet.left, track.feet.right]) {
      expect(Math.max(...foot.lift)).toBeCloseTo(STEP_LIFT_M, 9);
      expect(foot.x[last]!).toBeCloseTo(track.offsetX[last]!, 3);
      expect(foot.z[last]!).toBeCloseTo(track.offsetZ[last]!, 3);
      expectNoSlide(foot);
    }
    // The second foot lifts as the first lands.
    expect(track.steps[1]!.startStep).toBeCloseTo(track.steps[0]!.endStep, 9);
    expect(track.report.some((beat) => beat.steps.length > 0)).toBe(true);
    expect(describeBodyResponseTrack(track)).toMatch(
      /left foot steps, right foot steps/
    );
  });

  it("turns the feet under a sustained turn, the outside foot first", () => {
    const src = source(8, false, () => ({ left: null, right: null }));
    const track = buildBodyResponseTrack(
      options(src, { facingHint: (t) => (t >= 2 ? 90 * DEG : null) })
    )!;
    const last = track.yaw.length - 1;
    expect(track.yaw[last]!).toBeCloseTo(90 * DEG, 6);
    // A turn to the performer's left swings the right foot round first.
    expect(track.steps.map((s) => s.foot)).toEqual(["right", "left"]);
    for (const foot of [track.feet.left, track.feet.right]) {
      expect(foot.yaw[last]!).toBeCloseTo(track.yaw[last]!, 6);
      expectNoSlide(foot);
    }
  });

  it("brings the feet back to their start by the loop seam", () => {
    const reach = MODEL.gripReachM;
    const far: HandSpec = {
      at: { x: 0.2 + reach + 0.25, y: MODEL.shoulderDyM, z: MODEL.shoulderDzM },
      rotation: ALONG_Z,
    };
    const near: HandSpec = { ...far, at: { ...far.at, x: 0.2 + reach - 0.05 } };
    const src = source(8, true, (step) => ({
      left: step >= 2 && step < 6 ? far : near,
      right: null,
    }));
    const track = buildBodyResponseTrack(options(src))!;
    expect(track.steps.length).toBeGreaterThanOrEqual(4);
    const n = track.yaw.length;
    for (const foot of [track.feet.left, track.feet.right]) {
      expectNoSlide(foot);
      // The last sample runs into the first across the seam.
      expect(Math.abs(foot.x[n - 1]! - foot.x[0]!)).toBeLessThan(0.02);
      expect(foot.lift[0]).toBe(0);
    }
    const last = track.steps[track.steps.length - 1]!;
    expect(last.endStep).toBeLessThanOrEqual(track.stepCount + 1e-9);
    expect(last.to.x).toBeCloseTo(track.feet.left.x[0]!, 12);
    // No pair crowds the one before it.
    const pairs = track.steps.filter((_, k) => k % 2 === 0);
    for (let k = 1; k < pairs.length - 1; k++) {
      const previousLanding = track.steps[2 * k - 1]!.endStep;
      expect(pairs[k]!.startStep - previousLanding).toBeGreaterThanOrEqual(
        STEP_REST_BEATS - 1e-9
      );
    }
  });

  it("faces where the host asks unless reach needs otherwise", () => {
    const empty = source(6, false, () => ({ left: null, right: null }));
    const hinted = buildBodyResponseTrack(
      options(empty, { facingHint: () => 60 * DEG })
    )!;
    expect(hinted.yaw[mid(hinted, 3)]!).toBeCloseTo(60 * DEG, 6);
    // One staff far across to the right and forward: the left shoulder
    // cannot reach it from the hinted 60°, so reach pulls the body well away.
    const cross: HandSpec = {
      at: { x: -0.45, y: MODEL.shoulderDyM, z: 0.45 },
      rotation: ALONG_Z,
    };
    const src = source(6, false, (step) => ({
      left: step >= 1 ? cross : null,
      right: null,
    }));
    const track = buildBodyResponseTrack(
      options(src, { facingHint: () => 60 * DEG })
    )!;
    const i = mid(track, 3.5);
    const fromHint = Math.atan2(
      Math.sin(track.yaw[i]! - 60 * DEG),
      Math.cos(track.yaw[i]! - 60 * DEG)
    );
    expect(Math.abs(fromHint)).toBeGreaterThan(45 * DEG);
    const { staffs } = seenAt(src, track, i);
    const chest = track.yaw[i]! + track.chestYaw[i]!;
    expect(
      deficits(staffs, MODEL, chest, track.offsetX[i]!, track.offsetZ[i]!)[0]!
    ).toBeLessThan(0.01);
  });

  it("samples continuously, never above the ground, yaws the short way round", () => {
    const reach = MODEL.gripReachM;
    const far: HandSpec = {
      at: { x: 0.2 + reach + 0.2, y: MODEL.shoulderDyM, z: MODEL.shoulderDzM },
      rotation: ALONG_Z,
    };
    const src = source(4, true, (step) => ({
      left: step === 3 || step === 0 ? far : null,
      right: null,
    }));
    const track = buildBodyResponseTrack(
      options(src, {
        facingHint: (t) => (t >= 1.5 && t < 2.5 ? 120 * DEG : null),
      })
    )!;
    const end = sampleBodyResponseTrack(track, 4 - 1e-9);
    const start = sampleBodyResponseTrack(track, 0);
    expect(start.offset.x).toBeCloseTo(end.offset.x, 6);
    expect(start.offset.yaw).toBeCloseTo(end.offset.yaw, 6);
    expect(start.feet.left.x).toBeCloseTo(end.feet.left.x, 6);
    let previous = sampleBodyResponseTrack(track, 0);
    for (let k = 1; k <= 4 * 200; k++) {
      const at = sampleBodyResponseTrack(track, k / 200);
      expect(at.offset.y).toBeLessThanOrEqual(0);
      expect(Math.abs(at.offset.x - previous.offset.x)).toBeLessThan(0.02);
      expect(Math.abs(at.offset.yaw - previous.offset.yaw)).toBeLessThan(
        5 * DEG
      );
      previous = at;
    }
    // Between two dense samples the yaw takes the short arc, even across ±180.
    const wrapped: BodyResponseTrack = {
      ...track,
      yaw: track.yaw.map((_, i) => (i % 2 === 0 ? 170 * DEG : -170 * DEG)),
    };
    const half = sampleBodyResponseTrack(wrapped, 0.5 / track.samplesPerStep);
    expect(Math.abs(Math.abs(half.offset.yaw) - Math.PI)).toBeLessThan(1e-9);
  });
});

describe("body response over the corpus", () => {
  // Jade's hug fit: each hand half the staff from its grid centre.
  const STAFF_M = 0.67;
  const HEIGHT_M = 1.905;
  const MODES = [
    { name: "wall", mode: PlaneMode.WALL, floor: false },
    { name: "dual wheel", mode: PlaneMode.DUAL_WHEEL, floor: false },
    { name: "floor", mode: PlaneMode.CUSTOM, floor: true },
    // The stage's facing hint drifts the body up to 100 degrees and more off
    // square to its grid; the planner has to keep the grips in front anyway.
    {
      name: "wall, drifting facing",
      mode: PlaneMode.WALL,
      floor: false,
      drift: true,
    },
  ] as const;
  const driftingFacing = (t: number) => 110 * DEG * Math.sin(t / 3);

  it("closes the reach gap without putting staffs into the body, in every plane", () => {
    const rows: string[] = [];
    const totals: {
      name: string;
      builds: number;
      deficitBefore: number;
      deficitAfter: number;
      torsoBefore: number;
      torsoAfter: number;
      headBefore: number;
      headAfter: number;
      behindAfter: number;
      samples: number;
    }[] = [];
    for (const spec of MODES) {
      const { name, mode, floor } = spec;
      const facingHint = "drift" in spec ? driftingFacing : undefined;
      let deficitBefore = 0;
      let deficitAfter = 0;
      let samplesShortBefore = 0;
      let samplesShortAfter = 0;
      let torsoBefore = 0;
      let torsoAfter = 0;
      let torsoClearance = 0;
      let headBefore = 0;
      let headAfter = 0;
      let turned45 = 0;
      let behindBefore = 0;
      let behindAfter = 0;
      let samples = 0;
      let steps = 0;
      let builds = 0;
      let buildMs = 0;
      let slowest = 0;
      let maxStates = 0;
      for (const entry of propContinuityCorpus()) {
        const performer = createCharacterInstanceState(
          {
            id: `response-${name}-${entry.id}`,
            positionX: 0,
            persistent: false,
          },
          makeStandaloneDeps()
        );
        performer.setPlaneMode(floor ? PlaneMode.WALL : mode);
        performer.loadSequence(entry.sequence);
        if (floor) {
          performer.setHandPlane("left", Plane.FLOOR);
          performer.setHandPlane("right", Plane.FLOOR);
        }
        const planeMode = performer.planeMode;
        const hand = fixedHandDistance(STAFF_M / 2);
        performer.setHandDistance({ left: hand, right: hand });
        const stanceTrack =
          planeMode === PlaneMode.WALL
            ? buildStanceYawTrackForSource(performer, PlaneMode.WALL)
            : null;
        const hardBeatTrack = buildHardBeatTrack({
          source: performer,
          stanceTrack,
          heightM: HEIGHT_M,
          staffLengthM: STAFF_M,
          planeMode,
        });
        // The faster of two builds, so another process on the machine does
        // not count against the planner.
        let took = Infinity;
        let track: BodyResponseTrack | null = null;
        for (let run = 0; run < 2; run++) {
          const started = performance.now();
          track = buildBodyResponseTrack({
            source: performer,
            stanceTrack,
            hardBeatTrack,
            heightM: HEIGHT_M,
            staffLengthM: STAFF_M,
            planeMode,
            facingHint,
          });
          took = Math.min(took, performance.now() - started);
        }
        if (!track) continue;
        // Today's wall-only clearance planner, for comparison.
        const clearanceTrack = buildBodyClearanceTrack({
          source: performer,
          stanceTrack,
          hardBeatTrack,
          heightM: HEIGHT_M,
          staffLengthM: STAFF_M,
          planeMode,
        });
        builds++;
        buildMs += took;
        slowest = Math.max(slowest, took);
        maxStates = Math.max(maxStates, track.maxStatesPerSample);
        steps += track.steps.length;
        for (let i = 0; i < track.yaw.length; i += 2) {
          samples++;
          const seen = seenAt(
            performer,
            track,
            i,
            planeMode,
            stanceTrack,
            hardBeatTrack
          );
          const rest = restPose(seen.stanceChest, seen.stanceSpine1);
          const pose = renderedPose(
            track,
            i,
            seen.stanceChest,
            seen.stanceSpine1
          );
          const before = deficits(
            seen.staffs,
            track.model,
            seen.stanceChest
          ).reduce((a, b) => a + b, 0);
          const after = deficits(
            seen.staffs,
            track.model,
            pose.chest,
            pose.dx,
            pose.dz
          ).reduce((a, b) => a + b, 0);
          deficitBefore += before;
          deficitAfter += after;
          behindBefore += gripsBehind(
            seen.staffs,
            track.model,
            seen.stanceChest
          );
          behindAfter += gripsBehind(
            seen.staffs,
            track.model,
            pose.chest,
            pose.dx,
            pose.dz
          );
          if (before > 0.01) samplesShortBefore++;
          if (after > 0.01) samplesShortAfter++;
          const inBefore = insideCounts(seen.staffs, rest, track.model);
          const inAfter = insideCounts(seen.staffs, pose, track.model);
          if (inBefore.torso > 0) torsoBefore++;
          if (inAfter.torso > 0) torsoAfter++;
          if (clearanceTrack) {
            const moved = {
              ...rest,
              dx: clearanceTrack.offsetX[i]!,
              dz: clearanceTrack.offsetZ[i]!,
            };
            if (insideCounts(seen.staffs, moved, track.model).torso > 0)
              torsoClearance++;
          }
          if (inBefore.head > 0) headBefore++;
          if (inAfter.head > 0) headAfter++;
          if (Math.abs(track.yaw[i]!) > 45 * DEG) turned45++;
          expect(track.offsetY[i]!).toBeLessThanOrEqual(0);
          expect(track.clearance[i]!).toBeLessThanOrEqual(
            DEFAULT_BODY_CLEARANCE_MAX_M + 1e-9
          );
        }
        expectNoSlide(track.feet.left);
        expectNoSlide(track.feet.right);
      }
      totals.push({
        name,
        builds,
        deficitBefore,
        deficitAfter,
        torsoBefore,
        torsoAfter,
        headBefore,
        headAfter,
        behindAfter,
        samples,
      });
      rows.push(
        `| ${name} | ${builds} | ${samples} | ${deficitBefore.toFixed(1)} | ${deficitAfter.toFixed(1)} | ${samplesShortBefore} | ${samplesShortAfter} | ${torsoBefore} | ${torsoAfter} | ${mode === PlaneMode.WALL && !floor ? torsoClearance : "-"} | ${headBefore} | ${headAfter} | ${behindBefore} | ${behindAfter} | ${((100 * turned45) / samples).toFixed(1)}% | ${steps} | ${(buildMs / builds).toFixed(0)} / ${slowest.toFixed(0)} | ${maxStates} |`
      );
    }
    const table = [
      "| plane | sequences | samples | reach deficit before (m·samples) | after | samples short >1 cm before | after | torso-inside samples before | after | with today's clearance | head-inside before | after | grips behind before | after | yaw past 45° | steps | build ms mean / max | states/sample max |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...rows,
    ].join("\n");
    console.log(
      `\nbody response over the corpus (67 cm staff, 1.905 m)\n${table}`
    );
    const out = process.env.BODY_RESPONSE_TABLE;
    if (out) {
      mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
      writeFileSync(out, `${table}\n`);
    }
    for (const total of totals) {
      expect(total.builds).toBeGreaterThan(20);
      expect(total.deficitAfter).toBeLessThan(total.deficitBefore);
      expect(total.torsoAfter).toBeLessThanOrEqual(total.torsoBefore);
      // A facing the host forces may graze the head on a sample or two in a
      // thousand (main's planner: 3 of 2592 in the drifting pass).
      expect(total.headAfter).toBeLessThanOrEqual(
        total.headBefore + 0.001 * total.samples
      );
      // Hardly ever a staff held round the back: under 1% of hand-samples.
      expect(total.behindAfter).toBeLessThan(0.01 * 2 * total.samples);
    }
  }, 600_000);
});
