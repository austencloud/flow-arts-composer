/**
 * The true sidestep clips, `sidestep-left.glb` and `sidestep-right.glb`
 * (built from Mixamo "Side Step", see `locomotion-pack/SIDESTEP.md`), are
 * what a sidestep should look like before any rig plays them: the body
 * square to the audience, the feet stepping apart and closing without ever
 * passing, and the closing foot off the floor rather than skating along it.
 *
 * Read from the clips as authored, at their own rate. Measured when the
 * build landed: chest and head within 5 degrees of front, no crossing, the
 * feet never nearer than 13 cm in the travel direction, peak stance slip
 * 0.10 m against 7.9 m before the closing foot was lifted.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  analyzePosture,
  avatarAssetsPresent,
  driveSourceClip,
  editedScene3d,
  loadPackClips,
} from "./locomotion-harness";

beforeAll(loadPackClips, 120_000);

describe.skipIf(!avatarAssetsPresent() || !editedScene3d)(
  "true sidestep clips",
  () => {
    it.each(["sidestepLeft", "sidestepRight"])(
      "%s faces front and closes the feet without crossing",
      async (clip) => {
        const run = await driveSourceClip({ clip, seconds: 8, speed: 1.0 });
        const posture = analyzePosture(run.frames, run.posture, run.report);

        expect(Math.abs(posture.chestYaw)).toBeLessThan(10);
        expect(Math.abs(posture.headYaw)).toBeLessThan(10);
        expect(run.report.legCrossingFraction).toBe(0);
        expect(run.report.minimumLegOrderMargin).toBeGreaterThan(0.08);
        expect(run.report.peakSlip).toBeLessThan(0.15);
      },
      120_000
    );
  }
);
