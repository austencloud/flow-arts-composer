import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShortCodeShareError } from "$lib/shared/qr/domain/short-code-error";

// In-memory Firestore fake. `store` maps "collection/id" → data. Transactions
// stage writes and apply them on successful completion, like the real SDK.
const store = new Map<string, Record<string, unknown>>();
let transactionRuns = 0;
let queryResults: Array<{ id: string; data: Record<string, unknown> }> = [];
// One-shot OCC-contention injector. Simulates a competing DEVICE that commits
// its own allocation (both the code doc AND the index doc) in the window
// between our transaction reading the index as empty and committing. Firestore
// then forces our transaction to retry; the re-run sees the claimed index and
// adopts the competitor's code. This is the only way to exercise the
// cross-device write-write invariant in-process.
let occInjection: {
  indexPath: string;
  competitorDocs: Array<[string, Record<string, unknown>]>;
} | null = null;

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn((_db: unknown, name: string) => ({ collection: name })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDoc: vi.fn(async (ref: { path: string }): Promise<unknown> => {
    const data = store.get(ref.path);
    return data
      ? { exists: () => true, id: ref.path.split("/").pop(), data: () => data }
      : { exists: () => false };
  }),
  setDoc: vi.fn(
    async (ref: { path: string }, data: Record<string, unknown>) => {
      store.set(ref.path, data);
    }
  ),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(async () => ({
    empty: queryResults.length === 0,
    docs: queryResults.map((r) => ({ id: r.id, data: () => r.data })),
  })),
  updateDoc: vi.fn(),
  increment: vi.fn(),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      fn: (tx: {
        get: (ref: { path: string }) => Promise<unknown>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) => {
      // Run the callback once, tracking the paths it read + its staged writes.
      const runCallback = async () => {
        const readPaths = new Set<string>();
        const staged = new Map<string, Record<string, unknown>>();
        const result = await fn({
          get: async (ref) => {
            readPaths.add(ref.path);
            const data = staged.get(ref.path) ?? store.get(ref.path);
            return data
              ? { exists: () => true, data: () => data }
              : { exists: () => false };
          },
          set: (ref, data) => staged.set(ref.path, data),
        });
        return { readPaths, staged, result };
      };

      transactionRuns++;
      let run = await runCallback();

      // OCC contention: a competing writer claimed a doc this callback read as
      // empty, between read and commit. Apply the competitor's writes and
      // re-run the callback ONCE (Firestore's serializable retry). The re-read
      // now sees the conflict and the manager takes its adopt branch. The
      // first attempt's staged writes are DISCARDED — matching a real abort.
      if (
        occInjection &&
        run.readPaths.has(occInjection.indexPath) &&
        !store.has(occInjection.indexPath)
      ) {
        for (const [path, data] of occInjection.competitorDocs) {
          store.set(path, data);
        }
        occInjection = null; // one-shot
        transactionRuns++;
        run = await runCallback();
      }

      for (const [path, data] of run.staged) store.set(path, data);
      return run.result;
    }
  ),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/navigation/services/sequence-encoder", () => ({
  encodeSequenceForQR: vi.fn(async () => "s~test-blob"),
  isInlineEncoded: (s: string) => s.startsWith("s~"),
  decodeSequenceFromQR: vi.fn(async () => ({
    steps: [{ id: "decoded-step-1", stepNumber: 1, letter: null }],
  })),
}));
vi.mock("$lib/shared/navigation/services/letter-deriver", () => ({
  deriveLettersForSequence: vi.fn(
    async (sequence: Record<string, unknown>) => ({
      ...sequence,
      steps: [{ id: "decoded-step-1", stepNumber: 1, letter: "A" }],
    })
  ),
}));

import { addDoc } from "firebase/firestore";
import { ShortCodeManager } from "../short-code-manager";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  decodeSequenceFromQR,
  encodeSequenceForQR,
} from "$lib/shared/navigation/services/sequence-encoder";
import { deriveLettersForSequence } from "$lib/shared/navigation/services/letter-deriver";
import { createSoloProp } from "$lib/shared/foundation/services/solo-prop-factory";
import { soloPropToSequence } from "$lib/shared/foundation/services/solo-prop-sequence-adapter";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

