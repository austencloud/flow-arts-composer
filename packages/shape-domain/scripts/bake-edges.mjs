// Bakes the pictograph dataframes the letter lookup reads into JSON so the
// package needs no fetch. Run from packages/shape-domain after a CSV changes:
//   node scripts/bake-edges.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const STATIC = join(here, "../../../static/data/pictographs");
const OUT = join(here, "../src/letters");

// The CSV header (checked 2026-11-01, the same for both grids):
// letter,startPlacement,endPlacement,timing,direction,blueMotionType,
// blueRotationDirection,blueStartLocation,blueEndLocation,redMotionType,
// redRotationDirection,redStartLocation,redEndLocation
// The lookup's CsvEdge names the hands left/right; the CSV names them blue/red.
const RENAME = {
  blueMotionType: "leftMotionType",
  blueRotationDirection: "leftRotationDirection",
  blueStartLocation: "leftStartLocation",
  blueEndLocation: "leftEndLocation",
  redMotionType: "rightMotionType",
  redRotationDirection: "rightRotationDirection",
  redStartLocation: "rightStartLocation",
  redEndLocation: "rightEndLocation",
};

function bake(name, out) {
  const [head, ...rows] = readFileSync(join(STATIC, name), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const cols = head.split(",").map((c) => RENAME[c.trim()] ?? c.trim());
  const edges = rows.map((row) => {
    const cells = row.split(",").map((c) => c.trim());
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
  writeFileSync(join(OUT, out), `${JSON.stringify(edges)}\n`);
  console.log(`${out}: ${edges.length} edges`);
}

bake("DiamondPictographDataframe.csv", "diamond-edges.json");
bake("BoxPictographDataframe.csv", "box-edges.json");
