import { describe, expect, it } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { Flower } from "../../domain/flower-signature";
import { identifyShapeMatrixRealization } from "../shape-matrix-realization-source";

const left: Flower = {
  style: "pro",
  turns: 1,
  ori: "in",
  grid: "diamond",
  petals: 2,
};
const right: Flower = {
  style: "anti",
  turns: 2,
  ori: "out",
  grid: "diamond",
  petals: 6,
};

describe("identifyShapeMatrixRealization", () => {
  it("keeps the realized motion payload and gives the cell result its own identity", () => {
    const base = createSequenceData({
      id: "catalog/base word",
      name: "Base",
      word: "AAAA",
      steps: [createStepData({ id: "base-step" })],
    });
    const realized = createSequenceData({
      ...base,
      steps: [createStepData({ id: "realized-step", duration: 2 })],
      metadata: { marker: "exact" },
    });

    const source = identifyShapeMatrixRealization(
      base,
      realized,
      { left, right },
      "TO"
    );

    expect(source.sequence).toEqual({
      ...realized,
      id: "shape-matrix:catalog%2Fbase%20word:TO:pro-1-in-diamond:anti-2-out-diamond",
    });
    expect(source.sequence.steps).toBe(realized.steps);
    expect(source.sourceSequenceId).toBe(base.id);
    expect(source.provenance).toEqual({
      kind: "shape-matrix-realization",
      version: 1,
      baseSequenceId: base.id,
      mode: "TO",
      leftFlower: left,
      rightFlower: right,
    });
  });

  it("produces a different identity for a different mode without inventing a base", () => {
    const base = createSequenceData({
      id: "catalog-base",
      name: "Base",
      word: "AAAA",
      steps: [],
    });

    const ss = identifyShapeMatrixRealization(base, base, { left, right }, "SS");
    const so = identifyShapeMatrixRealization(base, base, { left, right }, "SO");

    expect(ss.sequence.id).not.toBe(so.sequence.id);
    expect(ss.sourceSequenceId).toBe("catalog-base");
    expect(so.sourceSequenceId).toBe("catalog-base");
  });
});
