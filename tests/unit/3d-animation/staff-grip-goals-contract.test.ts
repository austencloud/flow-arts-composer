/**
 * The staff-grip lab's goal list is the swept corpus, provably.
 *
 * The lab pins the 19 core TnD sequences and shows each one's result from
 * `docs/diagnostics/prop-continuity-findings.json`. That claim only holds while
 * three things stay in step:
 *
 *   1. the roster in `lab-goals.ts`,
 *   2. `TND_MOTIONS` ids 1-19 in `scripts/seed-tnd-deck.ts`, which the sweep
 *      builds its corpus from, and
 *   3. the baked `static/data/hero/tnd-base-words.json` the browser hydrates.
 *
 * If any of them drifts, the lab would show one sequence's findings while
 * playing another's choreography. These assertions fail first instead.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { selectStaticSequence } from "$lib/shared/foundation/services/static-sequence-catalog";
import { continuityReport } from "$lib/shared/3d/diagnostics/prop-continuity-findings";

import {
  LAB_GOALS,
  LAB_GOAL_FAMILIES,
} from "../../../src/routes/test/staff-grip/lab-goals";
import {
  labContinuityMarkers,
  labContinuityStatus,
} from "../../../src/routes/test/staff-grip/lab-continuity";
import { coreTnDCorpus } from "../../tools/prop-continuity-corpus";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const catalogPayload = JSON.parse(
  readFileSync(
    path.join(projectRoot, "static/data/hero/tnd-base-words.json"),
    "utf8",
  ),
) as unknown;

/** Every field that changes what the stage actually plays. */
function playbackShape(sequence: {
  readonly steps: readonly unknown[];
  readonly startPlacement?: unknown;
}): unknown {
  const motion = (raw: unknown) => {
    const m = raw as Record<string, unknown>;
    return {
      motionType: m.motionType,
      rotationDirection: m.rotationDirection,
      startLocation: m.startLocation,
      endLocation: m.endLocation,
      startOrientation: m.startOrientation,
      endOrientation: m.endOrientation,
      turns: m.turns,
      hand: m.hand,
    };
  };

  const framed = (raw: unknown, withGridMode: boolean) => {
    const s = raw as Record<string, unknown>;
    const motions = s.motions as Record<string, unknown>;
    return {
      letter: s.letter ?? null,
      startPlacement: s.startPlacement ?? null,
      endPlacement: s.endPlacement ?? null,
      // Only compared on steps. The seeder leaves it off the start position
      // record itself while the baked document carries it; both agree on the
      // grid mode inside that record's own motions, which is what renders.
      gridMode: withGridMode ? s.gridMode : null,
      left: motion(motions.left),
      right: motion(motions.right),
    };
  };

  return {
    steps: sequence.steps.map((step) => framed(step, true)),
    startPlacement: sequence.startPlacement
      ? framed(sequence.startPlacement, false)
      : null,
  };
}

describe("staff-grip lab goals", () => {
  const corpus = coreTnDCorpus();

  it("is the seeder's first nineteen, in order", () => {
    expect(LAB_GOALS.map((goal) => goal.id)).toEqual(
      corpus.map((entry) => entry.id),
    );
    expect(LAB_GOALS.map((goal) => goal.word)).toEqual(
      corpus.map((entry) => entry.word),
    );
    expect(LAB_GOALS.map((goal) => goal.order)).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    );
  });

  it("groups all nineteen with no goal in two families and none stranded", () => {
    const grouped = LAB_GOAL_FAMILIES.flatMap((family) => family.goals);
    expect(grouped).toHaveLength(LAB_GOALS.length);
    expect(new Set(grouped.map((goal) => goal.id)).size).toBe(LAB_GOALS.length);
    for (const family of LAB_GOAL_FAMILIES) {
      expect(family.goals.length).toBeGreaterThan(0);
      for (const goal of family.goals) {
        expect(goal.familyId).toBe(family.id);
      }
    }
  });

  it("shows a word the product would show, never the expanded form", () => {
    // A repeating word always displays in its smallest form: AAAA reads as A.
    expect(LAB_GOALS.map((goal) => goal.label)).toEqual([
      "A",
      "B",
      "C",
      "G",
      "H",
      "I",
      "S",
      "T",
      "U",
      "V",
      "JD",
      "KE",
      "LF",
      "DJ",
      "EK",
      "FL",
      "MP",
      "NQ",
      "OR",
    ]);
  });

  it("hydrates from the baked catalog to the choreography the sweep walked", () => {
    for (const entry of corpus) {
      const hydrated = selectStaticSequence(catalogPayload, entry.id);
      expect(hydrated, `${entry.id} is missing from the baked catalog`).not.toBe(
        null,
      );
      expect(playbackShape(hydrated!), entry.id).toEqual(
        playbackShape(entry.sequence),
      );
    }
  });

  /*
   * The scrub's markers are buttons, and `app.css` floors every button at
   * `--min-touch-target`. Two of them closer together than that would cover
   * each other and a tap would land on the wrong jump, so `LabTransport`
   * swaps the buttons for drawn ticks once its lane drops below 18rem.
   *
   * That threshold is only correct while the tightest pair the sweep actually
   * produces still clears 44px on a 288px lane. This is the arithmetic behind
   * the container query: if a future sweep finds two jumps closer together
   * than this, the breakpoint has to move with it.
   */
  it("keeps two markers a touch target apart at the width that still draws buttons", () => {
    const LAB_FRAME_STEP = 0.01;
    const NARROWEST_BUTTON_LANE_PX = 18 * 16;
    const MIN_TOUCH_TARGET_PX = 44;
    const required = MIN_TOUCH_TARGET_PX / NARROWEST_BUTTON_LANE_PX;

    let tightest = Number.POSITIVE_INFINITY;
    let tightestId = "";

    for (const goal of LAB_GOALS) {
      const status = labContinuityStatus(goal.id);
      const trackSpan = Math.max(
        continuityReport(goal.id)!.motionStepCount - LAB_FRAME_STEP,
        LAB_FRAME_STEP,
      );
      const centres = labContinuityMarkers(status, trackSpan)
        .map((marker) => marker.start + marker.width / 2)
        .sort((a, b) => a - b);

      for (let index = 1; index < centres.length; index += 1) {
        const gap = centres[index] - centres[index - 1];
        if (gap < tightest) {
          tightest = gap;
          tightestId = goal.id;
        }
      }
    }

    expect(tightest, "no goal has two markers to separate").toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
    expect(
      tightest,
      `${tightestId} puts two markers ${(tightest * NARROWEST_BUTTON_LANE_PX).toFixed(1)}px apart on an 18rem lane`,
    ).toBeGreaterThanOrEqual(required);
  });

  it("has a committed continuity result for every goal", () => {
    for (const goal of LAB_GOALS) {
      const report = continuityReport(goal.id);
      expect(report, `${goal.id} was never swept`).toBeDefined();
      expect(report!.word).toBe(goal.word);
      expect(report!.group).toBe("core-tnd");
      expect(report!.motionStepCount).toBe(
        corpus.find((entry) => entry.id === goal.id)!.sequence.steps.length,
      );
    }
  });
});
