import { describe, it, expect } from "vitest";
import { decode } from "#lib/shared/mandala/services/mandala-decoder.js";
import { buildIndex, type IndexInput } from "#lib/shared/mandala/services/mandala-index-builder.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";

function paths(left: string[], right: string[]): MandalaPaths {
  return {
    left: left.map((d, i) => ({ d, tipIndex: i })),
    right: right.map((d, i) => ({ d, tipIndex: i })),
    purple: [],
  };
}
const ARC = "M 10.00 0.00 C 5.00 5.00, 0.00 10.00, -10.00 0.00";
const LINE = "M -50.00 -50.00 C -25.00 -25.00, 0.00 0.00, 50.00 50.00";

const index = buildIndex([
  { ref: { seqId: "a", word: "AB", deck: "d1" }, paths: paths([ARC], []) },     // blue-only
  { ref: { seqId: "b", word: "BA", deck: "d1" }, paths: paths([], [ARC]) },     // red-only, same glyph
  { ref: { seqId: "c", word: "CC", deck: "d1" }, paths: paths([ARC], [ARC]) },  // combo, same glyph
  { ref: { seqId: "z", word: "ZZ", deck: "d1" }, paths: paths([LINE], []) },    // different glyph
] satisfies IndexInput[]);

describe("decode", () => {
  it("returns the full color-blind exact class for a query glyph", () => {
    const result = decode(paths([ARC], []), index);
    expect(result.exactClass.map((r) => r.seqId).sort()).toEqual(["a", "b", "c"]);
    expect(result.count.exact).toBe(3);
  });

  it("splits the class by color lens", () => {
    const result = decode(paths([ARC], []), index);
    expect(result.colorVariants.leftOnly.map((r) => r.seqId)).toEqual(["a"]);
    expect(result.colorVariants.rightOnly.map((r) => r.seqId)).toEqual(["b"]);
    expect(result.colorVariants.combo.map((r) => r.seqId)).toEqual(["c"]);
  });

  it("reports an empty class for a glyph absent from the catalog", () => {
    const absent = paths(["M 200.00 200.00 C 201.00 201.00, 202.00 202.00, 203.00 203.00"], []);
    const result = decode(absent, index);
    expect(result.exactClass).toHaveLength(0);
    expect(result.count.exact).toBe(0);
  });
});
