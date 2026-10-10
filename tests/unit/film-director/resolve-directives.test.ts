import { describe, expect, it } from "vitest";

import {
  createAxisStream,
  resolveFilmSeed,
} from "#lib/features/film-director/domain/directive-random.js";
import { resolveCastAxis } from "#lib/features/film-director/domain/resolve-directives.js";

const CATALOG = ["staff", "fan", "club", "sword", "torch", "buugeng"] as const;

function axis(
  values: Parameters<typeof resolveCastAxis<string>>[0]["values"],
  overrides: Partial<Parameters<typeof resolveCastAxis<string>>[0]> = {}
) {
  const ids = values.map((_, index) => `performer-${index + 1}`);
  return resolveCastAxis<string>({
    axis: "prop",
    sceneId: "scene-1",
    performerIds: ids,
    values,
    catalog: [...CATALOG],
    random: createAxisStream(resolveFilmSeed("test-film"), "scene-1", "prop"),
    ...overrides,
  });
}

describe("resolveCastAxis", () => {
  it("passes literals through untouched", () => {
    expect(axis(["staff", "fan"])).toEqual(["staff", "fan"]);
  });

  it("resolves pick:any from the catalog deterministically", () => {
    const first = axis([{ pick: "any" }, { pick: "any" }]);
    const second = axis([{ pick: "any" }, { pick: "any" }]);
    expect(first).toEqual(second);
    for (const value of first) expect(CATALOG).toContain(value);
  });

  it("distinct yields pairwise different values and routes around pins", () => {
    const resolved = axis([
      "staff",
      { pick: "distinct" },
      { pick: "distinct" },
      { pick: "distinct" },
    ]);
    expect(new Set(resolved).size).toBe(4);
    expect(resolved[0]).toBe("staff");
    expect(resolved.slice(1)).not.toContain("staff");
  });

  it("not excludes; oneOf restricts", () => {
    const resolved = axis([{ not: "staff" }, { oneOf: ["fan", "club"] }]);
    expect(resolved[0]).not.toBe("staff");
    expect(["fan", "club"]).toContain(resolved[1]);
  });

  it("sameAs copies a resolved pick, even from a directive", () => {
    const resolved = axis([{ pick: "any" }, { sameAs: "performer-1" }]);
    expect(resolved[1]).toBe(resolved[0]);
  });

  it("rejects distinct demands larger than the pool, with counts", () => {
    expect(() =>
      axis([
        { pick: "distinct", from: ["staff", "fan"] },
        { pick: "distinct", from: ["staff", "fan"] },
        { pick: "distinct", from: ["staff", "fan"] },
      ])
    ).toThrow(/distinct/i);
  });

  it("rejects excluding everything", () => {
    expect(() => axis([{ not: [...CATALOG] }])).toThrow(/exclud/i);
  });

  it("rejects sameAs cycles and missing references", () => {
    expect(() =>
      axis([{ sameAs: "performer-2" }, { sameAs: "performer-1" }])
    ).toThrow(/cycle/i);
    expect(() => axis([{ sameAs: "performer-9" }])).toThrow(/performer-9/);
  });

  it("rejects pool values outside the catalog", () => {
    expect(() => axis([{ oneOf: ["chainsaw"] }])).toThrow(/chainsaw/);
  });

  it("rejects open picks on axes with no catalog", () => {
    expect(() => axis([{ pick: "any" }], { catalog: null })).toThrow(/from/i);
  });

  it("resolves full-coverage distinct across the whole catalog", () => {
    const resolved = axis([
      { pick: "distinct" },
      { pick: "distinct" },
      { pick: "distinct" },
      { pick: "distinct" },
      { pick: "distinct" },
      { pick: "distinct" },
    ]);
    expect(new Set(resolved).size).toBe(6);
  });

  it("keeps distinct picks unique alongside literal pins", () => {
    const resolved = axis(
      ["a", "b", "c", { pick: "distinct" }, { pick: "distinct" }],
      { catalog: ["a", "b", "c", "d", "e", "f"] }
    );
    expect(new Set(resolved).size).toBe(5);
    expect(resolved.slice(0, 3)).toEqual(["a", "b", "c"]);
  });

  it("pick distinct with not draws distinct values and never the excluded one", () => {
    // 3 performers on a 5-value catalog, excluding one value: all three
    // resolved values are distinct and none is the excluded value.
    const resolved = axis(
      [
        { pick: "distinct", not: "staff" },
        { pick: "distinct", not: "staff" },
        { pick: "distinct", not: "staff" },
      ],
      { catalog: ["staff", "fan", "club", "sword", "torch"] }
    );
    expect(new Set(resolved).size).toBe(3);
    expect(resolved).not.toContain("staff");
  });

  it("pick distinct with not rejects when the pool minus exclusions is smaller than the cast, naming the post-exclusion pool", () => {
    // 4 performers, pool of 4, excluding 1 → the existing not-enough-values
    // rejection fires. The message must report the POOL THE DIRECTOR ACTUALLY
    // HAD TO DRAW FROM (3, after "a" was excluded), not the pre-exclusion
    // count of 4 — reporting 4 here would hide that the `not` is the whole
    // reason the pool ran out.
    expect(() =>
      axis(
        [
          { pick: "distinct", from: ["a", "b", "c", "d"], not: "a" },
          { pick: "distinct", from: ["a", "b", "c", "d"], not: "a" },
          { pick: "distinct", from: ["a", "b", "c", "d"], not: "a" },
          { pick: "distinct", from: ["a", "b", "c", "d"], not: "a" },
        ],
        { catalog: ["a", "b", "c", "d"] }
      )
    ).toThrow(
      'Scene "scene-1", axis "prop": distinct values were requested for 4 performers but the allowed pool has only 3 (b, c, d) after excluding a.'
    );
  });

  it("pick distinct without any exclusion reports the pool plainly, with no exclusion clause", () => {
    // Same pool-exhaustion shape as above, but nothing was excluded — the
    // message must not claim an exclusion happened when none did.
    let error: unknown;
    try {
      axis(
        [
          { pick: "distinct", from: ["a", "b"] },
          { pick: "distinct", from: ["a", "b"] },
          { pick: "distinct", from: ["a", "b"] },
        ],
        { catalog: ["a", "b"] }
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toBe(
      'Scene "scene-1", axis "prop": distinct values were requested for 3 performers but the allowed pool has only 2 (a, b).'
    );
    expect(message).not.toContain("excluding");
  });

  it("reports an accurate distinct-performer count in the failure message", () => {
    let error: unknown;
    try {
      axis(
        [
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          { pick: "distinct", from: ["a"] },
          { pick: "distinct", from: ["a"] },
        ],
        { catalog: ["a", "b", "c", "d", "e", "f"] }
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("2 performers");
    expect(message).not.toContain("8 performers");
    expect(message.toLowerCase()).toContain("distinct");
  });
});
