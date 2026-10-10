/**
 * A joined sequence keeps its one join through short-code records, and a code
 * minted for a sequence drawn on one grid never answers a joined one (nor the
 * other way round). The record is hydrated exactly as a scan hydrates it: the
 * embedded copy first, then the compact blob alone, which is all the offline
 * snapshot serves.
 *
 * Records are minted from built flows whose motions chain exactly through the
 * wire format, so the blob is stored, and from real saved sequences (O1FC
 * word, D14B4D hand path), so the minted blob and word are the ones
 * production makes.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
type Constraint =
  | { kind: "where"; field: string; value: unknown }
  | { kind: "limit"; count: number };

const store = new Map<string, Doc>();

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
  setDoc: vi.fn(async (ref: { path: string }, data: Doc) => {
    store.set(ref.path, data);
  }),
  query: vi.fn((source: unknown, ...constraints: Constraint[]) => ({
    source,
    constraints,
  })),
  where: vi.fn(
    (field: string, _op: string, value: unknown): Constraint => ({
      kind: "where",
      field,
      value,
    })
  ),
  limit: vi.fn((count: number): Constraint => ({ kind: "limit", count })),
  // Queries are evaluated against the stored documents, so dedup finds a
  // record only through the field the manager actually queried.
  getDocs: vi.fn(
    async (q: {
      source: { collection: string };
      constraints: Constraint[];
    }) => {
      const prefix = `${q.source.collection}/`;
      const max = q.constraints.find((c) => c.kind === "limit");
      const docs = [...store.entries()]
        .filter(
          ([path, data]) =>
            path.startsWith(prefix) &&
            q.constraints.every(
              (c) => c.kind !== "where" || data[c.field] === c.value
            )
        )
        .slice(0, max?.kind === "limit" ? max.count : undefined)
        .map(([path, data]) => ({
          id: path.slice(prefix.length),
          data: () => data,
        }));
      return { empty: docs.length === 0, docs };
    }
  ),
  updateDoc: vi.fn(async (ref: { path: string }, updates: Doc) => {
    store.set(ref.path, { ...store.get(ref.path), ...updates });
  }),
  increment: vi.fn(),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      fn: (tx: {
        get: (ref: { path: string }) => Promise<unknown>;
        set: (ref: { path: string }, data: Doc) => void;
      }) => Promise<unknown>
    ) => {
      const staged = new Map<string, Doc>();
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
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

import { loopDetector } from "#lib/shared/create/services/loop-detector.js";
import { registerLoopDetector } from "#lib/shared/create/get-loop-detector.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hydrate } from "#lib/shared/foundation/services/sequence-hydrator.js";
import { sha256Hex } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  decodeSequenceFromQR,
  encodeSequence,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import { deriveLettersForSequence } from "#lib/shared/navigation/services/letter-deriver.js";
import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
import {
  choreographyDigest,
  findChoreographyMismatch,
  projectChoreography,
  verifyEncodedChoreography,
} from "#lib/shared/qr/services/choreography-fidelity.js";
import { buildHandPathShortCodePayload } from "#lib/shared/qr/services/hand-path-short-code-payload.js";
import { hydrateSelfContainedShortCodePayload } from "#lib/shared/qr/services/short-code-payload-hydrator.js";
import { ShortCodeManager } from "#lib/shared/qr/services/short-code-manager.js";
import type { ShortCodeData } from "#lib/shared/qr/services/types.js";
import realRecords from "../../fixtures/shortcode-payloads/real-records.json";
import {
  buildJoinFixture,
  joinOf,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  withJoins,
  type JoinFixtureOptions,
} from "../grid-join/grid-join-fixtures";

interface RealRecord {
  payloadKind: "hand-path" | null;
  sequenceData: Record<string, unknown>;
}

const REAL = realRecords as unknown as Record<string, RealRecord>;

/** A real saved sequence, as the app holds it when minting. */
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

/** A joined sequence: the join covers every cell, the start included. */
const JOINED: JoinFixtureOptions = { sequenceJoin: JOIN_EAST_ONE };

/** Every kind of join a record has to tell apart. */
const VARIANTS: Record<string, JoinFixtureOptions> = {
  "a joined sequence": { sequenceJoin: JOIN_EAST_ONE },
  "a sequence joined toward the west": {
    sequenceJoin: { toward: "w", steps: 1 },
  },
  "a sequence joined two steps apart": {
    sequenceJoin: { toward: "e", steps: 2 },
  },
  "a sequence joined diagonally": { sequenceJoin: JOIN_NORTHEAST_TWO },
};

