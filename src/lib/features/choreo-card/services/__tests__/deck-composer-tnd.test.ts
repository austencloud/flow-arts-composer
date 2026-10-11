import { describe, it, expect } from "vitest";
import {
  getTnDFamilyOptions,
  getTnDTurnPatternOptions,
  buildTnDCards,
  classifyTnDSeedForGrid,
  type TnDSeedClass,
} from "../deck-composer";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

// Seed classes per §4.2: each base seed's grid-correct family (diamond | box).
// Mirror-half seeds share a letter multiset (MP/PM, DJ/JD, …). When both halves
// collapse onto the SAME family in a grid, only the canonical (word-sorts-first)
// seed is kept for that grid — diamond quarter-opp keeps MP/NQ/OR (not PM/QN/RO),
// box quarter-opp keeps DJ/EK/FL (not JD/KE/LF). The dropped half still appears in
// the OTHER family it lands in per grid (PM → box split-opp; JD → diamond split-opp).
function seedClass(
  seedId: string,
  diamond: string | null,
  box: string | null
): TnDSeedClass {
  return { seedId, sourceCatalogId: "l1-tnd-motions", diamond, box };
}

const SEED_CLASSES: TnDSeedClass[] = [
  // γ tog half — diamond quarter-opp, box tog-opp
  seedClass("MP", "quarter-opp", "tog-opp"),
  seedClass("NQ", "quarter-opp", "tog-opp"),
  seedClass("OR", "quarter-opp", "tog-opp"),
  // γ split half (new gamma seeds) — diamond quarter-opp, box split-opp
  seedClass("PM", "quarter-opp", "split-opp"),
  seedClass("QN", "quarter-opp", "split-opp"),
  seedClass("RO", "quarter-opp", "split-opp"),
  // α/β tog half — diamond tog-opp, box quarter-opp
  seedClass("DJ", "tog-opp", "quarter-opp"),
  seedClass("EK", "tog-opp", "quarter-opp"),
  seedClass("FL", "tog-opp", "quarter-opp"),
  // α/β split half — diamond split-opp, box quarter-opp
  seedClass("JD", "split-opp", "quarter-opp"),
  seedClass("KE", "split-opp", "quarter-opp"),
  seedClass("LF", "split-opp", "quarter-opp"),
  // same-direction families — timing-invariant across grids
  seedClass("A", "split-same", "split-same"),
  seedClass("G", "tog-same", "tog-same"),
  seedClass("S", "quarter-same", "quarter-same"),
];

const familyIds = (grids: ("diamond" | "box")[]) =>
  getTnDFamilyOptions(SEED_CLASSES, grids).map((o) => o.familyId);

const seedsIn = (familyId: string, grids: ("diamond" | "box")[]): string[] => {
  const fam = getTnDFamilyOptions(SEED_CLASSES, grids).find(
    (o) => o.familyId === familyId
  );
  return (fam?.entries ?? []).map((e) => e.sequenceId).sort();
};

