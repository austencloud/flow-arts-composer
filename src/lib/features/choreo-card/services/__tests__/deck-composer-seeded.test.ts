import { describe, it, expect } from "vitest";
import { composeDeck } from "../deck-composer";
import { makeRng } from "$lib/shared/foundation/utils/seeded-rng";
import type { StepCountWeight } from "../../domain/models/DeckRelease";

// Minimal pool: 20 entries at step 8, 20 at step 16.
function pool() {
  const mk = (n: number, step: number) =>
    Array.from({ length: n }, (_, i) => ({
      sequenceId: `alpha${i}_S${step}`,
      sourceCatalogId: "cat",
      stepCount: step,
      word: `alpha${i}_S${step}`,
      startPlacement: `alpha${i}`,
    }));
  return new Map([
    [8, mk(20, 8)],
    [16, mk(20, 16)],
  ]);
}
const weights: StepCountWeight[] = [
  { stepCount: 16, weight: 50, available: 20 },
  { stepCount: 8, weight: 50, available: 20 },
];

describe("composeDeck seeded", () => {
  it("same seed → identical draw (reproducible)", () => {
    const a = composeDeck(pool(), weights, 10, { center: "x" }, makeRng("seed-1"));
    const b = composeDeck(pool(), weights, 10, { center: "x" }, makeRng("seed-1"));
    expect(a.map((c) => c.sequenceId)).toEqual(b.map((c) => c.sequenceId));
  });

  it("different seed → different draw (fresh on reroll)", () => {
    const a = composeDeck(pool(), weights, 10, { center: "x" }, makeRng("seed-1"));
    const b = composeDeck(pool(), weights, 10, { center: "x" }, makeRng("seed-2"));
    expect(a.map((c) => c.sequenceId)).not.toEqual(b.map((c) => c.sequenceId));
  });

  it("draws the requested count", () => {
    const a = composeDeck(pool(), weights, 10, { center: "x" }, makeRng("seed-1"));
    expect(a).toHaveLength(10);
  });

  it("default rng (no seed) still composes (legacy behavior preserved)", () => {
    const a = composeDeck(pool(), weights, 10, { center: "x" });
    expect(a).toHaveLength(10);
  });
});
