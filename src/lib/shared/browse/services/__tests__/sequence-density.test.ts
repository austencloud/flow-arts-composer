// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type { SectionConfig } from "#lib/shared/browse/domain/models/browse-models.js";
import { organizeSections } from "#lib/shared/browse/services/browse-section-manager.js";
import {
  groupSequencesIntoSections,
  sortSequences,
} from "#lib/shared/browse/services/browse-sorter.js";
import {
  DENSITY_BANDS,
  densityBandById,
  densityBandOf,
  formatDensity,
  resolveMandalaDensity,
  resolveMandalaSignature,
} from "#lib/shared/browse/services/sequence-density.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const CLOCKWISE = ["n", "e", "s", "w"] as const;

function motion(motionType: "pro" | "anti", start: number) {
  return {
    motionType,
    rotationDirection: "cw",
    startLocation: CLOCKWISE[start % 4]!,
    endLocation: CLOCKWISE[(start + 1) % 4]!,
    turns: 0,
    startOrientation: "in",
    endOrientation: "in",
    isVisible: true,
  };
}

/** A sequence whose only fields are the ones density and sections read. */
function sequence(id: string, word: string, steps: unknown[]): SequenceData {
  return {
    id,
    name: word,
    word,
    steps,
    thumbnails: [],
    tags: [],
    metadata: {},
    isFavorite: false,
  } as unknown as SequenceData;
}

const twoHands = sequence(
  "two",
  "AAAA",
  Array.from({ length: 4 }, (_, beat) => ({
    letter: "A",
    stepNumber: beat + 1,
    motions: { left: motion("anti", beat + 2), right: motion("pro", beat) },
  }))
);
const oneHand = sequence(
  "one",
  "BBBB",
  Array.from({ length: 4 }, (_, beat) => ({
    letter: "B",
    stepNumber: beat + 1,
    motions: { left: null, right: motion("pro", beat) },
  }))
);
const empty = sequence("empty", "", []);

describe("a sequence's mandala density", () => {
  it("is 0 with no key for a sequence with no steps", () => {
    expect(resolveMandalaSignature(empty)).toEqual({ coverage: 0, key: "" });
  });

  it("is higher for two hands than one", () => {
    expect(resolveMandalaDensity(twoHands)).toBeGreaterThan(resolveMandalaDensity(oneHand));
  });

  it("is remembered per sequence", () => {
    expect(resolveMandalaSignature(twoHands)).toBe(resolveMandalaSignature(twoHands));
  });

  it("falls into a band named for the mandala", () => {
    expect(densityBandOf(0).id).toBe("sparse");
    expect(densityBandOf(DENSITY_BANDS[0]!.below).id).toBe("medium");
    expect(densityBandOf(0.9).id).toBe("dense");
    expect(densityBandOf(0.9).label).toBe("Dense mandala");
    expect(densityBandById("medium")?.label).toBe("Medium mandala");
    expect(densityBandById("Medium mandala")?.id).toBe("medium");
    expect(formatDensity(0.137)).toBe("14%");
  });
});

describe("sorting the library by mandala", () => {
  it("orders sparse to dense", () => {
    const sorted = sortSequences([twoHands, oneHand, empty], BrowseSortMethod.DENSITY);
    expect(sorted.map((s) => s.id)).toEqual(["empty", "one", "two"]);
  });

  it("sections by band", () => {
    const sections = groupSequencesIntoSections([twoHands, empty], BrowseSortMethod.DENSITY);
    const labels = DENSITY_BANDS.map((band) => band.label);
    for (const key of Object.keys(sections)) expect(labels).toContain(key);
    expect(sections["Sparse mandala"]).toContain(empty);
  });

  it("organizes density sections in band order with the band as the title", () => {
    const config: SectionConfig = {
      groupBy: "density",
      sortMethod: BrowseSortMethod.DENSITY,
      showEmptySections: false,
      expandedSections: new Set<string>(),
    };
    const dense = sequence("dense", "ZZZZ", twoHands.steps as unknown[]);
    // Lie about its coverage through a distinct id so it measures on its own.
    const sections = organizeSections([dense, empty, oneHand], config);
    expect(sections.length).toBeGreaterThan(0);
    const ids = sections.map((s) => s.id);
    expect(ids[0]).toBe("density-sparse");
    expect(sections[0]!.title).toMatch(/^Sparse mandala \(\d+ sequences?\)$/);
    expect(sections[0]!.sequences[0]).toBe(empty);
    const bandOrder = DENSITY_BANDS.map((band) => `density-${band.id}`);
    const seen = ids.map((id) => bandOrder.indexOf(id));
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});
