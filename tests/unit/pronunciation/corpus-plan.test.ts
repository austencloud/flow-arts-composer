import { describe, expect, it } from "vitest";

import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { getLetterPronunciation, PRONUNCIATION_POSITIONS } from "#lib/shared/pronunciation/pronunciation-plan.js";
import { cellsCoveredBy, coverageKey, planWords, TARGET_DEPTH } from "#lib/features/lab/pronunciation-recorder/domain/corpus-plan.js";

const ALL_LETTERS = Object.values(Letter);

function allCells(): string[] {
  return ALL_LETTERS.flatMap((letter) =>
    PRONUNCIATION_POSITIONS.map((position) =>
      coverageKey(getLetterPronunciation(letter)!.assetKey, position)
    )
  );
}

describe("cellsCoveredBy", () => {
  it("gives a multi-letter word one initial, one final, and the rest medial", () => {
    const cells = cellsCoveredBy([Letter.A, Letter.B, Letter.C, Letter.D]);

    expect(cells).toEqual([
      coverageKey("a", "initial"),
      coverageKey("b", "medial"),
      coverageKey("c", "medial"),
      coverageKey("d", "final"),
    ]);
  });

  it("gives a single-letter word an isolated cell", () => {
    // Isolated cannot come from any multi-letter word, so without solo reads
    // 54 cells stay empty and every word using them falls back to synthesis.
    expect(cellsCoveredBy([Letter.SIGMA])).toEqual([coverageKey("sigma", "isolated")]);
  });
});

describe("planWords", () => {
  it("reaches every one of the 216 cells at the target depth", () => {
    const pool = [] as string[][];
    for (const letter of ALL_LETTERS) {
      for (const other of ALL_LETTERS) {
        pool.push([letter, other, letter]);
      }
    }

    const plan = planWords({ pool, coverage: {}, maxWords: 5000 });
    const counts = new Map<string, number>();
    for (const word of plan.words) {
      for (const cell of cellsCoveredBy(word)) {
        counts.set(cell, (counts.get(cell) ?? 0) + 1);
      }
    }

    expect(plan.starved).toEqual([]);
    for (const cell of allCells()) {
      expect(counts.get(cell) ?? 0, cell).toBeGreaterThanOrEqual(TARGET_DEPTH);
    }
  });

  it("prefers the word that fills the most under-served cells", () => {
    const plan = planWords({
      pool: [
        [Letter.A, Letter.A, Letter.A],
        [Letter.A, Letter.B, Letter.C],
      ],
      coverage: { [coverageKey("a", "initial")]: TARGET_DEPTH },
      maxWords: 1,
    });

    expect(plan.words[0]).toEqual([Letter.A, Letter.B, Letter.C]);
  });

  it("stops when every cell is served rather than draining the pool", () => {
    const pool = ALL_LETTERS.map((letter) => [letter]);
    const coverage: Record<string, number> = {};
    for (const cell of allCells()) coverage[cell] = TARGET_DEPTH;
    coverage[coverageKey("sigma", "isolated")] = 0;

    const plan = planWords({ pool, coverage, maxWords: 500 });

    expect(plan.words).toEqual([[Letter.SIGMA]]);
  });

  it("emits solo reads for isolated cells the pool cannot cover", () => {
    const plan = planWords({
      pool: [[Letter.A, Letter.B]],
      coverage: {},
      maxWords: 500,
    });

    expect(plan.words).toContainEqual([Letter.A]);
    expect(plan.words).toContainEqual([Letter.SIGMA]);
  });

  it("reports a cell no pool word and no construction can reach", () => {
    // Starvation must be visible. A silently missing cell sends every word that
    // uses it to synthesis, permanently, with nothing logged anywhere.
    const plan = planWords({
      pool: [[Letter.A, Letter.B]],
      coverage: {},
      maxWords: 500,
      construct: false,
    });

    expect(plan.starved).toContain(coverageKey("sigma", "medial"));
  });

  it("plans nothing for letters outside the corpus scope", () => {
    // The `Letter` enum carries 54 entries; the TKA alphabet is 47. The other 7
    // are position names, and a position name cannot sit inside a word — so
    // scoping the planner is what keeps `constructWord` from handing Austen a
    // label like "α ζ α" to read aloud into a microphone.
    const letters = [Letter.A, Letter.B];

    const plan = planWords({
      pool: [[Letter.A, Letter.B]],
      coverage: {},
      maxWords: 500,
      letters,
    });

    const spoken = new Set(plan.words.flat());
    expect([...spoken].sort()).toEqual([...letters].sort());
    expect(plan.starved).toEqual([]);
  });

  it("mixes word lengths instead of emitting one contour", () => {
    const pool = [] as string[][];
    for (const letter of ALL_LETTERS) {
      pool.push([letter, letter]);
      pool.push([letter, letter, letter, letter, letter, letter]);
    }

    const plan = planWords({ pool, coverage: {}, maxWords: 5000 });
    const lengths = new Set(plan.words.map((word) => word.length));

    expect(lengths.size).toBeGreaterThan(1);
  });
});
