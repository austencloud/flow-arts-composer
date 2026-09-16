import { describe, it, expect } from "vitest";
import { buildSequencePool } from "../deck-composer";
import type { Catalog } from "../../domain/models/Catalog";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

function loopCatalog(over: Partial<Catalog>, sequenceIds: string[] = ["alpha1_AB"]): Catalog {
  return {
    id: "c",
    name: "",
    canonicalName: "",
    description: "",
    families: [{ id: "f", label: "F", typeCombo: "", sequenceIds }],
    totalSequences: sequenceIds.length,
    gridMode: GridMode.DIAMOND,
    level: 1,
    collection: "LOOPs",
    loopType: "rotated",
    sliceType: "quartered",
    stepCount: 8,
    turnPattern: "1-turn",
    reversalPattern: "continuous",
    ...over,
  };
}

const slice = new Set<"halved" | "quartered">(["quartered"]);

describe("buildSequencePool filters", () => {
  it("filters by loopType", () => {
    const rotated = loopCatalog({ id: "rot", loopType: "rotated" });
    const inverted = loopCatalog({ id: "inv", loopType: "inverted" }, ["alpha1_CD"]);
    const pool = buildSequencePool([rotated, inverted], { sliceTypes: slice, loopTypes: new Set(["rotated"]) });
    const ids = [...pool.values()].flat().map((e) => e.sourceCatalogId);
    expect(ids).toContain("rot");
    expect(ids).not.toContain("inv");
  });

  it("filters by level", () => {
    const rotated = loopCatalog({ id: "rot", level: 1 });
    const l2 = loopCatalog({ id: "l2", level: 2 }, ["alpha1_EF"]);
    const pool = buildSequencePool([rotated, l2], { sliceTypes: slice, levels: new Set([2]) });
    const ids = [...pool.values()].flat().map((e) => e.sourceCatalogId);
    expect(ids).toEqual(["l2"]);
  });

  it("no loopType/level filter ⇒ all LOOP catalogs (legacy behavior)", () => {
    const rotated = loopCatalog({ id: "rot", loopType: "rotated" });
    const inverted = loopCatalog({ id: "inv", loopType: "inverted" }, ["alpha1_CD"]);
    const pool = buildSequencePool([rotated, inverted], { sliceTypes: slice });
    expect([...pool.values()].flat()).toHaveLength(2);
  });

  it("filters by start-placement id subset", () => {
    const cat = loopCatalog({ id: "sp", loopType: "rotated" }, ["alpha1_AB", "beta3_CD"]);
    const pool = buildSequencePool([cat], { sliceTypes: slice, startPlacementIds: new Set(["alpha1"]) });
    const words = [...pool.values()].flat().map((e) => e.sequenceId);
    expect(words).toEqual(["alpha1_AB"]);
  });

  it("parses startPlacement from the seqId prefix", () => {
    const cat = loopCatalog({ id: "sp" }, ["beta3_XY"]);
    const pool = buildSequencePool([cat], { sliceTypes: slice });
    expect([...pool.values()].flat()[0]?.startPlacement).toEqual("beta3");
  });
});
