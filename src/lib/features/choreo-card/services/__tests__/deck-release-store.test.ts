import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  deleteDocMock,
  docMock,
  runTransactionMock,
  setDocMock,
  getDocsMock,
  collectionMock,
  batchSetMock,
  batchCommitMock,
  writeBatchMock,
} = vi.hoisted(() => ({
  deleteDocMock: vi.fn(),
  docMock: vi.fn((_db: unknown, path: string) => ({ __path: path })),
  runTransactionMock: vi.fn(),
  setDocMock: vi.fn(),
  getDocsMock: vi.fn(),
  collectionMock: vi.fn((_db: unknown, path: string) => ({ __path: path })),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(async () => undefined),
  writeBatchMock: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  doc: docMock,
  getDoc: vi.fn(),
  getDocs: getDocsMock,
  setDoc: setDocMock,
  deleteDoc: deleteDocMock,
  runTransaction: runTransactionMock,
  writeBatch: writeBatchMock,
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({ __db: true })),
}));

vi.mock("$lib/shared/library/data/firestore-paths", () => ({
  getDeckReleaseCounterPath: () => "deckReleases/counter",
  getDeckReleaseManifestPath: (n: number) => `deckReleases/counter/manifests/${n}`,
  getDeckReleaseManifestsPath: () => "deckReleases/counter/manifests",
  getDeckReleaseCardsPath: (n: number) =>
    `deckReleases/counter/manifests/${n}/cards`,
  getDeckReleaseCardPath: (n: number, i: number) =>
    `deckReleases/counter/manifests/${n}/cards/${i}`,
}));

import {
  deleteDeck,
  releaseDeck,
  archiveDeck,
  restoreDeck,
  getDeckReleaseCardData,
} from "../deck-release-store";
import type {
  DeckRecipe,
  DeckReleaseCard,
} from "../../domain/models/DeckRelease";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function fakeSequence(id: string): SequenceData {
  return createSequenceData({ id, word: id, steps: [] });
}

/** Run a releaseDeck transaction against a fake tx, returning the manifest that
 *  was set on the manifest doc path. */
async function captureManifest(
  cards: DeckReleaseCard[],
  sequences: SequenceData[] = [],
  recipe?: DeckRecipe,
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  runTransactionMock.mockImplementation(async (_db: unknown, updater: (tx: unknown) => unknown) => {
    const tx = {
      get: async () => ({ exists: () => true, data: () => ({ next: 5 }) }),
      set: (ref: { __path: string }, data: Record<string, unknown>) => {
        if (ref.__path.includes("/manifests/") && !ref.__path.includes("/cards/")) {
          captured = data;
        }
      },
    };
    return updater(tx);
  });
  await releaseDeck(cards, sequences, "rainbow", "Test Notes", {
    name: "Test", description: "", leftPropType: "staff", rightPropType: "staff",
  }, recipe);
  return captured;
}

const CARD: DeckReleaseCard = {
  sequenceId: "s1", sourceCatalogId: "cat", stepCount: 8, word: "AB", position: 1,
  footer: {},
};

describe("releaseDeck recipe", () => {
  beforeEach(() => {
    runTransactionMock.mockReset();
    docMock.mockClear();
    setDocMock.mockReset();
    writeBatchMock.mockReset();
  });

  it("round-trips the recipe onto the manifest when provided", async () => {
    const recipe: DeckRecipe = {
      deckMode: "loop",
      startOriModes: ["radial"],
      gridModes: ["diamond"],
      reversalPattern: null,
      weights: [{ stepCount: 8, weight: 50 }],
      totalCards: 52,
      sliceTypes: ["quartered"],
    };
    const manifest = await captureManifest([CARD], [], recipe);
    expect(manifest.recipe).toEqual(recipe);
  });

  it("omits the recipe field on legacy releases (no recipe arg)", async () => {
    const manifest = await captureManifest([CARD]);
    expect("recipe" in manifest).toBe(false);
  });
});

