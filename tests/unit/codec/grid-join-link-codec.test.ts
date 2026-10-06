/**
 * A joined sequence keeps its join through the link codec. The sequence's join
 * closes the header (`iiSSJe1`, `iiSSHJne2`), a cell's own join is a fourth
 * beat segment (`a:b::Je1`, `a:b:d2:Jx`), and a link without a join keeps the
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
  joinsOf,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  JOIN_SOUTH_TWO,
  type JoinFixtureOptions,
} from "../grid-join/grid-join-fixtures";

/** Bytes the fixture encoded to before joins existed. */
const PLAIN = "iiSS|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0";
const PLAIN_HAND_PATH =
  "iiSSH|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0";

const NO_JOINS = {
  sequence: undefined,
  start: undefined,
  steps: [undefined, undefined, undefined],
};

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
      startPlacement: { ...base.startPlacement!, conjoined: undefined },
      steps: base.steps.map((step) => ({ ...step, conjoined: undefined })),
    } as SequenceData;

    expect(encodeSequence(sequence)).toBe(PLAIN);
  });

  it("write nothing for a join that is not well formed", () => {
    const base = buildJoinFixture();
    const bad = { toward: "c", steps: 7 };
    const sequence = {
      ...base,
      conjoined: bad,
      startPlacement: { ...base.startPlacement!, conjoined: "e1" },
      steps: base.steps.map((step) => ({ ...step, conjoined: bad })),
    } as unknown as SequenceData;

    expect(encodeSequence(sequence)).toBe(PLAIN);
  });

  it("decode with no join key anywhere", () => {
    const decoded = decodeSequence(PLAIN);

    expect(joinsOf(decoded)).toEqual(NO_JOINS);
    expect("conjoined" in decoded).toBe(false);
    expect("conjoined" in decoded.startPlacement!).toBe(false);
    expect(decoded.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});

describe("where a join is written", () => {
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
    {
      name: "the start cell's join is a fourth segment after an empty duration",
      options: { startJoin: JOIN_NORTHEAST_TWO },
      encoded:
        "iiSS|nonox0:sosox0::Jne2|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0",
    },
    {
      name: "a start cell that stays on one grid is Jx",
      options: { sequenceJoin: JOIN_EAST_ONE, startJoin: null },
      encoded:
        "iiSSJe1|nonox0:sosox0::Jx|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0",
    },
    {
      name: "a one-beat step's join follows an empty duration",
      options: { stepJoins: [JOIN_SOUTH_TWO, undefined, undefined] },
      encoded:
        "iiSS|nonox0:sosox0|noeac0:sowec0::Js2|easoc1:wenoc1:d2|soweu0:noeau0",
    },
    {
      name: "a timed step's join follows its duration",
      options: { stepJoins: [undefined, JOIN_SOUTH_TWO, undefined] },
      encoded:
        "iiSS|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2:Js2|soweu0:noeau0",
    },
    {
      name: "a step that stays on one grid is Jx",
      options: { stepJoins: [undefined, undefined, null] },
      encoded:
        "iiSS|nonox0:sosox0|noeac0:sowec0|easoc1:wenoc1:d2|soweu0:noeau0::Jx",
    },
    {
      name: "every kind of join together",
      options: {
        sequenceJoin: JOIN_EAST_ONE,
        startJoin: JOIN_NORTHEAST_TWO,
        stepJoins: [JOIN_SOUTH_TWO, undefined, null],
      },
      encoded:
        "iiSSJe1|nonox0:sosox0::Jne2|noeac0:sowec0::Js2|easoc1:wenoc1:d2|soweu0:noeau0::Jx",
    },
  ];

  it.each(cases)("$name", ({ options, encoded }) => {
    const sequence = buildJoinFixture(options);

    expect(encodeSequence(sequence)).toBe(encoded);
    expect(joinsOf(decodeSequence(encoded))).toEqual(joinsOf(sequence));
  });

  it("carries a join on a beat whose hands are both blank", () => {
    const base = buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE });
    const first = base.steps[0]!;
    const blank = {
      ...first,
      isBlank: true,
      conjoined: JOIN_SOUTH_TWO,
      motions: {
        left: { ...first.motions.left, isVisible: false },
        right: { ...first.motions.right, isVisible: false },
      },
    };
    const encoded = encodeSequence({
      ...base,
      steps: [blank, ...base.steps.slice(1)],
    } as SequenceData);

    expect(encoded.split("|")[2]).toBe(":::Js2");
    const decoded = decodeSequence(encoded);
    expect(decoded.steps[0]!.isBlank).toBe(true);
    expect(decoded.steps[0]!.conjoined).toEqual(JOIN_SOUTH_TWO);
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

  it("carries a start cell's join onto the start placement", () => {
    const decoded = decodeSequence(
      encodeSequence(buildJoinFixture({ startJoin: JOIN_NORTHEAST_TWO }))
    );

    expect(decoded.startPlacement?.conjoined).toEqual(JOIN_NORTHEAST_TWO);
    expect(decoded.startingPlacement).toBe(decoded.startPlacement);
    expect(joinsOf(decoded).steps).toEqual([undefined, undefined, undefined]);
  });

  it("keeps a timed step's duration when it also has a join", () => {
    const decoded = decodeSequence(
      encodeSequence(
        buildJoinFixture({ stepJoins: [undefined, JOIN_SOUTH_TWO, undefined] })
      )
    );

    expect(decoded.steps.map((step) => step.duration)).toEqual([1, 2, 1]);
    expect(decoded.steps[1]!.conjoined).toEqual(JOIN_SOUTH_TWO);
  });

  describe("reads a token it does not know as no join", () => {
    const unknown = ["Jq9", "Jc1", "Je3", "Jx1", "J", "Zfuture", "e1"];

    it.each(unknown)("%s in a beat", (token) => {
      const decoded = decodeSequence(
        `iiSS|nonox0:sosox0::${token}|noeac0:sowec0::${token}|easoc1:wenoc1:d2:${token}|soweu0:noeau0`
      );

      expect(joinsOf(decoded)).toEqual(NO_JOINS);
      expect(decoded.steps.map((step) => step.duration)).toEqual([1, 2, 1]);
    });

    it.each(unknown)("%s closing the header", (token) => {
      const decoded = decodeSequence(
        `iiSSH${token}|nonox0:sosox0|noeac0:sowec0`
      );

      expect(decoded.conjoined).toBeUndefined();
      expect(decoded.sequenceKind).toBe("hand-path");
    });

    it("ignores a segment after the join", () => {
      const decoded = decodeSequence(
        "iiSS|nonox0:sosox0|noeac0:sowec0::Je1:future|soweu0:noeau0"
      );

      expect(joinsOf(decoded).steps).toEqual([JOIN_EAST_ONE, undefined]);
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
        buildJoinFixture({
          sequenceJoin: join,
          startJoin: join,
          stepJoins: [join, null, join],
          handPath,
        })
      );

      // The legacy detector reads only the header, and takes a colon or an
      // all-digit header for a legacy link.
      const header = encoded.split("|")[0]!;
      expect(header).not.toContain(":");
      expect(header).not.toMatch(/^\d+$/);
      expect(detectLegacySequenceFormat(encoded)).toBeNull();

      const decoded = decodeSequence(encoded);
      expect(decoded.conjoined).toEqual(join);
      expect(joinsOf(decoded).steps).toEqual([join, null, join]);
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
    { name: "a joined start cell", options: { startJoin: JOIN_SOUTH_TWO } },
    {
      name: "joined steps",
      options: { stepJoins: [JOIN_EAST_ONE, JOIN_SOUTH_TWO, null] },
    },
    {
      name: "a sequence with cells on one grid",
      options: {
        sequenceJoin: JOIN_EAST_ONE,
        startJoin: null,
        stepJoins: [undefined, null, undefined],
      },
    },
    {
      name: "every kind of join together",
      options: {
        sequenceJoin: JOIN_EAST_ONE,
        startJoin: JOIN_NORTHEAST_TWO,
        stepJoins: [JOIN_SOUTH_TWO, undefined, null],
        handPath: true,
      },
    },
  ];

  it.each(sequences)("$name through the link", ({ options }) => {
    const sequence = buildJoinFixture(options);

    expect(joinsOf(decodeSequence(encodeSequence(sequence)))).toEqual(
      joinsOf(sequence)
    );
  });

  it.each(sequences)("$name through the compressed link", ({ options }) => {
    const sequence = buildJoinFixture(options);
    const { encoded } = encodeSequenceWithCompression(sequence);

    expect(joinsOf(decodeSequenceWithCompression(encoded))).toEqual(
      joinsOf(sequence)
    );
  });

  it.each(sequences)("$name verifies as a clean round trip", ({ options }) => {
    const sequence = buildJoinFixture(options);
    const { encoded } = encodeSequenceWithCompression(sequence);
    const result = verifySequenceRoundTrip(encoded);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(joinsOf(result.decoded)).toEqual(joinsOf(sequence));
    }
  });

  it("re-encodes a decoded link to the same bytes", () => {
    const encoded =
      "iiSSHJe1|nonox0:sosox0::Jne2|noeac0:sowec0::Js2|easoc1:wenoc1:d2|soweu0:noeau0::Jx";

    expect(encodeSequence(decodeSequence(encoded))).toBe(encoded);
  });
});

describe("the join check behind the round trip", () => {
  const { findGridJoinMismatch } = __test__;
  const JOINED: JoinFixtureOptions = {
    sequenceJoin: JOIN_EAST_ONE,
    startJoin: JOIN_NORTHEAST_TWO,
    stepJoins: [JOIN_SOUTH_TWO, undefined, null],
  };

  it("finds nothing between sequences that carry the same joins", () => {
    expect(
      findGridJoinMismatch(buildJoinFixture(JOINED), buildJoinFixture(JOINED))
    ).toBeNull();
    expect(
      findGridJoinMismatch(buildJoinFixture(), buildJoinFixture())
    ).toBeNull();
  });

  it.each<readonly [string, JoinFixtureOptions, string]>([
    [
      "the sequence's join",
      { ...JOINED, sequenceJoin: undefined },
      "sequence grid join: e1 vs (none)",
    ],
    [
      "the start cell's join",
      { ...JOINED, startJoin: undefined },
      "start grid join: ne2 vs (none)",
    ],
    [
      "a start cell that moved onto one grid",
      { ...JOINED, startJoin: null },
      "start grid join: ne2 vs x",
    ],
    [
      "a step that gained a join",
      { ...JOINED, stepJoins: [JOIN_SOUTH_TWO, JOIN_EAST_ONE, null] },
      "step 2 grid join: (none) vs e1",
    ],
    [
      "a step that moved onto one grid",
      { ...JOINED, stepJoins: [JOIN_SOUTH_TWO, undefined, undefined] },
      "step 3 grid join: x vs (none)",
    ],
    [
      "a step whose join points elsewhere",
      { ...JOINED, stepJoins: [{ toward: "s", steps: 1 }, undefined, null] },
      "step 1 grid join: s2 vs s1",
    ],
  ])("names %s", (_label, other, reason) => {
    expect(
      findGridJoinMismatch(buildJoinFixture(JOINED), buildJoinFixture(other))
    ).toBe(reason);
  });

  it("names the first cell that differs", () => {
    expect(
      findGridJoinMismatch(
        buildJoinFixture(JOINED),
        buildJoinFixture({
          sequenceJoin: undefined,
          startJoin: null,
          stepJoins: [],
        })
      )
    ).toBe("sequence grid join: e1 vs (none)");
  });

  it("reads a join that is not well formed as no join", () => {
    const base = buildJoinFixture();
    const bad = { toward: "c", steps: 7 };
    const malformed = {
      ...base,
      conjoined: bad,
      startPlacement: { ...base.startPlacement!, conjoined: "e1" },
      steps: base.steps.map((step) => ({ ...step, conjoined: bad })),
    } as unknown as SequenceData;

    expect(findGridJoinMismatch(base, malformed)).toBeNull();
    expect(findGridJoinMismatch(buildJoinFixture(JOINED), malformed)).toBe(
      "sequence grid join: e1 vs (none)"
    );
  });

  it("reads a start cell stored under its older name", () => {
    const joined = buildJoinFixture(JOINED);
    const older = {
      ...joined,
      startPlacement: undefined,
      startingPlacement: joined.startPlacement,
    } as SequenceData;

    expect(findGridJoinMismatch(joined, older)).toBeNull();
    expect(
      findGridJoinMismatch(
        older,
        buildJoinFixture({ ...JOINED, startJoin: null })
      )
    ).toBe("start grid join: ne2 vs x");
  });
});
