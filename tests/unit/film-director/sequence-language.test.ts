import { describe, expect, it } from "vitest";

import { GenerationMode } from "../../../src/lib/shared/foundation/domain/models/generation/generate-models";
import {
  compileSequenceDirective,
  isIdleSequence,
  isLibrarySequence,
  isTransformedSequence,
  resolvePlacementRef,
  sequenceDirectiveKey,
  transformSourceId,
} from "../../../src/routes/test/film-director/_lib/sequence-language";
import { resolveFilmDirectorSpec } from "../../../src/routes/test/film-director/_lib/resolve-film-director-spec";

function film(performers: Record<string, unknown>[]) {
  return {
    version: 2,
    id: "language-film",
    title: "Language Film",
    scenes: [{ id: "s1", title: "S1", performance: { performers } }],
  };
}

/** The sequence the resolver hands back for the film's first performer. */
function firstSequence(performers: Record<string, unknown>[]) {
  return resolveFilmDirectorSpec(film(performers)).scenes[0]!.performance
    .performers[0]!.sequence;
}

describe("position references", () => {
  it("takes a position by name", () => {
    expect(resolvePlacementRef("beta5", "here")).toBe("beta5");
    expect(resolvePlacementRef("BETA5", "here")).toBe("beta5");
  });

  it("derives a position from a hand pair", () => {
    expect(resolvePlacementRef({ left: "s", right: "s" }, "here")).toBe("beta5");
    expect(resolvePlacementRef({ left: "s", right: "n" }, "here")).toBe(
      "alpha1"
    );
  });

  it("resolves a group at a spoken location", () => {
    expect(
      resolvePlacementRef({ group: "beta", location: "south" }, "here")
    ).toBe("beta5");
    expect(
      resolvePlacementRef({ group: "beta", location: "North-East" }, "here")
    ).toBe("beta2");
  });

  it("refuses to guess which hand an ambiguous group reference meant", () => {
    expect(() =>
      resolvePlacementRef({ group: "alpha", location: "south" }, "here")
    ).toThrow(/alpha1 \(left s, right n\) or alpha5 \(left n, right s\)/);
  });

  it("names the catalog when a location or position does not exist", () => {
    expect(() => resolvePlacementRef("beta9", "here")).toThrow(
      /unknown placement "beta9"/
    );
    expect(() =>
      resolvePlacementRef({ group: "beta", location: "up" }, "here")
    ).toThrow(/unknown grid location "up"/);
  });

  it("lists every candidate when a group puts several positions at one location", () => {
    expect(() =>
      resolvePlacementRef({ group: "zeta", location: "north" }, "here")
    ).toThrow(/zeta1 .* or zeta4 .* or zeta9 .* or zeta14/);
  });
});

describe("turn figures", () => {
  it("repeats one spoken turn across both hands", () => {
    const options = compileSequenceDirective({ word: "DJ", turns: 1 });
    expect(options.turnPattern).toEqual({ left: [1], right: [1] });
    expect(options.turnIntensity).toBeUndefined();
  });

  it("takes a figure per hand and rests the hand that is left out", () => {
    const options = compileSequenceDirective({
      word: "DJ",
      turns: { left: [1, 0, 2] },
    });
    expect(options.turnPattern).toEqual({ left: [1, 0, 2], right: [0] });
  });

  it("routes an intensity to the allocator instead of the pattern", () => {
    const options = compileSequenceDirective({
      length: 8,
      turns: { intensity: 2 },
    });
    expect(options.turnIntensity).toBe(2);
    expect(options.turnPattern).toBeUndefined();
  });

  it("rejects a turn the level does not carry", () => {
    expect(() => compileSequenceDirective({ word: "DJ", turns: 0.5 })).toThrow(
      /left turn 0.5 is not available at level 2/
    );
    expect(() =>
      compileSequenceDirective({ word: "DJ", turns: 1, level: 1 })
    ).toThrow(/not available at level 1, which allows 0/);
  });

  it("allows halves and floats once the level carries them", () => {
    const options = compileSequenceDirective({
      word: "DJ",
      level: 3,
      turns: { left: 0.5, right: "fl" },
    });
    expect(options.turnPattern).toEqual({ left: [0.5], right: ["fl"] });
  });

  it("keeps an intensity inside the level's ceiling", () => {
    expect(() =>
      compileSequenceDirective({ length: 8, turns: { intensity: 4 } })
    ).toThrow(/outside level 2, which tops out at 3/);
  });
});

