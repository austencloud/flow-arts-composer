/**
 * A joined sequence keeps its one join through the link codec. The sequence's
 * join closes the header (`iiSSJe1`, `iiSSHJne2`); beats carry no join, since
 * a sequence is joined one way for every cell. A link without a join keeps the
 * exact bytes it always had: those bytes are printed on physical cards.
 */
import { describe, expect, it } from "vitest";
import {
  __test__,
  decodeSequence,
  decodeSequenceWithCompression,
  encodeSequence,
  encodeSequenceWithCompression,
  verifySequenceRoundTrip,
} from "$lib/shared/navigation/services/sequence-encoder";
import { detectLegacySequenceFormat } from "$lib/shared/navigation/services/legacy-sequence-codec";
import { GRID_JOIN_DIRECTIONS } from "$lib/shared/foundation/domain/models/grid-join-token";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  buildJoinFixture,
  joinOf,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  type JoinFixtureOptions,
} from "../grid-join/grid-join-fixtures";

/** Bytes the fixture encoded to before joins existed. */
const PLAIN = "iiSS|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0";
const PLAIN_HAND_PATH =
  "iiSSH|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0";

describe("links without a join", () => {
  it("keep the bytes they always had", () => {
    expect(encodeSequence(buildJoinFixture())).toBe(PLAIN);
    expect(encodeSequence(buildJoinFixture({ handPath: true }))).toBe(
      PLAIN_HAND_PATH
    );
  });

  it("write nothing for a join key that is present but undefined", () => {
    const base = buildJoinFixture();
    const sequence = {
      ...base,
      conjoined: undefined,
    } as SequenceData;

    expect(encodeSequence(sequence)).toBe(PLAIN);
  });

  it("write nothing for a join that is not well formed", () => {
    const base = buildJoinFixture();
    const bad = { toward: "c", steps: 7 };
    const sequence = { ...base, conjoined: bad } as unknown as SequenceData;

    expect(encodeSequence(sequence)).toBe(PLAIN);
  });

  it("decode with no join key anywhere", () => {
    const decoded = decodeSequence(PLAIN);

    expect(joinOf(decoded)).toBeUndefined();
    expect("conjoined" in decoded).toBe(false);
    expect("conjoined" in decoded.startPlacement!).toBe(false);
    expect(decoded.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});

describe("where the join is written", () => {
  const cases: readonly {
    readonly name: string;
    readonly options: JoinFixtureOptions;
    readonly encoded: string;
  }[] = [
    {
      name: "the sequence's join closes the header",
      options: { sequenceJoin: JOIN_EAST_ONE },
      encoded:
        "iiSSJe1|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0",
    },
    {
      name: "a hand-path flag comes before the sequence's join",
      options: { sequenceJoin: JOIN_NORTHEAST_TWO, handPath: true },
      encoded:
        "iiSSHJne2|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0",
    },
  ];

  it.each(cases)("$name", ({ options, encoded }) => {
    const sequence = buildJoinFixture(options);

    expect(encodeSequence(sequence)).toBe(encoded);
    expect(joinOf(decodeSequence(encoded))).toEqual(joinOf(sequence));
  });

  it("writes no join on a beat, whatever a cell carries", () => {
    const base = buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE });
    const stray = {
      ...base,
      startPlacement: {
        ...base.startPlacement!,
        conjoined: JOIN_NORTHEAST_TWO,
      },
      steps: base.steps.map((step) => ({ ...step, conjoined: null })),
    } as unknown as SequenceData;

    expect(encodeSequence(stray)).toBe(encodeSequence(base));
  });
});

describe("decoding", () => {
  it("reads the hand-path flag and the join apart", () => {
    const decoded = decodeSequence(
      encodeSequence(
        buildJoinFixture({ sequenceJoin: JOIN_NORTHEAST_TWO, handPath: true })
      )
    );

    expect(decoded.sequenceKind).toBe("hand-path");
    expect(decoded.conjoined).toEqual(JOIN_NORTHEAST_TWO);
  });

  it("does not take a join header for a hand-path flag", () => {
    const decoded = decodeSequence(
      encodeSequence(buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE }))
    );

    expect("sequenceKind" in decoded).toBe(false);
    expect(decoded.conjoined).toEqual(JOIN_EAST_ONE);
  });

  it("gives no cell a join of its own, the start placement included", () => {
    const decoded = decodeSequence(
      encodeSequence(buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE }))
    );

    expect("conjoined" in decoded.startPlacement!).toBe(false);
    expect(decoded.startingPlacement).toBe(decoded.startPlacement);
    expect(decoded.steps.some((step) => "conjoined" in step)).toBe(false);
  });

  describe("reads a token it does not know as no join", () => {
    const unknown = ["Jq9", "Jc1", "Je3", "Jx1", "J", "Zfuture", "e1"];

    it.each(unknown)("%s closing the header", (token) => {
      const decoded = decodeSequence(
        `iiSSH${token}|nonox0:sosox0|noeac0:sowec0`
      );

      expect(decoded.conjoined).toBeUndefined();
      expect(decoded.sequenceKind).toBe("hand-path");
    });
  });

  describe("skips a join segment on a beat, as a build that never shipped wrote it", () => {
    const tokens = ["Je1", "Jne2", "Jx", "Jq9", "J"];

    it.each(tokens)("%s", (token) => {
      const decoded = decodeSequence(
        `iiSSJs1|nonox0:sosox0::${token}|noeac0:sowec0::${token}|easoc1:wenoc1:d2:${token}|soweu0:noeau0::${token}`
      );

      expect(decoded.conjoined).toEqual({ toward: "s", steps: 1 });
      expect(decoded.steps.map((step) => step.duration)).toEqual([1, 2, 1]);
      expect("conjoined" in decoded.startPlacement!).toBe(false);
      expect(decoded.steps.some((step) => "conjoined" in step)).toBe(false);
    });
  });
});

