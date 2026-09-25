import { describe, expect, it } from "vitest";
import { Group, Vector3, type AnimationClip, type Object3D } from "three";
import { LocomotionAnimator } from "@austencloud/scene-3d";

import {
  ALL_RIGS,
  avatar,
  avatarAssetsPresent,
  driveRig,
  loadPackClips,
  loadRig,
} from "./locomotion-harness";

/**
 * The walking pelvis has to sit low enough for the foot bearing weight to
 * stand on the floor the rig stands on, and it has to get there without
 * dropping the body for a frame or freezing it at the loop.
 *
 * Two things set that height. The contact bake (`bakeContactPreservedLegs`)
 * writes a pelvis track that stands this rig's legs on the floor through the
 * source clip's stances, which carries nearly all of the dip a walk is
 * authored with. `pelvisDrop` is what is left over: the cycle mean, over every
 * gait-probe sample a foot declares contact, of that sole's height over the
 * bind floor, measured on the baked clip and taken off the pelvis at runtime.
 * It is one number for the cycle on purpose: a per-phase curve was measured on
 * 2026-09-06 (ch01, 1.37 m/s, planted) to bring the planted sole from 2.0 cm
 * to 1.4 cm of the floor while adding 2.2 cm of pelvis bob every stride, and
 * the bounce is what an eye reads.
 *
 * With the bake standing the feet down, a large residual means the bake put
 * the foot somewhere other than the floor. Until 2026-09-24 it did, on every
 * rig whose ankle does not sit at the source's 0.109 leg lengths over its
 * sole: ch07 came out -0.043 (planted sole 5.1 cm in the air once the planter
 * held the toe down), ch42 -0.029, ch24 -0.023 and ch34 +0.024. Standing the
 * leg on the rig's own ankle height brought every forward and strafe walk
 * within 0.017 of zero. Backward walks and run strafes keep 0.01-0.05, the
 * part of their dip the bake does not own.
 *
 * Two defects the same measurement pass found, both once per stride at 60 Hz:
 * a 3.7 cm one-frame drop of the whole body where three.js skipped the pelvis
 * write on the frame the track repeated its value (the pelvis had been zeroed
 * before the mixer ran), and a two-tick freeze at every loop wrap because the
 * clips key from 0.0333 s while their duration counted from zero.
 *
 * Numbers below are measured on all twelve shipped rigs (2026-09-24, headless
 * 60 Hz harness, this build). The dip is the whole of it, the baked track's
 * mean under rest plus the residual: walk 0.045-0.074 (forward 0.045-0.057,
 * backward 0.051-0.074), strafe 0.057-0.076, run 0.128-0.150, run strafe
 * 0.098-0.141. The bands were first set on 2026-09-06 against the residual
 * alone, before the bake owned the pelvis, when the residual was the whole
 * dip. The run band still holds; the others are re-set around the baked
 * measurement with the margins they had. Planted sole at 1.368 m/s, a plant
 * being a toe moving under 0.1 m/s in 3D so the planter's acquire and release
 * tails are left out: highest 0.010 over the floor on ch01/ch12/ch21 and 0.018
 * on ch07, whose ankle sits 0.148 over its sole and reads a taller foot at
 * every pitch; 95th percentile 0.007-0.008 and 0.016; lowest -0.006 to -0.015
 * (the planter's floor clamp holds the toe itself at or above the floor).
 * Largest frame-to-frame pelvis move in a steady walk is under 0.01; the
 * defect was 0.037.
 */

const WALK_DROP = { min: 0.04, max: 0.08 };
const STRAFE_DROP = { min: 0.05, max: 0.085 };
const RUN_DROP = { min: 0.1, max: 0.16 };
const RUN_STRAFE_DROP = { min: 0.085, max: 0.15 };
/** Forward and strafe walks, whose stances the bake stands on the floor. */
const BAKED_RESIDUAL_MAX = 0.02;
const PLANTED_SOLE_MAX = 0.04;
const PLANTED_SOLE_P95_MAX = 0.04;
const PLANTED_SOLE_MIN = -0.03;
const PELVIS_STEP_MAX = 0.015;
const PLANTED_TOE_SPEED = 0.1;
const DRIVEN_RIGS = ["ch01", "ch07", "ch12", "ch21"];
const WALK_SPEED = 1.368;

