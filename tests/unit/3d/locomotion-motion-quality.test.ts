/**
 * Locomotion motion quality
 *
 * The rest of the locomotion suite checks plumbing: that a key exists, that a
 * band is arithmetic, that a clock advances. None of it can tell whether the
 * character on screen is moving like a person, because none of it ever poses a
 * skeleton. This does.
 *
 * It drives the real `LocomotionAnimator` with the real shipped clips on real
 * shipped rigs, reads the pose off the bones with the walk lab's own sampler,
 * and measures it with the walk lab's own analysis. Nothing here is a stand-in,
 * and that includes the retarget: the pack clips are authored on `mixamorig:`
 * and the avatars' bones are `mixamorig12:`, so every run goes through
 * `remapClipToSkeleton` exactly as the app does.
 *
 * The loading and driving live in `./locomotion-harness`, which every suite
 * that needs a posed skeleton shares.
 *
 * ## What this can and cannot see
 *
 * `FootPlanter` IK and the arm pass run after the animator in `Avatar3D`, and
 * neither runs here: `driveRig` is called without `planting`. That is
 * deliberate -- it isolates the layer the run tier changed, so a correction
 * downstream cannot hide a defect upstream -- but it decides what may be
 * asserted. The anatomy suite is the one that turns the planter on.
 *
 * Measured, not assumed: on `ch01` at 3.9 m/s this layer reports cadence 80/min
 * and a step length of 0 cm, while the same rig through the full pipeline in
 * the walk lab reports 133/min and 140.7 cm. Every contact-derived number --
 * cadence, step length, duty factor, foot slip, over-support, weight
 * alternation -- is dominated by the planter that is missing here, so asserting
 * on one would be pinning an artefact of the harness. Those belong to the
 * browser probe, on the complete pipeline.
 *
 * What survives the missing planter is what the animator alone decides:
 *
 * - the **pelvis bob**, which `prepareClip` writes and which is the whole
 *   reason a stance foot has something to stand through;
 * - the **gait tier**, which is pure clip-weight arithmetic;
 * - the **crossover**, because a pose discontinuity at the tier change would
 *   appear as joint acceleration whether or not a planter later locks a foot.
 *
 * Those three are measured on every shipped rig below, and they agree to within
 * a millimetre across all of them.
 *
 * ## Not a curve
 *
 * Every walk-lab pattern that sustains a gait long enough to fill a buffer
 * rides `CIRCLE_R = 2.6`, which at run speed is 6 m/s^2 of lateral acceleration
 * -- enough to move the pelvis off the support foot on its own. This travels in
 * a straight line, which is the only way to tell a weight-transfer defect from
 * the turn the character was asked to hold.
 *
 * `setActiveState` is not called, so weights take the legacy path. For steady
 * locomotion the two are equivalent: the state path multiplies the same
 * `targetDirWeights` by 1 while WALKING. `LocomotionState` is not exported from
 * the package, and reaching past that to exercise a multiply-by-one would buy
 * nothing.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { getClipFootprint } from "@austencloud/scene-3d";

import type { GaitFrame } from "$lib/shared/3d/diagnostics/gait/gait-frame";
import {
  avatar,
  avatarAssetsPresent,
  driveRig,
  loadPackClips,
  loadRig,
  REFERENCE_RIG,
  RIGS,
} from "./locomotion-harness";

beforeAll(loadPackClips, 120_000);

/** Peak-to-peak vertical travel of the pelvis, in centimetres. */
function bobCm(frames: GaitFrame[]): number {
  let low = Infinity;
  let high = -Infinity;
  for (const frame of frames) {
    low = Math.min(low, frame.hips.y);
    high = Math.max(high, frame.hips.y);
  }
  return (high - low) * 100;
}

const last = (values: number[]) => values[values.length - 1] ?? 0;

/**
 * Peak-to-peak pelvis travel a clip was authored with, in centimetres on the
 * reference rig: the footprint's hip heights are in leg lengths, and the bake
 * writes them onto this rig's legs.
 */