/**
 * The built flow cut to the two steps, with no turns, that read back from the
 * wire format as they were written. A turn is rebuilt with a different end
 * orientation than the fixture defaults to, and a counter-clockwise pro
 * without turns reads back as anti; either would leave the minted record
 * embedded-only and the blob unstored.
 */
function exactFlow(options: JoinFixtureOptions = {}): SequenceData {
  const base = buildJoinFixture(options);
  return {
    ...base,
    steps: base.steps.slice(0, 2).map((step) => ({
      ...step,
      motions: {
        ...(step.motions.left && {
          left: { ...step.motions.left, turns: 0 },
        }),
        ...(step.motions.right && {
          right: { ...step.motions.right, turns: 0 },
        }),
      },
    })),
  };
}

/** `exactFlow` as a hand path, with the join as chosen. */
function handPathFlow(options: JoinFixtureOptions = {}): SequenceData {
  return exactFlow({ ...options, handPath: true });
}

/**
 * `exactFlow` with the letters a scan derives for it, so its word is complete
 * and the minted blob re-derives it, then joined as chosen.
 */
async function wordFlow(
  options: JoinFixtureOptions = {}
): Promise<SequenceData> {
  const lettered = await deriveLettersForSequence(exactFlow());
  return withJoins(lettered, options);
}

/** The record as the offline snapshot serves it: the blob, no embedded copy. */
function withoutEmbed(record: ShortCodeData): ShortCodeData {
  const { sequenceData: _embed, ...blobOnly } = record;
  return blobOnly;
}

beforeAll(() => registerLoopDetector(loopDetector));

describe("the choreography projection", () => {
  it("is unchanged for a sequence drawn on one grid", async () => {
    for (const sequence of [
      buildJoinFixture(),
      buildJoinFixture({ lettered: true }),
      buildJoinFixture({ handPath: true }),
      saved("O1FC"),
      saved("Kuofvw"),
    ]) {
      const projection = projectChoreography(sequence);

      expect(Object.keys(projection)).toEqual(["kind", "start", "steps"]);
      expect(Object.keys(projection.start)).toEqual(["left", "right"]);
      for (const step of projection.steps) {
        expect(Object.keys(step)).toEqual(["duration", "left", "right"]);
      }
    }
  });

  it("names the join of the sequence, and of nothing else", () => {
    const projection = projectChoreography(buildJoinFixture(JOINED));

    expect(projection.join).toBe("e1");
    expect(Object.keys(projection.start)).toEqual(["left", "right"]);
    for (const step of projection.steps) {
      expect(Object.keys(step)).toEqual(["duration", "left", "right"]);
    }
  });

  it("ignores a join a cell carries on its own", () => {
    const base = buildJoinFixture();
    const sequence = {
      ...base,
      startPlacement: { ...base.startPlacement!, conjoined: JOIN_EAST_ONE },
      steps: base.steps.map((step) => ({ ...step, conjoined: null })),
    } as unknown as SequenceData;

    expect(projectChoreography(sequence)).toEqual(projectChoreography(base));
  });

  it("is the same from the stored plain-object shape", () => {
    const sequence = buildJoinFixture(JOINED);
    const stored = JSON.parse(JSON.stringify(sequence));

    expect(projectChoreography(stored)).toEqual(projectChoreography(sequence));
    expect(projectChoreography(stored).join).toBe("e1");
  });

  it("ignores a join that is malformed, as a drawing does", () => {
    const base = buildJoinFixture();
    const bad = { toward: "c", steps: 7 };
    const sequence = { ...base, conjoined: bad } as unknown as SequenceData;

    expect(projectChoreography(sequence)).toEqual(projectChoreography(base));
  });
});