function bindFloor(scene: Object3D, bone: "Foot" | "ToeBase"): number {
  scene.updateMatrixWorld(true);
  const probe = new Vector3();
  let floor = Infinity;
  scene.traverse((node) => {
    if (node.name.endsWith(`Left${bone}`) || node.name.endsWith(`Right${bone}`)) {
      floor = Math.min(floor, node.getWorldPosition(probe).y);
    }
  });
  return floor;
}

async function bootAnimator(id: string) {
  const clips = await loadPackClips();
  const rig = await loadRig(avatar(id));
  const travel = new Group();
  travel.add(rig.scene);
  const animator = new LocomotionAnimator();
  const seam = animator as unknown as {
    pendingClips: Map<string, AnimationClip>;
    clipsLoaded: boolean;
    gaits: Record<string, { pelvisDrop: number } | null>;
    walkActions: Record<string, { getClip(): AnimationClip } | undefined>;
    runActions: Record<string, { getClip(): AnimationClip } | undefined> | null;
    hipsBone: { position: Vector3 } | null;
    hipsRest: Vector3 | null;
  };
  seam.pendingClips = new Map(clips);
  seam.clipsLoaded = true;
  animator.initialize(rig.scene);
  return {
    animator,
    seam,
    bindAnkle: bindFloor(rig.scene, "Foot"),
    bindToe: bindFloor(rig.scene, "ToeBase"),
  };
}

type Seam = Awaited<ReturnType<typeof bootAnimator>>["seam"];

/**
 * How far under rest the pelvis sits on average through a gait's cycle: the
 * baked track's mean, which is an offset from rest, less the residual the
 * animator takes off at runtime.
 */
function walkingDip(seam: Seam, key: string): number {
  const action = seam.walkActions[key] ?? seam.runActions?.[key];
  const track = action
    ?.getClip()
    .tracks.find((candidate) => candidate.name.endsWith("Hips.position"));
  expect(track, `${key} pelvis track`).toBeTruthy();
  let sum = 0;
  const count = track!.times.length;
  for (let i = 0; i < count; i++) sum += track!.values[i * 3 + 1]!;
  return (seam.gaits[key]?.pelvisDrop ?? NaN) - sum / count;
}

