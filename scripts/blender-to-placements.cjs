// Converts Blender-exported placement JSON → placements.ts
// Uses EXACT Blender world-space transforms for perfect fidelity.
// Run: node scripts/blender-to-placements.cjs

const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "ocean-blender-placements.json");
const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

function rd(n) {
  return Math.round(n * 100) / 100;
}

function fmtArr(arr) {
  return `[${arr.map(v => rd(v)).join(", ")}]`;
}

const placements = data.placements.map((p, i) => {
  const id = `ocean-${i.toString().padStart(4, "0")}`;
  return {
    id,
    objectKey: p.objectKey,
    position: p.position.map(v => rd(v)),
    rotation: p.rotation.map(v => rd(v)),
    scale: p.scale.map(v => rd(v)),
  };
});

const lines = placements.map((p) => {
  return `\t{ id: "${p.id}", objectKey: "${p.objectKey}", position: ${fmtArr(p.position)}, rotation: ${fmtArr(p.rotation)}, scale: ${fmtArr(p.scale)} },`;
});

const output = `import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";

// Exported from Blender ocean_scene.blend — exact world-space transforms.
// Source: scripts/blender-export-placements.py → scripts/ocean-blender-placements.json
// Re-export: node scripts/blender-to-placements.cjs
// Total: ${placements.length} placements

// <!-- PLACEMENTS_START -->
export const OCEAN_PLACEMENTS: ComposerPlacement[] = [
${lines.join("\n")}
];
// <!-- PLACEMENTS_END -->
`;

const outPath = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "shared",
  "3d",
  "environments",
  "scenes",
  "ocean",
  "authored",
  "placements.ts"
);

fs.writeFileSync(outPath, output, "utf-8");
console.log(`Wrote ${placements.length} placements to:\n  ${outPath}`);

// Summary by objectKey
const categories = {};
for (const p of placements) {
  categories[p.objectKey] = (categories[p.objectKey] || 0) + 1;
}
console.log("\nBreakdown:");
for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
