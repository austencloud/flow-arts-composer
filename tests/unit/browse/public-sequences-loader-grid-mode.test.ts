import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  orderBy: vi.fn((field: string, direction: string) => ({ field, direction })),
  query: vi.fn((reference: unknown) => reference),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("$lib/shared/library/data/firestore-paths", () => ({
  getPublicSequencePath: vi.fn((id: string) => `publicSequences/${id}`),
  getPublicSequencesPath: vi.fn(() => "publicSequences"),
}));

vi.mock("$lib/shared/offline/state/network-status-state.svelte", () => ({
  networkStatusState: { isOnline: true },
}));

import { applyFilter } from "$lib/shared/browse/services/browse-filter";
import { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { resolveRecordedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicSequencesLoader grid mode mapping", () => {
  it("preserves Box so the gallery grid-mode filter can discover it", async () => {
    mocks.getDocs.mockResolvedValue({
      forEach: (visit: (doc: { id: string; data: () => unknown }) => void) => {
        visit({
          id: "box-sequence",
          data: () => ({
            id: "box-sequence",
            sourceRef: "users/austen/sequences/box-sequence",
            ownerId: "austen",
            ownerDisplayName: "Austen",
            name: "Box sequence",
            word: "AB",
            thumbnails: [],
            sequenceLength: 2,
            difficultyLevel: "beginner",
            level: 1,
            gridMode: "box",
            forkCount: 0,
            viewCount: 0,
            starCount: 0,
            tags: [],
            isForked: false,
            publishedAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        });
      },
    });

    const sequences = await new PublicSequencesLoader().refreshFromFirestore();

    expect(sequences[0]?.gridMode).toBe("box");
    expect(
      applyFilter(sequences, BrowseFilterType.GRID_MODE, "box").map(
        (sequence) => sequence.id
      )
    ).toEqual(["box-sequence"]);
  });
});

describe("PublicSequencesLoader exact-ID resolution", () => {
  it("repairs an old warmed cache that has sequence metadata but no ID source-ref key", async () => {
    const loader = new PublicSequencesLoader();
    loader.warmFromCache(
      [
        {
          id: "seq-cached",
          name: "Cached sequence",
          word: "AB",
          ownerId: "owner-1",
          steps: [],
          thumbnails: [],
          tags: [],
          metadata: {},
          isFavorite: false,
          isCircular: false,
        },
      ],
      new Map([["AB", "users/owner-1/sequences/seq-cached"]])
    );
    mocks.getDoc.mockResolvedValueOnce({
      id: "seq-cached",
      exists: () => true,
      data: () => ({
        name: "Cached sequence",
        word: "AB",
        steps: [{ stepNumber: 1, letter: "A", motions: {} }],
      }),
      metadata: { fromCache: false },
    });

    const sequence = await loader.loadFullSequenceDataStrict("seq-cached", "seq-cached");

    expect(sequence?.id).toBe("seq-cached");
    expect(sequence?.steps).toHaveLength(1);
    expect(mocks.doc).toHaveBeenCalledWith({}, "users/owner-1/sequences/seq-cached");
    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
  });

  it("reads publicSequences/{id} directly instead of using a same-word variation", async () => {
    const loader = new PublicSequencesLoader();
    loader.warmFromCache(
      [
        {
          id: "seq-other",
          name: "Same-word variation",
          word: "CD",
          ownerId: "owner-other",
          steps: [],
          thumbnails: [],
          tags: [],
          metadata: {},
          isFavorite: false,
          isCircular: false,
        },
      ],
      new Map([["CD", "users/owner-other/sequences/seq-other"]])
    );
    mocks.getDoc
      .mockResolvedValueOnce({
        id: "seq-new",
        exists: () => true,
        data: () => ({
          name: "New sequence",
          word: "CD",
          sourceRef: "users/owner-2/sequences/seq-new",
        }),
        metadata: { fromCache: false },
      })
      .mockResolvedValueOnce({
        id: "seq-new",
        exists: () => true,
        data: () => ({
          name: "New sequence",
          word: "CD",
          steps: [{ stepNumber: 1, letter: "C", motions: {} }],
        }),
        metadata: { fromCache: false },
      });

    const sequence = await loader.loadFullSequenceDataStrict("CD", "seq-new");

    expect(sequence?.id).toBe("seq-new");
    expect(sequence?.steps).toHaveLength(1);
    expect(mocks.doc.mock.calls.map((call) => call[1])).toEqual([
      "publicSequences/seq-new",
      "users/owner-2/sequences/seq-new",
    ]);
  });

  it("does not call a cache-only miss authoritative", async () => {
    const loader = new PublicSequencesLoader();
    loader.warmFromCache([], new Map());
    mocks.getDoc.mockResolvedValueOnce({
      id: "seq-offline",
      exists: () => false,
      data: () => undefined,
      metadata: { fromCache: true },
    });

    await expect(
      loader.loadFullSequenceDataStrict("seq-offline", "seq-offline")
    ).rejects.toThrow("never reached the server");
  });
});

describe("PublicSequencesLoader recorded prop intent", () => {
  async function loadSourceDoc(sourceData: Record<string, unknown>) {
    const loader = new PublicSequencesLoader();
    loader.warmFromCache([], new Map());
    mocks.getDoc
      .mockResolvedValueOnce({
        id: "seq-props",
        exists: () => true,
        data: () => ({
          name: "Recorded props",
          word: "AB",
          sourceRef: "users/owner-1/sequences/seq-props",
        }),
        metadata: { fromCache: false },
      })
      .mockResolvedValueOnce({
        id: "seq-props",
        exists: () => true,
        data: () => ({
          name: "Recorded props",
          word: "AB",
          steps: [{ stepNumber: 1, letter: "A", motions: {} }],
          ...sourceData,
        }),
        metadata: { fromCache: false },
      });
    return loader.loadFullSequenceData("AB", "seq-props");
  }

  it("keeps a recorded staff/fan pair from the source document", async () => {
    const sequence = await loadSourceDoc({
      creatorIntent: {
        propConfig: {
          leftPropType: "staff",
          rightPropType: "fan",
          catDogMode: true,
        },
      },
    });

    expect(resolveRecordedPropConfig(sequence)).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("keeps the legacy intendedProp field", async () => {
    const sequence = await loadSourceDoc({
      intendedProp: {
        leftPropType: "staff",
        rightPropType: "fan",
        catDogMode: false,
      },
    });

    expect(resolveRecordedPropConfig(sequence)).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("drops intent fields that are not objects", async () => {
    const sequence = await loadSourceDoc({
      creatorIntent: "staff",
      intendedProp: ["fan"],
    });

    expect(sequence?.creatorIntent).toBeUndefined();
    expect(sequence?.intendedProp).toBeUndefined();
    expect(resolveRecordedPropConfig(sequence)).toBeNull();
  });
});