function expectBand(value: number, band: { min: number; max: number }, label: string) {
  expect(value, label).toBeGreaterThanOrEqual(band.min);
  expect(value, label).toBeLessThanOrEqual(band.max);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

describe.skipIf(!avatarAssetsPresent())("locomotion pelvis drop", () => {
  it("measures a walking dip in the band on every shipped rig and gait", async () => {
    for (const id of ALL_RIGS) {
      const { seam } = await bootAnimator(id);
      for (const key of ["forward", "backward"]) {
        expectBand(walkingDip(seam, key), WALK_DROP, `${id} ${key}`);
      }
      for (const key of ["strafeLeft", "strafeRight"]) {
        expectBand(walkingDip(seam, key), STRAFE_DROP, `${id} ${key}`);
      }
      expectBand(walkingDip(seam, "runForward"), RUN_DROP, `${id} runForward`);
      for (const key of ["runStrafeLeft", "runStrafeRight"]) {
        expectBand(walkingDip(seam, key), RUN_STRAFE_DROP, `${id} ${key}`);
      }
    }
  }, 180_000);

  it("bakes forward and strafe stances onto the rig's own floor", async () => {
    for (const id of ALL_RIGS) {
      const { seam } = await bootAnimator(id);
      for (const key of ["forward", "strafeLeft", "strafeRight"]) {
        const residual = seam.gaits[key]?.pelvisDrop ?? NaN;
        expect(Math.abs(residual), `${id} ${key} residual`).toBeLessThan(
          BAKED_RESIDUAL_MAX
        );
      }
    }
  }, 180_000);

  it("hands the planter a toe no higher than it stands and never an ankle above the bind", async () => {
    for (const id of ALL_RIGS) {
      const { animator, bindAnkle, bindToe } = await bootAnimator(id);
      // The bake lifts the ball of the foot until the front of the shoe rests
      // on the floor, so in the lowered pose the toe joint can sit a few
      // millimetres over it. Pinning that joint at zero would push the shoe
      // through the floor by as much as the joint stands over its sole.
      const toe = animator.getToeOffset();
      expect(toe, `${id} toe`).toBeGreaterThanOrEqual(0);
      expect(toe, `${id} toe`).toBeLessThanOrEqual(bindToe);
      const sole = animator.getSoleOffset();
      expect(sole, `${id} sole`).toBeGreaterThanOrEqual(0);
      expect(sole, `${id} sole`).toBeLessThanOrEqual(bindAnkle);
    }
  }, 180_000);

  it("lowers the pelvis by the walk dip on average while moving and holds rest height when still", async () => {
    const { animator, seam } = await bootAnimator("ch01");
    const rest = seam.hipsRest!.y;
    for (let i = 0; i < 240; i++) {
      animator.setLocomotion({ isMoving: false, speed: 0, moveDirection: { x: 0, z: 0 } });
      animator.update(1 / 60);
    }
    expect(seam.hipsBone!.position.y).toBeCloseTo(rest, 2);
    const heights: number[] = [];
    for (let i = 0; i < 360; i++) {
      animator.setLocomotion({ isMoving: true, speed: WALK_SPEED, moveDirection: { x: 0, z: 1 } });
      animator.update(1 / 60);
      if (i >= 120) heights.push(seam.hipsBone!.position.y);
    }
    const walkDrop = walkingDip(seam, "forward");
    // The clip's own bob rides on top and averages out over whole cycles.
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    expect(rest - mean).toBeGreaterThan(walkDrop - 0.01);
    expect(rest - mean).toBeLessThan(walkDrop + 0.01);
  }, 60_000);

  it("keeps the planted sole on the rig's own floor", async () => {
    await loadPackClips();
    for (const id of DRIVEN_RIGS) {
      const scene = (await loadRig(avatar(id))).scene;
      const bindAnkle = bindFloor(scene, "Foot");
      const bindToe = bindFloor(scene, "ToeBase");
      const run = await driveRig({
        speedAt: () => WALK_SPEED,
        seconds: 6,
        rig: avatar(id),
        planting: true,
      });
      const frames = run.frames;
      const soles: number[] = [];
      let toeMin = Infinity;
      for (let i = 1; i < frames.length; i++) {
        for (const side of ["left", "right"] as const) {
          const foot = frames[i]![side];
          const prev = frames[i - 1]![side];
          if (!foot.toe || !prev.toe) continue;
          toeMin = Math.min(toeMin, foot.toe.y);
          const dt = frames[i]!.t - frames[i - 1]!.t || 1 / 60;
          const speed =
            Math.hypot(
              foot.toe.x - prev.toe.x,
              foot.toe.y - prev.toe.y,
              foot.toe.z - prev.toe.z
            ) / dt;
          if (speed > PLANTED_TOE_SPEED) continue;
          soles.push(Math.min(foot.ankle.y - bindAnkle, foot.toe.y - bindToe));
        }
      }
      expect(soles.length, `${id} planted samples`).toBeGreaterThan(60);
      expect(Math.max(...soles), `${id} sole hover`).toBeLessThan(PLANTED_SOLE_MAX);
      expect(percentile(soles, 0.95), `${id} sole hover p95`).toBeLessThan(
        PLANTED_SOLE_P95_MAX
      );
      expect(Math.min(...soles), `${id} sole dip`).toBeGreaterThan(PLANTED_SOLE_MIN);
      expect(toeMin, `${id} toe floor`).toBeGreaterThan(-0.005);
    }
  }, 300_000);

  it("never drops the pelvis for a single frame", async () => {
    await loadPackClips();
    for (const planting of [false, true]) {
      const run = await driveRig({
        speedAt: () => WALK_SPEED,
        seconds: 6,
        rig: avatar("ch01"),
        planting,
      });
      let largest = 0;
      for (let i = 1; i < run.frames.length; i++) {
        largest = Math.max(
          largest,
          Math.abs(run.frames[i]!.hips.y - run.frames[i - 1]!.hips.y)
        );
      }
      expect(largest, `planting ${planting}`).toBeLessThan(PELVIS_STEP_MAX);
    }
  }, 120_000);

  it("starts every pack clip at its first key and ends it at its last", async () => {
    const { seam } = await bootAnimator("ch01");
    expect(seam.pendingClips.size).toBeGreaterThan(0);
    for (const [name, clip] of seam.pendingClips) {
      let first = Infinity;
      let last = -Infinity;
      for (const track of clip.tracks) {
        if (track.times.length === 0) continue;
        first = Math.min(first, track.times[0]!);
        last = Math.max(last, track.times[track.times.length - 1]!);
      }
      expect(first, `${name} first key`).toBe(0);
      expect(clip.duration, `${name} duration`).toBeCloseTo(last, 5);
    }
    // The forward walk is 32 keys at 30 Hz: 31 intervals once the hold is gone.
    expect(seam.pendingClips.get("forward")!.duration).toBeCloseTo(31 / 30, 3);
  }, 60_000);
});