// getTnDFamilyOptions — grid-aware grouping by computed element
describe("getTnDFamilyOptions (grid-aware)", () => {
  it("diamond grouping keeps canonical gamma seeds (MP/NQ/OR), drops mirror PM/QN/RO", () => {
    expect(seedsIn("quarter-opp", ["diamond"])).toEqual(["MP", "NQ", "OR"]);
    expect(seedsIn("tog-opp", ["diamond"])).toEqual(["DJ", "EK", "FL"]);
    expect(seedsIn("split-opp", ["diamond"])).toEqual(["JD", "KE", "LF"]);
    expect(seedsIn("split-same", ["diamond"])).toEqual(["A"]);
    expect(seedsIn("tog-same", ["diamond"])).toEqual(["G"]);
    expect(seedsIn("quarter-same", ["diamond"])).toEqual(["S"]);
  });

  it("box quarter-opp keeps canonical DJ/EK/FL, drops mirror JD/KE/LF and the gamma seeds", () => {
    expect(seedsIn("quarter-opp", ["box"])).toEqual(["DJ", "EK", "FL"]);
    expect(seedsIn("quarter-opp", ["box"])).not.toContain("JD");
    expect(seedsIn("quarter-opp", ["box"])).not.toContain("MP");
  });

  it("box tog-opp = MP/NQ/OR (Air), box split-opp = PM/QN/RO (Fire)", () => {
    expect(seedsIn("tog-opp", ["box"])).toEqual(["MP", "NQ", "OR"]);
    expect(seedsIn("split-opp", ["box"])).toEqual(["PM", "QN", "RO"]);
  });

  it("families come back in canonical order", () => {
    expect(familyIds(["diamond"])).toEqual([
      "split-same",
      "tog-same",
      "quarter-same",
      "split-opp",
      "tog-opp",
      "quarter-opp",
    ]);
  });

  it("both grids selected: a seed lands in its per-grid family (MP → Moon & Air)", () => {
    expect(seedsIn("quarter-opp", ["diamond", "box"])).toContain("MP"); // diamond
    expect(seedsIn("tog-opp", ["diamond", "box"])).toContain("MP"); // box
  });

  it("returns empty when no seed classes", () => {
    expect(getTnDFamilyOptions([], ["box"])).toEqual([]);
  });

  it("mirror-half dedup is per grid: dropped half still appears in its other-grid family", () => {
    // PM is deduped out of diamond quarter-opp but remains the box split-opp seed.
    expect(seedsIn("quarter-opp", ["diamond"])).not.toContain("PM");
    expect(seedsIn("split-opp", ["box"])).toContain("PM");
    // JD is deduped out of box quarter-opp but remains the diamond split-opp seed.
    expect(seedsIn("quarter-opp", ["box"])).not.toContain("JD");
    expect(seedsIn("split-opp", ["diamond"])).toContain("JD");
  });
});

// Family counts per grid selection (§6 test 7)
describe("getTnDFamilyOptions — counts per grid selection", () => {
  it("diamond-only: quarter-opp counts 3 (canonical γ seeds, mirror half deduped)", () => {
    const opts = getTnDFamilyOptions(SEED_CLASSES, ["diamond"]);
    expect(opts.find((o) => o.familyId === "quarter-opp")!.sequenceCount).toBe(3);
  });

  it("box-only: quarter-opp counts 3 (DJ/EK/FL), tog-opp 3, split-opp 3", () => {
    const opts = getTnDFamilyOptions(SEED_CLASSES, ["box"]);
    expect(opts.find((o) => o.familyId === "quarter-opp")!.sequenceCount).toBe(3);
    expect(opts.find((o) => o.familyId === "tog-opp")!.sequenceCount).toBe(3);
    expect(opts.find((o) => o.familyId === "split-opp")!.sequenceCount).toBe(3);
  });

  it("both grids: each grid keeps its canonical seed per family (mirror halves deduped per grid)", () => {
    const opts = getTnDFamilyOptions(SEED_CLASSES, ["diamond", "box"]);
    const total = opts.reduce((s, o) => s + o.sequenceCount, 0);
    // diamond 12 (qopp 3, togopp 3, splitopp 3, ss/ts/qs 1 each)
    // + box 12 (qopp 3, togopp 3, splitopp 3, ss/ts/qs 1 each) = 24
    expect(total).toBe(24);
  });
});

// buildTnDCards — emits grid-correct content (§6 tests 4 & 5)
describe("buildTnDCards — box quarter-opp content (§6 test 4)", () => {
  it("Box + Quarter-Opp emits canonical DJ/EK/FL, no mirror JD/KE/LF, no MP/NQ/OR", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["box"]);
    const cards = buildTnDCards(families, new Set(["quarter-opp"]), new Set(["0|0"]));
    const ids = cards.map((c) => c.sequenceId).sort();
    expect(ids).toEqual(["DJ", "EK", "FL"]);
    expect(ids).not.toContain("JD");
    expect(ids).not.toContain("MP");
    expect(cards.every((c) => c.variation?.gridMode === "box")).toBe(true);
    expect(cards.every((c) => c.footer.center === "Quarter-Opp")).toBe(true);
  });
});

describe("buildTnDCards — box tog/split content (§6 test 5)", () => {
  it("Box + Tog-Opp → MP/NQ/OR (Air)", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["box"]);
    const cards = buildTnDCards(families, new Set(["tog-opp"]), new Set(["0|0"]));
    expect(cards.map((c) => c.sequenceId).sort()).toEqual(["MP", "NQ", "OR"]);
    expect(cards.every((c) => c.footer.center === "Tog-Opp")).toBe(true);
  });

  it("Box + Split-Opp → PM/QN/RO (Fire)", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["box"]);
    const cards = buildTnDCards(families, new Set(["split-opp"]), new Set(["0|0"]));
    expect(cards.map((c) => c.sequenceId).sort()).toEqual(["PM", "QN", "RO"]);
    expect(cards.every((c) => c.footer.center === "Split-Opp")).toBe(true);
  });
});

