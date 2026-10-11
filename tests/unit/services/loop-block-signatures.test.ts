import { describe, expect, it } from "vitest";
import { blockSignatures } from "#lib/shared/create/services/loop-block-signatures.js";
import type {
  LOOPSpecWire,
  ReflectionAxis,
} from "@tka/sequence-engine/loop";

const wire = (prop: Record<string, {
  period: number;
  mode?: "expand" | "overlay";
  reflectionAxis?: ReflectionAxis;
}>): LOOPSpecWire =>
  ({ left: prop, right: prop }) as LOOPSpecWire;

const sigs = (cells: Array<Set<string>>) => cells.map((c) => [...c].sort().join("+") || "base");

describe("blockSignatures", () => {
  it("halved MIR (rot:2, mir:2, inv:2): two cells — base | mirror+invert", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, mirrored: { period: 2 }, inverted: { period: 2 } }));
    expect(sigs(r.cells)).toEqual(["base", "inverted+mirrored"]);
    expect(r.rotation).toEqual({ interval: 2 });
  });

  it("full triple with expand inv:4 (rot:2, mir:2, inv:4): 8 cells, mirror inner, inversion alternating", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, mirrored: { period: 2 }, inverted: { period: 4 } }));
    expect(sigs(r.cells)).toEqual([
      "base", "mirrored", "inverted", "inverted+mirrored",
      "base", "mirrored", "inverted", "inverted+mirrored",
    ]);
  });

  it("overlay inversion (rot:2, mir:2, inv:4 overlay): 4 cells — base | inv | mirror | mirror+inv", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, mirrored: { period: 2 }, inverted: { period: 4, mode: "overlay" } }));
    expect(sigs(r.cells)).toEqual(["base", "inverted", "mirrored", "inverted+mirrored"]);
  });

  it("fused quarter-toggle (mir:4, inv:4): 4 cells alternating", () => {
    const r = blockSignatures(wire({ mirrored: { period: 4 }, inverted: { period: 4 } }));
    expect(sigs(r.cells)).toEqual(["base", "inverted+mirrored", "base", "inverted+mirrored"]);
    expect(r.rotation).toBeUndefined();
  });

  it("rotation absorbed into fused stage still reports the ribbon (rot:2 + inv:2, no mirror)", () => {
    const r = blockSignatures(wire({ rotated: { period: 2 }, inverted: { period: 2 } }));
    // one fused stage x2: cells [base, inverted]; rotation ribbon still shown
    expect(sigs(r.cells)).toEqual(["base", "inverted"]);
    expect(r.rotation).toEqual({ interval: 2 });
  });

  it("preserves the exact reflection axis for timeline icons", () => {
    const r = blockSignatures(
      wire({
        mirrored: {
          period: 2,
          reflectionAxis: "northeast-southwest",
        },
      })
    );

    expect(r.reflectionAxes).toEqual({
      mirrored: "northeast-southwest",
    });
  });
});
