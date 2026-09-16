import { describe, it, expect } from "vitest";
import { filterRealizations, MODE_ORDER } from "../shape-matrix-realizations";
import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";

const edge = (over: Partial<CsvEdge>): CsvEdge =>
  ({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "alpha3",
    timing: "split",
    direction: "same",
    leftMotionType: "pro",
    leftRotationDirection: "cw",
    leftStartLocation: "s",
    leftEndLocation: "w",
    rightMotionType: "pro",
    rightRotationDirection: "cw",
    rightStartLocation: "n",
    rightEndLocation: "e",
    ...over,
  }) as CsvEdge;

describe("filterRealizations", () => {
  it("returns one row per VTG mode, in canonical order, with a representative letter", () => {
    const edges = [
      edge({ letter: "A", timing: "split", direction: "same" }), // SS
      edge({ letter: "G", timing: "tog", direction: "same" }), // TS
      edge({ letter: "S", timing: "quarter", direction: "same" }), // QS
      edge({ letter: "D", timing: "split", direction: "opp" }), // SO
      edge({ letter: "X", timing: "split", direction: "opp" }), // SO dup → dropped
      edge({ letter: "J", timing: "tog", direction: "opp" }), // TO
      edge({ letter: "M", timing: "quarter", direction: "opp" }), // QO
    ];
    const r = filterRealizations(edges, "pro", "pro");
    expect(r.map((x) => x.mode)).toEqual(["SS", "TS", "QS", "SO", "TO", "QO"]);
    expect(r.map((x) => x.letter)).toEqual(["A", "G", "S", "D", "J", "M"]);
    expect(MODE_ORDER).toHaveLength(6);
  });

  it("tolerates full-word timing/direction spellings", () => {
    const r = filterRealizations(
      [edge({ letter: "J", timing: "together", direction: "opposite" })],
      "pro",
      "pro"
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      mode: "TO",
      modeLabel: "Together · Opp",
      letter: "J",
    });
  });

  it("excludes edges whose motion types don't match the cell styles", () => {
    const edges = [
      edge({ letter: "A", leftMotionType: "pro", rightMotionType: "pro" }),
      edge({ letter: "Γ", leftMotionType: "anti", rightMotionType: "anti" }),
    ];
    expect(
      filterRealizations(edges, "anti", "anti").map((x) => x.letter)
    ).toEqual(["Γ"]);
  });
});
