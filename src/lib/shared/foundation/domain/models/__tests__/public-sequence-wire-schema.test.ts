import { describe, it, expect } from "vitest";

import {
  PUBLIC_PROJECTION_SCHEMA_VERSION,
  PublicSequenceWireSchema,
  parsePublicSequenceWireDocument,
  toPublicSequenceProjection,
  toApplicationDate,
  isWireTimestamp,
  checkPublicProjectionSelfContainment,
  isSelfContainedPublicProjection,
  isLegacyPublicDocument,
  isCurrentPublicProjection,
  readPublicProjectionSchemaVersion,
  classifyPublicSequenceDocument,
} from "../public-sequence-wire-schema";

/**
 * Stand-in for a live Firestore Timestamp. Counts `toDate()` calls so a test can
 * prove conversion happens exactly once per field.
 */
class FakeTimestamp {
  toDateCalls = 0;
  constructor(
    readonly seconds: number,
    readonly nanoseconds = 0
  ) {}
  toDate(): Date {
    this.toDateCalls += 1;
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }
}

const SOLO_PROP = {
  id: "solo-blue",
  steps: [
    { location: "n", orientation: "in" },
    { location: "e", orientation: "in" },
  ],
  startLocation: "n",
  startOrientation: "in",
  contentHash: "abc",
  handPath: { id: "hp", steps: [] },
  length: 2,
  bigrams: ["n-e"],
  impliedGridMode: "diamond",
};

const STEP_PAIRINGS = [
  {
    letter: "A",
    leftReversal: false,
    rightReversal: false,
    startPlacement: "alpha1",
    endPlacement: "alpha3",
  },
  {
    letter: "B",
    leftReversal: false,
    rightReversal: false,
    startPlacement: "alpha3",
    endPlacement: "beta5",
  },
];

/** A complete, self-contained schema-2 document as it comes off the wire. */
function schemaTwoDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq_abc",
    sourceRef: "users/uid-1/sequences/seq_abc",
    ownerId: "uid-1",
    ownerDisplayName: "Austen",
    ownerAvatarUrl: "https://example.test/a.png",
    name: "AB",
    displayName: "My Loop",
    intendedWord: "AB",
    word: "AB",
    thumbnails: ["https://example.test/t.png"],
    sequenceLength: 2,
    difficultyLevel: "intermediate",
    level: 2,
    isCircular: true,
    loopType: "rotated",
    period: 2,
    components: ["rotation"],
    componentDomains: { rotation: "location" },
    gridMode: "diamond",
    reversalPattern: "book",
    tags: ["loop"],
    forkCount: 3,
    viewCount: 12,
    starCount: 1,
    publicPerformanceCount: 2,
    latestPublicPerformanceAt: new FakeTimestamp(1_735_000_000),
    isForked: false,
    contentHash: "hash-1",
    contentHashVersion: 2,
    encoderHash: "enc-1",
    leftPathHash: "bp",
    rightPathHash: "rp",
    leftSoloHash: "bs",
    rightSoloHash: "rs",
    leftSoloProp: SOLO_PROP,
    rightSoloProp: { ...SOLO_PROP, id: "solo-red" },
    stepPairings: STEP_PAIRINGS,
    startPlacement: { isStartPlacement: true, id: "start-1" },
    creatorIntent: {
      propConfig: {
        leftPropType: "staff",
        rightPropType: "staff",
        catDogMode: false,
      },
    },
    animatedSequenceUrl: "https://example.test/a.webp",
    animationFormat: "webp",
    birthday: new FakeTimestamp(1_700_000_000),
    publishedAt: new FakeTimestamp(1_720_000_000),
    updatedAt: new FakeTimestamp(1_730_000_000),
    publicProjectionSchemaVersion: PUBLIC_PROJECTION_SCHEMA_VERSION,
    publicProjectionRevision: 7,
    publicProjectionDigest: "digest-1",
    ...overrides,
  };
}

