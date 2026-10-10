import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveMotionType } from "#lib/shared/render/core/calculations/orientation.js";

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

const FILES = [
  "static/data/pictographs/DiamondPictographDataframe.csv",
  "static/data/pictographs/BoxPictographDataframe.csv",
];

describe("corpus parity: deriveMotionType reproduces stored motionType", () => {
  for (const file of FILES) {
    it(`matches every motion in ${file}`, () => {
      const rows = loadRows(file);
      expect(rows.length).toBeGreaterThan(100);
      const mismatches: string[] = [];
      for (const row of rows) {
        for (const color of ["blue", "red"] as const) {
          const stored = row[`${color}MotionType`];
          if (!stored) continue;
          const derived = deriveMotionType(
            row[`${color}StartLocation`]!,
            row[`${color}EndLocation`]!,
            row[`${color}RotationDirection`]!,
            0
          );
          if (derived !== stored) {
            mismatches.push(
              `${row.letter} ${color}: ${row[`${color}StartLocation`]}->${row[`${color}EndLocation`]} ` +
                `rot=${row[`${color}RotationDirection`]} stored=${stored} derived=${derived}`
            );
          }
        }
      }
      expect(mismatches, mismatches.slice(0, 20).join("\n")).toEqual([]);
    });
  }
});
