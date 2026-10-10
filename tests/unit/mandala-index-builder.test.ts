import { describe, it, expect } from "vitest";
import {
  buildIndex,
  type IndexInput,
} from "#lib/shared/mandala/services/mandala-index-builder.js";
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

describe("buildIndex", () => {
  it("groups sequences with the same glyph under one shapeKey", () => {
    const inputs: IndexInput[] = [
      { ref: { seqId: "a", word: "AB", deck: "d1" }, paths: paths([ARC], []) },
      { ref: { seqId: "b", word: "BA", deck: "d1" }, paths: paths([], [ARC]) }, // color-swap → same glyph
      { ref: { seqId: "c", word: "CD", deck: "d1" }, paths: paths([LINE], []) },
    ];
    const index = buildIndex(inputs);
    const keys = Object.keys(index.byShape);
    expect(keys).toHaveLength(2); // ARC-glyph and LINE-glyph
    const arcGroup = Object.values(index.byShape).find((g) => g.length === 2)!;
    expect(arcGroup.map((r) => r.seqId).sort()).toEqual(["a", "b"]);
  });

  it("records colorSig and orbitKey per ref, and a byOrbit map", () => {
    const inputs: IndexInput[] = [
      { ref: { seqId: "a", word: "AB", deck: "d1" }, paths: paths([ARC], []) },
    ];
    const index = buildIndex(inputs);
    const ref = Object.values(index.byShape)[0]![0]!;
    expect(ref.colorSig.leftOnly).toBe(true);
    expect(typeof ref.orbitKey).toBe("string");
    expect(Object.values(index.byOrbit)[0]).toContain(
      Object.keys(index.byShape)[0]
    );
  });

  it("skips empty-path sequences", () => {
    const index = buildIndex([
      { ref: { seqId: "x", word: "", deck: "d" }, paths: paths([], []) },
    ]);
    expect(Object.keys(index.byShape)).toHaveLength(0);
  });
});
