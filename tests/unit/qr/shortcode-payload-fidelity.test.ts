/**
 * Mint-time payload fidelity against real production short-code records.
 *
 * Fixture: tests/fixtures/shortcode-payloads/real-records.json holds the
 * stored blob, encoderHash and embedded sequence copy of five production
 * records (owner fields removed; render-only placement caches trimmed):
 *
 * - Kuofvw: the stored blob is start-only, and a fresh encode of its embed
 *   still loses a motion type (pro and anti with 0 turns share a wire token).
 * - O1FC: no visible start motion; the old encoder seeded orientation "in"
 *   while the first step starts "out".
 * - D14B4D: hand-path reference card whose blob plays anti where the embed
 *   plays pro.
 * - HFWmmG / EPcIm6: share one stored encoderHash while playing different
 *   choreography, so a hash match alone must never hand back a code.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Record<string, unknown>>();
let queryResults: Array<{ id: string; data: Record<string, unknown> }> = [];

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
  setDoc: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(async () => ({
    empty: queryResults.length === 0,
    docs: queryResults.map((r) => ({ id: r.id, data: () => r.data })),
  })),
  updateDoc: vi.fn(async () => {}),
  increment: vi.fn(),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      fn: (tx: {
        get: (ref: { path: string }) => Promise<unknown>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) => {
      const staged = new Map<string, Record<string, unknown>>();
      const result = await fn({
        get: async (ref) => {
          const data = staged.get(ref.path) ?? store.get(ref.path);
          return data
            ? { exists: () => true, data: () => data }
            : { exists: () => false };
        },
        set: (ref, data) => staged.set(ref.path, data),
      });
      for (const [path, data] of staged) store.set(path, data);
      return result;
    }
  ),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

import { loopDetector } from "$lib/shared/create/services/loop-detector";
import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import {
  decodeSequenceFromQR,
  encodeSequence,
  encodeSequenceForQR,
  UnencodableMotionError,
} from "$lib/shared/navigation/services/sequence-encoder";
import {
  choreographyDigest,
  findChoreographyMismatch,
  projectChoreography,
  verifyEncodedChoreography,
} from "$lib/shared/qr/services/choreography-fidelity";
import { buildHandPathShortCodePayload } from "$lib/shared/qr/services/hand-path-short-code-payload";
import {
  decodeWordShortCodePayload,
  hydrateSelfContainedShortCodePayload,
} from "$lib/shared/qr/services/short-code-payload-hydrator";
import { ShortCodeManager } from "$lib/shared/qr/services/short-code-manager";
import type { ShortCodeData } from "$lib/shared/qr/services/types";
import realRecords from "../../fixtures/shortcode-payloads/real-records.json";

interface RealRecord {
  code: string;
  payloadKind: "hand-path" | null;
  payloadStepCount: number;
  encoderHash: string;
  encoded: string;
  sequenceData: Record<string, unknown>;
}

const REAL = realRecords as unknown as Record<string, RealRecord>;

/** The saved sequence as the app holds it when minting. */
function saved(code: string): SequenceData {
  const record = REAL[code]!;
  return hydrate(
    createSequenceData({
      ...record.sequenceData,
      id: code,
      ...(record.payloadKind === "hand-path" && {
        sequenceKind: "hand-path" as const,
      }),
    } as Partial<SequenceData>)
  );
}

/** The stored record as a reader receives it. */
function storedRecord(code: string): ShortCodeData {
  const record = REAL[code]!;
  return {
    sequence: "",
    createdAt: "2026-06-01T00:00:00.000Z",
    createdBy: "system",
    scanCount: 0,
    encoderHash: record.encoderHash,
    encoded: record.encoded,
    payloadStepCount: record.payloadStepCount,
    sequenceData: record.sequenceData,
    ...(record.payloadKind && { payloadKind: record.payloadKind }),
  };
}

async function freshVerdict(sequence: SequenceData): Promise<string> {
  const result = await verifyEncodedChoreography(
    await encodeSequenceForQR(sequence),
    sequence
  );
  return result.exact ? "exact" : result.reason;
}

beforeAll(() => registerLoopDetector(loopDetector));

