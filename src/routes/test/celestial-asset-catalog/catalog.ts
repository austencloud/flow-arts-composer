export type CloudbreakCatalogView =
  | "front"
  | "rear"
  | "plan"
  | "trees"
  | "stone";

export type CloudbreakAssetKind = "tree" | "stone";

export type CloudbreakAssetVerdict =
  | "reuse"
  | "adapt"
  | "distant-only"
  | "exclude";

export interface CloudbreakAssetCandidate extends CloudbreakRenderableAsset {
  label: string;
  sourceLabel: string;
  kind: CloudbreakAssetKind;
  verdict: CloudbreakAssetVerdict;
  role: string;
  rationale: string;
  license: string;
  source: string;
  sizeBytes: number;
  renderVertexCount: number;
  sha256: string;
}

export type CloudbreakHuntMethod =
  | "Meshy multi-image"
  | "CC0 catalog"
  | "Blender modular"
  | "Runtime owner";

export interface CloudbreakHuntTarget {
  id: string;
  label: string;
  role: string;
  method: CloudbreakHuntMethod;
  priority:
    | "First"
    | "Second"
    | "After spatial approval"
    | "Complete"
    | "In progress";
  target: string;
  acceptance: string;
}

export const CLOUDBREAK_CATALOG_VIEWS: ReadonlyArray<{
  value: CloudbreakCatalogView;
  label: string;
}> = [
  { value: "front", label: "Front" },
  { value: "rear", label: "Rear" },
  { value: "plan", label: "Plan" },
  { value: "trees", label: "Trees" },
  { value: "stone", label: "Stone" },
];

export const CLOUDBREAK_ASSET_HUNT: ReadonlyArray<CloudbreakHuntTarget> = [
  {
    id: "ancient-olive-west",
    label: "Ancient olive, open crown",
    role: "Left stage frame",
    method: "Meshy multi-image",
    priority: "Complete",
    target:
      "A seven-metre ancient olive with a heavy three-leader trunk, exposed roots, silver-green leaves, and broad negative space through the crown.",
    acceptance:
      "Reads as olive at silhouette distance and leaves the performer band open in every registered front camera.",
  },
  {
    id: "windswept-olive-east",
    label: "Windswept olive, asymmetric crown",
    role: "Lagoon-side frame",
    method: "Meshy multi-image",
    priority: "Complete",
    target:
      "A six-metre old olive leaning away from the lagoon, with a twisted pale trunk, restrained leaf mass, and one directional crown gesture.",
    acceptance:
      "Pairs with the west olive without looking duplicated and keeps the lagoon edge legible from portrait and phone cameras.",
  },
  {
    id: "lagoon-limestone-outcrop",
    label: "Weathered lagoon ledge",
    role: "Hero water edge",
    method: "CC0 catalog",
    priority: "Complete",
    target:
      "Poly Haven Coast Rocks 05, optimized as a low weathered limestone ledge with undercut erosion, rounded fractures, and shallow shelves.",
    acceptance:
      "Keeps its shoreline silhouette below 110k triangles, survives warm relighting, and never sits as a loose boulder in the water channel.",
  },
  {
    id: "eroded-shelf-family",
    label: "Broken shoreline family",
    role: "Mesa caps and shelf edges",
    method: "CC0 catalog",
    priority: "Complete",
    target:
      "Poly Haven Sand Rocks Small 01 plus the existing Boulder 01, all using the same embedded Cloudbreak limestone material as the shelf.",
    acceptance:
      "Dresses the lagoon shoulders and distant shelves with varied silhouettes while keeping every hero scan under its scene budget.",
  },
  {
    id: "monumental-threshold",
    label: "Monumental threshold",
    role: "Rear spatial anchor",
    method: "Blender modular",
    priority: "In progress",
    target:
      "Two eroded limestone piers and a fractured lintel built to the approved 27 by 18 metre massing, with a nine metre opening and no classical ornament.",
    acceptance:
      "Reads as enormous beside a 1.75 metre figure, frames the worn path, and never turns the scene back into a religious or castle caricature.",
  },
  {
    id: "lagoon-optics",
    label: "Reflected lagoon optics",
    role: "Water material and reflection",
    method: "Runtime owner",
    priority: "Complete",
    target:
      "Compose the shared ReflectivePool and PlanarReflector owners with the approved six-point lagoon outline, restrained shoreline foam, and Cloudbreak sun direction.",
    acceptance:
      "Reflects sky, olives, mesas, and the angular sun with shallow turquoise absorption, restrained ripples, and no mirror-hole read.",
  },
  {
    id: "infinite-sun",
    label: "Angular sky sun",
    role: "Sun-mode hierarchy",
    method: "Runtime owner",
    priority: "Complete",
    target:
      "Use the shared camera-centred sky sun at a fixed angular diameter, with the same normalized direction driving clouds, water glints, and the directional key.",
    acceptance:
      "Shows no translation parallax while orbiting and reads as the source of every warm highlight in the scene.",
  },
];

