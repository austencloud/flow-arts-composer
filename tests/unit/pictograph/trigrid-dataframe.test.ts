/**
 * TrigridPictographDataframe.csv must hold every trigrid beat exactly once,
 * lettered by the multigrid rule. The generator writes the file; this pins
 * the file to the code by re-running generateTrigridRows(), and pins the
 * letter counts and column conventions independently of the generator.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  generateTrigridRows,
  toTrigridCsv,
  TRIGRID_CSV_COLUMNS,
} from "../../../scripts/generate-trigrid-dataframe";

const csvPath = resolve(__dirname, "../../../static/data/pictographs/TrigridPictographDataframe.csv");
const csvText = readFileSync(csvPath, "utf8");
const lines = csvText.split("\n").filter((line) => line.trim());
const header = lines[0]!.split(",");
const rows = lines.slice(1).map((line) => {
  const values = line.split(",");
  return Object.fromEntries(header.map((key, index) => [key, (values[index] ?? "").trim()]));
});

const VERTICES = ["n", "se", "sw"];
/** +1 clockwise, -1 counter-clockwise, 0 for a hold. */
function travel(start: string, end: string): number {
  const steps = (VERTICES.indexOf(end) - VERTICES.indexOf(start) + 3) % 3;
  return steps === 1 ? 1 : steps === 2 ? -1 : 0;
}

describe("trigrid dataframe", () => {
  it("is exactly what the generator writes today", () => {
    expect(header).toEqual([...TRIGRID_CSV_COLUMNS]);
    expect(csvText).toBe(toTrigridCsv(generateTrigridRows()));
  });

  it("has one row for each of the 225 trigrid beats", () => {
    const beats = new Set(
      rows.map((row) =>
        ["blue", "red"]
          .map((c) => `${row[`${c}MotionType`]}:${row[`${c}StartLocation`]}>${row[`${c}EndLocation`]}`)
          .join("|")
      )
    );
    expect(rows).toHaveLength(225);
    expect(beats.size).toBe(225);
  });

  it("has the approved letter counts", () => {
    // Worked out from the catalog in
    // docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md, not
    // from the generator: 3 points, 2 directions, and which hand is which.
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.letter!] = (counts[row.letter!] ?? 0) + 1;
    expect(counts).toEqual({
      D: 6, E: 6, F: 12, G: 6, H: 6, I: 12, J: 6, K: 6, L: 12, P: 6, Q: 6, R: 12,
      S: 12, T: 12, U: 12, V: 12, W: 12, X: 12, Y: 12, Z: 12, "Θ": 12, "Ω": 12,
      "β": 3, "γ": 6,
    });
  });

  it("names each placement by the hands' points", () => {
    const gammas = ["n,se", "n,sw", "se,n", "se,sw", "sw,n", "sw,se"];
    const name = (blue: string, red: string) =>
      blue === red
        ? `beta${VERTICES.indexOf(blue) + 1}`
        : `gamma${gammas.indexOf(`${blue},${red}`) + 1}`;
    for (const row of rows) {
      expect(row.startPlacement, JSON.stringify(row)).toBe(name(row.blueStartLocation!, row.redStartLocation!));
      expect(row.endPlacement, JSON.stringify(row)).toBe(name(row.blueEndLocation!, row.redEndLocation!));
    }
  });

  it("turns pro hands with their path and anti hands against it, as the diamond does", () => {
    for (const row of rows) {
      for (const c of ["blue", "red"]) {
        const path = travel(row[`${c}StartLocation`]!, row[`${c}EndLocation`]!);
        const motion = row[`${c}MotionType`];
        const turn = motion === "anti" ? -path : path;
        const expected = motion === "static" ? "noRotation" : turn > 0 ? "cw" : "ccw";
        expect(row[`${c}RotationDirection`], JSON.stringify(row)).toBe(expected);
      }
    }
  });

  it("marks direction and timing the way the diamond dataframe does", () => {
    const pairs: Record<string, number> = {};
    for (const row of rows) {
      const key = `${row.timing}/${row.direction}`;
      pairs[key] = (pairs[key] ?? 0) + 1;
    }
    // tog/same: G H I. tog/opp: the 24 opposite-direction beats whose hands
    // mirror each other across the vertical (from n, or from se and sw).
    expect(pairs).toEqual({ "tog/same": 24, "none/same": 48, "tog/opp": 24, "none/opp": 48, "none/none": 81 });
    for (const row of rows.filter((r) => r.timing === "tog" && r.direction === "same")) {
      expect(["G", "H", "I"]).toContain(row.letter);
    }
  });
});
