/**
 * The feet land, stand and leave the way the clip's feet do.
 *
 * Each figure is held to the same reading taken on the source clip, played on
 * the armature it was authored on (`driveSourceClip`). Until 2026-11-22 the
 * smaller-footed rigs landed toe first and slid every stance: ch01 touched
 * down at -5.7 degrees against the clip's 11, slid 31 cm in its worst stance,
 * and sidestepped with its feet skating 80 cm. Three causes, all fixed in the
 * contact bake rather than corrected after it:
 *
 * - Foot pitch was copied as an angle, and these rigs' feet sit at 30 to 34
 *   degrees at rest where the clip's sit at 39. The bake now carries pitch
 *   relative to each rig's own flat foot.
 * - The ball of the foot had no floor of its own in swing, so it dipped under
 *   the contact band mid-stride and read as a stance that slid.
 * - The pelvis travelled on an even rail while the feet were hung off it at
 *   the clip's offsets, so every planted foot slid by the clip's surge. The
 *   bake now gives the pelvis that surge back. And the pace a clip is played
 *   at is its own loop travel, not the travel of a foot that is pushing off.
 *
 * The sidestep is compared with the clip played at the same rate the rig
 * plays it. A trailing foot in that clip skims the floor for a frame at full
 * speed and for two at sixty percent, long enough to count as a stance that
 * travels, so the source read at its own speed would hold the rig to a walk
 * it is not playing.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  analyzePosture,
  avatar,
  avatarAssetsPresent,
  driveRig,
  driveSourceClip,
  editedScene3d,
  loadPackClips,
  type DriveRigResult,
} from "./locomotion-harness";

beforeAll(loadPackClips, 120_000);

const RIGS = ["x-bot", "ch01", "ch12", "ch44"];
const SIDE = { x: 1, z: 0 };

const sources = new Map<string, Promise<DriveRigResult>>();
function source(clip: string, speed?: number): Promise<DriveRigResult> {
  const key = `${clip}@${speed ?? "native"}`;
  if (!sources.has(key))
    sources.set(key, driveSourceClip({ clip, seconds: 8, speed }));
  return sources.get(key)!;
}

function target(rig: string, speed: number, direction = { x: 0, z: 1 }) {
  return driveRig({
    rig: avatar(rig),
    speedAt: () => speed,
    seconds: 8,
    settleSeconds: 3,
    planting: true,
    direction,
  });
}

const posture = (run: DriveRigResult) =>
  analyzePosture(run.frames, run.posture, run.report);

describe.skipIf(!avatarAssetsPresent() || !editedScene3d)(
  "foot contact carried from the clip",
  () => {
    it.each(RIGS)("walks %s heel first and standing still", async (rig) => {
      const clip = await source("forward");
      const walk = await target(rig, 1.4);
      const clipPosture = posture(clip);
      const walkPosture = posture(walk);

      expect(clipPosture.touchdownFootPitch).toBeGreaterThan(5);
      expect(walkPosture.touchdownFootPitch).toBeGreaterThan(2);
      expect(
        Math.abs(walkPosture.touchdownFootPitch - clipPosture.touchdownFootPitch)
      ).toBeLessThan(5);
      expect(
        Math.abs(
          walkPosture.midStanceKneeFlexion - clipPosture.midStanceKneeFlexion
        )
      ).toBeLessThan(5);
      expect(walk.report.peakSlip).toBeLessThanOrEqual(
        clip.report.peakSlip + 0.01
      );
    }, 180_000);

    // Skipped until the true sidestep clip is wired in (briefs/2026-11-22-walk-quality-run2.md
    // item 7): the pack's strafe it plays now crosses the feet on 42-46% of frames.
    it.skip.each(RIGS)("sidesteps %s without skating or crossing", async (rig) => {
      const clip = await source("strafeRight", 1.0);
      const side = await target(rig, 1.0, SIDE);
      const clipPosture = posture(clip);
      const sidePosture = posture(side);

      expect(side.report.peakSlip).toBeLessThanOrEqual(
        clip.report.peakSlip + 0.01
      );
      expect(side.report.meanSlip).toBeLessThanOrEqual(
        clip.report.meanSlip + 0.01
      );
      expect(sidePosture.widestAnkleSeparation).toBeLessThanOrEqual(
        1.1 * clipPosture.widestAnkleSeparation
      );
      expect(side.report.legCrossingFraction).toBe(0);
    }, 180_000);
  }
);
