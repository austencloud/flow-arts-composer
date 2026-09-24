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
  /** Palm pairs closer than 6 cm. */
  maxPalmsUnder6cm: number;
  /** Staff-frames where a rendered staff passes through head, torso or arm. */
  maxStaffThroughBody: number;
}

const HAND_FRAMES = 12_960;

// Baseline measured 2026-09-24 (legacy contact mode, full corpus).
const GATES: Record<string, Gate> = {
  ch07: {
    maxGapOver3cm: 8_068,
    maxGapP90M: 0.2327,
    maxForearmsUnder4cm: 0,
    maxPalmsUnder6cm: 0,
    maxStaffThroughBody: 60,
  },
  ch18: {
    maxGapOver3cm: 8_282,
    maxGapP90M: 0.2443,
    maxForearmsUnder4cm: 0,
    maxPalmsUnder6cm: 0,
    maxStaffThroughBody: 49,
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
      const { sequences: _sequences, worstBeats, ...summary } = score;
      console.log(
        `scoreboard ${JSON.stringify({ ...summary, worstBeats: worstBeats.slice(0, 5) })}`
      );

      expect(score.handFrames).toBe(HAND_FRAMES);
      expect(score.gapOver3cm).toBeLessThanOrEqual(gate.maxGapOver3cm);
      expect(score.gapP90M).toBeLessThanOrEqual(gate.maxGapP90M);
      expect(score.forearmsUnder4cm).toBeLessThanOrEqual(
        gate.maxForearmsUnder4cm
      );
      expect(score.palmsUnder6cm).toBeLessThanOrEqual(gate.maxPalmsUnder6cm);
      const staffThroughBody =
        score.staffThrough["prop-through-head"]! +
        score.staffThrough["prop-through-torso"]! +
        score.staffThrough["prop-through-arm"]!;
      expect(staffThroughBody).toBeLessThanOrEqual(gate.maxStaffThroughBody);
    }, 1_800_000);
  }
});
