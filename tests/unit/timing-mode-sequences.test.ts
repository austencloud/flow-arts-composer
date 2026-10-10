import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hydrateSequence } from "#lib/features/choreo-card/services/sequence-render-hydrator.js";
import { TnDMode } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
import { MODE_ORDER } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import {
  adjustModeLoop,
  adjustModeLoops,
  modeLoopCount,
  modeLoopsPerGrid,
  selectModeLoops,
  transformModeLoop,
  transformModeLoops,
} from "../../src/routes/(public)/timing-and-direction/_data/mode-sequences";

const records = JSON.parse(
  readFileSync("static/data/hero/tnd-base-words.json", "utf8")
);
const sequences = records.map(hydrateSequence);
vi.mock("#lib/features/browse/gallery-home/canonical-tnd-pool.js", () => ({
  loadCanonicalTnDBaseSequences: async () => sequences,
}));

describe("mode guide four-count loops", () => {
  it("gives every mode real closed loops on both grids, all in that mode", () => {
    const expected = {
      SS: ["AAAA", "BBBB", "CCCC", "AAAA", "BBBB", "CCCC"],
      TS: ["GGGG", "HHHH", "IIII", "GGGG", "HHHH", "IIII"],
      QS: ["SSSS", "TTTT", "UUUU", "VVVV", "SSSS", "TTTT", "UUUU", "VVVV"],
      SO: ["JDJD", "KEKE", "LFLF", "PMPM", "QNQN", "RORO"],
      TO: ["DJDJ", "EKEK", "FLFL", "MPMP", "NQNQ", "OROR"],
      QO: ["MPMP", "NQNQ", "OROR", "DJDJ", "EKEK", "FLFL"],
    } as const;
    for (const code of MODE_ORDER) {
      const loops = selectModeLoops(code, sequences);
      const perGrid = modeLoopsPerGrid(code);
      expect(loops.map((loop) => loop.word)).toEqual(expected[code]);
      expect(loops).toHaveLength(modeLoopCount(code));
      expect(loops.map((loop) => loop.gridMode)).toEqual([
        ...Array(perGrid).fill("diamond"),
        ...Array(perGrid).fill("box"),
      ]);
      expect(new Set(loops.map((loop) => loop.id)).size).toBe(loops.length);
      for (const { word, sequence, gridMode } of loops) {
        expect(sequence.metadata?.familyId).toBe(
          {
            SS: "split-same",
            TS: "tog-same",
            QS: "quarter-same",
            SO: "split-opp",
            TO: "tog-opp",
            QO: "quarter-opp",
          }[code]
        );
        expect(sequence.steps.map((step) => step.letter).join("")).toBe(word);
        for (const [index, step] of sequence.steps.entries()) {
          expect(step.gridMode).toBe(gridMode);
          expect(deriveTnDFromPictograph(step).tndMode).toBe(code);
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
    }
  });

  it("retains pro/anti differences rather than replacing notation with hand floats", () => {
    const loops = selectModeLoops("TO", sequences);
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
    for (const loop of selectModeLoops("TO", sequences)) {
      const before = JSON.stringify(loop.sequence);
      const result = await adjustModeLoop(loop, 1.5, 2);
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
    const loop = selectModeLoops("TO", sequences)[0]!;
    const first = await adjustModeLoop(loop, 0.5, 0, 0);
    expect(first.metadata?.turnLoopClosed).toBe(false);
    const second = await adjustModeLoop(
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
    expect(second.metadata?.turnLoopClosed).toBe(false);
    expect(first.steps[2]!.motions.left.turns).toBe(0);
  });

  it("applies one turn choice to all six cards without replacing their recipes", async () => {
    const loops = selectModeLoops("TO", sequences);
    const adjusted = await adjustModeLoops(loops, 1, 1.5, 2);

    expect(adjusted).toHaveLength(6);
    expect(adjusted.map((loop) => loop.id)).toEqual(
      loops.map((loop) => loop.id)
    );
    for (const loop of adjusted) {
      expect(
        loop.sequence.steps.map((step) => step.motions.left.turns)
      ).toEqual([0, 0, 1, 0]);
      expect(
        loop.sequence.steps.map((step) => step.motions.right.turns)
      ).toEqual([0, 0, 1.5, 0]);
    }
    expect(loops[0]!.sequence.steps[2]!.motions.left.turns).toBe(0);
  });

  it("keeps geometric transforms when turns are edited afterwards", async () => {
    const loop = selectModeLoops("TO", sequences)[0]!;
    const rotated = await transformModeLoop(loop, "rotate-clockwise");
    const withTurns = await adjustModeLoop(
      { ...loop, sequence: rotated },
      1,
      1
    );

    expect(deriveTnDFromPictograph(rotated.steps[0]!).tndMode).toBe(
      TnDMode.QUARTER_OPP
    );
    expect(deriveTnDFromPictograph(withTurns.steps[0]!).tndMode).toBe(
      TnDMode.QUARTER_OPP
    );
    expect(withTurns.steps.map((step) => step.motions.left.turns)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("updates every card's actual grid grouping after a quarter rotation", async () => {
    const rotated = await transformModeLoops(
      selectModeLoops("TO", sequences),
      "rotate-clockwise"
    );

    expect(rotated.filter((loop) => loop.gridMode === "box")).toHaveLength(3);
    expect(rotated.filter((loop) => loop.gridMode === "diamond")).toHaveLength(
      3
    );
    expect(
      rotated.map(
        (loop) => deriveTnDFromPictograph(loop.sequence.steps[0]!).tndMode
      )
    ).toEqual(Array(6).fill(TnDMode.QUARTER_OPP));
  });

  it("gives consecutive rotations fresh identities and reclassifies each geometry", async () => {
    const loop = selectModeLoops("TO", sequences)[0]!;
    const rotated45 = await transformModeLoop(loop, "rotate-clockwise");
    const rotated90 = await transformModeLoop(
      { ...loop, sequence: rotated45 },
      "rotate-clockwise"
    );

    expect(rotated45.id).not.toBe(rotated90.id);
    expect(deriveTnDFromPictograph(rotated45.steps[0]!).tndMode).toBe(
      TnDMode.QUARTER_OPP
    );
    expect(rotated45.metadata?.familyId).toBe("quarter-opp");
    expect(deriveTnDFromPictograph(rotated90.steps[0]!).tndMode).toBe(
      TnDMode.SPLIT_OPP
    );
    expect(rotated90.metadata?.familyId).toBe("split-opp");
  });

  it("keeps Together-Opposite classification through mirror, flip, and swap", async () => {
    const loop = selectModeLoops("TO", sequences)[0]!;
    const mirrored = await transformModeLoop(loop, "mirror");
    const flipped = await transformModeLoop(
      { ...loop, sequence: mirrored },
      "flip"
    );
    const swapped = await transformModeLoop(
      { ...loop, sequence: flipped },
      "swap"
    );

    expect(deriveTnDFromPictograph(swapped.steps[0]!).tndMode).toBe(
      TnDMode.TOG_OPP
    );
    expect(swapped.metadata?.familyId).toBe("tog-opp");
    expect(swapped.word).toBe(deriveWord(swapped));
  });
});
