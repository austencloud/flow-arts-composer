/**
 * Trigrid Pictograph Dataframe Generator
 *
 * Writes TrigridPictographDataframe.csv: every beat on the three-point grid
 * (n, se, sw), one row each. Three blue starts times three red starts, times
 * five moves per hand (hold, or shift one point either way as pro or anti;
 * three points have no opposite, so there is no dash) gives 225 beats:
 * 144 Type 1, 72 Type 2 and 9 Type 6.
 *
 * Types 1 and 2 are lettered by the multigrid rule,
 * src/lib/shared/pictograph/lettering/multigrid-lettering.ts, approved in
 * docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md. Type 6 is
 * β when both hands hold one point and γ when they hold two.
 *
 * Columns follow DiamondPictographDataframe.csv:
 * - Placements: beta1-3 put both hands on n, se, sw. gamma1-6 put
 *   (blue, red) on (n,se) (n,sw) (se,n) (se,sw) (sw,n) (sw,se).
 * - Rotation: pro turns with the hand path, anti against it, static has none.
 * - direction: same or opp when both hands shift, none otherwise.
 * - timing: the diamond's same-direction rows name the spacing they keep
 *   (tog 0, split 180, quarter 90) and its opposite-direction rows the axis
 *   the hands mirror across (tog vertical, split horizontal, quarter
 *   diagonal). A triangle has only the 0 spacing and only the vertical axis,
 *   so a row is tog when the hands travel together from one point or mirror
 *   each other across the vertical, and none otherwise.
 *
 * tests/unit/pictograph/trigrid-dataframe.test.ts pins the CSV to a fresh
 * generateTrigridRows() call. If the rule changes, rerun this script.
 *
 * Run with: npx tsx scripts/generate-trigrid-dataframe.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Letter } from "../src/lib/shared/foundation/domain/models/letter";
import {
  gridBeats,
  LETTER_GRIDS,
  letterOnGrid,
  type GridBeat,
  type GridHand,
} from "../src/lib/shared/pictograph/lettering/multigrid-lettering";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRIGRID = LETTER_GRIDS.trigrid;
const VERTICES = ["n", "se", "sw"] as const;

export const TRIGRID_CSV_COLUMNS = [
  "letter",
  "startPlacement",
  "endPlacement",
  "timing",
  "direction",
  "blueMotionType",
  "blueRotationDirection",
  "blueStartLocation",
  "blueEndLocation",
  "redMotionType",
  "redRotationDirection",
  "redStartLocation",
  "redEndLocation",
] as const;

export type TrigridRow = Record<(typeof TRIGRID_CSV_COLUMNS)[number], string>;

function placement(blue: number, red: number): string {
  if (blue === red) return `beta${blue + 1}`;
  return `gamma${blue * 2 + (red > blue ? red - 1 : red) + 1}`;
}

/** +1 clockwise, -1 counter-clockwise, 0 for a hold. */
function travel(hand: GridHand): number {
  const steps = (hand.end - hand.start + 3) % 3;
  return steps === 1 ? 1 : steps === 2 ? -1 : 0;
}

function rotation(hand: GridHand): string {
  const path = travel(hand);
  if (path === 0) return "noRotation";
  const turn = hand.motionType === "anti" ? -path : path;
  return turn > 0 ? "cw" : "ccw";
}

function direction(beat: GridBeat): string {
  const blue = travel(beat.blue);
  const red = travel(beat.red);
  if (blue === 0 || red === 0) return "none";
  return blue === red ? "same" : "opp";
}

function timing(beat: GridBeat): string {
  const { blue, red } = beat;
  switch (direction(beat)) {
    case "same":
      return blue.start === red.start ? "tog" : "none";
    case "opp":
      // Mirror images across the vertical sit at angles that sum to a whole
      // turn; the points are 120 degrees apart, so their indexes sum to 0 mod 3.
      return (blue.start + red.start) % 3 === 0 ? "tog" : "none";
    default:
      return "none";
  }
}

function trigridLetter(beat: GridBeat): Letter {
  const letter = letterOnGrid(TRIGRID, beat);
  if (letter) return letter;
  // No dash exists here, so the only beats outside Types 1 to 3 hold both hands.
  if (beat.blue.motionType !== "static" || beat.red.motionType !== "static") {
    throw new Error(`No trigrid letter for ${JSON.stringify(beat)}`);
  }
  return beat.blue.start === beat.red.start ? Letter.BETA : Letter.GAMMA;
}

const LETTER_ORDER: readonly string[] = Object.values(Letter);
const PLACEMENT_ORDER = [
  "beta1", "beta2", "beta3",
  "gamma1", "gamma2", "gamma3", "gamma4", "gamma5", "gamma6",
];
const MOTION_ORDER = ["pro", "anti", "static"];

function compareRows(a: TrigridRow, b: TrigridRow): number {
  return (
    LETTER_ORDER.indexOf(a.letter) - LETTER_ORDER.indexOf(b.letter) ||
    PLACEMENT_ORDER.indexOf(a.startPlacement) - PLACEMENT_ORDER.indexOf(b.startPlacement) ||
    PLACEMENT_ORDER.indexOf(a.endPlacement) - PLACEMENT_ORDER.indexOf(b.endPlacement) ||
    MOTION_ORDER.indexOf(a.blueMotionType) - MOTION_ORDER.indexOf(b.blueMotionType) ||
    MOTION_ORDER.indexOf(a.redMotionType) - MOTION_ORDER.indexOf(b.redMotionType)
  );
}

/** Every trigrid beat as a CSV row, sorted by letter, then placements, then motions. */
export function generateTrigridRows(): TrigridRow[] {
  const rows: TrigridRow[] = [];
  for (const beat of gridBeats(TRIGRID)) {
    const { blue, red } = beat;
    rows.push({
      letter: trigridLetter(beat),
      startPlacement: placement(blue.start, red.start),
      endPlacement: placement(blue.end, red.end),
      timing: timing(beat),
      direction: direction(beat),
      blueMotionType: blue.motionType,
      blueRotationDirection: rotation(blue),
      blueStartLocation: VERTICES[blue.start]!,
      blueEndLocation: VERTICES[blue.end]!,
      redMotionType: red.motionType,
      redRotationDirection: rotation(red),
      redStartLocation: VERTICES[red.start]!,
      redEndLocation: VERTICES[red.end]!,
    });
  }
  return rows.sort(compareRows);
}

export function toTrigridCsv(rows: readonly TrigridRow[]): string {
  const lines = rows.map((row) => TRIGRID_CSV_COLUMNS.map((column) => row[column]).join(","));
  return [TRIGRID_CSV_COLUMNS.join(","), ...lines].join("\n") + "\n";
}

function main() {
  const rows = generateTrigridRows();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.letter, (counts.get(row.letter) ?? 0) + 1);

  console.log(`Trigrid beats: ${rows.length}, letters: ${counts.size}`);
  console.log([...counts].map(([letter, count]) => `${letter} ${count}`).join(", "));

  const csv = toTrigridCsv(rows);
  if (process.argv.includes("--dry-run")) {
    console.log("\n[dry run] First rows:");
    console.log(csv.split("\n").slice(0, 8).join("\n"));
    return;
  }
  const outPath = path.join(__dirname, "..", "static", "data", "pictographs", "TrigridPictographDataframe.csv");
  fs.writeFileSync(outPath, csv, "utf-8");
  console.log(`Wrote ${outPath}`);
}

// Only run when invoked directly, not when a test imports generateTrigridRows.
const isEntryPoint =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntryPoint) {
  main();
}