/** A pre-schema-2 document: no projection stamps, but composition present. */
function legacyDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq_legacy",
    sourceRef: "users/uid-2/sequences/seq_legacy",
    ownerId: "uid-2",
    ownerDisplayName: "Christof",
    name: "IIECCK",
    word: "IIECCK",
    thumbnails: [],
    sequenceLength: 2,
    tags: [],
    forkCount: 0,
    viewCount: 0,
    starCount: 0,
    isForked: false,
    leftSoloProp: SOLO_PROP,
    rightSoloProp: { ...SOLO_PROP, id: "solo-red" },
    stepPairings: STEP_PAIRINGS,
    publishedAt: new FakeTimestamp(1_710_000_000),
    updatedAt: new FakeTimestamp(1_710_000_000),
    ...overrides,
  };
}

describe("PublicSequenceWireSchema", () => {
  it("accepts a complete schema-2 document", () => {
    const result = parsePublicSequenceWireDocument(schemaTwoDoc(), "seq_abc");
    expect(result.ok).toBe(true);
  });

  it("classifies a complete schema-2 document as current", () => {
    const classification = classifyPublicSequenceDocument(
      schemaTwoDoc(),
      "seq_abc"
    );

    expect(classification.disposition).toBe("current");
    expect(classification.legacy).toBe(false);
    expect(classification.schemaVersion).toBe(PUBLIC_PROJECTION_SCHEMA_VERSION);
    expect(classification.selfContainment.selfContained).toBe(true);
    expect(classification.selfContainment.blocking).toEqual([]);
    expect(classification.selfContainment.advisory).toEqual([]);
    expect(classification.issues).toEqual([]);
  });

  it("carries every field the loader currently reaches through a cast", () => {
    const { projection } = classifyPublicSequenceDocument(
      schemaTwoDoc(),
      "seq_abc"
    );

    // public-sequences-loader.ts:301-306 casts to reach these four.
    expect(projection?.displayName).toBe("My Loop");
    expect(projection?.isCircular).toBe(true);
    expect(projection?.components).toEqual(["rotation"]);
    expect(projection?.componentDomains).toEqual({ rotation: "location" });
  });

  it("carries the fields consumers read but the syncer never writes", () => {
    const { projection } = classifyPublicSequenceDocument(
      schemaTwoDoc(),
      "seq_abc"
    );

    expect(projection?.intendedWord).toBe("AB");
    expect(projection?.gridMode).toBe("diamond");
    expect(projection?.reversalPattern).toBe("book");
    expect(projection?.animatedSequenceUrl).toBe("https://example.test/a.webp");
    // Companion format — written by the projection builder; without it the
    // animation URL is ambiguous and the Watch feed cannot pick a decoder.
    expect(projection?.animationFormat).toBe("webp");
  });

  it("carries the seven fields the public-collection path reads and Browse drops", () => {
    const { projection } = classifyPublicSequenceDocument(
      schemaTwoDoc(),
      "seq_abc"
    );

    expect(projection?.forkCount).toBe(3);
    expect(projection?.viewCount).toBe(12);
    expect(projection?.starCount).toBe(1);
    expect(projection?.publicPerformanceCount).toBe(2);
    expect(projection?.latestPublicPerformanceAt).toEqual(
      new Date(1_735_000_000_000)
    );
    expect(projection?.contentHash).toBe("hash-1");
    expect(projection?.contentHashVersion).toBe(2);
    expect(projection?.creatorIntent).toBeDefined();
    expect(projection?.startPlacement).toEqual({
      isStartPlacement: true,
      id: "start-1",
    });
  });

  it("prefers the snapshot id over a stale denormalized id field", () => {
    const result = parsePublicSequenceWireDocument(
      schemaTwoDoc({ id: "stale-copy" }),
      "seq_abc"
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.id).toBe("seq_abc");
  });

  it("rejects a document missing ownerId or sourceRef as invalid, not legacy", () => {
    const noOwner = schemaTwoDoc();
    delete (noOwner as Record<string, unknown>).ownerId;

    const classification = classifyPublicSequenceDocument(noOwner, "seq_abc");

    expect(classification.disposition).toBe("invalid");
    expect(classification.projection).toBeNull();
    expect(classification.issues.join(" ")).toContain("ownerId");
  });

  it("applies defaults for absent count and list fields", () => {
    const bare = {
      id: "seq_bare",
      sourceRef: "users/uid/sequences/seq_bare",
      ownerId: "uid",
    };

    const result = parsePublicSequenceWireDocument(bare, "seq_bare");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.thumbnails).toEqual([]);
    expect(result.document.tags).toEqual([]);
    expect(result.document.forkCount).toBe(0);
    expect(result.document.viewCount).toBe(0);
    expect(result.document.starCount).toBe(0);
    expect(result.document.publicPerformanceCount).toBe(0);
    expect(result.document.isForked).toBe(false);
    expect(result.document.isCircular).toBe(false);
    expect(result.document.word).toBe("");
    expect(result.document.ownerDisplayName).toBe("");
  });
});

