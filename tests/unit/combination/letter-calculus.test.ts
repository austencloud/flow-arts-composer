import { describe, it, expect } from "vitest";
import {
  edgesFromSequence,
  enumerateHybridWords,
  findIngredientCoverWitness,
  type IngredientEdges,
} from "$lib/shared/combination/services/letter-calculus";
import { GGGG_CW, HHHH_CCW, AAAA_CCW, FALG } from "./fixtures";
import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

const FL: IngredientEdges = {
  name: "FL",
  edges: [
    { letter: "F", from: GridPlacementGroup.BETA, to: GridPlacementGroup.ALPHA },
    { letter: "L", from: GridPlacementGroup.ALPHA, to: GridPlacementGroup.BETA },
  ],
};
const AA: IngredientEdges = {
  name: "AA",
  edges: [
    { letter: "A", from: GridPlacementGroup.ALPHA, to: GridPlacementGroup.ALPHA },
  ],
};
const GG: IngredientEdges = {
  name: "GG",
  edges: [
    { letter: "G", from: GridPlacementGroup.BETA, to: GridPlacementGroup.BETA },
  ],
};

describe("letter calculus", () => {
  it("extracts family edges from a concrete sequence", () => {
    const edges = edgesFromSequence(GGGG_CW);
    expect(edges).toHaveLength(4);
    expect(edges[0]).toMatchObject({ letter: "G", from: "beta", to: "beta" });
  });

  it("FALG's real card decomposes into the FL/AA/GG edge families", () => {
    const edges = edgesFromSequence(FALG);
    expect(edges).toHaveLength(8);
    // First half: F β→α, A α→α, L α→β, G β→β
    expect(
      edges.slice(0, 4).map((e) => `${e.letter}:${e.from}>${e.to}`)
    ).toEqual(["F:beta>alpha", "A:alpha>alpha", "L:alpha>beta", "G:beta>beta"]);
  });

  it("derives FALG from FL + AA + GG (Austen's canonical hybrid), reported as its canonical rotation", () => {
    const { words } = enumerateHybridWords([FL, AA, GG], { maxLength: 4 });
    // FALG's rotations are FALG, ALGF, LGFA, GFAL. Lexicographically:
    // A(65) < F(70) < G(71) < L(76), so "ALGF" (starts with A) sorts first —
    // that's the canonical form I3 requires, distinct from display-layer
    // simplification (word-simplifier.ts), which is not involved here.
    const falg = words.find((w) => w.word === "ALGF");
    expect(falg).toBeDefined();
    expect(falg!.letters).toEqual(["A", "L", "G", "F"]);
    expect(falg!.ingredients).toEqual(
      expect.arrayContaining(["FL", "AA", "GG"])
    );
  });

  it("word list is deterministic and independent of ingredient array order — shortest-first, ties lexicographic (I3/N1)", () => {
    const orderings: readonly (readonly IngredientEdges[])[] = [
      [FL, AA, GG],
      [GG, AA, FL],
      [AA, GG, FL],
    ];
    // Iterative deepening (N1) makes the OUTPUT ORDER itself deterministic —
    // no test-side sorting needed. A small maxResults exercises the ordering
    // guarantee even when the full space would be much larger.
    const wordLists = orderings.map((ings) =>
      enumerateHybridWords(ings, { maxLength: 4, maxResults: 5 }).words.map(
        (w) => w.word
      )
    );
    expect(wordLists[1]).toEqual(wordLists[0]);
    expect(wordLists[2]).toEqual(wordLists[0]);
  });

  it("shortest-first ordering surfaces short words ('G', 'ALGF') rather than depth-8 degenerates (N1)", () => {
    const { words } = enumerateHybridWords([FL, AA, GG], {
      maxLength: 8,
      maxResults: 200,
    });
    const wordStrings = words.map((w) => w.word);
    expect(wordStrings).toContain("G");
    expect(wordStrings).toContain("ALGF");
    // "G" is length 1, "ALGF" is length 4 — shortest-first means "G" must
    // come first regardless of how large maxLength is.
    expect(wordStrings.indexOf("G")).toBeLessThan(wordStrings.indexOf("ALGF"));
  });

  it("closed-walk constraint: GG + AA alone cannot interleave (no α↔β edges)", () => {
    const { words } = enumerateHybridWords([AA, GG], {
      maxLength: 6,
      requireAllIngredients: true,
    });
    expect(words).toHaveLength(0);
  });

  it("HHHH edges chain with GGGG edges as primitive necklaces (both beta-world)", () => {
    const g = { name: "GG", edges: edgesFromSequence(GGGG_CW) };
    const h = { name: "HH", edges: edgesFromSequence(HHHH_CCW) };
    const { words } = enumerateHybridWords([g, h], {
      maxLength: 4,
      requireAllIngredients: true,
    });
    expect(words.some((w) => w.word === "GH")).toBe(true);
    // GHGH would just repeat "GH" twice — I5 excludes it once primitivity applies.
    expect(words.some((w) => w.word === "GHGH")).toBe(false);
  });

  it("alpha-world AAAA cannot reach beta-world GGGG without a bridge", () => {
    const a = { name: "AA", edges: edgesFromSequence(AAAA_CCW) };
    const g = { name: "GG", edges: edgesFromSequence(GGGG_CW) };
    const { words } = enumerateHybridWords([a, g], {
      maxLength: 8,
      requireAllIngredients: true,
    });
    expect(words).toHaveLength(0);
  });

  it("emits only primitive necklaces — a pure self-loop ingredient never emits GG/GGG (I5)", () => {
    const gg = { name: "GG", edges: edgesFromSequence(GGGG_CW) };
    const { words } = enumerateHybridWords([gg], { maxLength: 6 });
    expect(words.map((w) => w.word)).toEqual(["G"]);
  });

  it("exact cover: two DISTINCT-name ingredients sharing one identical edge require 2 occurrences, not 1 (I4 false-positive case, algorithm level)", () => {
    // Both ingredients offer the SAME edge (G: β→β) after dedup, so a walk
    // occurrence's owner set is {G1, G2} either way. A union-of-owners check
    // would wrongly call a single occurrence "covers both" since both names
    // appear in that one owner set — the exact-cover check must require a
    // DISTINCT occurrence per ingredient. "GG" itself is periodic and would
    // never survive isPrimitiveWord in the full pipeline (I5), so this is
    // tested directly against the matcher, independent of primitivity.
    const sharedOwners = new Set(["G1", "G2"]);

    // "G" (1 occurrence): cannot credit both G1 and G2 from a single occurrence.
    expect(findIngredientCoverWitness([sharedOwners], ["G1", "G2"])).toBeNull();

    // "GG" (2 occurrences): each ingredient claims one — feasible.
    expect(
      findIngredientCoverWitness([sharedOwners, sharedOwners], ["G1", "G2"])
    ).toEqual(["G1", "G2"]);
  });

  it("index identity: two SAME-NAMED ingredients aren't merged — a primitive word needing both occurrences of their shared edge (I4/N2, pipeline level)", () => {
    // Two ingredients named "SAME" both supply the IDENTICAL edge G: β→β; a
    // third, uniquely-named ingredient supplies a bridge letter X: β→β. If
    // ownership were keyed by NAME, "SAME" would collapse into ONE required
    // identity and the 2-occurrence word "GX" (length 2) would wrongly pass
    // requireAllIngredients. Keyed by INDEX (N2), both "SAME" ingredients are
    // separately required, so the shortest word that can satisfy cover is
    // the primitive necklace "GGX" (length 3: one G credited to each "SAME",
    // the X credited to "BRIDGE") — "GX" must be absent.
    const same0: IngredientEdges = {
      name: "SAME",
      edges: [
        {
          letter: "G",
          from: GridPlacementGroup.BETA,
          to: GridPlacementGroup.BETA,
        },
      ],
    };
    const same1: IngredientEdges = {
      name: "SAME",
      edges: [
        {
          letter: "G",
          from: GridPlacementGroup.BETA,
          to: GridPlacementGroup.BETA,
        },
      ],
    };
    const bridge: IngredientEdges = {
      name: "BRIDGE",
      edges: [
        {
          letter: "X",
          from: GridPlacementGroup.BETA,
          to: GridPlacementGroup.BETA,
        },
      ],
    };

    const { words } = enumerateHybridWords([same0, same1, bridge], {
      maxLength: 5,
      requireAllIngredients: true,
    });

    expect(words.some((w) => w.word === "GX")).toBe(false);
    const ggx = words.find((w) => w.word === "GGX");
    expect(ggx).toBeDefined();
    expect(ggx!.ingredients).toEqual(
      expect.arrayContaining(["SAME", "SAME (2)", "BRIDGE"])
    );
    expect(ggx!.ingredients).toHaveLength(3);
  });

  it("fast-fails when requireAllIngredients needs more distinct occurrences than maxLength allows (N4)", () => {
    const fiveIngredients: IngredientEdges[] = Array.from(
      { length: 5 },
      (_, i) => ({
        name: `ing${i}`,
        edges: [
          {
            letter: "G",
            from: GridPlacementGroup.BETA,
            to: GridPlacementGroup.BETA,
          },
        ],
      })
    );
    const result = enumerateHybridWords(fiveIngredients, {
      maxLength: 3,
      requireAllIngredients: true,
    });
    expect(result).toEqual({
      words: [],
      resultsTruncated: false,
      budgetExhausted: false,
      searchComplete: true,
    });
  });

  it("maxResults cap sets resultsTruncated, not budgetExhausted (N3)", () => {
    const { words, resultsTruncated, budgetExhausted, searchComplete } =
      enumerateHybridWords([FL, AA, GG], { maxLength: 8, maxResults: 2 });
    expect(words).toHaveLength(2);
    expect(resultsTruncated).toBe(true);
    expect(budgetExhausted).toBe(false);
    expect(searchComplete).toBe(false);
  });

  it("tiny search budget sets budgetExhausted, not resultsTruncated; results stay a subset of the full run (M10)", () => {
    const g = { name: "GG", edges: edgesFromSequence(GGGG_CW) };
    const h = { name: "HH", edges: edgesFromSequence(HHHH_CCW) };

    const full = enumerateHybridWords([g, h], { maxLength: 4 });
    expect(full.searchComplete).toBe(true);
    expect(full.budgetExhausted).toBe(false);
    expect(full.resultsTruncated).toBe(false);

    const truncatedRun = enumerateHybridWords([g, h], {
      maxLength: 4,
      searchBudget: 4,
    });
    expect(truncatedRun.budgetExhausted).toBe(true);
    expect(truncatedRun.resultsTruncated).toBe(false);
    expect(truncatedRun.searchComplete).toBe(false);

    const fullWords = new Set(full.words.map((w) => w.word));
    for (const candidate of truncatedRun.words) {
      expect(fullWords.has(candidate.word)).toBe(true);
    }
  });
});
