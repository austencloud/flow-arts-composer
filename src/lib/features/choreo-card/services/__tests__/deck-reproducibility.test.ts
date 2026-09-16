import { describe, it, expect } from "vitest";
import { composeDeck } from "../deck-composer";
import { makeRng, childSeed } from "$lib/shared/foundation/utils/seeded-rng";
import { hashRecipe } from "../deck-recipe";
import type { DeckRecipe, StepCountWeight } from "../../domain/models/DeckRelease";

function pool() {
  const mk = (n: number, step: number) =>
    Array.from({ length: n }, (_, i) => ({
      sequenceId: `alpha${i}_S${step}`,
      sourceCatalogId: "c",
      stepCount: step,
      word: `alpha${i}_S${step}`,
      startPlacement: `alpha${i}`,
    }));
  return new Map([
    [8, mk(40, 8)],
    [16, mk(40, 16)],
  ]);
}
const weights: StepCountWeight[] = [
  { stepCount: 16, weight: 50, available: 40 },
  { stepCount: 8, weight: 50, available: 40 },
];
const recipe: DeckRecipe = {
  schemaVersion: 1,
  generatorVersion: "deck-gen@1.0.0",
  seed: "REPRO",
  deckMode: "loop",
  startOriModes: ["radial"],
  gridModes: ["diamond"],
  totalCards: 20,
  sliceTypes: ["quartered"],
  loopTypes: ["rotated"],
  levels: [1],
};

describe("deck reproducibility", () => {
  it("identical (recipe, seed) → byte-identical deck (the wipe-and-rebuild invariant)", () => {
    const key = `${recipe.seed}:${hashRecipe(recipe)}`;
    const a = composeDeck(pool(), weights, 20, { center: "x" }, makeRng(key));
    const b = composeDeck(pool(), weights, 20, { center: "x" }, makeRng(key));
    expect(a.map((c) => c.sequenceId)).toEqual(b.map((c) => c.sequenceId));
  });

  it("a different stored seed reproduces a different deck (reroll provenance)", () => {
    const keyA = `${recipe.seed}:${hashRecipe(recipe)}`;
    const rerolled = { ...recipe, seed: "REROLLED" };
    const keyB = `${rerolled.seed}:${hashRecipe(rerolled)}`;
    const a = composeDeck(pool(), weights, 20, { center: "x" }, makeRng(keyA));
    const b = composeDeck(pool(), weights, 20, { center: "x" }, makeRng(keyB));
    expect(a.map((c) => c.sequenceId)).not.toEqual(b.map((c) => c.sequenceId));
  });

  it("per-slot sub-streams are stable per index", () => {
    const key = `${recipe.seed}:${hashRecipe(recipe)}`;
    const slot3a = makeRng(childSeed(key, 3))();
    const slot3b = makeRng(childSeed(key, 3))();
    const slot4 = makeRng(childSeed(key, 4))();
    expect(slot3a).toEqual(slot3b);
    expect(slot3a).not.toEqual(slot4);
  });
});