describe("the choreography digest", () => {
  it("is unchanged for a sequence drawn on one grid", async () => {
    expect(await choreographyDigest(buildJoinFixture())).toBe(
      "9f46a0c4970222c7e44743792fb5d06afc3b2576af94d23cb4bbdc7e9fc7e190"
    );
    expect(await choreographyDigest(buildJoinFixture({ lettered: true }))).toBe(
      "9f46a0c4970222c7e44743792fb5d06afc3b2576af94d23cb4bbdc7e9fc7e190"
    );
    expect(await choreographyDigest(buildJoinFixture({ handPath: true }))).toBe(
      "0415cdba54d52d4713725511702341519a29bb2e924f018f9a190161c96b6262"
    );
    expect(
      await choreographyDigest(
        buildJoinFixture({ handPath: true, lettered: true })
      )
    ).toBe("0415cdba54d52d4713725511702341519a29bb2e924f018f9a190161c96b6262");
  });

  it("differs for every kind of join", async () => {
    const plain = await choreographyDigest(buildJoinFixture());
    const digests = await Promise.all(
      Object.values(VARIANTS).map((options) =>
        choreographyDigest(buildJoinFixture(options))
      )
    );

    expect(digests).not.toContain(plain);
    expect(new Set(digests).size).toBe(digests.length);
  });

  it("does not depend on the key order of a join or on a malformed one", async () => {
    const swapped = (join: { toward: string; steps: number }) =>
      ({ steps: join.steps, toward: join.toward }) as never;
    const reordered = buildJoinFixture({
      sequenceJoin: swapped(JOIN_EAST_ONE),
    });

    expect(await choreographyDigest(reordered)).toBe(
      await choreographyDigest(buildJoinFixture(JOINED))
    );
  });
});

describe("a joined sequence against a one-grid record", () => {
  const plain = buildJoinFixture();

  it.each(Object.entries(VARIANTS))(
    "is told apart from %s, whichever way round it is asked",
    (_name, options) => {
      const joined = buildJoinFixture(options);
      const forward = findChoreographyMismatch(
        projectChoreography(joined),
        projectChoreography(plain)
      );
      const backward = findChoreographyMismatch(
        projectChoreography(plain),
        projectChoreography(joined)
      );

      expect(forward).toMatch(/join: /);
      expect(backward).toMatch(/join: /);
    }
  );

  it("reads out where the join differs", () => {
    const mismatch = (options: JoinFixtureOptions) =>
      findChoreographyMismatch(
        projectChoreography(buildJoinFixture(options)),
        projectChoreography(plain)
      );

    expect(mismatch({ sequenceJoin: JOIN_EAST_ONE })).toBe(
      "join: e1 vs (none)"
    );
  });

  it("is told apart from the same sequence joined another way", () => {
    expect(
      findChoreographyMismatch(
        projectChoreography(buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE })),
        projectChoreography(
          buildJoinFixture({ sequenceJoin: { toward: "w", steps: 1 } })
        )
      )
    ).toBe("join: e1 vs w1");
  });

  it("matches itself", () => {
    for (const options of Object.values(VARIANTS)) {
      const joined = projectChoreography(buildJoinFixture(options));

      expect(findChoreographyMismatch(joined, joined)).toBeNull();
    }
  });
});

describe("a hand-path record", () => {
  const sequence = handPathFlow(JOINED);

  it("keeps the join in its embedded copy, its blob and its digest", async () => {
    const record = await buildHandPathShortCodePayload(sequence);

    expect(record.encodedLossReason).toBeUndefined();
    expect(record.encodedFidelity).toBe("exact");
    expect(record.sequenceData?.conjoined).toEqual(JOIN_EAST_ONE);
    expect(record.payloadDigest).toBe(await choreographyDigest(sequence));
    expect(record.payloadDigest).not.toBe(
      await choreographyDigest(handPathFlow())
    );
    expect(
      await verifyEncodedChoreography(record.encoded!, sequence)
    ).toMatchObject({ exact: true });
  });

  it("plays its join from the embedded copy", async () => {
    const record = await buildHandPathShortCodePayload(sequence);
    const played = await hydrateSelfContainedShortCodePayload("HP01", record);

    expect(played).not.toBeNull();
    expect(joinOf(played!)).toEqual(joinOf(sequence));
  });

  it("plays its join from the blob alone, as the offline snapshot serves it", async () => {
    const record = await buildHandPathShortCodePayload(sequence);
    const played = await hydrateSelfContainedShortCodePayload(
      "HP01",
      withoutEmbed(record)
    );

    expect(played).not.toBeNull();
    expect(joinOf(played!)).toEqual(joinOf(sequence));
  });

  it("leaves a sequence drawn on one grid with no join in its embedded copy", async () => {
    const record = await buildHandPathShortCodePayload(handPathFlow());

    expect(record.sequenceData).not.toHaveProperty("conjoined");
  });

  it("does not store a join that is malformed", async () => {
    const record = await buildHandPathShortCodePayload({
      ...sequence,
      conjoined: { toward: "c", steps: 7 },
    } as unknown as SequenceData);

    expect(record.sequenceData).not.toHaveProperty("conjoined");
  });
});

