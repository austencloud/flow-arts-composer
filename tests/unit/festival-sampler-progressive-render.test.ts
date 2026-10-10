import { describe, expect, it } from "vitest";
import manifests from "#lib/features/choreo-card/data/festival-sampler-manifests.json";
import {
  festivalSamplerCardKey,
  findReadyFestivalSamplerPackIndexes,
  type FestivalSamplerCardManifest,
} from "#lib/features/choreo-card/services/festival-sampler-manifest.js";

const candidates = manifests.candidates as Array<{
  cards: FestivalSamplerCardManifest[];
}>;

describe("festival sampler progressive preview", () => {
  it("publishes complete packs once while other packs are still rendering", () => {
    const firstTwo = candidates.slice(0, 2);
    const firstPackKeys = new Set(
      firstTwo[0]!.cards.map(festivalSamplerCardKey)
    );

    expect(
      findReadyFestivalSamplerPackIndexes(firstTwo, firstPackKeys, new Set())
    ).toEqual([0]);

    const allKeys = new Set(
      firstTwo.flatMap((manifest) => manifest.cards.map(festivalSamplerCardKey))
    );
    expect(
      findReadyFestivalSamplerPackIndexes(firstTwo, allKeys, new Set([0]))
    ).toEqual([1]);
    expect(
      findReadyFestivalSamplerPackIndexes(firstTwo, allKeys, new Set([0, 1]))
    ).toEqual([]);
  });
});
