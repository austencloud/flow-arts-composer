import { describe, it, expect } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import {
  buildGalleryDeckResult,
  legacyGalleryFiltersToSpec,
  queryGalleryDeck,
  resolveGalleryCards,
  GALLERY_SOURCE_ID,
  normalizeGalleryFilters,
  type GalleryFilters,
  type GalleryLoaders,
} from "../gallery-deck-source";

function seq(over: Partial<SequenceData> & { id: string }): SequenceData {
  return {
    id: over.id,
    name: over.name ?? over.word ?? over.id,
    word: over.word ?? over.id,
    steps: over.steps ?? ([{}, {}, {}, {}] as never),
    sequenceLength: over.sequenceLength,
    level: over.level,
    loopType: over.loopType,
    period: over.period,
    tags: over.tags ?? [],
  } as SequenceData;
}

function loaders(list: SequenceData[]): GalleryLoaders {
  return {
    listPage: async () => ({
      sequences: list,
      nextCursor: null,
      exhausted: true,
    }),
    fetchByIds: async (ids) => list.filter((s) => ids.includes(s.id!)),
  };
}

function pagedLoaders(pages: SequenceData[][]): GalleryLoaders {
  return {
    listPage: async (_options, cursor) => {
      const pageIndex = cursor ? Number(cursor.documentId) : 0;
      const nextPage = pageIndex + 1;
      return {
        sequences: pages[pageIndex] ?? [],
        nextCursor:
          nextPage < pages.length
            ? { sortValue: nextPage, documentId: String(nextPage) }
            : null,
        exhausted: nextPage >= pages.length,
      };
    },
    fetchByIds: async () => [],
  };
}

