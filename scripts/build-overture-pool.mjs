// Builds static/boot/overture-pool.json, the Overture's cold-boot scenes,
// from authored sequences through the real mandala geometry calculator.
// Run by hand under tsx (it imports app TypeScript); the output is checked in
// and overture-pool.test.ts fails if it drifts from the geometry:
//
//   npx tsx scripts/build-overture-pool.mjs
//
// Design: docs/superpowers/specs/2026-10-26-boot-overture-design.md
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  OVERTURE_POOL_IDS,
  overturePoolSequence,
} from "../src/lib/shared/loading/overture/overture-pool-source.ts";
import { buildOvertureScene } from "../src/lib/shared/loading/overture/overture-snapshot.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "static/boot/overture-pool.json");

const scenes = OVERTURE_POOL_IDS.map((id) => {
  const sequence = overturePoolSequence(id);
  if (!sequence) throw new Error(`Unknown pool id ${id}`);
  const scene = buildOvertureScene(sequence, id);
  if (!scene) throw new Error(`No scene for ${id}`);
  return scene;
});

const json = JSON.stringify({ v: 1, scenes });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json + "\n");
for (const scene of scenes) {
  console.log(
    `${scene.id.padEnd(18)} ${scene.word.padEnd(18)} beats ${scene.beats} unit ${scene.unit}`
  );
}
console.log(
  `wrote ${out}: ${(json.length / 1024).toFixed(1)} KB, ${(gzipSync(json).length / 1024).toFixed(1)} KB gzipped`
);