// Steps carry letters: the mint path runs STRICT payload-word derivation and
// rejects a letterless payload (parity-repair spec, shortcode mint path).
const SEQUENCE = {
  id: "seq-1",
  word: "TEST",
  ownerId: "user-1",
  steps: [{ id: "step-1", stepNumber: 1, letter: "A" }],
} as unknown as SequenceData;

/** Stored fields of an existing record that plays SEQUENCE. Dedup adopts an
 *  existing code only after hydrating it and comparing what it plays. */
const PLAYS_SEQUENCE = {
  sequenceData: { steps: SEQUENCE.steps, word: "A" },
  payloadStepCount: 1,
};

/** A record that shares SEQUENCE's encoderHash but plays something else. */
const PLAYS_OTHER = {
  sequenceData: {
    word: "A",
    steps: [
      {
        id: "other-1",
        stepNumber: 1,
        letter: "A",
        motions: {
          left: {
            motionType: "pro",
            rotationDirection: "cw",
            turns: 0,
            startLocation: "s",
            endLocation: "w",
            startOrientation: "in",
            endOrientation: "in",
            isVisible: true,
          },
        },
      },
    ],
  },
  payloadStepCount: 1,
};

const SOLO_PROP = createSoloProp(
  [
    {
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 1,
      duration: 1,
    },
  ],
  GridLocation.NORTH,
  Orientation.IN,
  { name: "Left-hand choreography" }
);

const hashMatcher = {
  computeEncoderHash: vi.fn(async () => "HASH_A"),
} as never;

function makeManager() {
  const browseLoader = { loadFullSequenceData: vi.fn(async () => null) };
  return new ShortCodeManager(browseLoader as never, hashMatcher);
}

function docsIn(collectionName: string): string[] {
  return [...store.keys()].filter((k) => k.startsWith(`${collectionName}/`));
}

beforeEach(() => {
  store.clear();
  transactionRuns = 0;
  queryResults = [];
  occInjection = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404 }))
  );
  vi.mocked(encodeSequenceForQR).mockReset();
  vi.mocked(encodeSequenceForQR).mockResolvedValue("s~test-blob");
  vi.mocked(decodeSequenceFromQR).mockReset();
  vi.mocked(decodeSequenceFromQR).mockResolvedValue({
    steps: [{ id: "decoded-step-1", stepNumber: 1, letter: null }],
  } as never);
  vi.mocked(deriveLettersForSequence).mockReset();
  vi.mocked(deriveLettersForSequence).mockImplementation(
    async (sequence: SequenceData) =>
      ({
        ...sequence,
        steps: [{ id: "decoded-step-1", stepNumber: 1, letter: "A" }],
      }) as unknown as SequenceData
  );
});

