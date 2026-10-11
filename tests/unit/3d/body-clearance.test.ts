import { describe, expect, it } from "vitest";
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
  BODY_CLEARANCE_RAMP_STEPS,
  BODY_CLEARANCE_TORSO,
  DEFAULT_BODY_CLEARANCE_MAX_M,
  bodyClearanceNeed,
  buildBodyClearanceTrack,
  defaultBodyClearanceModel,
  describeBodyClearanceTrack,
  sampleBodyClearanceTrack,
  type BodyClearanceModel,
  type BodyClearancePose,
  type BodyClearanceProp,
  type BodyClearanceScoreSource,
  type BodyClearanceTrack,
  type BodyMove,
  type StaffLine,
} from "#lib/shared/3d/collision/body-clearance.js";
import { propStateToStaffTarget } from "#lib/shared/3d/services/swept-volume/swept-volume-builder.js";
import { fixedHandDistance } from "#lib/shared/3d/domain/performer-hand-distance.js";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";

/**
 * Where the body moves so a staff stays out of the torso. The need is checked
 * against hand-computed ellipse exits and against a direct inside test that
 * shares nothing with the interval chain; the corpus check runs the whole
 * prop-continuity corpus in isolation at 67 cm (Jade's hug fit) without rigs.
 */

const SQUARE: BodyClearancePose = { chestRad: 0, spine1Rad: 0 };
const MODEL: BodyClearanceModel = defaultBodyClearanceModel({
  heightM: 1.905,
  shoulderHalfWidthM: 0.2,
});
const R = MODEL.staffRadiusM;
/** A row that is a knot of the chest table: half-width 1.3, front 0.50,
 *  back -0.66 shoulder half-widths. */
const CHEST_ROW_Y = 0.008;
const CHEST_HALF_WIDTH_M = 1.3 * 0.2 + R;
const CHEST_FRONT_M = 0.5 * 0.2 + R;
const CHEST_BACK_M = -0.66 * 0.2 - R;
/** The module tests staff points this far apart. */
const STAFF_STEP_M = 0.01;

/** Straight back from the chest. */
function back(pose: BodyClearancePose): BodyMove {
  return { x: -Math.sin(pose.chestRad), z: -Math.cos(pose.chestRad) };
}

function across(y: number, z: number, half = 0.3): StaffLine {
  return { a: { x: -half, y, z }, b: { x: half, y, z } };
}

type Point = { x: number; y: number; z: number };

/** Inside test straight from the table, without the ray intersection. */
function insideTorso(
  p: Point,
  pose: BodyClearancePose,
  model: BodyClearanceModel,
  tolerance = 0
): boolean {
  const row = p.y / model.heightScale;
  const yaw = { chest: pose.chestRad, waist: pose.spine1Rad, pelvis: 0 };
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
    const c = Math.cos(yaw[part.turn]);
    const s = Math.sin(yaw[part.turn]);
    const u = p.x * c - p.z * s;
    const v = p.x * s + p.z * c;
    const sh = model.shoulderHalfWidthM;
    const a = half * sh + model.staffRadiusM;
    const v0 = ((front + back) / 2) * sh;
    const b = ((front - back) / 2) * sh + model.staffRadiusM;
    if ((u / a) ** 2 + ((v - v0) / b) ** 2 < 1 - tolerance) return true;
  }
  return false;
}

function pointsOf(staff: StaffLine, step = STAFF_STEP_M): Point[] {
  const { a, b } = staff;
  const count = Math.max(
    2,
    Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step)
  );
  const out: Point[] = [];
  for (let k = 0; k <= count; k++) {
    const s = k / count;
    out.push({
      x: a.x + (b.x - a.x) * s,
      y: a.y + (b.y - a.y) * s,
      z: a.z + (b.z - a.z) * s,
    });
  }
  return out;
}

/** Staff points inside the torso after the body moves by `(dx, dz)`: in the
 *  body's frame the points move the other way. */
