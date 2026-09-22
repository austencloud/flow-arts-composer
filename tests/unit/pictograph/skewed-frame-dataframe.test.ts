/**
 * SkewedPictographDataframe.csv must carry every skewed-frame beat (start
 * position zeta/eta) lettered exactly as the classifier letters it. The
 * generator writes the file; this pins the file to the code by re-running
 * generateSkewedFrameRows() and comparing it to the CSV row for row, so
 * neither drifts silently.
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
import {
  generateSkewedFrameRows,
  type SkewedRow,
} from "../../../scripts/generate-skewed-dataframe";

const csvPath = resolve(
  __dirname,
  "../../../static/data/pictographs/SkewedPictographDataframe.csv"
);
const lines = readFileSync(csvPath, "utf8")
  .split("\n")
  .filter((line) => line.trim());
const header = lines[0]!.split(",").map((key) => key.trim());
const rows = lines.slice(1).map((line) => {
  const values = line.split(",");
  return Object.fromEntries(
    header.map((key, index) => [key, (values[index] ?? "").trim()])
  );
});
const frameRows = rows.filter((row) =>
  /^(zeta|eta)\d+$/.test(row.startPlacement!)
);

// Reshape a freshly generated row into the same string-keyed CSV column shape
// the parser above produces, so the two can be compared with toEqual.
function toCsvShape(row: SkewedRow): Record<string, string> {
  return {
    letter: row.letter,
    startPlacement: row.startPlacement,
    endPlacement: row.endPlacement,
    timing: row.timing,
    direction: row.direction,
    blueMotionType: row.leftMotionType,
    blueRotationDirection: row.leftRotationDirection,
    blueSkewDir: row.leftSkewDir,
    blueHandPath: row.leftHandPath,
    blueSkewSteps: String(row.leftSkewSteps),
    blueStartLocation: row.leftStartLocation,
    blueEndLocation: row.leftEndLocation,
    redMotionType: row.rightMotionType,
    redRotationDirection: row.rightRotationDirection,
    redSkewDir: row.rightSkewDir,
    redHandPath: row.rightHandPath,
    redSkewSteps: String(row.rightSkewSteps),
    redStartLocation: row.rightStartLocation,
    redEndLocation: row.rightEndLocation,
    category: String(row.category),
  };
}

// Stable sort key so the CSV rows (in file order) and the freshly generated
// rows (in generation order) line up for a column-for-column comparison even
// if either order ever changes.
function stableKey(row: Record<string, string>): string {
  return [
    row.startPlacement,
    row.blueMotionType,
    row.blueStartLocation,
    row.blueEndLocation,
    row.redMotionType,
    row.redStartLocation,
    row.redEndLocation,
  ].join("|");
}

const freshFrameRows = generateSkewedFrameRows().map(toCsvShape);

// Independent oracle for the rotation-direction assertions below: computed
// straight from the 8-point location cycle, not from the generator's own
// frameRotationDirection/frameHandPath helpers. The full-row comparison test
// above only proves the generator agrees with itself and with the CSV; this
// proves the CSV's rotation convention is actually correct against the
// dataframe's own geometry, independent of how the generator derives it.
const ORDER = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
function pathDirection(
  start: string,
  end: string
): "cw" | "ccw" | "noRotation" {
  const delta = (ORDER.indexOf(end) - ORDER.indexOf(start) + 8) % 8;
  if (delta === 2) return "cw";
  if (delta === 6) return "ccw";
  return "noRotation";
}

describe("skewed-frame dataframe rows", () => {
  it("has exactly 1152 category-3 skewed-frame rows", () => {
    expect(rows.filter((row) => row.category === "3")).toHaveLength(1152);
  });

  it("keeps 6272 total rows: 5120 category 1/2 entries plus 1152 category 3 frame rows", () => {
    expect(rows).toHaveLength(6272);
  });

  it("matches a freshly generated set of frame rows column for column", () => {
    const sortedCsv = [...frameRows].sort((a, b) =>
      stableKey(a).localeCompare(stableKey(b))
    );
    const sortedFresh = [...freshFrameRows].sort((a, b) =>
      stableKey(a).localeCompare(stableKey(b))
    );
    expect(sortedCsv).toEqual(sortedFresh);
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
        const path = pathDirection(
          row[`${hand}StartLocation`]!,
          row[`${hand}EndLocation`]!
        );
        const type = row[`${hand}MotionType`];
        const expected =
          type === "pro" ? path : type === "anti" ? flip[path] : "noRotation";
        expect(row[`${hand}RotationDirection`], JSON.stringify(row)).toBe(
          expected
        );
        expect(row[`${hand}HandPath`]).toBe(
          type === "static" ? "static" : type === "dash" ? "dash" : path
        );
      }
    }
  });
});
