import { describe, expect, it } from "vitest";

import {
  createAxisStream,
  resolveFilmSeed,
  seededPick,
  seededShuffle,
} from "#lib/features/film-director/domain/directive-random.js";

describe("resolveFilmSeed", () => {
  it("derives a stable base from the film id when none is given", () => {
    expect(resolveFilmSeed("my-film")).toEqual(resolveFilmSeed("my-film"));
    expect(resolveFilmSeed("my-film").base).not.toBe(
      resolveFilmSeed("other-film").base
    );
  });

  it("honors an explicit base and axis salts", () => {
    const seed = resolveFilmSeed("my-film", { base: 7, axes: { prop: 2 } });
    expect(seed.base).toBe(7);
    expect(seed.axes.prop).toBe(2);
  });

  it("copies the caller's axes object instead of aliasing it", () => {
    const axes: Record<string, number> = { prop: 3 };
    const seed = resolveFilmSeed("my-film", { axes });
    axes.prop = 999;
    axes.newKey = 1;
    expect(seed.axes).toEqual({ prop: 3 });
  });

  // Golden vector: this literal IS the determinism contract. If a refactor
  // to hashString/mulberry32/resolveFilmSeed changes this value, every
  // authored film's random draws reroll. Do not update it casually — only
  // when a reroll is an intentional, communicated decision.
  it("freezes the derived base for a known film id (golden vector)", () => {
    expect(resolveFilmSeed("my-film").base).toBe(1462482181);
  });
});

describe("createAxisStream", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("is deterministic per (seed, scene, axis)", () => {
    const seed = resolveFilmSeed("my-film");
    const one = seededShuffle(items, createAxisStream(seed, "shot-1", "prop"));
    const two = seededShuffle(items, createAxisStream(seed, "shot-1", "prop"));
    expect(one).toEqual(two);
  });

  it("bumping one axis salt changes only that axis's stream", () => {
    const before = resolveFilmSeed("my-film");
    const after = resolveFilmSeed("my-film", { axes: { prop: 1 } });
    expect(
      seededShuffle(items, createAxisStream(before, "shot-1", "characterId"))
    ).toEqual(seededShuffle(items, createAxisStream(after, "shot-1", "characterId")));
    expect(
      seededShuffle(items, createAxisStream(before, "shot-1", "prop"))
    ).not.toEqual(seededShuffle(items, createAxisStream(after, "shot-1", "prop")));
  });

  it("different scenes draw different streams", () => {
    const seed = resolveFilmSeed("my-film");
    expect(
      seededShuffle(items, createAxisStream(seed, "shot-1", "prop"))
    ).not.toEqual(seededShuffle(items, createAxisStream(seed, "shot-2", "prop")));
  });

  it("different axes on the same scene draw different streams by default", () => {
    const seed = resolveFilmSeed("my-film");
    expect(
      seededShuffle(items, createAxisStream(seed, "shot-1", "prop"))
    ).not.toEqual(
      seededShuffle(items, createAxisStream(seed, "shot-1", "characterId"))
    );
  });

  it("a stream advances across draws instead of repeating the same value", () => {
    const seed = resolveFilmSeed("my-film");
    const hundred = Array.from({ length: 100 }, (_, index) => index);
    const stream = createAxisStream(seed, "shot-1", "prop");
    const first = seededPick(hundred, stream);
    const second = seededPick(hundred, stream);
    expect(first).not.toBe(second);
  });

  // Golden vector: this permutation IS the determinism contract for
  // (my-film, scene-1, prop). If a refactor to the key encoding or the PRNG
  // changes it, every authored film's shuffles reroll. Do not update this
  // literal casually — only when a reroll is an intentional, communicated
  // decision.
  it("freezes the shuffle for a known (seed, scene, axis) triple (golden vector)", () => {
    expect(
      seededShuffle(items, createAxisStream(resolveFilmSeed("my-film"), "shot-1", "prop"))
    ).toEqual(["e", "g", "d", "f", "a", "c", "h", "b"]);
  });
});

describe("seededShuffle / seededPick", () => {
  it("shuffle returns a permutation without mutating the input", () => {
    const items = ["a", "b", "c", "d"];
    const stream = createAxisStream(resolveFilmSeed("f"), "s", "prop");
    const shuffled = seededShuffle(items, stream);
    expect(items).toEqual(["a", "b", "c", "d"]);
    expect([...shuffled].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("pick returns a member", () => {
    const stream = createAxisStream(resolveFilmSeed("f"), "s", "prop");
    expect(["x", "y", "z"]).toContain(seededPick(["x", "y", "z"], stream));
  });

  it("pick returns undefined for an empty array instead of lying with a cast", () => {
    const stream = createAxisStream(resolveFilmSeed("f"), "s", "prop");
    expect(seededPick([], stream)).toBeUndefined();
  });
});
