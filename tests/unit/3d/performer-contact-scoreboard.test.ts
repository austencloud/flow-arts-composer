/**
 * Contact gates for the stage performer. The numbers are ratchets from
 * `docs/architecture/performer-contact-review.md`: tighten them when a fix
 * lands, never loosen them to make a change pass.
 *
 * Set SCOREBOARD_OUT to a directory to write each rig's full report as JSON
 * (per-sequence counts and the worst beats).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { avatarAssetsPresent } from "./locomotion-harness";
import { runContactScoreboard } from "./performer-contact-scoreboard";

interface Gate {
  /** Hand-frames with the palm over 3 cm from its staff (of 12,960). */
  maxGapOver3cm: number;
  /** 90th-percentile palm-to-staff gap, metres. */
  maxGapP90M: number;
  /** Forearm pairs closer than 4 cm (of 6,480 pair-frames). */
  maxForearmsUnder4cm: number;
  /** Forearm pairs closer than 8 cm: the near misses around those contacts. */
  maxForearmsUnder8cm: number;
  /** Palm pairs closer than 6 cm. */
  maxPalmsUnder6cm: number;
  /** Staff-frames where a rendered staff passes through head, torso or arm. */
  maxStaffThroughBody: number;
  /** The same for the staff where the grid places it, before displacement. */
  maxAuthoredStaffThroughBody: number;
  /** The same for the displaced staff, before the render lock. */
  maxDisplacedStaffThroughBody: number;
  /** Pair-frames whose depth lane puts downstage the hand that elbow routing
   *  does not put over. */
  maxRoutingLaneMismatchFrames: number;
}

const HAND_FRAMES = 12_960;
/** The review's goal for the 90th-percentile gap, both rigs. */
const GAP_P90_GOAL_M = 0.12;
/** The approved displacement caps, written out so a change to the planner's
 *  defaults cannot move them: 25 cm in toward the grid centre, never out, and
 *  a 10 cm depth lane. */
const APPROVED_CAPS = {
  radialInMaxM: 0.25,
  radialOutMaxM: 0,
  laneDepthMaxM: 0.1,
} as const;
const EPS = 1e-9;

// Step 2 (hard-beat displacement: staff and hand move together, radially and
// in depth, within caps, and the legacy pair split is off), measured
// 2026-09-25, full corpus:
//   ch07 gap>3cm 1,787 / p90 0.0386 / forearms 75 (under 8 cm 350) / palms 7
//        / staff 73 (authored 65, displaced 75) / lane against routing 460
//   ch18 gap>3cm 2,362 / p90 0.0572 / forearms 34 (285) / palms 3
//        / staff 73 (authored 72, displaced 70) / lane against routing 460
// Before the review fixes it was ch07 1,822 / 0.0394 / 75 / 7 / 104 (67) and
// ch18 2,412 / 0.0602 / 35 / 3 / 122 (72). Step 1 (square-stance wrist aim,
// legacy split on) was ch07 3,858 / 0.1806 / 0 / 8 / 136 (70) and ch18
// 4,134 / 0.1846 / 0 / 4 / 157 (83).
//
// Step 2 replaces the inward pull with a radial/depth displacement and must
// bring the rendered count down to the authored one. Not met yet: ch07 73
// against 65, ch18 73 against 72. The displaced staff alone clips 75 and 70.
//
// The forearm gate is not met and stays at 0 (ch07 75, ch18 34 contacts under
// 4 cm). The legacy split kept forearms apart by pulling the hands off their
// staffs, with no limit. Without it the contacts are elbow against elbow near
// the midline. On the tog-opp beats the lane is fully reached (18 cm planned,
// 18 cm between the palms) and the elbows still meet at 2-3 cm with the chest
// square; on the quarter-same and split-same beats the hands fall short of
// the lane. Only 7 and 5 of the contacts have a lane against elbow routing,
// and making the two agree frame by frame raised the contacts to 95 and 56.
// Closing the rest needs elbow and shoulder planning, not a wider lane.
const GATES: Record<string, Gate> = {
  ch07: {
    maxGapOver3cm: 1_787,
    maxGapP90M: 0.0386,
    maxForearmsUnder4cm: 0,
    maxForearmsUnder8cm: 350,
    maxPalmsUnder6cm: 7,
    maxStaffThroughBody: 73,
    maxAuthoredStaffThroughBody: 65,
    maxDisplacedStaffThroughBody: 75,
    maxRoutingLaneMismatchFrames: 460,
  },
  ch18: {
    maxGapOver3cm: 2_362,
    maxGapP90M: 0.0572,
    maxForearmsUnder4cm: 0,
    maxForearmsUnder8cm: 285,
    maxPalmsUnder6cm: 3,
    maxStaffThroughBody: 73,
    maxAuthoredStaffThroughBody: 72,
    maxDisplacedStaffThroughBody: 70,
    maxRoutingLaneMismatchFrames: 460,
  },
};