describe("gallery-deck-source", () => {
  it("stamps gallery cards with the gallery source id + position", async () => {
    const { cards } = await queryGalleryDeck(
      {},
      10,
      "Fire Drums",
      loaders([seq({ id: "a", word: "AB" }), seq({ id: "b", word: "CD" })])
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      sequenceId: "a",
      sourceCatalogId: GALLERY_SOURCE_ID,
      position: 1,
      footer: { center: "Fire Drums" },
    });
    expect(cards[1]!.position).toBe(2);
  });

  it("caps at the requested size", async () => {
    const list = Array.from({ length: 5 }, (_, i) => seq({ id: `s${i}` }));
    const { cards, sequences } = await queryGalleryDeck(
      {},
      3,
      "",
      loaders(list)
    );
    expect(cards).toHaveLength(3);
    expect(sequences).toHaveLength(3);
  });

  it("preserves the canonical workspace order when building cards", () => {
    const ordered = [
      seq({ id: "third", word: "THIRD" }),
      seq({ id: "first", word: "FIRST" }),
      seq({ id: "second", word: "SECOND" }),
    ];

    const result = buildGalleryDeckResult(ordered, 2, "Workshop set");

    expect(result.sequences.map((sequence) => sequence.id)).toEqual([
      "third",
      "first",
    ]);
    expect(result.cards.map((card) => card.sequenceId)).toEqual([
      "third",
      "first",
    ]);
    expect(result.cards.map((card) => card.position)).toEqual([1, 2]);
    expect(result.cards[0]?.footer.center).toBe("Workshop set");
  });

  it("dedups by id", async () => {
    const { cards } = await queryGalleryDeck(
      {},
      10,
      "",
      loaders([seq({ id: "dup" }), seq({ id: "dup" }), seq({ id: "other" })])
    );
    expect(cards.map((c) => c.sequenceId)).toEqual(["dup", "other"]);
  });

  it("filters by level + length client-side", async () => {
    const { cards } = await queryGalleryDeck(
      { levels: [2], lengths: [8] },
      10,
      "",
      loaders([
        seq({ id: "keep", level: 2, sequenceLength: 8 }),
        seq({ id: "wrong-level", level: 1, sequenceLength: 8 }),
        seq({ id: "wrong-len", level: 2, sequenceLength: 4 }),
      ])
    );
    expect(cards.map((c) => c.sequenceId)).toEqual(["keep"]);
  });

  it("filters by loop type + period bucket", async () => {
    const filters: GalleryFilters = {
      loopTypes: ["rotated"],
      period: "quartered",
    };
    const { cards } = await queryGalleryDeck(
      filters,
      10,
      "",
      loaders([
        seq({ id: "keep", loopType: "rotated" as never, period: 4 }),
        seq({ id: "wrong-loop", loopType: "mirrored" as never, period: 4 }),
        seq({ id: "wrong-period", loopType: "rotated" as never, period: 2 }),
      ])
    );
    expect(cards.map((c) => c.sequenceId)).toEqual(["keep"]);
  });

  it("rejects sequences with missing period when a period is selected", async () => {
    const { cards } = await queryGalleryDeck(
      { period: "quartered" },
      10,
      "",
      loaders([
        seq({ id: "missing-period" }),
        seq({ id: "quartered", period: 4 }),
      ])
    );
    expect(cards.map((card) => card.sequenceId)).toEqual(["quartered"]);
  });

  it("keeps paging when an early page contains no client-side matches", async () => {
    const { cards } = await queryGalleryDeck(
      { levels: [2] },
      2,
      "",
      pagedLoaders([
        [seq({ id: "wrong-1", level: 1 }), seq({ id: "wrong-2", level: 3 })],
        [seq({ id: "keep-1", level: 2 }), seq({ id: "keep-2", level: 2 })],
      ])
    );
    expect(cards.map((card) => card.sequenceId)).toEqual(["keep-1", "keep-2"]);
  });

  it("dedups across pages and stops at the requested cap", async () => {
    const { cards } = await queryGalleryDeck(
      {},
      3,
      "",
      pagedLoaders([
        [seq({ id: "first" }), seq({ id: "duplicate" })],
        [seq({ id: "duplicate" }), seq({ id: "after-cap" })],
      ])
    );
    expect(cards.map((card) => card.sequenceId)).toEqual([
      "first",
      "duplicate",
      "after-cap",
    ]);
  });

  it("passes the selected tag to the repository query", async () => {
    let receivedTagIds: string[] | undefined;
    const queryLoaders: GalleryLoaders = {
      listPage: async (options) => {
        receivedTagIds = options.tagIds;
        return { sequences: [], nextCursor: null, exhausted: true };
      },
      fetchByIds: async () => [],
    };
    await queryGalleryDeck({ tagId: "tag-fire" }, 4, "", queryLoaders);
    expect(receivedTagIds).toEqual(["tag-fire"]);
  });

  it("normalizes legacy loop ids and removes inactive levels", () => {
    expect(
      normalizeGalleryFilters({
        loopTypes: ["rotated_mirrored", "rotated_mirrored", "not-a-loop"],
        levels: [1, 4, 6, 3],
      })
    ).toMatchObject({ loopTypes: ["mirrored_rotated"], levels: [1, 3] });
  });

  it("migrates reusable legacy axes into the canonical Browse rule", () => {
    const spec = legacyGalleryFiltersToSpec({
      collectionId: "collection-1",
      wordQuery: "  flame  ",
      loopTypes: ["rotated_mirrored"],
      period: "quartered",
      levels: [1, 4, 3],
      lengths: [4, 8],
    });

    expect(spec.source).toBe("my-library");
    expect(spec.searchQuery).toBe("flame");
    expect(
      spec.filters
        .filter((filter) => filter.type === BrowseFilterType.DIFFICULTY)
        .map((filter) => filter.value)
    ).toEqual([1, 3]);
    expect(
      spec.filters
        .filter((filter) => filter.type === BrowseFilterType.LENGTH)
        .map((filter) => filter.value)
    ).toEqual([4, 8]);
    expect(
      spec.filters
        .filter((filter) => filter.type === BrowseFilterType.LOOP_TYPE)
        .map((filter) => filter.value)
    ).toEqual(["component:rotated_quartered", "component:mirrored"]);
    expect(spec.connectives?.[BrowseFilterType.LOOP_TYPE]).toBe("all");
  });

  it("resolveGalleryCards returns sequences for the given ids", async () => {
    const list = [seq({ id: "x" }), seq({ id: "y" }), seq({ id: "z" })];
    const out = await resolveGalleryCards(["x", "z"], loaders(list));
    expect(out.map((s) => s.id)).toEqual(["x", "z"]);
  });
});
