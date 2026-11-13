import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaSignature } from "#lib/shared/mandala/services/mandala-density.js";
import {
  fitLevelPictures,
  levelExamples,
  levelFace,
  mandalaLevels,
  startingLevel,
  steadyPictureCount,
  type MandalaLevel,
  type MandalaLevelShape,
} from "./mandala-levels";

function sequence(id: string): SequenceData {
  return { id, word: id } as unknown as SequenceData;
}

/** Sequences and the signature each one was measured with. */
function pool(entries: [id: string, key: string, spaces: number][]) {
  const signatures = new Map<string, MandalaSignature>();
  const sequences = entries.map(([id, key, spaces]) => {
    signatures.set(id, { key, spaces, coverage: spaces / 200 });
    return sequence(id);
  });
  return {
    sequences,
    signatureOf: (seq: SequenceData) => signatures.get(seq.id),
  };
}

describe("mandalaLevels", () => {
  it("counts sequences per level by their own mandala, keeping empty levels", () => {
    const { sequences, signatureOf } = pool([
      ["a", "k-simple", 4],
      ["b", "k-simple", 4],
      ["c", "k-edge", 9], // the first space count of level 2
      ["d", "k-busy", 120],
    ]);
    const levels = mandalaLevels(sequences, signatureOf);

    expect(levels.map((level) => [level.level, level.count])).toEqual([
      [1, 2],
      [2, 1],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 1],
    ]);
    expect(levels[0]!.shapes).toHaveLength(1);
    expect(levels[0]!.shapes[0]!.sequences.map((seq) => seq.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("leaves out unmeasured sequences and ones with no mandala", () => {
    const { sequences, signatureOf } = pool([
      ["a", "k-simple", 4],
      ["empty", "", 0],
    ]);
    const levels = mandalaLevels(
      [...sequences, sequence("not-measured")],
      signatureOf
    );
    expect(levels.reduce((sum, level) => sum + level.count, 0)).toBe(1);
  });

  it("orders a level's mandalas simple to complex", () => {
    const { sequences, signatureOf } = pool([
      ["a", "k-15", 15],
      ["b", "k-10", 10],
      ["c", "k-12", 12],
    ]);
    const [, level2] = mandalaLevels(sequences, signatureOf);
    expect(level2!.shapes.map((shape) => shape.spaces)).toEqual([10, 12, 15]);
  });
});

function shape(
  key: string,
  spaces: number,
  drawnBy: number
): MandalaLevelShape {
  return {
    key,
    spaces,
    coverage: 0,
    sequences: Array.from({ length: drawnBy }, (_, i) =>
      sequence(`${key}-${i}`)
    ),
  };
}

describe("levelExamples", () => {
  it("spreads the pictures over the whole level, taking the most-drawn of each run", () => {
    const shapes = [
      shape("a", 1, 1),
      shape("b", 2, 5),
      shape("c", 3, 1),
      shape("d", 4, 1),
      shape("e", 5, 2),
      shape("f", 6, 1),
    ];
    // Three runs: a b | c d | e f.
    expect(levelExamples(shapes, 3).map((pick) => pick.key)).toEqual([
      "b",
      "c",
      "e",
    ]);
  });

  it("shows every mandala when there are fewer than places", () => {
    const shapes = [shape("a", 1, 1), shape("b", 2, 1)];
    expect(levelExamples(shapes, 12).map((pick) => pick.key)).toEqual([
      "a",
      "b",
    ]);
    expect(levelExamples(shapes, 0)).toEqual([]);
  });
});

describe("fitLevelPictures", () => {
  // A 4K area: fifteen boxes of 238 across, eight rows.
  const base = { cols: 15, rows: 8, box: 238 };

  it("keeps the area's own layout when the level fills every place", () => {
    expect(fitLevelPictures(3700, 2000, 10, 400, base)).toBe(base);
    expect(fitLevelPictures(3700, 2000, 10, 0, base)).toBe(base);
  });

  it("grows a short level's pictures to fill the frame in whole rows", () => {
    const fit = fitLevelPictures(3700, 1800, 10, 31, base);
    // Whole rows of real mandalas, bigger than the base, inside the area.
    expect(fit.cols * fit.rows).toBeLessThanOrEqual(31);
    expect(fit.box).toBeGreaterThan(base.box);
    expect(fit.box).toBeLessThanOrEqual(base.box * 2);
    expect(fit.cols * fit.box + (fit.cols - 1) * 10).toBeLessThanOrEqual(3700);
    expect(fit.rows * fit.box + (fit.rows - 1) * 10).toBeLessThanOrEqual(1800);
    // It covers more of the area than two rows of base boxes did.
    expect(fit.cols * fit.rows * fit.box ** 2).toBeGreaterThan(
      30 * base.box ** 2
    );
  });

  it("puts a handful in one row, never past twice the base size", () => {
    expect(fitLevelPictures(3700, 1800, 10, 3, base)).toEqual({
      cols: 3,
      rows: 1,
      box: 476,
    });
  });

  it("adds a row a tall phone has room for, a little smaller, so no band stays empty", () => {
    // 378 by 487: three rows of 119 leave 110 px blank under them.
    expect(
      fitLevelPictures(378, 487, 10, 31, { cols: 3, rows: 3, box: 119 })
    ).toEqual({
      cols: 3,
      rows: 4,
      box: 114,
    });
  });

  it("never trades a picture away for bigger ones when the level has enough", () => {
    // A short phone, 341 by 180: two of 165 cover more, but three of 107 stay.
    const base = { cols: 3, rows: 1, box: 107 };
    expect(fitLevelPictures(341, 180, 10, 31, base)).toBe(base);
  });

  it("picks more pictures over bigger ones when both fill the frame", () => {
    // An upright tablet: 3 by 3 of 249 and 4 by 4 of 184 both fill 778 by 767.
    expect(
      fitLevelPictures(778, 767, 10, 31, { cols: 4, rows: 3, box: 187 })
    ).toEqual({
      cols: 4,
      rows: 4,
      box: 184,
    });
  });
});

function level(n: number, shapes: number): MandalaLevel {
  return {
    level: n,
    count: shapes,
    shapes: Array.from({ length: shapes }, (_, i) => shape(`${n}-${i}`, i, 1)),
  };
}

describe("steadyPictureCount", () => {
  it("gives every level as many places as the level with the fewest mandalas", () => {
    expect(
      steadyPictureCount([
        level(1, 31),
        level(2, 90),
        level(3, 0),
        level(4, 60),
      ])
    ).toBe(31);
  });

  it("does not let a nearly empty level shrink every other level", () => {
    expect(steadyPictureCount([level(1, 2), level(2, 40), level(3, 25)])).toBe(
      25
    );
    expect(steadyPictureCount([level(1, 2), level(2, 4)])).toBe(4);
    expect(steadyPictureCount([level(1, 0), level(2, 0)])).toBe(0);
  });
});

describe("levelFace", () => {
  it("takes the most-drawn mandala from the middle half, not the level's edges", () => {
    const shapes = [
      shape("a", 1, 1),
      shape("b", 2, 5), // first quarter: looks like the level below
      shape("c", 3, 1),
      shape("d", 4, 3),
      shape("e", 5, 2),
      shape("f", 6, 1),
      shape("g", 7, 9), // last quarter: looks like the level above
      shape("h", 8, 1),
    ];
    expect(levelFace(shapes)?.key).toBe("d");
  });

  it("uses what a short level has", () => {
    expect(levelFace([shape("a", 1, 1)])?.key).toBe("a");
    expect(levelFace([])).toBeUndefined();
  });
});

describe("startingLevel", () => {
  const { sequences, signatureOf } = pool([["a", "k-busy", 70]]);
  const levels = mandalaLevels(sequences, signatureOf);

  it("starts on the applied level, else the first level with sequences", () => {
    expect(startingLevel(levels, 2)).toBe(2);
    expect(startingLevel(levels, null)).toBe(5);
    expect(startingLevel(levels, 7)).toBe(5);
    expect(startingLevel([], null)).toBe(1);
  });
});
