import { describe, expect, it } from "vitest";
import { MUSEUM_EXHIBIT_SEQUENCES } from "$lib/features/museum/data/museum-exhibit-sequences";
import {
  EFFECT_PREVIEW_MINIMUM_COUNTS,
  EFFECT_PREVIEW_TARGET_COUNTS,
  isEffectPreviewLoop,
} from "$lib/shared/effects/domain/effect-preview-loop-policy";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function caveLoop(repetitions: number): SequenceData {
  const fixture = MUSEUM_EXHIBIT_SEQUENCES["performer-cave-seq"]!;
  return {
    id: `preview-${repetitions}`,
    name: "Effect preview",
    word: fixture.word.repeat(repetitions),
    steps: Array.from({ length: repetitions }, () => fixture.steps).flat(),
    startPlacement: fixture.startPlacement ?? undefined,
    thumbnails: [],
    isFavorite: false,
    isCircular: true,
    tags: [],
    metadata: {},
  };
}

describe("effect preview LOOP policy", () => {
  it("rejects a four-count clip even when its seam is closed", () => {
    expect(caveLoop(1).steps).toHaveLength(4);
    expect(isEffectPreviewLoop(caveLoop(1))).toBe(false);
  });

  it("accepts continuous eight- and sixteen-count previews", () => {
    expect(EFFECT_PREVIEW_MINIMUM_COUNTS).toBe(8);
    expect(EFFECT_PREVIEW_TARGET_COUNTS).toBe(16);
    expect(isEffectPreviewLoop(caveLoop(2))).toBe(true);
    expect(isEffectPreviewLoop(caveLoop(4))).toBe(true);
  });

  it("rejects a long sequence whose final pose does not close", () => {
    const sequence = caveLoop(2);
    const last = sequence.steps.at(-1)!;
    const openSequence: SequenceData = {
      ...sequence,
      steps: [
        ...sequence.steps.slice(0, -1),
        { ...last, endPlacement: "alpha1" },
      ],
    };

    expect(isEffectPreviewLoop(openSequence)).toBe(false);
  });
});