describe.skipIf(!avatarAssetsPresent())("performer contact scoreboard", () => {
  for (const [rig, gate] of Object.entries(GATES)) {
    it(`${rig}: palms stay on their staffs without arms colliding`, async () => {
      const score = await runContactScoreboard(rig);
      const out = process.env.SCOREBOARD_OUT;
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(
          path.join(out, `${rig}.json`),
          JSON.stringify(score, null, 1)
        );
      }
      const {
        sequences: _sequences,
        displacedBeats,
        worstBeats,
        forearmClusters,
        ...summary
      } = score;
      console.log(
        `scoreboard ${JSON.stringify({ ...summary, displacedBeats: displacedBeats.length, worstBeats: worstBeats.slice(0, 5) })}`
      );
      const cm = (m: number | null) =>
        m === null ? "-" : `${(m * 100).toFixed(1)} cm`;
      console.log(
        displacedBeats
          .map(
            (beat) =>
              `displaced ${beat.sequence} step ${beat.step} ${beat.hand}: radial ${cm(beat.radialInMaxM)}${beat.capped ? " (capped)" : ""}, toward ${cm(beat.laneTowardAudienceMaxM)}, away ${cm(beat.laneAwayMaxM)}, corridor ${cm(beat.corridorDepthMaxAbsM)}, short ${cm(beat.shortfallMaxM)}, lock ${cm(beat.lockMaxM)} (tangential ${cm(beat.lockTangentialMaxM)}) (${[...beat.causes, ...(beat.laneRule ? [beat.laneRule] : [])].join(", ")})`
          )
          .join("\n")
      );
      console.log(
        forearmClusters
          .map(
            (cluster) =>
              `forearms ${cluster.sequence} step ${cluster.step}: ${cluster.frames} frames, min ${cm(cluster.minM)}, lane ${cm(cluster.laneTargetSeparationM)} planned / ${cm(cluster.laneRealizedSeparationM)} reached, ${cluster.routingLaneMismatchFrames} against routing`
          )
          .join("\n")
      );

      expect(score.handFrames).toBe(HAND_FRAMES);

      // Every displaced beat is in the report, within the approved caps, with
      // a reason.
      expect(displacedBeats.length).toBeGreaterThan(0);
      expect(score.unlistedDisplacedFrames).toBe(0);
      for (const beat of displacedBeats) {
        const where = `${beat.sequence} step ${beat.step} ${beat.hand}`;
        expect(beat.causes.length, where).toBeGreaterThan(0);
        expect(beat.radialInMaxM, where).toBeLessThanOrEqual(
          APPROVED_CAPS.radialInMaxM + EPS
        );
        expect(beat.radialOutMaxM, where).toBeLessThanOrEqual(
          APPROVED_CAPS.radialOutMaxM + EPS
        );
        expect(beat.laneTowardAudienceMaxM, where).toBeLessThanOrEqual(
          APPROVED_CAPS.laneDepthMaxM + EPS
        );
        expect(beat.laneAwayMaxM, where).toBeLessThanOrEqual(
          APPROVED_CAPS.laneDepthMaxM + EPS
        );
      }
      // The same caps measured on the staffs as drawn, from where the score
      // puts them: along the radial line and in depth only, never around the
      // grid. The render lock on top is logged, not gated here: it still
      // slides up to its 6 cm in any direction.
      const moves = score.renderedMoves;
      expect(moves.offPlaneMaxM).toBeLessThanOrEqual(EPS);
      expect(moves.radialInMaxM).toBeLessThanOrEqual(
        APPROVED_CAPS.radialInMaxM + EPS
      );
      expect(moves.radialOutMaxM).toBeLessThanOrEqual(
        APPROVED_CAPS.radialOutMaxM + EPS
      );
      expect(moves.depthMaxAbsM).toBeLessThanOrEqual(
        APPROVED_CAPS.laneDepthMaxM + EPS
      );

      expect(score.gapOver3cm).toBeLessThanOrEqual(gate.maxGapOver3cm);
      expect(score.gapP90M).toBeLessThanOrEqual(GAP_P90_GOAL_M);
      expect(score.gapP90M).toBeLessThanOrEqual(gate.maxGapP90M);
      expect(score.palmsUnder6cm).toBeLessThanOrEqual(gate.maxPalmsUnder6cm);
      const throughBody = (counts: Record<string, number>) =>
        counts["prop-through-head"]! +
        counts["prop-through-torso"]! +
        counts["prop-through-arm"]!;
      expect(throughBody(score.staffThrough)).toBeLessThanOrEqual(
        gate.maxStaffThroughBody
      );
      expect(throughBody(score.authoredStaffThrough)).toBeLessThanOrEqual(
        gate.maxAuthoredStaffThroughBody
      );
      expect(throughBody(score.displacedStaffThrough)).toBeLessThanOrEqual(
        gate.maxDisplacedStaffThroughBody
      );
      expect(score.routingLaneMismatchFrames).toBeLessThanOrEqual(
        gate.maxRoutingLaneMismatchFrames
      );
      expect(score.forearmsUnder8cm).toBeLessThanOrEqual(
        gate.maxForearmsUnder8cm
      );
      // Last, so the other gates are still checked while this one is unmet.
      expect(score.forearmsUnder4cm).toBeLessThanOrEqual(
        gate.maxForearmsUnder4cm
      );
    }, 1_800_000);
  }
});
