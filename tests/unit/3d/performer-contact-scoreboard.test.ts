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
  /** Staff-frames (of 12,960) whose staff, as drawn, passes through the
   *  rig's head, torso, a leg, the other hand's arm, or the upper arm of the
   *  hand that holds it. */
  maxRenderedHead: number;
  maxRenderedTorso: number;
  maxRenderedLeg: number;
  maxRenderedOtherArm: number;
  maxRenderedOwnUpperArm: number;
  /** The forearm of the hand holding the staff: the staff runs along it
   *  wherever the wrist would have to bend to keep it clear. */
  maxRenderedOwnForearm: number;
  /** Head plus torso for the staff after displacement, before the lock, and
   *  where the stance plans it. */
  maxDisplacedHeadTorso: number;
  maxPlannedHeadTorso: number;
  /** Frames the drawn chest turns more than 60 degrees past the pelvis.
   *  Reported, not blocked, until the hips and feet carry the turn. */
  maxTwistOver60: number;
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

// Staffs are measured against the skinned mesh (performer-body-mesh.ts). The
// package's collision spheres put the face 8 cm behind the head, miss the
// front of the chest and ignore the turn, so the staff counts they gave
// (73 drawn, 65 and 72 "from the grid alone") are not comparable and the grid
// claim was wrong. First mesh measurement, 2026-09-25, staff-frames of 12,960,
// head / torso / leg:
//                  ch07              ch18
//   square body    0 / 0 / 0         0 / 0 / 0
//   planned        22 / 1,167 / 17   23 / 1,587 / 17
//   displaced      19 / 490 / 17     60 / 760 / 15
//   drawn          64 / 642 / 20     149 / 1,271 / 21
// The grid never touches the body held square. The hits come from turning the
// chest side-on (up to 87 degrees) while the staffs stay on the wall plane:
// tog-same and the fx g/h sequences above all. The drawn tog-opp step 2 right
// staff also passes through the head with the chest square (19 and 28
// frames, none planned): displacement pulls that hand 18 cm in and 9 cm back
// toward the body, and the render lock adds the rest (ch07 displaced 0). Drawn
// staffs through arms: own forearm 2,886 / 2,666, own upper arm 1,908 / 1,848,
// the other arm 628 / 637; wrist and elbow planning owns those. The chest
// turns more than 60 degrees past the pelvis on 2,633 / 2,614 of 6,480
// frames, up to 88 degrees: reported only until the hips and feet carry the
// turn (Austen, 2026-09-25).
//
// Hard-beat displacement (step 2 of the review: staff and hand move together,
// radially and in depth, within caps, and the legacy pair split is off),
// measured 2026-09-25, full corpus:
//   ch07 gap>3cm 1,787 / p90 0.0386 / forearms 75 (under 8 cm 350) / palms 7
//        / lane against routing 460
//   ch18 gap>3cm 2,362 / p90 0.0572 / forearms 34 (285) / palms 3 / 460
// Before the review fixes it was ch07 1,822 / 0.0394 / 75 / 7 and ch18
// 2,412 / 0.0602 / 35 / 3. Step 1 (square-stance wrist aim, legacy split on)
// was ch07 3,858 / 0.1806 / 0 / 8 and ch18 4,134 / 0.1846 / 0 / 4.
//
// Forearms are capped at the measured count (ch07 75, ch18 34 contacts under
// 4 cm), not at 0. Austen accepted that on 2026-09-25 so step 2 could merge.
// The old 0 came from the legacy split pulling the hands off their staffs,
// with no limit. Without it the contacts are elbow against elbow near the
// midline. On the tog-opp beats the lane is fully reached (18 cm planned,
// 18 cm between the palms) and the elbows still meet at 2-3 cm with the chest
// square; on the quarter-same and split-same beats the hands fall short of
// the lane. Only 7 and 5 of the contacts have a lane against elbow routing,
// and making the two agree frame by frame raised the contacts to 95 and 56.
// Closing the rest needs elbow and shoulder planning (step 4), not a wider
// lane; step 4 brings this cap back to 0.
const GATES: Record<string, Gate> = {
  ch07: {
    maxGapOver3cm: 1_787,
    maxGapP90M: 0.0386,
    maxForearmsUnder4cm: 75,
    maxForearmsUnder8cm: 350,
    maxPalmsUnder6cm: 7,
    maxRenderedHead: 64,
    maxRenderedTorso: 642,
    maxRenderedLeg: 20,
    maxRenderedOtherArm: 628,
    maxRenderedOwnUpperArm: 1_908,
    maxRenderedOwnForearm: 2_886,
    maxDisplacedHeadTorso: 509,
    maxPlannedHeadTorso: 1_189,
    maxTwistOver60: 2_633,
    maxRoutingLaneMismatchFrames: 460,
  },
  ch18: {
    maxGapOver3cm: 2_362,
    maxGapP90M: 0.0572,
    maxForearmsUnder4cm: 34,
    maxForearmsUnder8cm: 285,
    maxPalmsUnder6cm: 3,
    maxRenderedHead: 149,
    maxRenderedTorso: 1_271,
    maxRenderedLeg: 21,
    maxRenderedOtherArm: 637,
    maxRenderedOwnUpperArm: 1_848,
    maxRenderedOwnForearm: 2_666,
    maxDisplacedHeadTorso: 820,
    maxPlannedHeadTorso: 1_610,
    maxTwistOver60: 2_614,
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
        staffHitBeats,
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
        staffHitBeats
          .map(
            (beat) =>
              `staff ${beat.sequence} step ${beat.step} ${beat.side} through ${beat.zone}: ${beat.frames} frames (planned ${beat.plannedFrames}), chest up to ${beat.chestDegMax.toFixed(0)} deg`
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
      const rendered = score.staffThrough.rendered;
      expect(rendered.head).toBeLessThanOrEqual(gate.maxRenderedHead);
      expect(rendered.torso).toBeLessThanOrEqual(gate.maxRenderedTorso);
      expect(rendered.leg).toBeLessThanOrEqual(gate.maxRenderedLeg);
      expect(rendered.otherArm).toBeLessThanOrEqual(gate.maxRenderedOtherArm);
      expect(rendered.ownUpperArm).toBeLessThanOrEqual(
        gate.maxRenderedOwnUpperArm
      );
      expect(rendered.ownForearm).toBeLessThanOrEqual(
        gate.maxRenderedOwnForearm
      );
      const headTorso = (stage: "planned" | "displaced") =>
        score.staffThrough[stage].head + score.staffThrough[stage].torso;
      expect(headTorso("displaced")).toBeLessThanOrEqual(
        gate.maxDisplacedHeadTorso
      );
      expect(headTorso("planned")).toBeLessThanOrEqual(
        gate.maxPlannedHeadTorso
      );
      expect(score.twist.over60).toBeLessThanOrEqual(gate.maxTwistOver60);
      expect(score.routingLaneMismatchFrames).toBeLessThanOrEqual(
        gate.maxRoutingLaneMismatchFrames
      );
      expect(score.forearmsUnder8cm).toBeLessThanOrEqual(
        gate.maxForearmsUnder8cm
      );
      // Capped, not yet 0: see the note above GATES.
      expect(score.forearmsUnder4cm).toBeLessThanOrEqual(
        gate.maxForearmsUnder4cm
      );
    }, 1_800_000);
  }
});