describe("Kuofvw: start-only blob, and a wire format that cannot tell pro from anti", () => {
  it("the saved choreography, every motion field", () => {
    const motion = (
      motionType: string,
      rotationDirection: string,
      startLocation: string,
      endLocation: string,
      startOrientation: string,
      endOrientation: string
    ) => ({
      motionType,
      rotationDirection,
      turns: 0,
      startLocation,
      endLocation,
      startOrientation,
      endOrientation,
    });
    expect(projectChoreography(saved("Kuofvw"))).toEqual({
      kind: "prop",
      start: {
        left: { location: "s", orientation: "in" },
        right: { location: "e", orientation: "in" },
      },
      steps: [
        {
          duration: 1,
          left: motion("anti", "ccw", "s", "w", "in", "out"),
          right: motion("anti", "cw", "e", "n", "in", "out"),
        },
        {
          duration: 1,
          left: motion("pro", "ccw", "w", "s", "out", "out"),
          right: motion("pro", "cw", "n", "e", "out", "out"),
        },
        {
          duration: 1,
          left: motion("pro", "ccw", "s", "w", "out", "out"),
          right: motion("pro", "cw", "e", "n", "out", "out"),
        },
        {
          duration: 1,
          left: motion("anti", "ccw", "w", "s", "out", "in"),
          right: motion("anti", "cw", "n", "e", "out", "in"),
        },
      ],
    });
  });

  it("the stored blob plays no steps at all", async () => {
    expect(
      await verifyEncodedChoreography(
        REAL.Kuofvw!.encoded,
        REAL.Kuofvw!.sequenceData
      )
    ).toEqual({ exact: false, reason: "step count: 4 vs 0" });
  });

  it("a fresh encode is flagged lossy on the motion type it drops", async () => {
    expect(await freshVerdict(saved("Kuofvw"))).toBe(
      "step 3 left.motionType: pro vs anti"
    );
  });

  it("a scan plays the embedded copy, not the blob", async () => {
    const played = await hydrateSelfContainedShortCodePayload(
      "Kuofvw",
      storedRecord("Kuofvw")
    );
    expect(played).not.toBeNull();
    expect(
      findChoreographyMismatch(
        projectChoreography(saved("Kuofvw")),
        projectChoreography(played!)
      )
    ).toBeNull();
  });
});

describe("O1FC: orientation seed comes from the first step", () => {
  it("the stored blob, minted with the old 'in' seed, starts in the wrong orientation", async () => {
    expect(
      await verifyEncodedChoreography(
        REAL.O1FC!.encoded,
        REAL.O1FC!.sequenceData
      )
    ).toEqual({ exact: false, reason: "start left: w/out vs w/in" });
  });

  it("a fresh encode seeds from the first visible motion and round-trips exactly", async () => {
    const sequence = saved("O1FC");
    expect(encodeSequence(sequence).split("|")[0]).toBe("oiSS");
    expect(await freshVerdict(sequence)).toBe("exact");

    const decoded = projectChoreography(
      await decodeSequenceFromQR(await encodeSequenceForQR(sequence))
    );
    expect(decoded.start).toEqual({
      left: { location: "w", orientation: "out" },
      right: { location: "w", orientation: "in" },
    });
    expect(decoded.steps[0]).toEqual({
      duration: 1,
      left: {
        motionType: "dash",
        rotationDirection: "ccw",
        turns: 1,
        startLocation: "w",
        endLocation: "e",
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "anti",
        rotationDirection: "cw",
        turns: 0,
        startLocation: "w",
        endLocation: "s",
        startOrientation: "in",
        endOrientation: "out",
      },
    });
  });
});

describe("D14B4D: hand-path blob that plays anti where the card shows pro", () => {
  it("the stored blob is lossy", async () => {
    expect(
      await verifyEncodedChoreography(
        REAL.D14B4D!.encoded,
        REAL.D14B4D!.sequenceData
      )
    ).toEqual({
      exact: false,
      reason: "step 1 left.motionType: pro vs anti",
    });
  });

  it("a new hand-path record keeps the embed and stores no lossy blob", async () => {
    const sequence = saved("D14B4D");
    const record = await buildHandPathShortCodePayload(sequence);

    expect(record.encoded).toBeUndefined();
    expect(record.encodedFidelity).toBe("lossy");
    expect(record.encodedLossReason).toBe(
      "step 1 left.motionType: pro vs anti"
    );
    expect(record.payloadDigest).toBe(await choreographyDigest(sequence));
    expect((record.sequenceData as { steps: unknown[] }).steps).toHaveLength(4);

    const played = await hydrateSelfContainedShortCodePayload("NEW1", record);
    expect(played).not.toBeNull();
    expect(projectChoreography(played!).steps[0]).toEqual({
      duration: 1,
      left: {
        motionType: "pro",
        rotationDirection: "noRotation",
        turns: 0,
        startLocation: "s",
        endLocation: "w",
        startOrientation: "in",
        endOrientation: "in",
      },
      right: {
        motionType: "pro",
        rotationDirection: "noRotation",
        turns: 0,
        startLocation: "s",
        endLocation: "e",
        startOrientation: "in",
        endOrientation: "in",
      },
    });
  });

  it("a blob flagged lossy is never decoded for playback", async () => {
    expect(
      await decodeWordShortCodePayload("D14B4D", {
        ...storedRecord("D14B4D"),
        encodedFidelity: "lossy",
      })
    ).toBeNull();
  });
});

