import { describe, it, expect } from "vitest";
import { buildSignals, resolveCatalogMembership } from "#lib/features/choreo-card/domain/catalog-membership.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";

function seq(partial: Partial<SequenceData>): SequenceData {
  return {
    id: "t",
    name: "",
    word: "",
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    ...partial,
  } as SequenceData;
}

function catalog(p: Partial<Catalog>): Catalog {
  return {
    id: "d",
    name: "",
    canonicalName: "",
    description: "",
    families: [],
    totalSequences: 0,
    gridMode: "diamond",
    level: 1,
    collection: "LOOPs",
    loopType: "rotated",
    sliceType: "halved",
    stepCount: 8,
    turnPattern: "",
    reversalPattern: "continuous",
    ...p,
  } as Catalog;
}

const providers = {
  analyzeLevel: () => 1,
  analyzeLoop: () => ({ loopType: "rotated", period: "halved" as const }),
};

describe("buildSignals", () => {
  it("returns null level for L4+ sequences", () => {
    const s = seq({
      gridMode: "centric",
      steps: [{
        stepNumber: 1, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
        motions: { left: { startLocation: "c" }, right: { startLocation: "n" } },
      }] as unknown as SequenceData["steps"],
    });
    const signals = buildSignals(s, providers);
    expect(signals.level).toBeNull();
    expect(signals.beyondLevel3Features.length).toBeGreaterThan(0);
  });

  it("returns classifier level for L1-L3 sequences", () => {
    const s = seq({
      gridMode: "diamond",
      steps: [{
        stepNumber: 1, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
        motions: { left: { startLocation: "n" }, right: { startLocation: "s" } },
      }] as unknown as SequenceData["steps"],
    });
    const signals = buildSignals(s, providers);
    expect(signals.level).toBe(1);
  });
});

describe("resolveCatalogMembership", () => {
  it("refuses to match any deck when level is null (L4+ sequence)", () => {
    const catalogs = [catalog({ id: "l1-deck", level: 1 }), catalog({ id: "l2-deck", level: 2 })];
    const signals = {
      level: null,
      beyondLevel3Features: ["gridMode:centric"],
      gridMode: "centric",
      loopType: "rotated",
      sliceType: "halved" as const,
      stepCount: 8,
      reversalPatternId: "continuous",
    };
    expect(resolveCatalogMembership(signals, catalogs)).toEqual([]);
  });

  it("matches an exact deck when all signals align", () => {
    const catalogs = [
      catalog({ id: "match", level: 1, gridMode: "diamond", loopType: "rotated", sliceType: "halved", stepCount: 8, reversalPattern: "continuous" }),
      catalog({ id: "miss",  level: 2, gridMode: "diamond", loopType: "rotated", sliceType: "halved", stepCount: 8, reversalPattern: "continuous" }),
    ];
    const signals = {
      level: 1, beyondLevel3Features: [], gridMode: "diamond",
      loopType: "rotated", sliceType: "halved" as const, stepCount: 8,
      reversalPatternId: "continuous",
    };
    const results = resolveCatalogMembership(signals, catalogs);
    expect(results).toHaveLength(1);
    expect(results[0]!.catalog.id).toBe("match");
    expect(results[0]!.exact).toBe(true);
  });

  it("returns partial matches when non-essential signals are null", () => {
    const catalogs = [catalog({ id: "d1", level: 1, loopType: "rotated", sliceType: "halved", stepCount: 8 })];
    const signals = {
      level: 1, beyondLevel3Features: [], gridMode: "diamond",
      loopType: null, sliceType: null, stepCount: 8,
      reversalPatternId: "continuous",
    };
    const results = resolveCatalogMembership(signals, catalogs);
    expect(results).toHaveLength(1);
    expect(results[0]!.exact).toBe(false);
    expect(results[0]!.missingFields).toContain("loopType");
    expect(results[0]!.missingFields).toContain("sliceType");
  });
});
