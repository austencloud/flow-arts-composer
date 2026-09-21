/**
 * SkewedPictographDataframe.csv must carry every skewed-frame beat (start
 * position zeta/eta) lettered exactly as the classifier letters it. The
 * generator writes the file; this pins the file to the code so neither drifts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  classifySkewedFrameLetter,
  SKEWED_FRAME_LETTERS,
  type SkewFrameLocation,
  type SkewFrameMotionType,
} from "$lib/shared/pictograph/skew/skewed-frame-letter";

const csvPath = resolve(__dirname, "../../../static/data/pictographs/SkewedPictographDataframe.csv");
const lines = readFileSync(csvPath, "utf8").split("\n").filter((line) => line.trim());
const header = lines[0]!.split(",").map((key) => key.trim());
const rows = lines.slice(1).map((line) => {
  const values = line.split(",");
  return Object.fromEntries(header.map((key, index) => [key, (values[index] ?? "").trim()]));
});
const frameRows = rows.filter((row) => /^(zeta|eta)\d+$/.test(row.startPlacement!));

const ORDER = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
function pathDirection(start: string, end: string): "cw" | "ccw" | "noRotation" {
  const delta = (ORDER.indexOf(end) - ORDER.indexOf(start) + 8) % 8;
  if (delta === 2) return "cw";
  if (delta === 6) return "ccw";
  return "noRotation";
}

describe("skewed-frame dataframe rows", () => {
  it("holds all 1152 skewed-frame beats plus the 5120 entry rows", () => {
    expect(frameRows.length).toBe(1152);
    expect(rows.length).toBe(6272);
  });

  it("letters each row exactly as the classifier does", () => {
    for (const row of frameRows) {
      const letter = classifySkewedFrameLetter({
        left: {
          motionType: row.blueMotionType as SkewFrameMotionType,
          startLocation: row.blueStartLocation as SkewFrameLocation,
          endLocation: row.blueEndLocation as SkewFrameLocation,
        },
        right: {
          motionType: row.redMotionType as SkewFrameMotionType,
          startLocation: row.redStartLocation as SkewFrameLocation,
          endLocation: row.redEndLocation as SkewFrameLocation,
        },
      });
      expect(letter, JSON.stringify(row)).toBe(row.letter);
    }
  });

  it("covers the 38-letter skewed alphabet and nothing else", () => {
    const letters = new Set(frameRows.map((row) => row.letter));
    expect([...letters].sort()).toEqual([...SKEWED_FRAME_LETTERS].sort());
  });

  it("is category 3 with no skew modifiers, ending in the frame", () => {
    for (const row of frameRows) {
      expect(row.category).toBe("3");
      expect(row.blueSkewDir).toBe("");
      expect(row.redSkewDir).toBe("");
      expect(row.blueSkewSteps).toBe("0");
      expect(row.redSkewSteps).toBe("0");
      expect(row.endPlacement).toMatch(/^(zeta|eta)\d+$/);
    }
  });

  it("uses the dataframe rotation convention: pro follows the hand path, anti opposes it", () => {
    const flip = { cw: "ccw", ccw: "cw", noRotation: "noRotation" } as const;
    for (const row of frameRows) {
      for (const hand of ["blue", "red"] as const) {
        const path = pathDirection(row[`${hand}StartLocation`]!, row[`${hand}EndLocation`]!);
        const type = row[`${hand}MotionType`];
        const expected = type === "pro" ? path : type === "anti" ? flip[path] : "noRotation";
        expect(row[`${hand}RotationDirection`], JSON.stringify(row)).toBe(expected);
        expect(row[`${hand}HandPath`]).toBe(
          type === "static" ? "static" : type === "dash" ? "dash" : path
        );
      }
    }
  });
});
