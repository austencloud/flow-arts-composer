import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hydrateSequence } from "$lib/features/choreo-card/services/sequence-render-hydrator";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import {
  adjustTogetherOppositeLoop,
  selectTogetherOppositeLoops,
} from "../../src/routes/(public)/timing-and-direction/_data/together-opposite-sequences";

const records = JSON.parse(
  readFileSync("static/data/hero/tnd-base-words.json", "utf8")
);
const sequences = records.map(hydrateSequence);
vi.mock("$lib/features/browse/gallery-home/canonical-tnd-pool", () => ({
  loadCanonicalTnDBaseSequences: async () => sequences,
}));

describe("Together–Opposite four-count loops", () => {
  it("resolves all six real sequences into the correct grids and family", () => {
    const loops = selectTogetherOppositeLoops(sequences);
    expect(loops.map(({ word, gridMode }) => `${gridMode}:${word}`)).toEqual([
      "diamond:DJDJ",
      "diamond:EKEK",
      "diamond:FLFL",
      "box:MPMP",
      "box:NQNQ",
      "box:OROR",
    ]);
    for (const { word, sequence, gridMode } of loops) {
      expect(sequence.steps.map((step) => step.letter).join("")).toBe(word);
      for (const [index, step] of sequence.steps.entries()) {
        expect(step.gridMode).toBe(gridMode);
        expect(deriveTnDFromPictograph(step).tndMode).toBe(TnDMode.TOG_OPP);
        const next = sequence.steps[(index + 1) % 4]!;
        for (const hand of ["left", "right"] as const) {
          expect(step.motions[hand].endLocation).toBe(
            next.motions[hand].startLocation
          );
          expect(step.motions[hand].endOrientation).toBe(
            next.motions[hand].startOrientation
          );
        }
      }
    }
  });

  it("retains pro/anti differences rather than replacing notation with hand floats", () => {
    const loops = selectTogetherOppositeLoops(sequences);
    expect(
      loops.slice(0, 3).map(({ sequence }) =>
        Object.values(sequence.steps[0]!.motions)
          .map((motion) => motion.motionType)
          .sort()
      )
    ).toEqual([
      ["pro", "pro"],
      ["anti", "anti"],
      ["anti", "pro"],
    ]);
  });

  it("adjusts and propagates turns immutably without changing the hand classification", async () => {
    for (const loop of selectTogetherOppositeLoops(sequences)) {
      const before = JSON.stringify(loop.sequence);
      const result = await adjustTogetherOppositeLoop(loop, 1.5, 2);
      expect(JSON.stringify(loop.sequence)).toBe(before);
      expect(result.metadata?.turnLoopClosed).toBe(true);
      for (const [index, step] of result.steps.entries()) {
        expect(step.motions.left.turns).toBe(1.5);
        expect(step.motions.right.turns).toBe(2);
        expect(deriveTnDFromPictograph(step).tndMode).toBe(TnDMode.TOG_OPP);
        const next = result.steps[(index + 1) % 4]!;
        for (const hand of ["left", "right"] as const) {
          expect(step.motions[hand].endOrientation).toBe(
            next.motions[hand].startOrientation
          );
        }
      }
    }
  });

  it("keeps earlier count edits and flags an open prop orientation seam", async () => {
    const loop = selectTogetherOppositeLoops(sequences)[0]!;
    const first = await adjustTogetherOppositeLoop(loop, 0.5, 0, 0);
    expect(first.metadata?.turnLoopClosed).toBe(false);
    const second = await adjustTogetherOppositeLoop(
      { ...loop, sequence: first },
      0.5,
      0,
      2
    );
    expect(second.steps.map((step) => step.motions.left.turns)).toEqual([
      0.5, 0, 0.5, 0,
    ]);
    expect(second.steps.map((step) => step.motions.right.turns)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(first.steps[2]!.motions.left.turns).toBe(0);
  });
});
