/**
 * Export the Root Terrace (Earth wing) Blender build manifest.
 *
 * The layout authority is buildEarthRootTerraceLayout over the compiled
 * Vulcan Cave grid — the same call physics and the runtime component consume.
 * This script serialises the Blender-frame contract into a hash-stamped JSON
 * file for scripts/build-earth-root-terrace-graybox.py. Never hand-edit the
 * JSON; regenerate it from here.
 *
 *   pnpm exec tsx scripts/export-earth-root-terrace-blender-plan.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledEarthRootTerraceBlenderContract } from "../src/lib/features/museum/data/earth-root-terrace-blender-contract";
import { canonicalJSON } from "../src/lib/shared/foundation/utils/canonical-json";

export const EARTH_ROOT_TERRACE_BLENDER_MANIFEST_PATH = resolve(
  "docs/superpowers/specs/earth-root-terrace/earth-root-terrace-blender-plan.json"
);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createEarthRootTerraceBlenderManifest() {
  const contract = buildCompiledEarthRootTerraceBlenderContract();
  return {
    hashAlgorithm: "sha256" as const,
    sourceDigest: sha256(canonicalJSON(contract)),
    contract,
  };
}

export function exportEarthRootTerraceBlenderManifest(
  outputPath = EARTH_ROOT_TERRACE_BLENDER_MANIFEST_PATH
): void {
  const manifest = createEarthRootTerraceBlenderManifest();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${canonicalJSON(manifest)}\n`, "utf8");
  console.log(`Root Terrace Blender plan: ${outputPath}`);
  console.log(`Source digest: ${manifest.sourceDigest}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  exportEarthRootTerraceBlenderManifest();
}