describe("the compiler", () => {
  it("compiles Austen's spoken example", () => {
    const options = compileSequenceDirective({
      word: "DJ",
      startPlacement: { group: "beta", location: "south" },
      turns: 1,
    });
    expect(options).toMatchObject({
      word: "DJ",
      length: 2,
      startPlacementId: "beta5",
      turnPattern: { left: [1], right: [1] },
      gridMode: "diamond",
      difficulty: "intermediate",
      constraintPreset: "smooth",
    });
  });

  it("maps each continuity dial to the axis the engine reads", () => {
    const options = compileSequenceDirective({
      length: 8,
      flow: "choppy",
      handPath: "mixed",
      motionTypes: "no-dash",
    });
    expect(options.constraintPreset).toBe("choppy");
    expect(options.handPathMode).toBe("mixed");
    expect(options.motionTypeFilter).toBe("no-dash");
  });

  it("puts the generator in circular mode whenever a LOOP is named", () => {
    const bare = compileSequenceDirective({ length: 8, loop: "rotated" });
    expect(bare.mode).toBe(GenerationMode.CIRCULAR);
    expect(bare.loopType).toBe("rotated");
    expect(bare.period).toBeUndefined();

    const periodic = compileSequenceDirective({
      length: 8,
      loop: { type: "mirrored", period: "quartered" },
    });
    expect(periodic.mode).toBe(GenerationMode.CIRCULAR);
    expect(periodic.period).toBe("quartered");
  });

  it("carries orientations, letters and end positions", () => {
    const options = compileSequenceDirective({
      length: 8,
      startOrientation: { left: "in", right: "counter" },
      mustContain: ["A"],
      mustNotContain: ["B", "C"],
      endPlacement: [{ left: "s", right: "s" }, "alpha3"],
    });
    expect(options.leftStartOrientation).toBe("in");
    expect(options.rightStartOrientation).toBe("counter");
    expect(options.mustContainLetters).toEqual(["A"]);
    expect(options.mustNotContainLetters).toEqual(["B", "C"]);
    expect(options.endPlacements).toEqual(["beta5", "alpha3"]);
  });

  it("repeats one spoken orientation across both hands", () => {
    const options = compileSequenceDirective({
      length: 8,
      startOrientation: "out",
    });
    expect(options.leftStartOrientation).toBe("out");
    expect(options.rightStartOrientation).toBe("out");
  });

  it("rejects a letter that is not in the alphabet", () => {
    expect(() =>
      compileSequenceDirective({ length: 8, mustContain: ["QQ"] })
    ).toThrow(/mustContain names "QQ", which is not a TKA letter/);
  });
});

describe("the cache key", () => {
  it("separates two performers who asked for the same word differently", () => {
    expect(sequenceDirectiveKey({ word: "DJ", turns: 1 })).not.toBe(
      sequenceDirectiveKey({ word: "DJ", turns: 2 })
    );
  });

  it("joins two performers who asked for the same thing in a different order", () => {
    expect(sequenceDirectiveKey({ word: "DJ", turns: 1, level: 2 })).toBe(
      sequenceDirectiveKey({ level: 2, turns: 1, word: "DJ" })
    );
  });

  it("keys demo and mirror sequences by what they follow", () => {
    expect(sequenceDirectiveKey({ source: "demo" })).toBe("demo");
    expect(sequenceDirectiveKey({ mirrorOf: "lead" })).toBe("mirrorOf:lead");
  });
});

