import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const canonicalPropRoot = path.join(
  repoRoot,
  "node_modules/@austencloud/scene-3d/src/lib/components/props"
);

/**
 * Offscreen workers cannot mount the package's Svelte components, so the plain
 * Three.js factory carries their geometry tables. If the canonical prop changes
 * later, this fails loudly instead of letting the worker show an old silhouette
 * that still looks plausible.
 */
const CANONICAL_PROP_SOURCE_HASHES = {
  "Prop3D.svelte":
    "6bae71b6f5bd3274d7c022b1202cc61c5b76d22d048eaac7302f784218b47009",
  "GltfProp3D.svelte":
    "62a715d89eb98785be287061b9720bcf7cc88c4bd19731433b931902e06bd96b",
  // Flat-grip build (43bf94fc40): the component picks fan-flat-grip.glb, and
  // worker-prop-factory.ts plus worker-gltf-props.ts make the same choice from
  // the same build.fanBuild value, so the worker is already in parity.
  "Fan3D.svelte":
    "e0153c9447c163665314beeb56fee0324cc33d60a2dcb30e01ad4efadb58a6c7",
  "club-profile.ts":
    "23e6db6928f508be7b6b15d915a6fd5bf22365418708075390edae2e74e796b1",
  "fan-profile.ts":
    "e92a9d43b18e8d2259a34b3ad0f3f6a04bf2f9ef0b9ce6a06743c5c429661ed2",
  "geng-profile.ts":
    "942d4eae6034050faa5a9360608d0936dd09983f1e48e68e8f5899ee0b052555",
  "triquetra-profile.ts":
    "ce261974050ff47c1457524b54a953ba6e52e29ae6cbc2e3f56a90e7d10148f4",
  "eightrings-profile.ts":
    "c943eabe2b40464e514f396ef7bcf97c0fa961587eee7320425edb360f95a4a5",
  "hoop-geometry.ts":
    "5fdc56cb354a242428066c95b6f64891b10e709461d79f758aaf369d0e9be172",
  "torch-profile.ts":
    "d9337b9071279ec8f22e109e26e12fcb1892211b3ce590da50a03cac385a4bc3",
  "triad-frame.ts":
    "bbace429119c54d5dba703cfdabe8b14ee1d8d767979c044c96ff1203d23f866",
  "prop-lathe.ts":
    "61dc933031955dcad74cb18bc799f24c8f14f3d2b2f0ee8a9c1b02942309ce9e",
  "plate-extrude.ts":
    "a983dcf9a18ebe678402743e7194dc3aaaed9eab5d3cf3e8f69f3e1c5bca0fb0",
  "plate-materials.ts":
    "709956b8ee633bf32244344ca4d8f703f1dc92db06fee7e00e8b09f5bf4d45f0",
  "frame-materials.ts":
    "e395ac1f9319fab678a5c002fdd5b6b58de2422090aec8c6f741bb1bd0da8a72",
  "prop-model-registry.ts":
    "203495aac2e641cb0e69a1d467884d769eab7dd6bbdb1f4faf3dd5365800cd15",
  "prop-model-recolor.ts":
    "01f7cda639579236bf5cc45c3806f70b9967d5fa7a91c157f78959ad15f38813",
} as const;

describe("worker prop factory canonical source contract", () => {
  it("fails when a canonical prop implementation changes without a worker parity update", () => {
    for (const [relativePath, expected] of Object.entries(
      CANONICAL_PROP_SOURCE_HASHES
    )) {
      const source = readFileSync(
        path.join(canonicalPropRoot, relativePath),
        "utf8"
      );
      const actual = createHash("sha256").update(source).digest("hex");
      expect(actual, relativePath).toBe(expected);
    }
  });
});
