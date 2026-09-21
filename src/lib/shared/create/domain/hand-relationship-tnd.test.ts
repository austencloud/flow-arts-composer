/**
 * Each hand mode is one VTG timing/direction quadrant on the diamond grid.
 *
 * Direction asks whether the map is a reflection (a reflection reverses one
 * hand's arc). Timing asks how far the map moves the downbeat: identity and
 * the N-S mirror keep South fixed (Together), the 180 turn and the E-W flip
 * swap North and South (Split), the 90 degree turns and the diagonal
 * reflections move it a quarter (Quarter). On the box grid the two diagonal
 * reflections coincide with the 180 turn on some letters, so QO reads as
 * Quarter or Split there; every other mode is one quadrant on both grids.
 * This test reads the production dataframes so the claim can never drift
 * from the data the generator draws from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  handRelationshipHolds,
  type HandRelationshipOptions,
} from "@tka/sequence-engine/generation";
import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { HAND_MODE_MAPS } from "./hand-relationship";

interface RowMotion {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
}

interface Row {
  letter: string;
  timing: string;
  direction: string;
  left: RowMotion;
  right: RowMotion;
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
      left: {
        motionType: c[5]!,
        rotationDirection: c[6]!,
        startLocation: c[7]!,
        endLocation: c[8]!,
      },
      right: {
        motionType: c[9]!,
        rotationDirection: c[10]!,
        startLocation: c[11]!,
        endLocation: c[12]!,
      },
    }));
}

const SHIFTS = new Set(["pro", "anti"]);

function quadrantsHeld(rows: Row[], options: HandRelationshipOptions) {
  const held = rows.filter(
    (row) =>
      SHIFTS.has(row.left.motionType) &&
      SHIFTS.has(row.right.motionType) &&
      handRelationshipHolds(row.left as never, row.right as never, options)
  );
  return {
    count: held.length,
    quadrants: [
      ...new Set(held.map((row) => `${row.timing}/${row.direction}`)),
    ].sort(),
  };
}

const DIAMOND: Record<VtgMode, string[]> = {
  TS: ["tog/same"],
  SS: ["split/same"],
  QS: ["quarter/same"],
  TO: ["tog/opp"],
  SO: ["split/opp"],
  QO: ["quarter/opp"],
};

const BOX: Record<VtgMode, string[]> = {
  ...DIAMOND,
  QO: ["quarter/opp", "split/opp"],
};

const GRIDS = [
  ["DiamondPictographDataframe.csv", DIAMOND],
  ["BoxPictographDataframe.csv", BOX],
] as const;

describe("hand modes are the timing and direction quadrants", () => {
  for (const [file, expected] of GRIDS) {
    describe(file, () => {
      const rows = loadRows(file);
      const modes = Object.entries(HAND_MODE_MAPS) as [
        VtgMode,
        readonly string[],
      ][];
      for (const [mode, maps] of modes) {
        for (const map of maps) {
          for (const inverted of [false, true]) {
            const label = `${mode} via ${map}${inverted ? " inverted" : ""}`;
            it(`${label} holds 16 shift rows in ${expected[mode].join(" or ")}`, () => {
              const options = { map, inverted } as HandRelationshipOptions;
              const result = quadrantsHeld(rows, options);
              expect(result.count).toBe(16);
              expect(result.quadrants).toEqual(expected[mode]);
            });
          }
        }
      }
    });
  }
});