async function authoredBobCm(key: string): Promise<number> {
  const clip = (await loadPackClips()).get(key);
  const footprint = clip ? getClipFootprint(clip) : null;
  expect(footprint, `${key} footprint`).toBeTruthy();
  const { leftLeg } = await loadRig(REFERENCE_RIG);
  const at = (bone: { getWorldPosition(v: Vector3): Vector3 }) =>
    bone.getWorldPosition(new Vector3());
  const legLength =
    at(leftLeg.root).distanceTo(at(leftLeg.middle)) +
    at(leftLeg.middle).distanceTo(at(leftLeg.effector));
  const hips = Array.from(footprint!.hips);
  return (Math.max(...hips) - Math.min(...hips)) * legLength * 100;
}

/**
 * Flow Fest walks at 1.7 and sprints at 3.91. These sit either side of the
 * band the animator derives from the clips' own measured speeds: the walk clip
 * stops being honest at 1.5174 x 1.15 = 1.745 and the run clip starts being
 * honest at 3.0987 x 0.80 = 2.479.
 */
const WALK_SPEED = 1.4;
const RUN_SPEED = 3.9;

// The rigs are gitignored (see avatarAssetsPresent): CI and fresh clones skip
// this suite instead of reporting a missing binary as a broken gait.
const present = avatarAssetsPresent();

