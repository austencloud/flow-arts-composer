// Seeds per-prop default arrow-placement datasets by copying the staff (root)
// JSON into <prop>/ subfolders. Idempotent: never clobbers a file that has
// already diverged from the staff source (i.e. been hand-tuned).
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GRIDS = ["diamond"];
const MOTIONS = ["pro", "anti", "float", "dash", "static"];

// Geometrically-distinct props that warrant their own dataset. Staff stays at
// root (it IS the seed source). Unlisted props fall back to staff at runtime.
// To add a prop: append its lowercased PropType value here and re-run.
const SEED_PROPS = [
  "fan",
  "bigfan",
  "club",
  "bigclub",
  "triad",
  "bigtriad",
  "minihoop",
  "bighoop",
  "triangle",
  "buugeng",
  "bigbuugeng",
  "doublestar",
  "bigdoublestar",
  "eightrings",
  "bigeightrings",
];

const baseDir = (grid) =>
  join(ROOT, "static/data/arrow_placement", grid, "default");
const staffPath = (grid, motion) =>
  join(baseDir(grid), `default_${grid}_${motion}_placements.json`);
const propPath = (grid, prop, motion) =>
  join(baseDir(grid), prop, `default_${grid}_${motion}_placements.json`);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

let written = 0,
  skipped = 0;
for (const grid of GRIDS) {
  for (const motion of MOTIONS) {
    const staff = await readFile(staffPath(grid, motion), "utf8");
    for (const prop of SEED_PROPS) {
      const target = propPath(grid, prop, motion);
      if (await exists(target)) {
        const current = await readFile(target, "utf8");
        if (current !== staff) {
          skipped++;
          continue;
        } // diverged = hand-tuned, leave it
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, staff);
      written++;
    }
  }
}
console.log(`seed-prop-defaults: wrote ${written}, skipped (tuned) ${skipped}`);
