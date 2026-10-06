/**
 * Grid joins in the two content hashes. The identity hash (V3) and the
 * render-cache fingerprint include a join only where one is set, so every
 * sequence drawn on one grid keeps the hash it already had: those hashes are
 * stored in documents and keyed into caches. The pinned values below were
 * computed before joins existed.
 */
import { describe, expect, it } from "vitest";
import {
  computeHash,
  HASH_VERSION_V1,
  HASH_VERSION_V2,
  HASH_VERSION_V3,
} from "$lib/shared/library/services/sequence-content-hasher";
import {
  hashSequenceContent,
  hashSequenceSkeleton,
} from "$lib/shared/foundation/services/content-hasher";
import {
  ensureComposition,
  hydrate,
} from "$lib/shared/foundation/services/sequence-hydrator";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  buildJoinFixture,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  JOIN_SOUTH_TWO,
  type JoinFixtureOptions,
} from "./grid-join-fixtures";

describe("sequences drawn on one grid keep their hashes", () => {
  it("at every identity-hash version", async () => {
    const plain = buildJoinFixture();

    expect(await computeHash(plain, HASH_VERSION_V1)).toBe(
      "d3e2a48e32b7182ad72d98bebd8a0c5c1cddfc033b8c952d2c24c2c95556de53"
    );
    expect(await computeHash(plain, HASH_VERSION_V2)).toBe(
      "7e200b0408f81c6fa6c2aefd60f037055b53a05d714cd932e5ecc4ded62c4eeb"
    );
    expect(await computeHash(plain, HASH_VERSION_V3)).toBe(
      "711e4a15c5eacb4df61c07e65f7bbb0bae0afb24d9a150ecf2b89b3d86fdbc4e"
    );
    expect(await computeHash(plain)).toBe(
      "711e4a15c5eacb4df61c07e65f7bbb0bae0afb24d9a150ecf2b89b3d86fdbc4e"
    );
  });

  it("for a lettered sequence", async () => {
    expect(
      await computeHash(buildJoinFixture({ lettered: true }), HASH_VERSION_V3)
    ).toBe("6cfd1d265c692aeee4254f630effaabac76cf5a7be838227eac9bd65a5508bea");
  });

  it("for a hand-path sequence, which is hashed in its own namespace", async () => {
    const handPath = buildJoinFixture({ handPath: true });

    expect(await computeHash(handPath, HASH_VERSION_V1)).toBe(
      "e100c2dfa47378dc8ad5ad99e7f69fa2ae20bc7b47cb3c90c8446ce523fb6e14"
    );
    expect(await computeHash(handPath, HASH_VERSION_V2)).toBe(
      "ed22fe177fba28798c9bb51bc8c693dfe53d6fb599203f6b81b8837f2577614a"
    );
    expect(await computeHash(handPath, HASH_VERSION_V3)).toBe(
      "5aa0423214630b8a76e9fd3629e5094b2cc0459122c1d2d4bc59e525cf015067"
    );
    expect(
      await computeHash(
        buildJoinFixture({ handPath: true, lettered: true }),
        HASH_VERSION_V3
      )
    ).toBe("87f4c5a51fc4c74bb697f1a8492ee3e69b796145c96d96dcab6473f417d54e4d");
  });

  it("in the render-cache fingerprint and the path skeleton", () => {
    const plain = buildJoinFixture();

    expect(hashSequenceContent(plain)).toBe("2KOJL4iBwp5Q0js1uPDgDj");
    expect(hashSequenceSkeleton(plain)).toBe("48egHhlzc6ffAWcs8eDwEh");
    expect(hashSequenceContent(buildJoinFixture({ lettered: true }))).toBe(
      "2BCugFIgZNZ7CL42u9P5jb"
    );
  });

  it("when a join key is present but undefined or malformed", async () => {
    const base = buildJoinFixture();
    const bad = { toward: "c", steps: 7 };
    const withKeys = (join: unknown) =>
      ({
        ...base,
        conjoined: join,
        startPlacement: { ...base.startPlacement!, conjoined: join },
        steps: base.steps.map((step) => ({
          ...step,
          conjoined: join,
        })),
      }) as unknown as SequenceData;

    for (const join of [undefined, bad, "e1", 7]) {
      const sequence = withKeys(join);

      expect(await computeHash(sequence, HASH_VERSION_V3)).toBe(
        await computeHash(base, HASH_VERSION_V3)
      );
      expect(hashSequenceContent(sequence)).toBe(hashSequenceContent(base));
    }
  });
});