describe("old links and new links are told apart", () => {
  const joins = GRID_JOIN_DIRECTIONS.flatMap((toward) =>
    ([1, 2] as const).flatMap((steps) =>
      [false, true].map((handPath) => ({ toward, steps, handPath }))
    )
  );

  it.each(joins)(
    "$toward$steps (hand path: $handPath) never reaches the legacy decoder",
    ({ toward, steps, handPath }) => {
      const join = { toward, steps };
      const encoded = encodeSequence(
        buildJoinFixture({ sequenceJoin: join, handPath })
      );

      // The legacy detector reads only the header, and takes a colon or an
      // all-digit header for a legacy link.
      const header = encoded.split("|")[0]!;
      expect(header).not.toContain(":");
      expect(header).not.toMatch(/^\d+$/);
      expect(detectLegacySequenceFormat(encoded)).toBeNull();

      expect(decodeSequence(encoded).conjoined).toEqual(join);
    }
  );

  it("still sends the legacy formats to the legacy decoder", () => {
    expect(detectLegacySequenceFormat("v3|ii|a")).toBe(3);
    expect(detectLegacySequenceFormat("v2|a")).toBe(2);
    expect(detectLegacySequenceFormat("a:b|c")).toBe(1);
    expect(detectLegacySequenceFormat("12|c")).toBe(1);
  });
});

describe("round trips", () => {
  const sequences: readonly {
    readonly name: string;
    readonly options: JoinFixtureOptions;
  }[] = [
    { name: "a joined sequence", options: { sequenceJoin: JOIN_EAST_ONE } },
    {
      name: "a joined hand-path sequence",
      options: { sequenceJoin: JOIN_NORTHEAST_TWO, handPath: true },
    },
  ];

  it.each(sequences)("$name through the link", ({ options }) => {
    const sequence = buildJoinFixture(options);

    expect(joinOf(decodeSequence(encodeSequence(sequence)))).toEqual(
      joinOf(sequence)
    );
  });

  it.each(sequences)("$name through the compressed link", ({ options }) => {
    const sequence = buildJoinFixture(options);
    const { encoded } = encodeSequenceWithCompression(sequence);

    expect(joinOf(decodeSequenceWithCompression(encoded))).toEqual(
      joinOf(sequence)
    );
  });

  it.each(sequences)("$name verifies as a clean round trip", ({ options }) => {
    const sequence = buildJoinFixture(options);
    const { encoded } = encodeSequenceWithCompression(sequence);
    const result = verifySequenceRoundTrip(encoded);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(joinOf(result.decoded)).toEqual(joinOf(sequence));
    }
  });

  it("re-encodes a decoded link to the same bytes", () => {
    const encoded =
      "iiSSHJe1|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0";

    expect(encodeSequence(decodeSequence(encoded))).toBe(encoded);
  });
});

describe("the join check behind the round trip", () => {
  const { findGridJoinMismatch } = __test__;
  const JOINED: JoinFixtureOptions = { sequenceJoin: JOIN_EAST_ONE };

  it("finds nothing between sequences that carry the same join", () => {
    expect(
      findGridJoinMismatch(buildJoinFixture(JOINED), buildJoinFixture(JOINED))
    ).toBeNull();
    expect(
      findGridJoinMismatch(buildJoinFixture(), buildJoinFixture())
    ).toBeNull();
  });

  it.each<readonly [string, JoinFixtureOptions, string]>([
    ["a lost join", {}, "grid join: e1 vs (none)"],
    [
      "a join that points elsewhere",
      { sequenceJoin: { toward: "w", steps: 1 } },
      "grid join: e1 vs w1",
    ],
    [
      "a join at another distance",
      { sequenceJoin: { toward: "e", steps: 2 } },
      "grid join: e1 vs e2",
    ],
  ])("names %s", (_label, other, reason) => {
    expect(
      findGridJoinMismatch(buildJoinFixture(JOINED), buildJoinFixture(other))
    ).toBe(reason);
  });

  it("names a join that appeared", () => {
    expect(
      findGridJoinMismatch(buildJoinFixture(), buildJoinFixture(JOINED))
    ).toBe("grid join: (none) vs e1");
  });

  it("reads a join that is not well formed as no join", () => {
    const base = buildJoinFixture();
    const malformed = {
      ...base,
      conjoined: { toward: "c", steps: 7 },
    } as unknown as SequenceData;

    expect(findGridJoinMismatch(base, malformed)).toBeNull();
    expect(findGridJoinMismatch(buildJoinFixture(JOINED), malformed)).toBe(
      "grid join: e1 vs (none)"
    );
  });
});