export const CLOUDBREAK_ASSET_CATALOG: ReadonlyArray<CloudbreakAssetCandidate> =
  [
    {
      ...getCloudbreakRuntimeAsset("olive-west-ancient"),
      label: "Ancient open olive",
      sourceLabel: "Cloudbreak Olive West",
      kind: "tree",
      verdict: "reuse",
      role: "Primary western stage frame",
      rationale:
        "The heavy three-leader trunk gives the stage an ancient anchor while the open crown preserves sky and performer visibility.",
      license: "TKA generated asset",
      source: "Cloudbreak ImageGen turntable + Meshy 6 multi-image",
      sizeBytes: 1_856_428,
      renderVertexCount: 176_040,
      sha256:
        "5740bf0c1ae801b30c3d5eba73c84c78fa701cd4cf5142e4cc82fdcf20fbbd19",
    },
    {
      ...getCloudbreakRuntimeAsset("olive-east-windswept"),
      label: "Windswept olive",
      sourceLabel: "Cloudbreak Olive East",
      kind: "tree",
      verdict: "reuse",
      role: "Directional eastern stage frame",
      rationale:
        "The slimmer wind-shaped crown answers the western tree without looking duplicated and points attention back toward the stage.",
      license: "TKA generated asset",
      source: "Cloudbreak ImageGen turntable + Meshy 6 multi-image",
      sizeBytes: 1_742_348,
      renderVertexCount: 155_817,
      sha256:
        "9cd5a7f920d350c28a6aab748e1b5021fde44cc145efa5c53a5473931ed338ae",
    },
    {
      id: "forked-forest-elm",
      label: "Forked canopy",
      sourceLabel: "Forked Forest Elm",
      path: "/models/forest/trees/forked-forest-elm.glb",
      kind: "tree",
      verdict: "exclude",
      role: "Retired olive stand-in",
      rationale:
        "Its fork helped establish the target silhouette, but the custom ancient olive now supplies the right species, bark, and crown density.",
      license: "TKA generated asset",
      source: "Forest ImageGen + Meshy 6",
      sizeBytes: 1_138_220,
      renderVertexCount: 77_769,
      sha256:
        "a8d4441b12326b93e642cfc11260850ed08a49dec27662c4fdf406bab541a520",
      targetHeight: 5.9,
      materialGrade: "olive",
    },
    {
      id: "lush-canopy-oak",
      label: "Broad canopy",
      sourceLabel: "Lush Canopy Beech",
      path: "/models/forest/trees/lush-canopy-oak.glb",
      kind: "tree",
      verdict: "exclude",
      role: "Retired canopy stand-in",
      rationale:
        "The production detail remains useful elsewhere, but its lush woodland crown no longer belongs in Cloudbreak beside the purpose-built olives.",
      license: "TKA generated asset",
      source: "Forest ImageGen + Meshy 6",
      sizeBytes: 1_155_360,
      renderVertexCount: 95_985,
      sha256:
        "e84d844d61b09790b08f533fd712320d2ed1e0f91d06f507fae93c2df562c9d6",
      targetHeight: 5.6,
      materialGrade: "olive",
    },
    {
      id: "young-hornbeam",
      label: "Young canopy",
      sourceLabel: "Leafy Young Hornbeam",
      path: "/models/forest/trees/young-hornbeam.glb",
      kind: "tree",
      verdict: "distant-only",
      role: "Small mesa or depth tree",
      rationale:
        "Useful for a distant living accent. Its upright woodland habit is too generic to carry the foreground olive identity.",
      license: "TKA generated asset",
      source: "Forest ImageGen + Meshy 6",
      sizeBytes: 1_034_760,
      renderVertexCount: 53_853,
      sha256:
        "2ffa082358f6a7847f6438d23dd08c7dac7da63c5d45d3fa9750d330b1e2ce07",
      targetHeight: 3.7,
      materialGrade: "olive",
    },
    {
      id: "low-poly-oak",
      label: "Low-poly oak",
      sourceLabel: "Vegetation Pack Oak",
      path: "/models/vegetation/tree/tree_oak.glb",
      kind: "tree",
      verdict: "exclude",
      role: "Efficiency comparison",
      rationale:
        "Very cheap, but its faceted toy-like canopy breaks the scene's established material quality at every useful distance.",
      license: "Repository asset",
      source: "Legacy vegetation pack",
      sizeBytes: 14_644,
      renderVertexCount: 588,
      sha256:
        "d7fd8773674928c50c11b66d12c636d49bdcc15a8b1c7fbb98e6f63a3439a3f3",
      targetHeight: 4.8,
      materialGrade: "olive",
    },
    {
      ...getCloudbreakRuntimeAsset("coast-rocks-05"),
      label: "Weathered lagoon ledge",
      sourceLabel: "Poly Haven coast_rocks_05",
      kind: "stone",
      verdict: "reuse",
      role: "Primary lagoon shoreline",
      rationale:
        "Its long undercut ledge forms a convincing water edge without reading as a random boulder dropped into the channel.",
      license: "CC0",
      source: "Poly Haven; Cloudbreak-optimized",
      sizeBytes: 1_372_156,
      renderVertexCount: 305_691,
      sha256:
        "36e4a5fd6f19d1f0c4cf0aec686579e34025f8e755b0fa57212b4812699c1f81",
    },
    {
      ...getCloudbreakRuntimeAsset("sand-rocks-small-01"),
      label: "Broken shoreline cluster",
      sourceLabel: "Poly Haven sand_rocks_small_01",
      kind: "stone",
      verdict: "reuse",
      role: "Lagoon shoulder and transition",
      rationale:
        "The clustered scan breaks the opposite bank into smaller ledges while staying within the same natural erosion language.",
      license: "CC0",
      source: "Poly Haven; Cloudbreak-optimized",
      sizeBytes: 966_700,
      renderVertexCount: 254_205,
      sha256:
        "636eeff95a732ab7424a4c31bd39d295f682c7c47d821bd74482522917361cd7",
    },
    {
      id: "polyhaven-boulder",
      label: "Weathered boulder",
      sourceLabel: "Poly Haven boulder_01",
      path: "/models/ocean/polyhaven/boulder_01.glb",
      kind: "stone",
      verdict: "reuse",
      role: "Lagoon bank geometry",
      rationale:
        "The rounded erosion and readable mass survive a Cloudbreak limestone material. The geometry is already proven in the Autumn environment.",
      license: "CC0",
      source: "Poly Haven",
      sizeBytes: 1_586_880,
      renderVertexCount: 197_352,
      sha256:
        "235e62d87dcee6f2d5181b66237e4a70d57c71298b577604e6f23514403e130f",
      targetHeight: 1.7,
      materialGrade: "limestone",
    },
    {
      id: "polyhaven-rock",
      label: "Earth-tone rock",
      sourceLabel: "Poly Haven rock_07",
      path: "/models/ocean/polyhaven/rock_07.glb",
      kind: "stone",
      verdict: "reuse",
      role: "Shoulder-stone geometry",
      rationale:
        "Compact file, useful natural asymmetry, and enough surface detail for the stage edge once its dark source albedo is replaced.",
      license: "CC0",
      source: "Poly Haven",
      sizeBytes: 603_040,
      renderVertexCount: 44_382,
      sha256:
        "4293cd332f0a0bd34b6060261013254bc6f04d79066bda58ab26a1e342519018",
      targetHeight: 0.9,
      materialGrade: "limestone",
    },
    {
      id: "polyhaven-stone",
      label: "Small quartz stone",
      sourceLabel: "Poly Haven stone_01",
      path: "/models/ocean/polyhaven/stone_01.glb",
      kind: "stone",
      verdict: "exclude",
      role: "Detail-scale comparison",
      rationale:
        "The scan looks natural, but nearly 159k rendered vertices are hard to justify for a small repeated stone.",
      license: "CC0",
      source: "Poly Haven",
      sizeBytes: 1_061_828,
      renderVertexCount: 158_946,
      sha256:
        "356e20376b9320350f8ac67d6d8f8eb6f034ef8a9f8ed814013b4ce3a4d1e384",
      targetHeight: 0.45,
      materialGrade: "limestone",
    },
    {
      id: "low-poly-rock",
      label: "Low-poly rock",
      sourceLabel: "Vegetation Pack Rock A",
      path: "/models/vegetation/rock/rock_largeA.glb",
      kind: "stone",
      verdict: "distant-only",
      role: "Far mesa scatter",
      rationale:
        "Excellent budget geometry for tiny distant silhouettes. It is too faceted for the lagoon edge or performer shelf.",
      license: "Repository asset",
      source: "Legacy vegetation pack",
      sizeBytes: 7_552,
      renderVertexCount: 240,
      sha256:
        "6dd15390fd96501dcd1454765a17ba61dbbd8d47705dfe5149c8dd92b353ce25",
      targetHeight: 0.85,
      materialGrade: "limestone",
    },
  ];

export function assetsForView(
  view: CloudbreakCatalogView
): ReadonlyArray<CloudbreakAssetCandidate> {
  if (view === "trees") {
    return CLOUDBREAK_ASSET_CATALOG.filter((asset) => asset.kind === "tree");
  }
  if (view === "stone") {
    return CLOUDBREAK_ASSET_CATALOG.filter((asset) => asset.kind === "stone");
  }
  if (view === "rear" || view === "plan") return [];
  return CLOUDBREAK_ASSET_CATALOG.filter(
    (asset) => asset.verdict === "reuse" || asset.verdict === "adapt"
  );
}

export function formatCatalogBytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(2)} MB`;
}

export function formatCatalogVertices(vertices: number): string {
  return vertices >= 1_000
    ? `${Math.round(vertices / 1_000)}k vertices`
    : `${vertices} vertices`;
}
import {
  getCloudbreakRuntimeAsset,
  type CloudbreakRenderableAsset,
} from "#lib/shared/3d/environments/scenes/celestial/cloudbreak-assets.js";
