/**
 * The Walk Lab page and the harness play the same walk.
 *
 * `Avatar3D` does not call `setLocomotion` with the commanded speed: it runs
 * `AnimationStateMachine` first and passes its smoothed `animationSpeed`, and
 * the lab scales ch01 by 1.08. In November 2026 the page showed a swing half
 * as high as the harness's and a foot-slip readout ten times larger. The
 * swing turned out to be a stale package transform on the preview server,
 * and the readout was the `straight` pattern's backward legs; this keeps the
 * one real difference between the two drive paths, the state machine and the
 * scale, from opening a gap again.
 *
 * Swing height is read as the highest ankle over the lowest, per foot, in
 * the forward walk, which is what a half-height swing changes.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  avatar,
  avatarAssetsPresent,
  driveRig,
  editedScene3d,
  loadPackClips,
  type DriveRigResult,
} from "./locomotion-harness";

beforeAll(loadPackClips, 120_000);

function swing(run: DriveRigResult, side: "left" | "right"): number {
  const heights = run.frames.map((f) => f[side].ankle.y);
  return Math.max(...heights) - Math.min(...heights);
}

describe.skipIf(!avatarAssetsPresent() || !editedScene3d)(
  "page drive path",
  () => {
    it("walks ch01 at the page's scale the same through the state machine", async () => {
      const common = {
        rig: avatar("ch01"),
        speedAt: () => 1.4,
        seconds: 6,
        settleSeconds: 2,
        planting: true,
        rigScale: 1.08,
      } as const;
      const direct = await driveRig(common);
      const page = await driveRig({ ...common, throughStateMachine: true });

      for (const side of ["left", "right"] as const) {
        expect(swing(page, side)).toBeGreaterThan(0.9 * swing(direct, side));
      }
      expect(
        Math.abs(page.report.meanSlip - direct.report.meanSlip)
      ).toBeLessThan(0.01);
      expect(page.report.peakSlip).toBeLessThan(0.03);
    }, 120_000);
  }
);
