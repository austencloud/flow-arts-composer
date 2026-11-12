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
  MANDALA_SECTIONS,
  formatDensity,
  mandalaSectionById,
  mandalaSectionOf,
  resolveMandalaDensity,
  resolveMandalaSignature,
  seedMandalaSignature,
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
    expect(resolveMandalaSignature(empty)).toEqual({ coverage: 0, key: "", spaces: 0 });
  });

  it("is higher for two hands than one", () => {
    expect(resolveMandalaDensity(twoHands)).toBeGreaterThan(resolveMandalaDensity(oneHand));
  });

  it("is remembered per sequence", () => {
    expect(resolveMandalaSignature(twoHands)).toBe(resolveMandalaSignature(twoHands));
  });

  it("counts the spaces its lines enclose", () => {
    expect(resolveMandalaSignature(twoHands).spaces).toBeGreaterThan(0);
  });

  it("falls into a section named for the mandala", () => {
    expect(mandalaSectionOf(0).id).toBe("simple");
    expect(mandalaSectionOf(29).id).toBe("simple");
    expect(mandalaSectionOf(30).id).toBe("busier");
    expect(mandalaSectionOf(69).id).toBe("busier");
    expect(mandalaSectionOf(70).id).toBe("complex");
    expect(MANDALA_SECTIONS.map((section) => section.label)).toEqual([
      "Simple mandala",
      "Busier mandala",
      "Complex mandala",
    ]);
    expect(mandalaSectionById("busier")?.label).toBe("Busier mandala");
    expect(mandalaSectionById("Busier mandala")?.id).toBe("busier");
    expect(formatDensity(0.137)).toBe("14%");
  });
});

/** A sequence with a planted signature, so the order is set by the numbers. */
function planted(id: string, spaces: number, coverage: number, level = 1, length = 4): SequenceData {
  const planted = {
    ...sequence(id, "PLNT", twoHands.steps as unknown[]),
    level,
    sequenceLength: length,
  } as SequenceData;
  seedMandalaSignature(planted, { key: `k-${id}`, coverage, spaces });
  return planted;
}

describe("sorting the library by mandala", () => {
  it("orders by enclosed spaces, then coverage, then level, then length", () => {
    const pool = [
      planted("busy", 80, 0.1),
      planted("thin-ring", 1, 0.1),
      planted("fat-ring", 1, 0.3),
      planted("cross-hard", 4, 0.2, 3),
      planted("cross-easy-long", 4, 0.2, 1, 8),
      planted("cross-easy", 4, 0.2, 1, 4),
    ];
    expect(sortSequences(pool, BrowseSortMethod.DENSITY).map((s) => s.id)).toEqual([
      "thin-ring",
      "fat-ring",
      "cross-easy",
      "cross-easy-long",
      "cross-hard",
      "busy",
    ]);
  });

  it("sections by how busy the mandala is", () => {
    const sections = groupSequencesIntoSections(
      [planted("s", 3, 0.2), planted("b", 40, 0.2), planted("c", 90, 0.2)],
      BrowseSortMethod.DENSITY
    );
    expect(Object.keys(sections).sort()).toEqual(
      ["Busier mandala", "Complex mandala", "Simple mandala"]
    );
  });

  it("organizes the sections simple, busier, complex, with the section as the title", () => {
    const config: SectionConfig = {
      groupBy: "density",
      sortMethod: BrowseSortMethod.DENSITY,
      showEmptySections: false,
      expandedSections: new Set<string>(),
    };
    const sections = organizeSections(
      [planted("c2", 90, 0.5), planted("s2", 2, 0.3), planted("b2", 50, 0.2), planted("s1", 2, 0.1)],
      config
    );
    expect(sections.map((s) => s.id)).toEqual(["density-simple", "density-busier", "density-complex"]);
    expect(sections[0]!.title).toBe("Simple mandala (2 sequences)");
    expect(sections[1]!.title).toBe("Busier mandala (1 sequence)");
    expect(sections[2]!.title).toBe("Complex mandala (1 sequence)");
    expect(sections[0]!.sequences.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
