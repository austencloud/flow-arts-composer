import { describe, it, expect, vi } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SeedMatrix } from "#lib/features/lab/vtg-lab/domain/tnd-turn-patterns.js";

// canonical-tnd-pool.ts resolves each TnD family via resolveTnDFamilyCards, which
// in turn hits real Firestore (base catalog) + a static CSV fetch (diamond edges)
// to compose+classify the family grid. That's real integration plumbing, not
// unit-test surface — this test mocks the family-resolution seam directly so it
// exercises only what canonical-tnd-pool.ts itself is responsible for: stamping
// CANONICAL_TND_AUTHOR onto whatever resolveTnDFamilyCards hands back.
vi.mock("#lib/features/lab/vtg-lab/services/resolve-tnd-family-cards.js", () => {
  const fakeSeq = (id: string) => createSequenceData({ id, word: "AA", steps: [] });

  return {
    resolveTnDFamilyCards: vi.fn(
      async (familyId: string): Promise<SeedMatrix[]> => {
        if (familyId !== "split-same") return [];
        return [
          {
            seedId: "tnd-split-same-aa",
            word: "AA",
            footer: { center: "Split-Same" },
            byTurn: new Map([
              ["0|0", fakeSeq("tnd-split-same-aa__t_0-0")],
              ["1|1", fakeSeq("tnd-split-same-aa__t_1-1")],
            ]),
          },
        ];
      }
    ),
  };
});

import {
  loadCanonicalTnDSequences,
  CANONICAL_TND_AUTHOR,
} from "#lib/features/browse/gallery-home/canonical-tnd-pool.js";

describe("canonical T&D pool author stamp", () => {
  it("stamps every sequence with the reserved author", async () => {
    const pool = await loadCanonicalTnDSequences();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((s) => s.author === CANONICAL_TND_AUTHOR)).toBe(true);
  });
});
