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
  // Grip Lab staff length (95ef2c3bff): Prop3D gives the fire double staff a
  // long-axis stretch of length / 0.9, its authored 900 mm. Shared staff
  // length: without a length of its own it now falls back to
  // userProportionsState.staffLength, as Staff3D does.
  // createRegistryWorkerProp applies the same stretch from options.length,
  // which the worker snapshot resolves the same way. MODEL_BUILD_LENGTHS in
  // scene-prop-catalog.ts records which models stretch, so the staff-grip lab
  // reports the length that is drawn; change it with the stretch.
  // Stick: Prop3D stretches the stick the same way, and swaps in the entry's
  // rightHandModelUrl for the red hand. createRegistryWorkerProp makes both
  // choices from STRETCHED_PROP_TYPES and its own rightHandModelUrl.
  "Prop3D.svelte":
    "6823e39d2150183267bd41b51bb6bc404b3d578dfeb2aa86887a80018e380a69",
  // Hand colors (d11b2ce06c): the component re-clones when the hand palette
  // changes. The worker recolors from the same live PROP_COLORS object and
  // rebuilds a performer whose snapshot handColors differ, so it already
  // matches. The unsquared scale and flipLongAxis were mirrored earlier.
  // lengthScaleY (95ef2c3bff) scales only the model transform's Y, which the
  // worker's model transform now does too.
  "GltfProp3D.svelte":
    "01fc59727841afb81bda5c9b86a6b8d9949f789f1faa2492696dc5f1095dc21b",
  // Flat-grip (43bf94fc40) and Star builds: the component picks the build's
  // own GLB through SEPARATE_BUILD_MODEL_URLS, and fanModelUrl() in
  // worker-gltf-props.ts makes the same choice from the same build.fanBuild
  // value, so the worker is already in parity. Hand colors (d11b2ce06c) paint
  // the cover and moon frame from the live hand palette; createFanModelWorkerProp
  // reads the same live PROP_PALETTES for both.
  "Fan3D.svelte":
    "2ee4c18f29f0048242fe702da10fb79a704430617f540ddf0dfc6f6be1853d06",
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
    "0b922d83644f0f28acae6e46341df7177e779e0c372c82c7c353a48a848c14e9",
  "Hoop3D.svelte":
    "595e3b940deae41c5310333bf419fe35d9d050cd88c34b68b16d20ebdef2b8f2",
  "triangle-geometry.ts":
    "36762a38aeed51d029989565b91089b7e627652a06955f80429ad5ea75ef3d2d",
  "Triangle3D.svelte":
    "157d34332346f1c239a7d950ff4de389d48859fe78a9b87a0a0d9e1e924e0a91",
  "torch-profile.ts":
    "d9337b9071279ec8f22e109e26e12fcb1892211b3ce590da50a03cac385a4bc3",
  "triad-frame.ts":
    "bbace429119c54d5dba703cfdabe8b14ee1d8d767979c044c96ff1203d23f866",
  "prop-lathe.ts":
    "61dc933031955dcad74cb18bc799f24c8f14f3d2b2f0ee8a9c1b02942309ce9e",
  "plate-extrude.ts":
    "a983dcf9a18ebe678402743e7194dc3aaaed9eab5d3cf3e8f69f3e1c5bca0fb0",
  // Hand colors (d11b2ce06c): every part these paint with paintWithPropHand,
  // worker-prop-materials.ts paints the same way, including the plate edge's
  // 60% lerp toward the dark shade and the day frame's dark hub and lit tip.
  "plate-materials.ts":
    "802012b4eb486184939ecc7b51f4da29e154ec01dd7f6f72fefa81fe83b5fd45",
  "frame-materials.ts":
    "b87df4094b88553c53cf560df7f741655284c52894a48f4b631d8d87336c3ceb",
  // Stick: stick.glb for the left hand, stick-right.glb for the right, the
  // same pair worker-gltf-props.ts registers.
  "prop-model-registry.ts":
    "df5dad3b015a70acac80731e7ea7e81bfc6025639a39c7cb8a8b639fcf03247c",
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