function insideAfter(
  staffs: readonly (StaffLine | null)[],
  pose: BodyClearancePose,
  model: BodyClearanceModel,
  dx: number,
  dz: number
): number {
  let count = 0;
  for (const staff of staffs) {
    if (!staff) continue;
    for (const p of pointsOf(staff)) {
      const moved = { x: p.x - dx, y: p.y, z: p.z - dz };
      // 1e-6 of the unit ellipse: the exit itself sits on the surface.
      if (insideTorso(moved, pose, model, 1e-6)) count++;
    }
  }
  return count;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("body clearance need", () => {
  it("is zero for a staff in front of the chest", () => {
    expect(
      bodyClearanceNeed(
        [across(CHEST_ROW_Y, CHEST_FRONT_M + 0.01)],
        SQUARE,
        MODEL,
        back(SQUARE)
      )
    ).toBe(0);
    expect(bodyClearanceNeed([null, null], SQUARE, MODEL, back(SQUARE))).toBe(
      0
    );
  });

  it("moves a square chest back until a staff through it clears the front", () => {
    // The deepest point is on the midline, where the ellipse is deepest.
    expect(
      bodyClearanceNeed(
        [across(CHEST_ROW_Y, 0.05)],
        SQUARE,
        MODEL,
        back(SQUARE)
      )
    ).toBeCloseTo(CHEST_FRONT_M - 0.05, 9);
  });

  it("measures along the chest's own facing when it turns side-on", () => {
    // Side-on to the performer's left, the chest faces +x: a staff running
    // toward the audience 5 cm in front of the chest's midline.
    const pose = { chestRad: Math.PI / 2, spine1Rad: 0.45 * (Math.PI / 2) };
    const staff: StaffLine = {
      a: { x: 0.05, y: CHEST_ROW_Y, z: -0.3 },
      b: { x: 0.05, y: CHEST_ROW_Y, z: 0.3 },
    };
    expect(bodyClearanceNeed([staff], pose, MODEL, back(pose))).toBeCloseTo(
      CHEST_FRONT_M - 0.05,
      9
    );
    // Square to the audience the same staff runs front to back through the
    // chest, so moving back passes the whole staff: the rear tip, 0.3 behind
    // the body's axis, clears the chest's front last.
    const u = 0.05 / CHEST_HALF_WIDTH_M;
    const centre = ((0.5 - 0.66) / 2) * 0.2;
    const frontAtX = centre + (CHEST_FRONT_M - centre) * Math.sqrt(1 - u * u);
    expect(bodyClearanceNeed([staff], SQUARE, MODEL, back(SQUARE))).toBeCloseTo(
      frontAtX + 0.3,
      9
    );
    // Sideways it leaves through the chest's side.
    expect(
      bodyClearanceNeed([staff], SQUARE, MODEL, { x: -1, z: 0 })
    ).toBeLessThan(CHEST_HALF_WIDTH_M);
  });

  it("does not stop the body inside a staff it moves into", () => {
    const behind = across(CHEST_ROW_Y, CHEST_BACK_M - 0.05);
    expect(bodyClearanceNeed([behind], SQUARE, MODEL, back(SQUARE))).toBe(0);
    // A staff through the chest clears through the front, but the body backs
    // into a second staff 2 cm behind it on the way, so the move runs on until
    // the chest has passed that one too.
    const through = across(CHEST_ROW_Y, 0);
    const rear = across(CHEST_ROW_Y, CHEST_BACK_M - 0.02);
    expect(
      bodyClearanceNeed([through, rear], SQUARE, MODEL, back(SQUARE))
    ).toBeCloseTo(CHEST_FRONT_M - CHEST_BACK_M + 0.02, 9);
  });

  it("scales heights with the performer and widths with the shoulders", () => {
    const half = defaultBodyClearanceModel({
      heightM: 1.905 / 2,
      shoulderHalfWidthM: 0.1,
    });
    expect(half.heightScale).toBeCloseTo(0.5, 12);
    expect(half.gripReachM).toBeCloseTo(MODEL.gripReachM / 2, 12);
    const front = 0.5 * 0.1 + half.staffRadiusM;
    expect(
      bodyClearanceNeed(
        [across(CHEST_ROW_Y / 2, 0.025)],
        SQUARE,
        half,
        back(SQUARE)
      )
    ).toBeCloseTo(front - 0.025, 9);
    // Above the chest and below the pelvis there is no body.
    expect(
      bodyClearanceNeed([across(0.2, 0)], SQUARE, MODEL, back(SQUARE))
    ).toBe(0);
    expect(
      bodyClearanceNeed([across(-0.8, 0)], SQUARE, MODEL, back(SQUARE))
    ).toBe(0);
  });

  it("plans for the broader measured rig until the shoulders are measured", () => {
    const unmeasured = defaultBodyClearanceModel({ heightM: 1.905 });
    expect(unmeasured.shoulderHalfWidthM).toBeCloseTo(0.223, 12);
    const shorter = defaultBodyClearanceModel({ heightM: 1.5 });
    expect(shorter.shoulderHalfWidthM).toBeCloseTo(0.223 * (1.5 / 1.905), 12);
    expect(
      defaultBodyClearanceModel({ heightM: 1.905, shoulderHalfWidthM: 0.19 })
        .shoulderHalfWidthM
    ).toBe(0.19);
  });

  it("leaves no staff point inside the torso, whichever way the body moves", () => {
    const random = mulberry32(20260928);
    let pushed = 0;
    for (let trial = 0; trial < 400; trial++) {
      const chestRad = (random() * 2 - 1) * (Math.PI / 2);
      const pose = { chestRad, spine1Rad: 0.45 * chestRad };
      const heading = random() * Math.PI * 2;
      const move = { x: Math.cos(heading), z: Math.sin(heading) };
      const staffs = [0, 1].map(() => {
        const centre = {
          x: (random() * 2 - 1) * 0.3,
          y: -0.7 + random() * 0.8,
          z: (random() * 2 - 1) * 0.25,
        };
        const theta = random() * Math.PI;
        const phi = random() * Math.PI * 2;
        const half = 0.2 + random() * 0.3;
        const dir = {
          x: Math.sin(theta) * Math.cos(phi),
          y: Math.cos(theta),
          z: Math.sin(theta) * Math.sin(phi),
        };
        return {
          a: {
            x: centre.x + dir.x * half,
            y: centre.y + dir.y * half,
            z: centre.z + dir.z * half,
          },
          b: {
            x: centre.x - dir.x * half,
            y: centre.y - dir.y * half,
            z: centre.z - dir.z * half,
          },
        };
      });
      const need = bodyClearanceNeed(staffs, pose, MODEL, move);
      if (need > 0) pushed++;
      expect(
        insideAfter(staffs, pose, MODEL, move.x * need, move.z * need)
      ).toBe(0);
    }
    // The trials exercise the chain, not just empty space.
    expect(pushed).toBeGreaterThan(100);
  });
});

/** One staff at chest height, through the chest during `inside` steps and
 *  clear in front of it otherwise, within the arm's reach. By default it lies
 *  across the body 5 cm into the chest; `along` turns it to run front to back
 *  through the chest's middle. */
function staffSource(
  steps: number,
  loop: boolean,
  inside: (step: number) => boolean,
  along = false
): BodyClearanceScoreSource {
  const rotation = along
    ? new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    : new Quaternion();
  return {
    motionStepCount: steps,
    loop,
    propStatesAtScoreTime(scoreTime: number) {
      const step = Math.floor(scoreTime) % steps;
      // Grid frame: the grid centre is 0.3 in front of the body's axis.
      const z = inside(step) ? (along ? 0.02 : 0.05) - 0.3 : along ? 0.15 : 0;
      const left: BodyClearanceProp = {
        worldPosition: new Vector3(0, CHEST_ROW_Y, z),
        worldRotation: rotation,
        plane: Plane.WALL,
      };
      return { left, right: null };
    },
  };
}

/** The staff and pose the planner saw at a sample, rebuilt from the source. */
function plannedAt(
  source: BodyClearanceScoreSource,
  track: BodyClearanceTrack,
  i: number,
  stanceTrack: Parameters<typeof resolveTrackedUpperBodyStance>[0] = null,
  hardBeatTrack: Parameters<typeof sampleHardBeatTrack>[0] = null
) {
  const t = i / track.samplesPerStep;
  const { left, right } = source.propStatesAtScoreTime(t);
  const stance = resolveTrackedUpperBodyStance(
    stanceTrack,
    t,
    PlaneMode.WALL,
    left,
    right,
    null
  );
  const shift = sampleHardBeatTrack(hardBeatTrack, t);
  const staffs = (
    [
      [displaceProp(left, shift.left), stance.leftDepthOffsetM],
      [displaceProp(right, shift.right), stance.rightDepthOffsetM],
    ] as const
  ).map(([prop, depth]): StaffLine | null => {
    if (!prop) return null;
    const staff = propStateToStaffTarget(prop, track.staffHalfLengthM);
    return {
      a: { ...staff.tipAWorld, z: staff.tipAWorld.z + depth },
      b: { ...staff.tipBWorld, z: staff.tipBWorld.z + depth },
    };
  });
  const pose: BodyClearancePose = {
    chestRad: stance.segments.chestRad,
    spine1Rad: stance.segments.spine1Rad,
  };
  return { staffs, pose };
}

/** Grip less shoulder, per hand, after the body moves by `(dx, dz)`, against
 *  the reach the move may not pull it past. */
function reachAfter(
  staffs: readonly (StaffLine | null)[],
  pose: BodyClearancePose,
  model: BodyClearanceModel,
  dx: number,
  dz: number
): { before: number; after: number; limit: number }[] {
  const h = model.shoulderHalfWidthM;
  return staffs.flatMap((line, index) => {
    if (!line) return [];
    const side = index === 0 ? 1 : -1;
    const shoulder = {
      x: side * h * Math.cos(pose.chestRad),
      y: model.shoulderDyM,
      z: model.shoulderDzM - side * h * Math.sin(pose.chestRad),
    };
    const grip = {
      x: (line.a.x + line.b.x) / 2,
      y: (line.a.y + line.b.y) / 2,
      z: (line.a.z + line.b.z) / 2,
    };
    const before = Math.hypot(
      grip.x - shoulder.x,
      grip.y - shoulder.y,
      grip.z - shoulder.z
    );
    const after = Math.hypot(
      grip.x - shoulder.x - dx,
      grip.y - shoulder.y,
      grip.z - shoulder.z - dz
    );
    return [{ before, after, limit: Math.max(model.gripReachM, before) }];
  });
}

describe("body clearance track", () => {
  const options = (source: BodyClearanceScoreSource) => ({
    source,
    stanceTrack: null,
    heightM: 1.905,
    staffLengthM: 0.6,
    model: MODEL,
  });

  it("plans nothing without a score, a staff, or the wall plane", () => {
    const source = staffSource(4, true, (step) => step === 1);
    expect(
      buildBodyClearanceTrack({ ...options(source), source: null })
    ).toBeNull();
    expect(
      buildBodyClearanceTrack({ ...options(source), staffLengthM: 0 })
    ).toBeNull();
    expect(
      buildBodyClearanceTrack({
        ...options(source),
        planeMode: PlaneMode.DUAL_WHEEL,
      })
    ).toBeNull();
    expect(sampleBodyClearanceTrack(null, 1.5)).toEqual({ x: 0, z: 0 });
  });

  it("moves straight back from a staff across the chest, ahead of the beat", () => {
    const track = buildBodyClearanceTrack(
      options(staffSource(4, false, (step) => step === 1))
    )!;
    const need = CHEST_FRONT_M - 0.05;
    expect(sampleBodyClearanceTrack(track, 1.5).z).toBeCloseTo(-need, 9);
    expect(sampleBodyClearanceTrack(track, 1.5).x).toBeCloseTo(0, 12);
    // Ramping: part way back half a ramp ahead, nothing a whole ramp ahead.
    const halfAhead = sampleBodyClearanceTrack(
      track,
      1 - BODY_CLEARANCE_RAMP_STEPS / 2
    ).z;
    expect(halfAhead).toBeLessThan(-0.1 * need);
    expect(halfAhead).toBeGreaterThan(-need);
    expect(
      sampleBodyClearanceTrack(track, 1 - BODY_CLEARANCE_RAMP_STEPS - 0.05).z
    ).toBeCloseTo(0, 12);
    for (let i = 0; i < track.clearance.length; i++) {
      const raw = Math.hypot(track.rawX[i]!, track.rawZ[i]!);
      expect(track.clearance[i]!).toBeGreaterThanOrEqual(raw - 1e-12);
      expect(track.clearance[i]!).toBeLessThanOrEqual(need + 1e-12);
    }
    expect(track.capped.every((flag) => flag === 0)).toBe(true);
    expect(track.report.map((beat) => beat.step)).toEqual([0, 1, 2]);
    expect(track.report[1]!.clearanceMaxM).toBeCloseTo(need, 9);
    expect(describeBodyClearanceTrack(track).split("\n")[1]).toMatch(
      /^step 1: (\d+\.\d) cm, \1 back$/
    );
  });

  it("moves sideways off a staff that runs front to back through the chest", () => {
    const source = staffSource(4, false, (step) => step === 1, true);
    const track = buildBodyClearanceTrack(options(source))!;
    const mid = 1.5 * track.samplesPerStep;
    const { staffs, pose } = plannedAt(source, track, mid);
    const rawX = track.rawX[mid]!;
    const rawZ = track.rawZ[mid]!;
    // Moving back would pass the whole staff, past the cap; the side is
    // closer, and the chosen move is exactly that side's need.
    expect(bodyClearanceNeed(staffs, pose, MODEL, back(pose))).toBeGreaterThan(
      DEFAULT_BODY_CLEARANCE_MAX_M
    );
    const side = { x: Math.sign(rawX), z: 0 };
    expect(Math.abs(rawZ)).toBeLessThan(1e-12);
    expect(Math.abs(rawX)).toBeCloseTo(
      bodyClearanceNeed(staffs, pose, MODEL, side),
      12
    );
    expect(insideAfter(staffs, pose, MODEL, rawX, rawZ)).toBe(0);
    expect(track.capped[mid]).toBe(0);
    expect(describeBodyClearanceTrack(track).split("\n")[1]).toMatch(
      /^step 1: (\d+\.\d) cm, \1 (left|right)$/
    );
  });

  it("never pulls a grip further out than the arms reach", () => {
    // With no reach to spare, straight back would pull the grip, 5 cm in front
    // of the chest's middle, further from its shoulder. The body clears toward
    // the grip's side instead.
    const source = staffSource(4, true, (step) => step === 2);
    const track = buildBodyClearanceTrack({
      ...options(source),
      model: { ...MODEL, gripReachM: 0 },
    })!;
    for (let i = 0; i < track.clearance.length; i++) {
      const { staffs, pose } = plannedAt(source, track, i);
      for (const hand of reachAfter(
        staffs,
        pose,
        track.model,
        track.offsetX[i]!,
        track.offsetZ[i]!
      )) {
        expect(hand.after).toBeLessThanOrEqual(hand.limit + 1e-9);
      }
    }
    const mid = 2.5 * track.samplesPerStep;
    const { staffs, pose } = plannedAt(source, track, mid);
    expect(track.rawX[mid]!).toBeLessThan(-0.01);
    expect(
      insideAfter(staffs, pose, MODEL, track.rawX[mid]!, track.rawZ[mid]!)
    ).toBe(0);
  });

  it("wraps the ramp across the loop seam", () => {
    const track = buildBodyClearanceTrack(
      options(staffSource(4, true, (step) => step === 3))
    )!;
    const seamEnd = sampleBodyClearanceTrack(track, 4 - 1e-9);
    const seamStart = sampleBodyClearanceTrack(track, 0);
    expect(seamStart.z).toBeCloseTo(seamEnd.z, 6);
    expect(sampleBodyClearanceTrack(track, 0.2).z).toBeLessThan(0);
    const later = sampleBodyClearanceTrack(track, 8.2);
    const first = sampleBodyClearanceTrack(track, 0.2);
    expect(later.x).toBeCloseTo(first.x, 12);
    expect(later.z).toBeCloseTo(first.z, 12);
  });

  it("caps the move and says so", () => {
    const track = buildBodyClearanceTrack({
      ...options(staffSource(4, true, (step) => step === 2)),
      maxM: 0.02,
    })!;
    expect(Math.max(...track.clearance)).toBeCloseTo(0.02, 12);
    expect(track.report.find((beat) => beat.step === 2)?.capped).toBe(true);
    expect(describeBodyClearanceTrack(track)).toContain("(capped)");
  });
});

describe("body clearance over the isolation corpus", () => {
  // Jade's hug fit: each hand half the staff from its grid centre.
  const STAFF_M = 0.67;
  const HEIGHT_M = 1.905;

  it("clears the torso within the cap and the arms' reach", () => {
    let beatsMoving = 0;
    let largest = 0;
    let checked = 0;
    let insideBefore = 0;
    let insideRendered = 0;
    let short = 0;
    for (const entry of propContinuityCorpus()) {
      const source = createCharacterInstanceState(
        { id: `clearance-${entry.id}`, positionX: 0, persistent: false },
        makeStandaloneDeps()
      );
      source.setPlaneMode(PlaneMode.WALL);
      source.loadSequence(entry.sequence);
      const hand = fixedHandDistance(STAFF_M / 2);
      source.setHandDistance({ left: hand, right: hand });
      const stanceTrack = buildStanceYawTrackForSource(source, PlaneMode.WALL);
      const hardBeatTrack = buildHardBeatTrack({
        source,
        stanceTrack,
        heightM: HEIGHT_M,
      });
      const track = buildBodyClearanceTrack({
        source,
        stanceTrack,
        hardBeatTrack,
        heightM: HEIGHT_M,
        staffLengthM: STAFF_M,
      });
      if (!track) continue;
      beatsMoving += track.report.length;
      for (let i = 0; i < track.clearance.length; i++) {
        largest = Math.max(largest, track.clearance[i]!);
        expect(track.clearance[i]!).toBeLessThanOrEqual(
          DEFAULT_BODY_CLEARANCE_MAX_M + 1e-12
        );
        const { staffs, pose } = plannedAt(
          source,
          track,
          i,
          stanceTrack,
          hardBeatTrack
        );
        const dx = track.offsetX[i]!;
        const dz = track.offsetZ[i]!;
        for (const reach of reachAfter(staffs, pose, track.model, dx, dz)) {
          expect(reach.after).toBeLessThanOrEqual(reach.limit + 1e-9);
        }
        if (insideAfter(staffs, pose, track.model, 0, 0) === 0) continue;
        insideBefore++;
        if (insideAfter(staffs, pose, track.model, dx, dz) > 0) {
          insideRendered++;
        }
        if (track.capped[i]) {
          short++;
          continue;
        }
        // A move that is not cut short clears every staff point.
        expect(
          insideAfter(staffs, pose, track.model, track.rawX[i]!, track.rawZ[i]!)
        ).toBe(0);
        checked++;
      }
    }
    // The corpus does turn side-on in isolation, so the check is not empty.
    expect(checked).toBeGreaterThan(500);
    expect(beatsMoving).toBeGreaterThan(20);
    expect(largest).toBeGreaterThan(0.1);
    // Planned 2026-09-28: 966 samples start inside, 85 moves are cut short,
    // and 346 samples keep some point inside as rendered, where the reach cut
    // and the ramp shorten or turn the chosen move (a median of 2 cm short).
    // The table is the outer envelope of both rigs; against the rig meshes
    // the rendered torso contacts fell by about 90%.
    expect(short).toBeLessThan(0.12 * insideBefore);
    expect(insideRendered).toBeLessThan(0.4 * insideBefore);
  });
});
