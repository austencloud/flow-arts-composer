/**
 * Freezes the renderer's SVG output for a fixed sample, so the move into
 * @austencloud/tka-pictograph can be checked byte for byte.
 * Run from mcp-server-pkg: npx tsx scripts/capture-pictograph-baseline.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
  getStandaloneRenderer,
  type PictographInput,
} from "../src/core/standalone-renderer.js";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, "../assets/data/pictographs/DiamondPictographDataframe.csv");
const outDir = join(here, "../../packages/tka-pictograph/tests/baseline");

const LETTERS = ["A", "β", "γ", "W-", "Φ-", "Λ"];
const TURNS: (number | "fl")[] = [0, 1, 2.5];
const PROPS = ["staff", "fan"];

const [header, ...lines] = readFileSync(csvPath, "utf-8").split(/\r?\n/);
const columns = header!.split(",");
const rows = lines
  .filter((line) => line.trim())
  .map((line) => Object.fromEntries(line.split(",").map((v, i) => [columns[i], v])));

function inputFor(letter: string, turns: number | "fl"): PictographInput {
  const row = rows.find((r) => r.letter === letter);
  if (!row) throw new Error(`No dataframe row for ${letter}`);
  const motion = (side: "blue" | "red", hand: "left" | "right") => ({
    motionType: row[`${side}MotionType`]!,
    rotationDirection: row[`${side}RotationDirection`] || "no_rotation",
    startLocation: row[`${side}StartLocation`]!,
    endLocation: row[`${side}EndLocation`]!,
    hand,
    turns,
    startOrientation: "in",
  });
  return {
    letter: row.letter!,
    startPlacement: row.startPlacement,
    endPlacement: row.endPlacement,
    leftMotion: motion("blue", "left"),
    rightMotion: motion("red", "right"),
  };
}

export const BASELINE_CASES: { name: string; input: PictographInput; prop: string }[] = [];
for (const letter of LETTERS) {
  for (const turns of TURNS) {
    for (const prop of PROPS) {
      BASELINE_CASES.push({ name: `${letter}-${turns}-${prop}`, input: inputFor(letter, turns), prop });
    }
  }
}
BASELINE_CASES.push({ name: "A-fl-staff", input: inputFor("A", "fl"), prop: "staff" });

mkdirSync(outDir, { recursive: true });
const renderer = getStandaloneRenderer();
const manifest: { name: string; input: PictographInput; prop: string }[] = [];
for (const c of BASELINE_CASES) {
  const svg = await renderer.renderToSvg(c.input, {
    darkMode: true,
    showTKA: true,
    leftPropType: c.prop,
    rightPropType: c.prop,
  });
  writeFileSync(join(outDir, `${c.name}.svg`), svg);
  manifest.push(c);
}
writeFileSync(join(outDir, "cases.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${manifest.length} baseline SVGs to ${outDir}`);
