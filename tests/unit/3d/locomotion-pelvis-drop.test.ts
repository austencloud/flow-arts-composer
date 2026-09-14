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
 * The pack's walk clips are re-anchored at the rig's rest height, which
 * discards the dip a walk is authored with. `pelvisDrop` is the cycle mean,
 * over every gait-probe sample a foot declares contact, of that sole's height
 * over the bind floor. It is one number for the cycle on purpose: a per-phase
 * curve was measured on 2026-09-06 (ch01, 1.37 m/s, planted) to bring the
 * planted sole from 2.0 cm to 1.4 cm of the floor while adding 2.2 cm of
 * pelvis bob every stride, and the bounce is what an eye reads.
 *
 * Two defects the same measurement pass found, both once per stride at 60 Hz:
 * a 3.7 cm one-frame drop of the whole body where three.js skipped the pelvis
 * write on the frame the track repeated its value (the pelvis had been zeroed
 * before the mixer ran), and a two-tick freeze at every loop wrap because the
 * clips key from 0.0333 s while their duration counted from zero.
 *
 * Numbers below are measured on the shipped rigs (2026-09-06, headless 60 Hz
 * harness, this build): walk dip 0.032-0.053 (forward and backward), strafe
 * dip 0.051-0.065, run dip 0.116-0.149, run strafe dip 0.092-0.119. Planted
 * sole at 1.368 m/s, a plant being a toe moving under 0.1 m/s in 3D so the
 * planter's acquire and release tails are left out: highest 0.016-0.019 over
 * the floor on ch01/ch12/ch21/ch44 and 0.035 on ch07, whose ankle sits 0.148
 * over its sole and reads a taller foot at every pitch; 95th percentile
 * 0.015-0.016 and 0.034; lowest -0.005 to -0.019 (the planter's floor clamp
 * holds the toe itself at or above the floor). Largest frame-to-frame pelvis
 * move in a steady walk is under 0.01; the defect was 0.037.
 */

const WALK_DROP = { min: 0.03, max: 0.06 };
const STRAFE_DROP = { min: 0.045, max: 0.075 };
const RUN_DROP = { min: 0.1, max: 0.16 };
const RUN_STRAFE_DROP = { min: 0.085, max: 0.13 };
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
        expectBand(seam.gaits[key]?.pelvisDrop ?? -1, WALK_DROP, `${id} ${key}`);
      }
      for (const key of ["strafeLeft", "strafeRight"]) {
        expectBand(seam.gaits[key]?.pelvisDrop ?? -1, STRAFE_DROP, `${id} ${key}`);
      }
      expectBand(seam.gaits.runForward?.pelvisDrop ?? -1, RUN_DROP, `${id} runForward`);
      for (const key of ["runStrafeLeft", "runStrafeRight"]) {
        expectBand(seam.gaits[key]?.pelvisDrop ?? -1, RUN_STRAFE_DROP, `${id} ${key}`);
      }
    }
  }, 180_000);

  it("hands the planter a toe pinned at the floor and never an ankle above the bind", async () => {
    for (const id of ALL_RIGS) {
      const { animator, bindAnkle } = await bootAnimator(id);
      // In the lowered pose the lowest ball of the foot is at or under the
      // floor, so the plant pins it at the floor itself.
      expect(animator.getToeOffset(), `${id} toe`).toBe(0);
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
    const walkDrop = seam.gaits.forward!.pelvisDrop;
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
