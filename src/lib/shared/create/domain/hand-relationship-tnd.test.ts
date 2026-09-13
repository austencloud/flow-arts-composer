/**
 * The four hand relationships are the four VTG timing/direction quadrants.
 *
 * Direction asks whether the map is a reflection (a reflection reverses one
 * hand's arc). Timing asks whether the map moves the downbeat: the N-S mirror
 * and identity keep South fixed, so both hands reach it together; the E-W
 * flip and the 180 turn swap North and South, so the hands are half a cycle
 * apart. This test reads the production dataframes so the claim can never
 * drift from the data the generator actually draws from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "@tka/sequence-engine/generation";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  HAND_RELATIONSHIP_TND,
  handRelationshipToEngine,
  type HandRelationship,
} from "./hand-relationship";

const TND_WIRE: Record<TnDMode, string> = {
  [TnDMode.TOG_OPP]: "tog/opp",
  [TnDMode.SPLIT_OPP]: "split/opp",
  [TnDMode.TOG_SAME]: "tog/same",
  [TnDMode.SPLIT_SAME]: "split/same",
  [TnDMode.QUARTER_SAME]: "quarter/same",
  [TnDMode.QUARTER_OPP]: "quarter/opp",
};

interface Row {
  letter: string;
  timing: string;
  direction: string;
  left: { motionType: string; rotationDirection: string; startLocation: string; endLocation: string };
  right: { motionType: string; rotationDirection: string; startLocation: string; endLocation: string };
}

function loadRows(file: string): Row[] {
  const csv = readFileSync(
    path.resolve(process.cwd(), "static/data/pictographs", file),
    "utf8"
  );
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",").map((s) => s.trim()))
    .filter((c) => c.length >= 13 && c[0])
    .map((c) => ({
      letter: c[0]!,
      timing: c[3]!,
      direction: c[4]!,
      left: { motionType: c[5]!, rotationDirection: c[6]!, startLocation: c[7]!, endLocation: c[8]! },
      right: { motionType: c[9]!, rotationDirection: c[10]!, startLocation: c[11]!, endLocation: c[12]! },
    }));
}

const GRIDS = ["DiamondPictographDataframe.csv", "BoxPictographDataframe.csv"];
const RELATIONSHIPS: Exclude<HandRelationship, "free">[] = ["mirrored", "flipped", "unison", "opposite"];

describe("hand relationships are the timing and direction quadrants", () => {
  it("declares one quadrant per relationship and covers all four", () => {
    expect(HAND_RELATIONSHIP_TND).toEqual({
      mirrored: TnDMode.TOG_OPP,
      flipped: TnDMode.SPLIT_OPP,
      unison: TnDMode.TOG_SAME,
      opposite: TnDMode.SPLIT_SAME,
    });
  });

  it.each(GRIDS)("%s: every shift row a relationship selects carries its quadrant", (file) => {
    const rows = loadRows(file);
    for (const relationship of RELATIONSHIPS) {
      for (const inverted of [false, true]) {
        const options = handRelationshipToEngine(relationship, inverted) as HandRelationshipOptions;
        const shifts = rows.filter(
          (r) =>
            ["pro", "anti"].includes(r.left.motionType) &&
            handRelationshipHolds(r.left as never, r.right as never, options)
        );
        expect(shifts.length, `${relationship}${inverted ? " inverted" : ""}`).toBe(16);
        const seen = new Set(shifts.map((r) => `${r.timing}/${r.direction}`));
        expect([...seen], `${relationship}${inverted ? " inverted" : ""}`).toEqual([
          TND_WIRE[HAND_RELATIONSHIP_TND[relationship]],
        ]);
      }
    }
  });
});
