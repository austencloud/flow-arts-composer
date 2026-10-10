import { describe, expect, it } from "vitest";
import manifests from "#lib/features/choreo-card/data/festival-sampler-manifests.json";
import {
  festivalSamplerCardKey,
  type FestivalSamplerCardManifest,
} from "#lib/features/choreo-card/services/festival-sampler-manifest.js";
import {
  applyFestivalSamplerTurnAssignment,
  loadFestivalSamplerBaseSequence,
  resolveFestivalSamplerCardSequence,
} from "#lib/features/choreo-card/services/festival-sampler-turns.js";

describe("festival sampler frozen turn assignments", () => {
  it("resolves the first-page JD card from its approved four-step family", async () => {
    const card = manifests.candidates[0]!.cards.find(
      (candidate) => candidate.name === "JDJD"
    ) as FestivalSamplerCardManifest;
    const sequence = await resolveFestivalSamplerCardSequence(card);
    const applied = sequence.steps.map(
      (step) => `${step.motions?.left?.turns}|${step.motions?.right?.turns}`
    );

    expect(card.turnPatternId).toBe("alternating-hands");
    expect(card.turnPattern).toBe("1|0-0|1-1|0-0|1");
    expect(applied).toEqual(["1|0", "0|1", "1|0", "0|1"]);
  });

  it("keeps every patterned card closed and inside its declared turn cap", async () => {
    const uniqueCards = new Map<string, FestivalSamplerCardManifest>();
    for (const pack of manifests.candidates) {
      for (const card of pack.cards as FestivalSamplerCardManifest[]) {
        uniqueCards.set(festivalSamplerCardKey(card), card);
      }
    }

    expect(uniqueCards.size).toBeGreaterThan(300);
    for (const card of uniqueCards.values()) {
      const sequence = await resolveFestivalSamplerCardSequence(card);
      const turns = sequence.steps.flatMap((step) => [
        step.motions?.left?.turns,
        step.motions?.right?.turns,
      ]);
      const cap = card.turnIntensity ?? 0;

      expect(sequence.level).toBe(card.level);
      expect(
        turns.every(
          (turn) => typeof turn === "number" && turn >= 0 && turn <= cap
        )
      ).toBe(true);
      if (cap === 0) {
        expect(turns.every((turn) => turn === 0)).toBe(true);
      } else {
        expect(turns).toContain(cap);
        expect(turns).toContain(0);
        expect(card.turnPatternId).toBeTruthy();
      }
    }
  }, 30_000);

  it("rejects a frozen pattern that does not match its catalog family", async () => {
    const source = manifests.candidates
      .flatMap((pack) => pack.cards as FestivalSamplerCardManifest[])
      .find((card) => card.source === "catalog" && card.turnPatternId)!;
    const base = await loadFestivalSamplerBaseSequence(source);
    const mismatched = {
      ...source,
      level: 2,
      turnIntensity: 1,
      turnPattern: "1|1-0|0-0|1-1|0",
    };

    expect(() => applyFestivalSamplerTurnAssignment(mismatched, base)).toThrow(
      /not valid/
    );
  });
});