describe("a joined sequence", () => {
  const variants: Record<string, JoinFixtureOptions> = {
    "joined sequence": { sequenceJoin: JOIN_EAST_ONE },
    "joined toward the west": { sequenceJoin: { toward: "w", steps: 1 } },
    "joined two steps apart": { sequenceJoin: { toward: "e", steps: 2 } },
    "joined start cell only": { startJoin: JOIN_EAST_ONE },
    "joined first step only": { stepJoins: [JOIN_EAST_ONE] },
    "joined last step only": {
      stepJoins: [undefined, undefined, JOIN_EAST_ONE],
    },
    "start cell on one grid in a joined sequence": {
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: null,
    },
    "step on one grid in a joined sequence": {
      sequenceJoin: JOIN_EAST_ONE,
      stepJoins: [undefined, null],
    },
    "every kind of join together": {
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: JOIN_NORTHEAST_TWO,
      stepJoins: [JOIN_SOUTH_TWO, undefined, null],
    },
  };
  const entries = Object.entries(variants);

  it("hashes differently from the same sequence on one grid, at V3", async () => {
    const plain = await computeHash(buildJoinFixture(), HASH_VERSION_V3);

    for (const [name, options] of entries) {
      const joined = await computeHash(
        buildJoinFixture(options),
        HASH_VERSION_V3
      );
      expect(joined, name).not.toBe(plain);
    }
  });

  it("gets a different V3 hash for every place and kind of join", async () => {
    const hashes = await Promise.all(
      entries.map(([, options]) =>
        computeHash(buildJoinFixture(options), HASH_VERSION_V3)
      )
    );

    expect(new Set(hashes).size).toBe(entries.length);
  });

  it("gets a different fingerprint for every place and kind of join", () => {
    const plain = hashSequenceContent(buildJoinFixture());
    const fingerprints = entries.map(([, options]) =>
      hashSequenceContent(buildJoinFixture(options))
    );

    expect(fingerprints).not.toContain(plain);
    expect(new Set(fingerprints).size).toBe(entries.length);
  });

  it("gets a different V3 hash for every place and kind of join on a hand path", async () => {
    const plain = await computeHash(
      buildJoinFixture({ handPath: true }),
      HASH_VERSION_V3
    );
    const hashes = await Promise.all(
      entries.map(([, options]) =>
        computeHash(
          buildJoinFixture({ ...options, handPath: true }),
          HASH_VERSION_V3
        )
      )
    );

    expect(hashes).not.toContain(plain);
    expect(new Set(hashes).size).toBe(entries.length);
  });

  it("keeps a joined hand path apart from the same joins on a prop sequence", async () => {
    for (const [name, options] of entries) {
      expect(
        await computeHash(
          buildJoinFixture({ ...options, handPath: true }),
          HASH_VERSION_V3
        ),
        name
      ).not.toBe(await computeHash(buildJoinFixture(options), HASH_VERSION_V3));
    }
  });

  it("keeps the V1 and V2 hashes of a joined hand path", async () => {
    const plain = buildJoinFixture({ handPath: true });

    for (const [name, options] of entries) {
      const joined = buildJoinFixture({ ...options, handPath: true });
      expect(await computeHash(joined, HASH_VERSION_V1), name).toBe(
        await computeHash(plain, HASH_VERSION_V1)
      );
      expect(await computeHash(joined, HASH_VERSION_V2), name).toBe(
        await computeHash(plain, HASH_VERSION_V2)
      );
    }
  });

  it("keeps its V1 and V2 hashes, which predate joins", async () => {
    const plain = buildJoinFixture();

    for (const [name, options] of entries) {
      const joined = buildJoinFixture(options);
      expect(await computeHash(joined, HASH_VERSION_V1), name).toBe(
        await computeHash(plain, HASH_VERSION_V1)
      );
      expect(await computeHash(joined, HASH_VERSION_V2), name).toBe(
        await computeHash(plain, HASH_VERSION_V2)
      );
    }
  });

  it("keeps the path skeleton, which ignores how the grids are drawn", () => {
    const plain = hashSequenceSkeleton(buildJoinFixture());

    for (const [name, options] of entries) {
      expect(hashSequenceSkeleton(buildJoinFixture(options)), name).toBe(plain);
    }
  });

  it("hashes the same however the stored join orders its keys", async () => {
    const swapped = (join: { toward: string; steps: number }) =>
      ({ steps: join.steps, toward: join.toward }) as never;
    const options: JoinFixtureOptions = {
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: JOIN_NORTHEAST_TWO,
      stepJoins: [JOIN_SOUTH_TWO, undefined, null],
    };
    const reordered: JoinFixtureOptions = {
      sequenceJoin: swapped(JOIN_EAST_ONE),
      startJoin: swapped(JOIN_NORTHEAST_TWO),
      stepJoins: [swapped(JOIN_SOUTH_TWO), undefined, null],
    };

    expect(await computeHash(buildJoinFixture(reordered))).toBe(
      await computeHash(buildJoinFixture(options))
    );
    expect(hashSequenceContent(buildJoinFixture(reordered))).toBe(
      hashSequenceContent(buildJoinFixture(options))
    );
  });
});

describe("the identity hash across save and load", () => {
  /** What the repository writes and reads back: pairings in, derived steps out. */
  function savedAndLoaded(sequence: SequenceData): SequenceData {
    const stored = JSON.parse(
      JSON.stringify({ ...ensureComposition(sequence), steps: [] })
    );
    return hydrate(stored);
  }

  it.each(
    Object.entries({
      "on one grid": {},
      joined: {
        sequenceJoin: JOIN_EAST_ONE,
        startJoin: JOIN_NORTHEAST_TWO,
        stepJoins: [JOIN_SOUTH_TWO, undefined, null],
      },
      "with cells on one grid": {
        sequenceJoin: JOIN_EAST_ONE,
        startJoin: null,
        stepJoins: [undefined, null, undefined],
      },
      "joined on a hand path": {
        sequenceJoin: JOIN_EAST_ONE,
        startJoin: JOIN_NORTHEAST_TWO,
        stepJoins: [JOIN_SOUTH_TWO, undefined, null],
        handPath: true,
      },
    } satisfies Record<string, JoinFixtureOptions>)
  )(
    "does not change a sequence %s, so saving it again forks nothing",
    async (_name, options) => {
      const original = buildJoinFixture(options);

      expect(await computeHash(savedAndLoaded(original))).toBe(
        await computeHash(original)
      );
    }
  );
});
