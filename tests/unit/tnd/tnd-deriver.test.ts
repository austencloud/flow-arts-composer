import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveTnD,
  deriveTnDFromPictograph,
} from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import {
  TnDMode,
  ElementalType,
  RotationDirection,
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { calculateTnD } from "$lib/shared/pictograph/shared/domain/utils/tnd-calculator";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";

const { NORTH, EAST, SOUTH, WEST, NORTHEAST, SOUTHEAST, SOUTHWEST, NORTHWEST } =
  GridLocation;

// §2.2 ground-truth cases — real canonical-dataframe hand paths (start→end).
// Direction is the HAND ORBITAL arc, not prop rotation.
describe("deriveTnD — §2.2 ground truth (canonical M rows)", () => {
  it("Box M @γ12 (sw→nw / se→ne) → tog-opp (Air)", () => {
    const r = deriveTnD(SOUTHWEST, NORTHWEST, SOUTHEAST, NORTHEAST);
    expect(r.tndMode).toBe(TnDMode.TOG_OPP);
    expect(r.elementalType).toBe(ElementalType.AIR);
  });

  it("Box M @γ10 (se→sw / ne→nw) → split-opp (Fire)", () => {
    const r = deriveTnD(SOUTHEAST, SOUTHWEST, NORTHEAST, NORTHWEST);
    expect(r.tndMode).toBe(TnDMode.SPLIT_OPP);
    expect(r.elementalType).toBe(ElementalType.FIRE);
  });

  it("Diamond M @γ11 (s→w / e→n) → quarter-opp (Moon)", () => {
    const r = deriveTnD(SOUTH, WEST, EAST, NORTH);
    expect(r.tndMode).toBe(TnDMode.QUARTER_OPP);
    expect(r.elementalType).toBe(ElementalType.MOON);
  });

  it("Diamond J (e→n / w→n) → tog-opp (Air)", () => {
    const r = deriveTnD(EAST, NORTH, WEST, NORTH);
    expect(r.tndMode).toBe(TnDMode.TOG_OPP);
    expect(r.elementalType).toBe(ElementalType.AIR);
  });
});

// Same-direction families (A/G/S) from the diamond CSV — timing-invariant.
describe("deriveTnD — same-direction families", () => {
  it("A @alpha3 (w→n / e→s) → split-same (Water)", () => {
    const r = deriveTnD(WEST, NORTH, EAST, SOUTH);
    expect(r.tndMode).toBe(TnDMode.SPLIT_SAME);
    expect(r.elementalType).toBe(ElementalType.WATER);
  });

  it("G @beta3 (e→s / e→s) → tog-same (Earth)", () => {
    const r = deriveTnD(EAST, SOUTH, EAST, SOUTH);
    expect(r.tndMode).toBe(TnDMode.TOG_SAME);
    expect(r.elementalType).toBe(ElementalType.EARTH);
  });

  it("S @gamma3 (n→e / e→s) → quarter-same (Sun)", () => {
    const r = deriveTnD(NORTH, EAST, EAST, SOUTH);
    expect(r.tndMode).toBe(TnDMode.QUARTER_SAME);
    expect(r.elementalType).toBe(ElementalType.SUN);
  });
});

// Prop rotation is irrelevant: A/B/C share hand paths → all split-same.
describe("deriveTnD — prop rotation does not affect TnD", () => {
  it("A/B/C @alpha3 all share w→n / e→s → all split-same", () => {
    // A: pro/pro, B: anti/anti, C: anti/pro — identical hand paths.
    const r = deriveTnD(WEST, NORTH, EAST, SOUTH);
    expect(r.tndMode).toBe(TnDMode.SPLIT_SAME);
  });
});

// Non-shift geometry (no arc) → null.
describe("deriveTnD — non-shift → null", () => {
  it("static (start === end) → null", () => {
    const r = deriveTnD(NORTH, NORTH, EAST, EAST);
    expect(r.tndMode).toBeNull();
    expect(r.elementalType).toBeNull();
  });

  it("dash (opposite points) → null", () => {
    const r = deriveTnD(NORTH, SOUTH, EAST, WEST);
    expect(r.tndMode).toBeNull();
  });
});

// deriveTnDFromPictograph reads blue/red start+end, only for pro/anti shifts.
describe("deriveTnDFromPictograph", () => {
  function pictograph(
    left: Partial<Parameters<typeof createMotionData>[0]>,
    right: Partial<Parameters<typeof createMotionData>[0]>
  ): PictographData {
    return {
      id: "test",
      motions: {
        [HandSide.LEFT]: createMotionData({ hand: HandSide.LEFT, ...left }),
        [HandSide.RIGHT]: createMotionData({ hand: HandSide.RIGHT, ...right }),
      },
    };
  }

  it("classifies a pro/anti pictograph off the motion arcs (M @γ11 geometry)", () => {
    const p = pictograph(
      { motionType: MotionType.PRO, startLocation: SOUTH, endLocation: WEST },
      { motionType: MotionType.ANTI, startLocation: EAST, endLocation: NORTH }
    );
    expect(deriveTnDFromPictograph(p).tndMode).toBe(TnDMode.QUARTER_OPP);
  });

  it("returns null when a motion is static (start-placement pictograph)", () => {
    const p = pictograph(
      {
        motionType: MotionType.STATIC,
        startLocation: SOUTH,
        endLocation: SOUTH,
      },
      {
        motionType: MotionType.STATIC,
        startLocation: NORTH,
        endLocation: NORTH,
      }
    );
    expect(deriveTnDFromPictograph(p).tndMode).toBeNull();
  });

  it("returns null for missing motions", () => {
    expect(
      deriveTnDFromPictograph({ id: "x", motions: {} }).tndMode
    ).toBeNull();
  });
});

// §6.2 GOLDEN SNAPSHOT — the deriver reproduces the canonical calculateTnD table
// for every shift+shift (Type-1) row of both dataframes, per grid mode. The table
// is the oracle (it is being retired to this regression fixture). Target: 100%.
//
// NOTE: the dataframes' own `timing`/`direction` columns are NOT the oracle for
// box — box D/E/F/J/K/L carry stale (non-box-transformed) timing/direction values
// (the "box-D anomaly" called out in the design). The grid-correct truth is
// calculateTnD(letter, BOX, startPos) = QUARTER_OPP, which the deriver reproduces
// from the box-transformed geometry. Any residual mismatch is a real table bug.
function loadRows(file: string): Record<string, string>[] {
  const text = readFileSync(resolve(process.cwd(), file), "utf8").trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const SHIFTS = new Set([MotionType.PRO, MotionType.ANTI]);

const FILES: { file: string; gridMode: GridMode }[] = [
  {
    file: "static/data/pictographs/DiamondPictographDataframe.csv",
    gridMode: GridMode.DIAMOND,
  },
  {
    file: "static/data/pictographs/BoxPictographDataframe.csv",
    gridMode: GridMode.BOX,
  },
];

describe("golden snapshot: deriveTnD reproduces the calculateTnD table", () => {
  for (const { file, gridMode } of FILES) {
    it(`matches every shift+shift row in ${file}`, () => {
      const rows = loadRows(file);
      expect(rows.length).toBeGreaterThan(100);
      const mismatches: string[] = [];
      let checked = 0;
      for (const row of rows) {
        // Type-1 (shift + shift) rows only: both hands arc.
        if (
          !SHIFTS.has(row.blueMotionType as MotionType) ||
          !SHIFTS.has(row.redMotionType as MotionType)
        )
          continue;
        const expected = calculateTnD(
          row.letter as Letter,
          gridMode,
          row.startPlacement as GridPlacement
        ).tndMode;
        if (!expected) continue; // not a TnD letter
        checked++;
        const got = deriveTnD(
          row.blueStartLocation as GridLocation,
          row.blueEndLocation as GridLocation,
          row.redStartLocation as GridLocation,
          row.redEndLocation as GridLocation
        );
        if (got.tndMode !== expected) {
          mismatches.push(
            `${row.letter} ${row.startPlacement}: left ${row.blueStartLocation}→${row.blueEndLocation} ` +
              `right ${row.redStartLocation}→${row.redEndLocation} table=${expected} derived=${got.tndMode}`
          );
        }
      }
      expect(checked).toBeGreaterThan(50);
      expect(
        mismatches,
        `${mismatches.length} mismatches:\n${mismatches.slice(0, 40).join("\n")}`
      ).toEqual([]);
    });
  }
});