describe("the film schema", () => {
  it("accepts a fully directed sequence", () => {
    expect(
      firstSequence([
        {
          id: "lead",
          sequence: {
            word: "DJ",
            startPlacement: { group: "beta", location: "south" },
            turns: 1,
          },
        },
      ])
    ).toEqual({
      word: "DJ",
      startPlacement: { group: "beta", location: "south" },
      turns: 1,
    });
  });

  it("refuses a sequence that names no source", () => {
    expect(() =>
      firstSequence([{ id: "lead", sequence: { turns: 1 } }])
    ).toThrow(/names one source/);
  });

  it("refuses a sequence that names two sources", () => {
    expect(() =>
      firstSequence([
        { id: "lead", sequence: { word: "DJ", length: 8 } },
        { id: "second" },
      ])
    ).toThrow(/names one source, but this one names/);
  });

  it("refuses controls on a sequence that only follows another", () => {
    expect(() =>
      firstSequence([
        { id: "lead", sequence: { word: "DJ" } },
        { id: "second", sequence: { mirrorOf: "lead", turns: 1 } },
      ])
    ).toThrow(/turns/);
  });

  it("names the offending field rather than every branch it is not", () => {
    expect(() =>
      firstSequence([{ id: "lead", sequence: { word: "DJ", flow: "jazzy" } }])
    ).toThrow(/flow/);
  });

  it("stops the film when a directive names a position that cannot exist", () => {
    expect(() =>
      firstSequence([
        { id: "lead", sequence: { word: "DJ", startPlacement: "beta9" } },
      ])
    ).toThrow(/unknown placement "beta9"/);
  });
});

describe("derived and library sequences", () => {
  it("keys a transform chain by its source and its ordered ops", () => {
    const key = sequenceDirectiveKey({
      transformOf: "lead",
      transforms: [
        { op: "rotate", degrees: 90, direction: "cw" },
        { op: "swap-hands" },
      ],
    });
    expect(key).toBe(
      'transformOf:lead:[{"degrees":90,"direction":"cw","op":"rotate"},{"op":"swap-hands"}]'
    );
  });

  it("keys the same ops in a different order as a different sequence", () => {
    const a = sequenceDirectiveKey({
      transformOf: "lead",
      transforms: [{ op: "mirror" }, { op: "flip" }],
    });
    const b = sequenceDirectiveKey({
      transformOf: "lead",
      transforms: [{ op: "flip" }, { op: "mirror" }],
    });
    expect(a).not.toBe(b);
  });

  it("keys a library sequence by its id", () => {
    expect(sequenceDirectiveKey({ library: "abc-123" })).toBe("library:abc-123");
  });

  it("names the performer a derived sequence comes from", () => {
    expect(transformSourceId({ mirrorOf: "lead" })).toBe("lead");
    expect(
      transformSourceId({ transformOf: "second", transforms: [{ op: "invert" }] })
    ).toBe("second");
    expect(transformSourceId({ source: "demo" })).toBeNull();
    expect(transformSourceId({ library: "x" })).toBeNull();
  });

  it("classifies sources", () => {
    expect(
      isTransformedSequence({ transformOf: "a", transforms: [{ op: "rewind" }] })
    ).toBe(true);
    expect(isTransformedSequence({ mirrorOf: "a" })).toBe(false);
    expect(isLibrarySequence({ library: "a" })).toBe(true);
    expect(isLibrarySequence({ word: "AB" })).toBe(false);
  });
});

describe("standing and watching", () => {
  it("keys an idle performer by their idleness", () => {
    expect(sequenceDirectiveKey({ source: "none" })).toBe("none");
  });

  it("classifies an idle sequence", () => {
    expect(isIdleSequence({ source: "none" })).toBe(true);
    expect(isIdleSequence({ source: "demo" })).toBe(false);
    expect(isIdleSequence({ word: "AB" })).toBe(false);
  });
});