describe.skipIf(!present)("locomotion motion quality", () => {
  describe("pelvis bob", () => {
    it("raises and lowers the pelvis through a walk", async () => {
      const { frames } = await driveRig({
        speedAt: () => WALK_SPEED,
        seconds: 6,
      });
      // A walk lifts its pelvis roughly eight centimetres per step, and that
      // rise is what gives a foot a stance to stand through. A pelvis pinned
      // to one height leaves the leg no way to fold except by moving the foot.
      expect(bobCm(frames)).toBeGreaterThan(4);
      expect(bobCm(frames)).toBeLessThan(14);
    }, 120_000);

    it("keeps the bob once the run tier has taken over", async () => {
      const run = await driveRig({ speedAt: () => RUN_SPEED, seconds: 6 });
      expect(bobCm(run.frames)).toBeGreaterThan(4);
      // Blending toward a clip that had lost its vertical track would show up
      // here as the run keeping little of the pelvis travel it was authored
      // with. Measured against the run clip itself, not against the walk: the
      // pack's run lifts its pelvis 0.0890 leg lengths peak to peak and its
      // walk 0.0852, only 4% apart, and holding every planted foot exactly on
      // the floor trims the run's pelvis 6% and the walk's not at all. On ch01
      // that is a 6.89 cm run against a 7.05 cm walk, with the run keeping 94%
      // of its authored 7.32 cm (2026-09-24). "The run bobs more than the
      // walk" was a margin inside the bake's own correction, not a property
      // of the clips.
      expect(bobCm(run.frames)).toBeGreaterThan(
        0.9 * (await authoredBobCm("runForward"))
      );
    }, 120_000);

    it("bobs by the same amount on every shipped rig", async () => {
      const measured: Record<string, number> = {};
      for (const id of RIGS) {
        const { frames } = await driveRig({
          speedAt: () => WALK_SPEED,
          seconds: 5,
          rig: avatar(id),
        });
        measured[id] = bobCm(frames);
      }
      const values = Object.values(measured);
      for (const [id, cm] of Object.entries(measured)) {
        expect(cm, `${id} bob`).toBeGreaterThan(4);
        expect(cm, `${id} bob`).toBeLessThan(14);
      }
      // The bob is written as a fraction of each clip's own hip height, so it
      // should land in the same place on a tall rig and a short one. A rig
      // whose armature convention differed would fall out of this spread
      // rather than quietly measuring a pelvis that never moved.
      expect(Math.max(...values) - Math.min(...values)).toBeLessThan(2);
    }, 300_000);
  });

  describe("gait tier", () => {
    it("holds the walk clip below the band and reaches the run clip above it", async () => {
      const walk = await driveRig({ speedAt: () => WALK_SPEED, seconds: 4 });
      const run = await driveRig({ speedAt: () => RUN_SPEED, seconds: 4 });
      expect(last(walk.tiers)).toBeLessThan(0.01);
      expect(last(run.tiers)).toBeGreaterThan(0.99);
    }, 120_000);

    it("engages on every shipped rig", async () => {
      for (const id of RIGS) {
        const { tiers } = await driveRig({
          speedAt: () => RUN_SPEED,
          seconds: 4,
          rig: avatar(id),
        });
        expect(last(tiers), `${id} reaches the run tier`).toBeGreaterThan(0.99);
      }
    }, 300_000);

    it("stays on the walk when the pack carries no run clips", async () => {
      const { tiers, frames } = await driveRig({
        speedAt: () => RUN_SPEED,
        seconds: 5,
        omitClips: ["runForward", "runStrafeLeft", "runStrafeRight"],
      });
      // A pack without run coverage must behave exactly as it did before the
      // tier existed: the fraction is zero when the clip is absent, so the
      // body speed-walks rather than blending toward a clip it does not have.
      expect(last(tiers)).toBe(0);
      // And it must still be animating -- a fallback that froze the pelvis
      // would satisfy the tier check above while looking like a bug.
      expect(bobCm(frames)).toBeGreaterThan(4);
    }, 120_000);

    it("changes the shape of the gait, not only its rate", async () => {
      const walk = await driveRig({ speedAt: () => WALK_SPEED, seconds: 6 });
      const run = await driveRig({ speedAt: () => RUN_SPEED, seconds: 6 });
      // Absolute duty factor here is not the app's -- contact detection needs
      // the planter this harness omits -- but the ratio is the point. A run
      // replaces double support with flight, so its feet are down for a
      // materially smaller share of the cycle than the walk's. A speed-walk
      // driven by playback rate alone would leave this ratio near 1.
      expect(run.report.dutyFactor).toBeLessThan(walk.report.dutyFactor * 0.6);
      expect(run.report.doubleSupportFraction).toBeLessThan(
        walk.report.doubleSupportFraction + 1e-9
      );
    }, 120_000);
  });

  describe("walk to run crossover", () => {
    const RAMP_SECONDS = 8;
    const rampDrive = () =>
      driveRig({
        speedAt: (t) => 1.2 + (4.2 - 1.2) * Math.min(1, t / RAMP_SECONDS),
        seconds: RAMP_SECONDS + 2,
      });

    it("rises monotonically through the band it derives from the clips", async () => {
      const { tiers, speeds } = await rampDrive();
      let regressions = 0;
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i]! < tiers[i - 1]! - 1e-6) regressions++;
      }
      // Hunting between tiers would read as a body that cannot decide whether
      // it is running, so the fraction may never fall while the speed climbs.
      expect(regressions).toBe(0);
      expect(tiers[0]).toBeLessThan(0.01);
      expect(last(tiers)).toBeGreaterThan(0.99);

      const enter = tiers.findIndex((value) => value > 0.01);
      const exit = tiers.findIndex((value) => value > 0.99);
      // Derived band is 1.745 to 2.479; the commanded speed leads the blended
      // speed the animator actually sees, so the measured crossing trails it.
      expect(speeds[enter]!).toBeGreaterThan(1.4);
      expect(speeds[enter]!).toBeLessThan(2.0);
      expect(speeds[exit]!).toBeGreaterThan(2.2);
      expect(speeds[exit]!).toBeLessThan(2.9);
    }, 120_000);

    it("exchanges the two tiers without jolting a joint", async () => {
      const { report, tiers } = await rampDrive();
      const enter = tiers.findIndex((value) => value > 0.01);
      const exit = tiers.findIndex((value) => value > 0.99);
      const frameCount = tiers.length;
      const duration = report.duration;
      // Without this the filter below would grade an empty window as clean:
      // a tier that never left zero has no band to be quiet inside.
      expect(enter).toBeGreaterThan(-1);
      expect(exit).toBeGreaterThan(enter);

      // Both tiers read the same monotonic gait clock and each clip is offset
      // by its own measured left-strike phase, so a crossover should land
      // between footfalls with the two clips already agreeing on which foot is
      // down. If they did not, the tier change would teleport a leg -- and a
      // teleport is exactly what a body-local acceleration spike is.
      const inBand = report.jolts.filter((jolt) => {
        const frame = Math.round(
          (jolt.t / Math.max(duration, 1e-6)) * frameCount
        );
        return frame >= enter && frame <= exit;
      });
      expect(
        inBand.map((jolt) => `${jolt.joint}@${jolt.t.toFixed(2)}s`)
      ).toEqual([]);
    }, 120_000);
  });
});