describe("a word record", () => {
  const hashMatcher = {
    computeEncoderHash: async (sequence: SequenceData) =>
      sha256Hex(encodeSequence(sequence)),
  };
  const manager = () =>
    new ShortCodeManager(
      { loadFullSequenceData: vi.fn(async () => null) } as never,
      hashMatcher as never
    );
  const recordOf = (code: string) =>
    store.get(`shortcodes/${code}`) as unknown as ShortCodeData;

  beforeEach(() => {
    store.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("minted from a joined sequence", () => {
    it("keeps the join in its embedded copy and its blob", async () => {
      const joined = await wordFlow(JOINED);
      const { code } = await manager().createShortCode(joined);
      const record = recordOf(code);

      expect(record.encodedLossReason).toBeUndefined();
      expect(record.encodedFidelity).toBe("exact");
      expect(record.sequenceData?.conjoined).toEqual(JOIN_EAST_ONE);
      expect(record.payloadDigest).toBe(await choreographyDigest(joined));
      expect(
        await verifyEncodedChoreography(record.encoded!, joined)
      ).toMatchObject({ exact: true });
    });

    it("plays its join from the embedded copy", async () => {
      const joined = await wordFlow(JOINED);
      const { code } = await manager().createShortCode(joined);
      const played = await hydrateSelfContainedShortCodePayload(
        code,
        recordOf(code)
      );

      expect(joinOf(played!)).toEqual(joinOf(joined));
    });

    it("plays its join from the blob alone, as the offline snapshot serves it", async () => {
      const joined = await wordFlow(JOINED);
      const { code } = await manager().createShortCode(joined);
      const played = await hydrateSelfContainedShortCodePayload(
        code,
        withoutEmbed(recordOf(code))
      );

      expect(played).not.toBeNull();
      expect(joinOf(played!)).toEqual(joinOf(joined));
    });

    it("plays the join of the blob when the embedded copy is unusable", async () => {
      const joined = await wordFlow(JOINED);
      const { code } = await manager().createShortCode(joined);
      const played = await hydrateSelfContainedShortCodePayload(code, {
        ...recordOf(code),
        payloadStepCount: 99,
      });

      expect(played).not.toBeNull();
      expect(joinOf(played!)).toEqual(joinOf(joined));
    });

    it("still plays its join once the scan page hydrates it", async () => {
      const joined = await wordFlow(JOINED);
      const { code } = await manager().createShortCode(joined);
      const record = recordOf(code);

      for (const stored of [record, withoutEmbed(record)]) {
        const played = await hydrateSelfContainedShortCodePayload(code, stored);
        const shown = await hydrateSequence(played!, { loopDetector });

        expect(joinOf(shown)).toEqual(joinOf(joined));
      }
    });

    it("keeps the join of a real saved sequence", async () => {
      const joined = withJoins(saved("O1FC"), { sequenceJoin: JOIN_EAST_ONE });
      const { code } = await manager().createShortCode(joined);
      const record = recordOf(code);

      expect(record.encodedFidelity).toBe("exact");
      expect(record.sequenceData?.conjoined).toEqual(JOIN_EAST_ONE);
      for (const stored of [record, withoutEmbed(record)]) {
        const played = await hydrateSelfContainedShortCodePayload(code, stored);

        expect(joinOf(played!)).toEqual(joinOf(joined));
      }
    });
  });

  describe("minted from a sequence drawn on one grid", () => {
    it("carries no join in its embedded copy or its blob", async () => {
      const { code } = await manager().createShortCode(await wordFlow());
      const record = recordOf(code);
      const decoded = await decodeSequenceFromQR(record.encoded!);

      expect(record.sequenceData).not.toHaveProperty("conjoined");
      expect(joinOf(decoded)).toBeUndefined();
    });

    it("plays no join", async () => {
      const { code } = await manager().createShortCode(await wordFlow());

      for (const stored of [recordOf(code), withoutEmbed(recordOf(code))]) {
        const played = await hydrateSelfContainedShortCodePayload(code, stored);

        expect(joinOf(played!)).toBeUndefined();
      }
    });
  });

  describe.each(Object.entries(VARIANTS))("%s", (_name, options) => {
    const plain = () => wordFlow();
    const joined = () => wordFlow(options);

    it("gets its own code, in the same session as a one-grid code", async () => {
      const session = manager();
      const one = await session.createShortCode(await plain());
      const two = await session.createShortCode(await joined());

      expect(two.code).not.toBe(one.code);
      expect(two.isNew).toBe(true);
      expect((await session.createShortCode(await plain())).code).toBe(
        one.code
      );
      expect((await session.createShortCode(await joined())).code).toBe(
        two.code
      );
    });

    it("gets its own code from a new session, joined second", async () => {
      const one = await manager().createShortCode(await plain());
      const two = await manager().createShortCode(await joined());

      expect(two.code).not.toBe(one.code);
      expect(two.isNew).toBe(true);
      expect(await manager().createShortCode(await plain())).toMatchObject({
        code: one.code,
        isNew: false,
      });
      expect(await manager().createShortCode(await joined())).toMatchObject({
        code: two.code,
        isNew: false,
      });
    });

    it("gets its own code from a new session, joined first", async () => {
      const two = await manager().createShortCode(await joined());
      const one = await manager().createShortCode(await plain());

      expect(one.code).not.toBe(two.code);
      expect(one.isNew).toBe(true);
      expect((await manager().createShortCode(await joined())).code).toBe(
        two.code
      );
      expect((await manager().createShortCode(await plain())).code).toBe(
        one.code
      );
    });

    it("is found only through the code that plays it", async () => {
      const one = await manager().createShortCode(await plain());

      expect(
        await manager().findExistingCodeForSequence(await joined())
      ).toBeNull();
      expect(await manager().findExistingCodeForSequence(await plain())).toBe(
        one.code
      );

      const two = await manager().createShortCode(await joined());

      expect(await manager().findExistingCodeForSequence(await joined())).toBe(
        two.code
      );
      expect(await manager().findExistingCodeForSequence(await plain())).toBe(
        one.code
      );
    });

    it("is not handed a one-grid code that carries its hash and digest", async () => {
      // Dedup finds a code through its encoderHash, its hash-index claim and
      // its payloadDigest. Give the one-grid record all three of this joined
      // sequence's keys, the way a record minted before joins existed shares
      // them, and only what the record plays can tell the two apart.
      const one = await manager().createShortCode(await plain());
      const hash = await hashMatcher.computeEncoderHash(await joined());
      store.set(`shortcodes/${one.code}`, {
        ...recordOf(one.code),
        encoderHash: hash,
        payloadDigest: await choreographyDigest(await joined()),
      } as Doc);
      store.set(`shortcodeHashes/${hash}`, { code: one.code });

      expect(
        await manager().findExistingCodeForSequence(await joined())
      ).toBeNull();

      const two = await manager().createShortCode(await joined());

      expect(two.code).not.toBe(one.code);
      expect(two.isNew).toBe(true);
      const played = await hydrateSelfContainedShortCodePayload(
        two.code,
        recordOf(two.code)
      );
      expect(joinOf(played!)).toEqual(joinOf(await joined()));
    });
  });

  describe("minted from a joined hand-path sequence", () => {
    const plain = () => saved("D14B4D");
    const joined = () => withJoins(saved("D14B4D"), JOINED);

    it("keeps its join and gets its own code", async () => {
      const one = await manager().createShortCode(plain());
      const two = await manager().createShortCode(joined());

      expect(two.code).not.toBe(one.code);
      expect(recordOf(one.code).sequenceData).not.toHaveProperty("conjoined");
      expect(recordOf(two.code).sequenceData?.conjoined).toEqual(JOIN_EAST_ONE);

      const played = await hydrateSelfContainedShortCodePayload(
        two.code,
        recordOf(two.code)
      );
      expect(joinOf(played!)).toEqual(joinOf(joined()));
      expect((await manager().createShortCode(joined())).code).toBe(two.code);
      expect((await manager().createShortCode(plain())).code).toBe(one.code);
    });
  });
});