describe("buildTnDCards — diamond canonical gamma half (§6 test 6 regression guard)", () => {
  it("Diamond + Quarter-Opp → MP/NQ/OR only (mirror PM/QN/RO deduped), no DEFJKL", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["diamond"]);
    const cards = buildTnDCards(families, new Set(["quarter-opp"]), new Set(["0|0"]));
    expect(cards.map((c) => c.sequenceId).sort()).toEqual(["MP", "NQ", "OR"]);
    expect(cards.every((c) => c.variation?.gridMode === undefined)).toBe(true);
  });
});

// buildTnDCards — cartesian enumeration (preserved behavior)
describe("buildTnDCards — cartesian over patterns × registers", () => {
  it("emits seed × pattern × register cards with variation.turnPattern", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["box"]); // box tog-opp: MP/NQ/OR
    const cards = buildTnDCards(
      families,
      new Set(["tog-opp"]),
      new Set(["0|0", "1|1"])
    );
    expect(cards).toHaveLength(3 * 2); // 3 seeds × 2 patterns
    expect(cards.filter((c) => c.variation!.turnPattern === "1|1")).toHaveLength(3);
  });

  it("returns no cards when no pattern is selected", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["diamond"]);
    expect(buildTnDCards(families, new Set(["tog-opp"]), new Set())).toEqual([]);
  });

  it("multiplies every seed by each selected register; radial omits the tag", () => {
    const families = getTnDFamilyOptions(SEED_CLASSES, ["box"]); // box tog-opp: 3
    const cards = buildTnDCards(
      families,
      new Set(["tog-opp"]),
      new Set(["1|1"]),
      ["radial", "nonradial", "split"]
    );
    expect(cards).toHaveLength(3 * 3);
    expect(cards.filter((c) => c.variation?.startOriMode === "nonradial")).toHaveLength(3);
    expect(cards.filter((c) => c.variation?.startOriMode === undefined)).toHaveLength(3);
  });
});

describe("getTnDTurnPatternOptions (TURN_VALUES²)", () => {
  it("produces all 49 cells with canonical b|r patterns", () => {
    const opts = getTnDTurnPatternOptions(10);
    expect(opts).toHaveLength(49);
    expect(opts.map((o) => o.turnPattern)).toContain("0|0");
    expect(opts.map((o) => o.turnPattern)).toContain("0.5|1");
    expect(opts.every((o) => o.sequenceCount === 10)).toBe(true);
  });
});

// classifyTnDSeedForGrid — first rotating step drives the element (diamond)
describe("classifyTnDSeedForGrid", () => {
  function seqWithFirstStep(
    left: { start: GridLocation; end: GridLocation },
    right: { start: GridLocation; end: GridLocation }
  ): SequenceData {
    return {
      id: "seq",
      name: "",
      word: "MP",
      steps: [
        {
          id: "s1",
          stepNumber: 1,
          isBlank: false,
          motions: {
            [HandSide.LEFT]: createMotionData({
              hand: HandSide.LEFT,
              motionType: MotionType.PRO,
              startLocation: left.start,
              endLocation: left.end,
            }),
            [HandSide.RIGHT]: createMotionData({
              hand: HandSide.RIGHT,
              motionType: MotionType.PRO,
              startLocation: right.start,
              endLocation: right.end,
            }),
          },
        },
      ],
      metadata: {},
    } as unknown as SequenceData;
  }

  it("diamond M @γ11 (s→w / e→n) classifies quarter-opp", () => {
    const seq = seqWithFirstStep(
      { start: GridLocation.SOUTH, end: GridLocation.WEST },
      { start: GridLocation.EAST, end: GridLocation.NORTH }
    );
    expect(classifyTnDSeedForGrid(seq, "diamond")).toBe("quarter-opp");
  });

  it("diamond A @alpha3 (w→n / e→s) classifies split-same", () => {
    const seq = seqWithFirstStep(
      { start: GridLocation.WEST, end: GridLocation.NORTH },
      { start: GridLocation.EAST, end: GridLocation.SOUTH }
    );
    expect(classifyTnDSeedForGrid(seq, "diamond")).toBe("split-same");
  });
});