describe("ShortCodeManager allocation", () => {
  it("mints a titled hand-path snapshot without requiring TKA letters", async () => {
    const sequence = {
      ...SEQUENCE,
      sequenceKind: "hand-path" as const,
      displayName: "Tog-Opp",
      word: "",
      notes: "Together time, opposite direction.",
      steps: SEQUENCE.steps.map((step) => ({ ...step, letter: null })),
    };
    vi.mocked(decodeSequenceFromQR).mockResolvedValue(sequence);
    const result = await makeManager().createShortCode(sequence, {});
    expect(store.get(`shortcodes/${result.code}`)).toMatchObject({
      payloadKind: "hand-path",
      payloadWord: "",
      payloadTitle: "Tog-Opp",
      encoded: "s~test-blob",
      encodedFidelity: "exact",
      payloadDigest: expect.any(String),
      sequenceData: {
        sequenceKind: "hand-path",
        word: "",
        displayName: "Tog-Opp",
      },
    });
  });
  it("two concurrent calls with different options mint ONE code (the 2026-07-05 dup-mint race)", async () => {
    const manager = makeManager();
    // Exactly the two production call sites: overlay state (embed, no props)
    // and QR generator (lean, prop options). Pre-fix these used different
    // single-flight scopes and each wrote its own doc — 1,044 dup groups.
    const [a, b] = await Promise.all([
      manager.createShortCode(SEQUENCE, { embedSequenceData: true }),
      manager.createShortCode(SEQUENCE, {
        leftPropType: "C",
        rightPropType: "C",
      }),
    ]);

    expect(a.code).toBe(b.code);
    expect(docsIn("shortcodes")).toHaveLength(1);
    expect(docsIn("shortcodeHashes")).toEqual([`shortcodeHashes/HASH_A`]);
    expect(store.get("shortcodeHashes/HASH_A")?.code).toBe(a.code);
    // Each caller still gets a URL shaped by its OWN options.
    expect(b.url).toContain("bp=C");
    expect(b.url).toContain("rp=C");
    expect(a.url).not.toContain("bp=");
  });

  it("adopts the code from an existing hash-index doc instead of minting", async () => {
    store.set("shortcodeHashes/HASH_A", { code: "OLD1" });
    store.set("shortcodes/OLD1", {
      encoderHash: "HASH_A",
      createdAt: "2026-05-01T00:00:00.000Z",
      ...PLAYS_SEQUENCE,
    });
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});

    expect(result.code).toBe("OLD1");
    expect(result.isNew).toBe(false);
    expect(docsIn("shortcodes")).toEqual(["shortcodes/OLD1"]);
  });

  it("mints a hash-less code when the hash index names different choreography", async () => {
    store.set("shortcodeHashes/HASH_A", { code: "OTHR" });
    store.set("shortcodes/OTHR", {
      encoderHash: "HASH_A",
      createdAt: "2026-05-01T00:00:00.000Z",
      ...PLAYS_OTHER,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(result.code).not.toBe("OTHR");
    expect(result.isNew).toBe(true);
    expect(record?.encoderHash).toBeUndefined();
    expect(record?.sequenceData).toEqual(PLAYS_SEQUENCE.sequenceData);
    expect(store.get("shortcodeHashes/HASH_A")).toEqual({ code: "OTHR" });
    warn.mockRestore();
  });

  it("mints a separate code when every hash match plays different choreography", async () => {
    // HFWmmG and EPcIm6 share an encoderHash in production while playing
    // different orientations. A hash match alone must never be handed back.
    queryResults = [
      {
        id: "OTHR",
        data: {
          encoderHash: "HASH_A",
          createdAt: "2026-05-01T00:00:00.000Z",
          ...PLAYS_OTHER,
        },
      },
    ];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(result.code).not.toBe("OTHR");
    expect(result.isNew).toBe(true);
    // The hash already belongs to OTHR, so the new code claims no index.
    expect(record?.encoderHash).toBeUndefined();
    expect(docsIn("shortcodeHashes")).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("play different choreography"),
      expect.objectContaining({ codes: ["OTHR"] })
    );
    warn.mockRestore();
  });

  it("skips a hash match whose record cannot be hydrated", async () => {
    queryResults = [
      { id: "BARE", data: { createdAt: "2026-05-01T00:00:00.000Z" } },
    ];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});

    expect(result.code).not.toBe("BARE");
    expect(result.isNew).toBe(true);
    warn.mockRestore();
  });

  it("picks the OLDEST doc when legacy duplicates exist for a hash", async () => {
    queryResults = [
      {
        id: "NEW1",
        data: { createdAt: "2026-06-01T00:00:00.000Z", ...PLAYS_SEQUENCE },
      },
      {
        id: "OLD9",
        data: { createdAt: "2026-05-01T00:00:00.000Z", ...PLAYS_SEQUENCE },
      },
    ];
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});

    expect(result.code).toBe("OLD9");
    expect(result.isNew).toBe(false);
  });

  it("second sequential call resolves from cache without another transaction", async () => {
    const manager = makeManager();
    const first = await manager.createShortCode(SEQUENCE, {});
    const runsAfterFirst = transactionRuns;

    const second = await manager.createShortCode(SEQUENCE, {
      leftPropType: "F",
    });

    expect(second.code).toBe(first.code);
    expect(transactionRuns).toBe(runsAfterFirst);
    expect(second.url).toContain("bp=F");
  });

  it("loser in a cross-device write-write race retries and adopts the winner's code (OCC)", async () => {
    // COVERED here: the serializable-transaction RETRY path — the load-bearing
    // cross-device invariant of the whole fix. Our allocation reads
    // shortcodeHashes/HASH_A as empty; a competing DEVICE commits its own code
    // doc + index doc in the gap; Firestore re-invokes our callback; the
    // re-read sees the claimed index and adopts "COMP1" instead of minting a
    // duplicate. (Same-tab races are already covered by single-flight above.)
    // NOT covered here — only the manual Task-7 live check can: real Firestore
    // OCC version-conflict detection and genuine multi-client timing. The mock
    // forces the retry deterministically rather than proving Firestore aborts.
    occInjection = {
      indexPath: "shortcodeHashes/HASH_A",
      competitorDocs: [
        [
          "shortcodes/COMP1",
          {
            encoderHash: "HASH_A",
            createdAt: "2026-07-05T00:00:00.000Z",
            ...PLAYS_SEQUENCE,
          },
        ],
        [
          "shortcodeHashes/HASH_A",
          { code: "COMP1", createdAt: "2026-07-05T00:00:00.000Z" },
        ],
      ],
    };
    const manager = makeManager();

    const [a, b] = await Promise.all([
      manager.createShortCode(SEQUENCE, { embedSequenceData: true }),
      manager.createShortCode(SEQUENCE, { leftPropType: "C" }),
    ]);

    expect(a.code).toBe("COMP1");
    expect(b.code).toBe("COMP1");
    expect(a.isNew).toBe(false);
    // Exactly one code doc (the competitor's) + one index doc: our aborted
    // attempt's staged writes were discarded, so NO duplicate was minted.
    expect(docsIn("shortcodes")).toEqual(["shortcodes/COMP1"]);
    expect(docsIn("shortcodeHashes")).toEqual(["shortcodeHashes/HASH_A"]);
    expect(transactionRuns).toBe(2); // initial run + one OCC retry
  });

  it("tie-breaks on smaller doc id when legacy duplicates share a createdAt", async () => {
    // 0ms-apart dups exist in real data; without a deterministic tie-break two
    // clients could converge on different codes for the same hash. Smaller id
    // wins — regardless of the arbitrary query order.
    queryResults = [
      {
        id: "ZZ99",
        data: { createdAt: "2026-05-01T00:00:00.000Z", ...PLAYS_SEQUENCE },
      },
      {
        id: "AA11",
        data: { createdAt: "2026-05-01T00:00:00.000Z", ...PLAYS_SEQUENCE },
      },
    ];
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});

    expect(result.code).toBe("AA11");
    expect(result.isNew).toBe(false);
  });

  it("stores the embedded copy on every mint, and the blob beside it when it plays exactly", async () => {
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(record?.encoded).toBe("s~test-blob");
    expect(record?.encodedFidelity).toBe("exact");
    expect(record?.encodedLossReason).toBeUndefined();
    expect(record?.payloadDigest).toEqual(expect.any(String));
    expect(record?.sequenceData).toEqual({
      steps: SEQUENCE.steps,
      // The source fixture deliberately carries stale word "TEST".
      word: "A",
    });
    expect(record?.payloadWord).toBe("A");
    expect(record?.payloadStepCount).toBe(1);
    expect(deriveLettersForSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            letter: null,
          }),
        ],
      })
    );
  });

  it("stores an honest embed instead of a blob that re-derives another word", async () => {
    vi.mocked(deriveLettersForSequence).mockImplementationOnce(
      async (sequence: SequenceData) =>
        ({
          ...sequence,
          steps: [{ id: "decoded-step-1", stepNumber: 1, letter: "B" }],
        }) as unknown as SequenceData
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(record?.encoded).toBeUndefined();
    expect(record?.encodedFidelity).toBe("lossy");
    expect(record?.encodedLossReason).toBe("word: A vs B");
    expect(record?.sequenceData).toEqual({
      steps: SEQUENCE.steps,
      // The source fixture deliberately carries stale word "TEST".
      word: "A",
    });
    expect(record?.payloadWord).toBe("A");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("storing the embedded copy only"),
      expect.objectContaining({ reason: "word: A vs B" })
    );
    warn.mockRestore();
  });

  it("stores an embed when decoded motions cannot re-derive every beat", async () => {
    vi.mocked(deriveLettersForSequence).mockImplementationOnce(
      async (sequence: SequenceData) =>
        ({
          ...sequence,
          steps: [{ id: "decoded-step-1", stepNumber: 1, letter: null }],
        }) as unknown as SequenceData
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(record?.encoded).toBeUndefined();
    expect(record?.sequenceData).toEqual({
      steps: SEQUENCE.steps,
      word: "A",
    });
    expect(record?.encodedLossReason).toBe("word: A vs (incomplete)");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("storing the embedded copy only"),
      expect.objectContaining({ reason: "word: A vs (incomplete)" })
    );
    warn.mockRestore();
  });

  it("stores an embed when the encoder emits a payload its decoder rejects", async () => {
    vi.mocked(decodeSequenceFromQR).mockRejectedValueOnce(
      new Error("unreadable payload")
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(record?.encoded).toBeUndefined();
    expect(record?.sequenceData).toEqual({
      steps: SEQUENCE.steps,
      word: "A",
    });
    expect(record?.encodedLossReason).toBe("decode failed: unreadable payload");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("storing the embedded copy only"),
      expect.objectContaining({ sequenceId: "seq-1" })
    );
    warn.mockRestore();
  });

  it("stores no blob when the decoded choreography differs from the source", async () => {
    vi.mocked(decodeSequenceFromQR).mockResolvedValueOnce({
      steps: [
        { id: "decoded-step-1", stepNumber: 1, letter: null },
        { id: "decoded-step-2", stepNumber: 2, letter: null },
      ],
    } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});
    const record = store.get(`shortcodes/${result.code}`);

    expect(record?.encoded).toBeUndefined();
    expect(record?.encodedFidelity).toBe("lossy");
    expect(record?.encodedLossReason).toContain("step count");
    expect(record?.sequenceData).toEqual(PLAYS_SEQUENCE.sequenceData);
    warn.mockRestore();
  });

  it("fails the mint loudly when the encoder rejects a motion", async () => {
    vi.mocked(encodeSequenceForQR).mockRejectedValueOnce(
      new Error('Cannot encode motion: unknown startLocation "q"')
    );
    const manager = makeManager();

    await expect(manager.createShortCode(SEQUENCE, {})).rejects.toThrow(
      "Cannot encode motion"
    );
    expect(docsIn("shortcodes")).toHaveLength(0);
    expect(docsIn("shortcodeHashes")).toHaveLength(0);
  });

  it("mints and resolves schema-3 solo choreography without inventing a word", async () => {
    const soloSequence = soloPropToSequence(SOLO_PROP, "left", {
      sourceSoloPropId: SOLO_PROP.id,
    });
    vi.mocked(decodeSequenceFromQR).mockResolvedValue({
      ...soloSequence,
      word: "Λ",
      steps: soloSequence.steps.map((step) => ({ ...step, letter: "Λ" })),
    });
    const manager = makeManager();

    const result = await manager.createShortCode(soloSequence, {});
    const record = store.get(`shortcodes/${result.code}`);
    const resolved = await manager.resolveShortCode(result.code);

    expect(record).toMatchObject({
      payloadKind: "solo",
      payloadSchemaVersion: 3,
      payloadTitle: "Left-hand choreography",
      payloadContentHash: SOLO_PROP.contentHash,
      payloadStepCount: 1,
      authoredHand: "left",
      sourceSoloPropId: SOLO_PROP.id,
      soloData: { id: SOLO_PROP.id, contentHash: SOLO_PROP.contentHash },
    });
    // The canonical solo prop is the payload; the rules forbid both at once.
    expect(record?.encoded).toBeUndefined();
    expect(record?.payloadWord).toBeUndefined();
    expect(getSequenceMotionProfile(resolved!)).toEqual({
      kind: "solo",
      hand: "left",
      authoredHand: "left",
    });
    expect(resolved?.displayName).toBe("Left-hand choreography");
    expect(resolved?.word).toBe("");
    expect(resolved?.steps.every((step) => step.letter === null)).toBe(true);
    expect(resolved?.leftSoloProp?.id).toBe(SOLO_PROP.id);
    expect(resolved?.metadata.sourceSoloPropId).toBe(SOLO_PROP.id);
  });

  it("omits source provenance for an extracted solo artifact that was never saved", async () => {
    const soloSequence = soloPropToSequence(SOLO_PROP, "left");
    vi.mocked(decodeSequenceFromQR).mockResolvedValue(soloSequence);
    const manager = makeManager();

    const result = await manager.createShortCode(soloSequence, {});
    const record = store.get(`shortcodes/${result.code}`);
    const resolved = await manager.resolveShortCode(result.code);

    expect(record?.sourceSoloPropId).toBeUndefined();
    expect(resolved?.metadata.sourceSoloPropId).toBeUndefined();
    expect(resolved?.leftSoloProp?.id).toBe(`shortcode-${result.code}`);
  });

  it("falls back to canonical soloData when the codec loses the absent hand", async () => {
    vi.mocked(decodeSequenceFromQR).mockResolvedValue({
      steps: [{ id: "decoded-step-1", stepNumber: 1, letter: null }],
    } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = makeManager();

    const result = await manager.createSoloShortCode(SOLO_PROP, "right");
    const record = store.get(`shortcodes/${result.code}`);
    const resolved = await manager.resolveShortCode(result.code);

    expect(record?.encoded).toBeUndefined();
    expect(record?.sourceSoloPropId).toBeUndefined();
    expect(record?.soloData).toMatchObject({
      id: SOLO_PROP.id,
      contentHash: SOLO_PROP.contentHash,
    });
    expect(getSequenceMotionProfile(resolved!)).toEqual({
      kind: "solo",
      hand: "right",
      authoredHand: "right",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("blocks mixed paired and single-hand choreography before minting", async () => {
    const soloSequence = soloPropToSequence(SOLO_PROP, "left");
    const leftMotion = soloSequence.steps[0]!.motions.left;
    const mixed = {
      ...soloSequence,
      steps: [
        {
          ...soloSequence.steps[0],
          motions: {
            ...soloSequence.steps[0]!.motions,
            right: { ...leftMotion, hand: "right" },
          },
        },
        {
          ...soloSequence.steps[0],
          id: "solo-step-2",
          stepNumber: 2,
        },
      ],
    } as SequenceData;
    const manager = makeManager();

    await expect(manager.createShortCode(mixed)).rejects.toMatchObject({
      name: "ShortCodeShareError",
      code: "MIXED_CHOREOGRAPHY_UNSUPPORTED",
    } satisfies Partial<ShortCodeShareError>);
    expect(docsIn("shortcodes")).toHaveLength(0);
  });

  it("rejects a solo title that Firestore rules cannot accept", async () => {
    const manager = makeManager();

    await expect(
      manager.createSoloShortCode(
        { ...SOLO_PROP, name: "x".repeat(161) },
        "left"
      )
    ).rejects.toMatchObject({
      code: "SOLO_TITLE_TOO_LONG",
    } satisfies Partial<ShortCodeShareError>);
    expect(docsIn("shortcodes")).toHaveLength(0);
  });
});

describe("ShortCodeManager scan events", () => {
  it("persists the physical card's resolved prop configuration", async () => {
    vi.mocked(addDoc).mockClear();
    const manager = makeManager();

    await manager.logScanEvent("PROP", {
      printId: "print-1",
      country: "US",
      city: "Chicago",
      userAgent: "test",
      screenWidth: 1200,
      screenHeight: 800,
      referrer: null,
      userId: "user-1",
      deviceId: "device-1",
      leftPropType: "poi",
      rightPropType: "fan",
      catDogMode: true,
    });

    expect(vi.mocked(addDoc)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        leftPropType: "poi",
        rightPropType: "fan",
        catDogMode: true,
        timestamp: expect.any(String),
      })
    );
  });
});