describe("forward compatibility", () => {
  it("does not crash on an unexpected extra field", () => {
    const result = parsePublicSequenceWireDocument(
      schemaTwoDoc({ someFutureField: { nested: [1, 2, 3] } }),
      "seq_abc"
    );

    expect(result.ok).toBe(true);
  });

  it("preserves the unexpected field instead of stripping it", () => {
    const result = PublicSequenceWireSchema.safeParse(
      schemaTwoDoc({ someFutureField: { nested: [1, 2, 3] } })
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect((result.data as Record<string, unknown>).someFutureField).toEqual({
      nested: [1, 2, 3],
    });
  });

  it("still classifies a document from a newer schema version as non-legacy", () => {
    const classification = classifyPublicSequenceDocument(
      schemaTwoDoc({
        publicProjectionSchemaVersion: PUBLIC_PROJECTION_SCHEMA_VERSION + 1,
        someFutureField: "hello",
      }),
      "seq_abc"
    );

    expect(classification.legacy).toBe(false);
    expect(classification.disposition).toBe("current");
  });
});

describe("timestamp conversion", () => {
  it("converts a live Timestamp exactly once per field", () => {
    const birthday = new FakeTimestamp(1_700_000_000);
    const publishedAt = new FakeTimestamp(1_720_000_000);
    const updatedAt = new FakeTimestamp(1_730_000_000);

    const parsed = parsePublicSequenceWireDocument(
      schemaTwoDoc({ birthday, publishedAt, updatedAt }),
      "seq_abc"
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Validation alone must not convert — the wire type still holds wire values.
    expect(birthday.toDateCalls).toBe(0);
    expect(publishedAt.toDateCalls).toBe(0);
    expect(updatedAt.toDateCalls).toBe(0);

    const projection = toPublicSequenceProjection(parsed.document);

    expect(birthday.toDateCalls).toBe(1);
    expect(publishedAt.toDateCalls).toBe(1);
    expect(updatedAt.toDateCalls).toBe(1);
    expect(projection.publishedAt).toBeInstanceOf(Date);
    expect(projection.publishedAt?.getTime()).toBe(1_720_000_000 * 1000);
  });

  it("returns the same Date instance when given an application Date", () => {
    const date = new Date(1_720_000_000_000);

    expect(toApplicationDate(date)).toBe(date);
    expect(toApplicationDate(toApplicationDate(date))).toBe(date);
  });

  it("does not double-convert an already-converted projection", () => {
    const parsed = parsePublicSequenceWireDocument(schemaTwoDoc(), "seq_abc");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const once = toPublicSequenceProjection(parsed.document);
    // Feeding the converted output back through the wire schema must be safe:
    // Dates are a valid wire encoding, and conversion is idempotent.
    const reparsed = parsePublicSequenceWireDocument(once, "seq_abc");
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    const twice = toPublicSequenceProjection(reparsed.document);

    expect(twice.publishedAt).toBe(once.publishedAt);
    expect(twice.birthday).toBe(once.birthday);
    expect(twice.updatedAt).toBe(once.updatedAt);
  });

  it("accepts every wire encoding a public document arrives in", () => {
    const expected = 1_720_000_000_000;

    expect(toApplicationDate(new FakeTimestamp(1_720_000_000))?.getTime()).toBe(
      expected
    );
    expect(
      toApplicationDate({ seconds: 1_720_000_000, nanoseconds: 0 })?.getTime()
    ).toBe(expected);
    expect(
      toApplicationDate({ _seconds: 1_720_000_000, _nanoseconds: 0 })?.getTime()
    ).toBe(expected);
    expect(toApplicationDate(new Date(expected).toISOString())?.getTime()).toBe(
      expected
    );
    expect(toApplicationDate(expected)?.getTime()).toBe(expected);
  });

  it("fails closed instead of manufacturing a date", () => {
    expect(toApplicationDate(undefined)).toBeUndefined();
    expect(toApplicationDate(null)).toBeUndefined();
    expect(toApplicationDate("")).toBeUndefined();
    expect(toApplicationDate("not a date")).toBeUndefined();
    expect(toApplicationDate({})).toBeUndefined();
    expect(toApplicationDate(new Date("nope"))).toBeUndefined();

    expect(isWireTimestamp(new FakeTimestamp(1))).toBe(true);
    expect(isWireTimestamp("not a date")).toBe(false);
  });

  it("rejects an unreadable date field at parse time", () => {
    const result = parsePublicSequenceWireDocument(
      schemaTwoDoc({ publishedAt: "not a date" }),
      "seq_abc"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("publishedAt");
  });
});

describe("self-containment", () => {
  it("fails when the compositional fields are absent", () => {
    const doc = schemaTwoDoc();
    delete (doc as Record<string, unknown>).leftSoloProp;
    delete (doc as Record<string, unknown>).rightSoloProp;
    delete (doc as Record<string, unknown>).stepPairings;

    const classification = classifyPublicSequenceDocument(doc, "seq_abc");

    expect(classification.disposition).toBe("invariant-violation");
    expect(classification.selfContainment.selfContained).toBe(false);
    expect(classification.selfContainment.blocking).toEqual([
      "MISSING_LEFT_SOLO_PROP",
      "MISSING_RIGHT_SOLO_PROP",
      "MISSING_STEP_PAIRINGS",
    ]);
  });

  it("fails when one compositional field is absent", () => {
    const doc = schemaTwoDoc();
    delete (doc as Record<string, unknown>).rightSoloProp;

    const report = checkPublicProjectionSelfContainment(
      classifyPublicSequenceDocument(doc, "seq_abc").projection!
    );

    expect(report.selfContained).toBe(false);
    expect(report.blocking).toEqual(["MISSING_RIGHT_SOLO_PROP"]);
  });

  it("fails on an empty stepPairings array the loader's && guard would pass", () => {
    const report = checkPublicProjectionSelfContainment({
      word: "AB",
      sequenceLength: 2,
      leftSoloProp: SOLO_PROP,
      rightSoloProp: SOLO_PROP,
      stepPairings: [],
      publishedAt: new Date(),
    });

    expect(report.selfContained).toBe(false);
    expect(report.blocking).toContain("EMPTY_STEP_PAIRINGS");
  });

  it("fails on a blank word", () => {
    const report = checkPublicProjectionSelfContainment({
      word: "   ",
      sequenceLength: 2,
      leftSoloProp: SOLO_PROP,
      rightSoloProp: SOLO_PROP,
      stepPairings: STEP_PAIRINGS,
      publishedAt: new Date(),
    });

    expect(report.selfContained).toBe(false);
    expect(report.blocking).toContain("EMPTY_WORD");
  });

  it("reports sequenceLength 0 as advisory, not as a render blocker", () => {
    // Three live public documents carry sequenceLength 0 despite source lengths
    // of 16, 8, and 8 (spec, corpus audit).
    const report = checkPublicProjectionSelfContainment({
      word: "AB",
      sequenceLength: 0,
      leftSoloProp: SOLO_PROP,
      rightSoloProp: SOLO_PROP,
      stepPairings: STEP_PAIRINGS,
      publishedAt: new Date(),
    });

    expect(report.selfContained).toBe(true);
    expect(report.blocking).toEqual([]);
    expect(report.advisory).toContain("MISSING_SEQUENCE_LENGTH");
  });

  it("reports a sequenceLength that disagrees with the pairing count", () => {
    const report = checkPublicProjectionSelfContainment({
      word: "AB",
      sequenceLength: 12,
      leftSoloProp: SOLO_PROP,
      rightSoloProp: SOLO_PROP,
      stepPairings: STEP_PAIRINGS,
      publishedAt: new Date(),
    });

    expect(report.selfContained).toBe(true);
    expect(report.advisory).toContain("SEQUENCE_LENGTH_MISMATCH");
  });

  it("reports a missing publishedAt as advisory", () => {
    const report = checkPublicProjectionSelfContainment({
      word: "AB",
      sequenceLength: 2,
      leftSoloProp: SOLO_PROP,
      rightSoloProp: SOLO_PROP,
      stepPairings: STEP_PAIRINGS,
    });

    expect(report.selfContained).toBe(true);
    expect(report.advisory).toContain("MISSING_PUBLISHED_AT");
  });

  it("exposes a bare predicate", () => {
    expect(
      isSelfContainedPublicProjection({
        word: "AB",
        sequenceLength: 2,
        leftSoloProp: SOLO_PROP,
        rightSoloProp: SOLO_PROP,
        stepPairings: STEP_PAIRINGS,
        publishedAt: new Date(),
      })
    ).toBe(true);

    expect(isSelfContainedPublicProjection({ word: "AB" })).toBe(false);
  });
});

describe("legacy detection", () => {
  it("identifies a stampless document as legacy, not invalid", () => {
    const classification = classifyPublicSequenceDocument(
      legacyDoc(),
      "seq_legacy"
    );

    expect(classification.disposition).not.toBe("invalid");
    expect(classification.legacy).toBe(true);
    expect(classification.schemaVersion).toBe(0);
    expect(classification.projection).not.toBeNull();
    expect(classification.issues).toEqual([]);
  });

  it("marks a self-contained legacy document as needing no fallback", () => {
    const classification = classifyPublicSequenceDocument(
      legacyDoc(),
      "seq_legacy"
    );

    expect(classification.disposition).toBe("legacy-self-contained");
    expect(classification.selfContainment.selfContained).toBe(true);
  });

  it("allows the sourceRef fallback only for an incomplete legacy document", () => {
    const incomplete = legacyDoc();
    delete (incomplete as Record<string, unknown>).leftSoloProp;
    delete (incomplete as Record<string, unknown>).rightSoloProp;
    delete (incomplete as Record<string, unknown>).stepPairings;

    const classification = classifyPublicSequenceDocument(
      incomplete,
      "seq_legacy"
    );

    expect(classification.disposition).toBe("legacy-fallback");
    expect(classification.projection?.sourceRef).toBe(
      "users/uid-2/sequences/seq_legacy"
    );
  });

  it("never gives a broken schema-2 document the legacy fallback", () => {
    const broken = schemaTwoDoc();
    delete (broken as Record<string, unknown>).stepPairings;

    const classification = classifyPublicSequenceDocument(broken, "seq_abc");

    expect(classification.disposition).toBe("invariant-violation");
    expect(classification.legacy).toBe(false);
  });

  it("reads the schema stamp with an absent stamp meaning version 0", () => {
    expect(readPublicProjectionSchemaVersion({})).toBe(0);
    expect(
      readPublicProjectionSchemaVersion({ publicProjectionSchemaVersion: 2 })
    ).toBe(2);

    expect(isLegacyPublicDocument({})).toBe(true);
    expect(isLegacyPublicDocument({ publicProjectionSchemaVersion: 1 })).toBe(
      true
    );
    expect(isLegacyPublicDocument({ publicProjectionSchemaVersion: 2 })).toBe(
      false
    );
    expect(
      isCurrentPublicProjection({ publicProjectionSchemaVersion: 2 })
    ).toBe(true);
  });
});