describe("HFWmmG / EPcIm6: one stored encoderHash, two choreographies", () => {
  it("the collision is real", async () => {
    expect(REAL.HFWmmG!.encoderHash).toBe(REAL.EPcIm6!.encoderHash);
    expect(
      findChoreographyMismatch(
        projectChoreography(saved("HFWmmG")),
        projectChoreography(saved("EPcIm6"))
      )
    ).not.toBeNull();
    expect(await choreographyDigest(saved("HFWmmG"))).not.toBe(
      await choreographyDigest(saved("EPcIm6"))
    );
  });

  it("the digest does not depend on the stored shape", async () => {
    for (const code of ["HFWmmG", "EPcIm6", "Kuofvw", "O1FC"]) {
      expect(await choreographyDigest(REAL[code]!.sequenceData)).toBe(
        await choreographyDigest(saved(code))
      );
    }
  });

  describe("dedup", () => {
    const sharedHash = REAL.HFWmmG!.encoderHash;
    const hashMatcher = {
      computeEncoderHash: vi.fn(async () => sharedHash),
    };
    const manager = () =>
      new ShortCodeManager(
        { loadFullSequenceData: vi.fn(async () => null) } as never,
        hashMatcher as never
      );

    beforeEach(() => {
      store.clear();
      queryResults = [{ id: "HFWmmG", data: storedRecord("HFWmmG") as never }];
      store.set("shortcodes/HFWmmG", storedRecord("HFWmmG") as never);
      store.set(`shortcodeHashes/${sharedHash}`, { code: "HFWmmG" });
    });

    it("returns the existing code for the choreography it plays", async () => {
      const result = await manager().createShortCode(saved("HFWmmG"));
      expect(result).toMatchObject({ code: "HFWmmG", isNew: false });
    });

    it("mints a separate code for the other choreography", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await manager().createShortCode(saved("EPcIm6"));
      const record = store.get(`shortcodes/${result.code}`)!;

      expect(result.code).not.toBe("HFWmmG");
      expect(result.isNew).toBe(true);
      expect(record.encoderHash).toBeUndefined();
      expect(store.get(`shortcodeHashes/${sharedHash}`)).toEqual({
        code: "HFWmmG",
      });
      // The new record plays EPcIm6 from its own embed.
      const played = await hydrateSelfContainedShortCodePayload(
        result.code,
        record as unknown as ShortCodeData
      );
      expect(
        findChoreographyMismatch(
          projectChoreography(saved("EPcIm6")),
          projectChoreography(played!)
        )
      ).toBeNull();
      warn.mockRestore();
    });
  });
});

describe("encoder refuses motions it cannot represent", () => {
  // O1FC step 1: left is a dash, right is an anti.
  function withFirstMotion(
    hand: "left" | "right",
    patch: Record<string, unknown>
  ): SequenceData {
    const sequence = saved("O1FC");
    const [first, ...rest] = sequence.steps;
    return {
      ...sequence,
      steps: [
        {
          ...first!,
          motions: {
            ...first!.motions,
            [hand]: { ...first!.motions[hand]!, ...patch },
          },
        },
        ...rest,
      ],
    } as SequenceData;
  }

  it.each([
    ["startLocation", { startLocation: "q" }, "q"],
    ["endLocation", { endLocation: "zz" }, "zz"],
    ["rotationDirection", { rotationDirection: "sideways" }, "sideways"],
    ["turns", { turns: "abc" }, "abc"],
  ] as const)("unknown %s", (field, patch, value) => {
    let thrown: unknown;
    try {
      encodeSequence(withFirstMotion("right", patch));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnencodableMotionError);
    expect(thrown).toMatchObject({ field, value });
  });

  it("fails a mint instead of dropping the hand", async () => {
    await expect(
      encodeSequenceForQR(withFirstMotion("right", { startLocation: "q" }))
    ).rejects.toBeInstanceOf(UnencodableMotionError);
  });

  it("accepts the legacy no-rotation spellings", () => {
    const sequence = saved("Kuofvw");
    const respell = (rotationDirection: string): SequenceData =>
      ({
        ...sequence,
        steps: sequence.steps.map((step) => ({
          ...step,
          motions: {
            left: { ...step.motions.left!, rotationDirection },
            right: step.motions.right,
          },
        })),
      }) as SequenceData;
    const canonical = encodeSequence(respell("noRotation"));
    expect(encodeSequence(respell("no_rot"))).toBe(canonical);
    expect(encodeSequence(respell("no_rotation"))).toBe(canonical);
  });
});
