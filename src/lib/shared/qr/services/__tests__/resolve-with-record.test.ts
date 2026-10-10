import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mock surface as resolve-for-import: Firestore and app-firebase are the
// only network the record fetch touches, so tests control every record shape.
const getDocMock = vi.fn();
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: (ref: unknown) => getDocMock(ref),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  increment: vi.fn(),
  runTransaction: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("#lib/shared/navigation/services/sequence-encoder.js", () => ({
  encodeSequenceForQR: vi.fn(),
  isInlineEncoded: (s: string) => s.startsWith("s~"),
  decodeSequenceFromQR: vi.fn(async (payload: string) => ({
    id: "",
    word: `decoded:${payload}`,
    steps: [{ id: "step1" }],
  })),
}));

import { ShortCodeManager } from "../short-code-manager";

function makeManager(record: Record<string, unknown> | null) {
  const browseLoader = { loadFullSequenceData: vi.fn(async () => null) };
  const manager = new ShortCodeManager(browseLoader as never, undefined, {
    get: vi.fn(async () => null),
    getMany: vi.fn(async () => new Map()),
    set: vi.fn(),
  } as never);
  getDocMock.mockImplementation(async () =>
    record
      ? { exists: () => true, data: () => record }
      : { exists: () => false }
  );
  return manager;
}

beforeEach(() => {
  getDocMock.mockReset();
  // The static-snapshot fallback fetches real URLs — force it to miss.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404 }))
  );
});

describe("resolveShortCodeWithRecord", () => {
  it("hydrates the server-prefetched record without another network lookup", async () => {
    const manager = makeManager(null);
    const { sequence, record } = await manager.resolveShortCodeWithRecord(
      "AB3D",
      {
        sequence: "KAKA",
        encoded: "s~server-blob",
        createdAt: "2026-07-30T00:00:00.000Z",
        createdBy: "owner-1",
        scanCount: 0,
        deckId: "deck-loop-01",
      }
    );

    expect(sequence?.id).toBe("AB3D");
    expect(sequence?.word).toBe("KAKA");
    expect(record?.deckId).toBe("deck-loop-01");
    expect(getDocMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses an exact embedded copy before the lean encoded blob", async () => {
    const manager = makeManager(null);
    const { sequence } = await manager.resolveShortCodeWithRecord("AB3D", {
      sequence: "V",
      payloadWord: "V",
      payloadStepCount: 1,
      ownerId: "owner-1",
      ownerDisplayName: "Sequence Owner",
      sequenceData: {
        id: "source-sequence-id",
        word: "V",
        isCircular: true,
        loopType: "rotated",
        steps: [{ id: "embedded-step", letter: "V" }],
      },
      encoded: "s~lean-blob",
      createdAt: "2026-07-30T00:00:00.000Z",
      createdBy: "owner-1",
      scanCount: 0,
    });

    expect(sequence).toMatchObject({
      id: "AB3D",
      name: "V",
      word: "V",
      ownerId: "owner-1",
      ownerDisplayName: "Sequence Owner",
      isCircular: true,
      loopType: "rotated",
    });
    expect(sequence?.steps[0]?.id).toBe("embedded-step");
  });

  it("hands back the deck attribution the scan page needs", async () => {
    // The whole point: deck_id was structurally null on every scan ever
    // recorded because the client discarded this record and leaned on SSR
    // meta, which never populated on workerd.
    const manager = makeManager({
      sequence: "KAKA",
      encoded: "s~blob",
      deckId: "deck-loop-01",
      deckName: "LOOP Deck One",
    });
    const { sequence, record } =
      await manager.resolveShortCodeWithRecord("AB3D");
    expect(sequence?.id).toBe("AB3D");
    expect(sequence?.word).toBe("KAKA");
    expect(record?.deckId).toBe("deck-loop-01");
    expect(record?.deckName).toBe("LOOP Deck One");
  });

  it("uses the public REST record when the browser Firestore SDK stalls", async () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(null);
      getDocMock.mockReturnValue(new Promise(() => {}));
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) => {
          const url = String(input);
          if (url.startsWith("https://firestore.googleapis.com/")) {
            return {
              ok: true,
              status: 200,
              statusText: "OK",
              json: async () => ({
                fields: {
                  sequence: { stringValue: "KAKA" },
                  encoded: { stringValue: "s~rest-blob" },
                  deckId: { stringValue: "deck-rest" },
                },
              }),
            };
          }
          return { ok: false, status: 404, statusText: "Not Found" };
        })
      );

      const resolving = manager.resolveShortCodeWithRecord("W61Y");
      await vi.advanceTimersByTimeAsync(2_500);

      const { sequence, record } = await resolving;
      expect(sequence?.id).toBe("W61Y");
      expect(sequence?.word).toBe("KAKA");
      expect(record?.deckId).toBe("deck-rest");

      // Settle the abandoned SDK leg before restoring real timers.
      await vi.advanceTimersByTimeAsync(5_500);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a null record for an inline-encoded code (no doc exists)", async () => {
    const manager = makeManager(null);
    const { sequence, record } =
      await manager.resolveShortCodeWithRecord("s~blob");
    expect(sequence?.word).toBe("decoded:s~blob");
    expect(record).toBeNull();
  });

  it("still returns the record when hydration fails, so the scan is attributable", async () => {
    // No `encoded`, no `sequenceData`, no public hit — every hydrate
    // strategy misses, but the card still came from a known deck.
    const manager = makeManager({ sequence: "KAKA", deckId: "deck-loop-01" });
    const { sequence, record } =
      await manager.resolveShortCodeWithRecord("AB3D");
    expect(sequence).toBeNull();
    expect(record?.deckId).toBe("deck-loop-01");
  });

  it("keeps resolveShortCode returning the bare sequence for existing callers", async () => {
    const manager = makeManager({ sequence: "KAKA", encoded: "s~blob" });
    const sequence = await manager.resolveShortCode("AB3D");
    expect(sequence?.id).toBe("AB3D");
  });
});