describe("releaseDeck — exact reprint data", () => {
  beforeEach(() => {
    runTransactionMock.mockReset();
    docMock.mockClear();
    setDocMock.mockReset();
    writeBatchMock.mockReset();
    batchSetMock.mockReset();
    batchCommitMock.mockClear();
    writeBatchMock.mockReturnValue({ set: batchSetMock, commit: batchCommitMock });
  });

  it("writes one card-data doc per card via batch, then flags cardDataSaved", async () => {
    const cards: DeckReleaseCard[] = [CARD, { ...CARD, sequenceId: "s2", position: 2 }];
    const sequences = [fakeSequence("s1"), fakeSequence("s2")];
    const manifest = await captureManifest(cards, sequences);

    expect(writeBatchMock).toHaveBeenCalledTimes(1);
    expect(batchSetMock).toHaveBeenCalledTimes(2);
    expect(batchSetMock).toHaveBeenCalledWith(
      { __path: "deckReleases/counter/manifests/5/cards/0" },
      { cardIndex: 0, sequence: sequences[0] }
    );
    expect(batchSetMock).toHaveBeenCalledWith(
      { __path: "deckReleases/counter/manifests/5/cards/1" },
      { cardIndex: 1, sequence: sequences[1] }
    );
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    // Best-effort patch onto the manifest doc, merge:true.
    expect(setDocMock).toHaveBeenCalledWith(
      { __path: "deckReleases/counter/manifests/5" },
      { cardDataSaved: true },
      { merge: true }
    );
    // captureManifest returns the same in-memory manifest object releaseDeck
    // hands back to its caller — confirms that object is patched too, not
    // just the Firestore doc, so the caller's `release.cardDataSaved` is
    // accurate immediately after release() resolves.
    expect(manifest.cardDataSaved).toBe(true);
  });

  it("skips the card-data write when sequences don't positionally match cards", async () => {
    await captureManifest([CARD, { ...CARD, sequenceId: "s2", position: 2 }], [fakeSequence("s1")]);
    expect(writeBatchMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("does not fail the release when the batch write throws", async () => {
    batchCommitMock.mockRejectedValueOnce(new Error("boom"));
    await expect(captureManifest([CARD], [fakeSequence("s1")])).resolves.toBeDefined();
  });
});

describe("getDeckReleaseCardData", () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    collectionMock.mockClear();
  });

  it("returns null (legacy signal) when the subcollection is empty", async () => {
    getDocsMock.mockResolvedValue({ empty: true, docs: [] });
    const result = await getDeckReleaseCardData(9, 3);
    expect(result).toBeNull();
  });

  it("returns saved card data ordered by cardIndex", async () => {
    const seqA = fakeSequence("a");
    const seqB = fakeSequence("b");
    getDocsMock.mockResolvedValue({
      empty: false,
      docs: [
        { data: () => ({ cardIndex: 1, sequence: seqB }) },
        { data: () => ({ cardIndex: 0, sequence: seqA }) },
      ],
    });
    const result = await getDeckReleaseCardData(9, 2);
    expect(result).toEqual([
      { cardIndex: 0, sequence: seqA },
      { cardIndex: 1, sequence: seqB },
    ]);
  });

  it("throws naming the missing 1-indexed positions when the subcollection is incomplete", async () => {
    getDocsMock.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ cardIndex: 0, sequence: fakeSequence("a") }) }],
    });
    await expect(getDeckReleaseCardData(9, 3)).rejects.toThrow(/2, 3/);
  });
});

describe("archiveDeck / restoreDeck", () => {
  beforeEach(() => {
    setDocMock.mockReset();
    docMock.mockClear();
  });

  it("archiveDeck sets archived:true with a timestamp, merged", async () => {
    await archiveDeck(12);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, data, opts] = setDocMock.mock.calls[0]!;
    expect(ref).toEqual({ __path: "deckReleases/counter/manifests/12" });
    expect(data.archived).toBe(true);
    expect(typeof data.archivedAt).toBe("string");
    expect(opts).toEqual({ merge: true });
  });

  it("restoreDeck clears archived and archivedAt, merged", async () => {
    await restoreDeck(12);
    expect(setDocMock).toHaveBeenCalledWith(
      { __path: "deckReleases/counter/manifests/12" },
      { archived: false, archivedAt: null },
      { merge: true }
    );
  });
});

describe("deleteDeck", () => {
  beforeEach(() => {
    deleteDocMock.mockReset();
    docMock.mockClear();
  });

  it("deletes the manifest doc for the given deck number", async () => {
    await deleteDeck(7);
    expect(docMock).toHaveBeenCalledWith(
      expect.anything(),
      "deckReleases/counter/manifests/7",
    );
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(deleteDocMock).toHaveBeenCalledWith({
      __path: "deckReleases/counter/manifests/7",
    });
  });

  it("does not touch the counter (numbers are permanent)", async () => {
    await deleteDeck(7);
    const touchedCounter = docMock.mock.calls.some(
      ([, path]) => path === "deckReleases/counter",
    );
    expect(touchedCounter).toBe(false);
  });
});
