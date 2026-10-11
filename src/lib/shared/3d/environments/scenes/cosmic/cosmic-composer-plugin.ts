import type { Mesh } from "three";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import type {
  SceneComposerPlugin,
  ComposerCatalog,
  CatalogCategory,
  SurfaceRules,
  PlacementConstraints,
} from "#lib/shared/3d/scene-composer/types.js";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { COSMIC_PLACEMENTS } from "./placements";
import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";

const spireItems: ObjectDefinition[] = [
  {
    key: "crystal-spire-prismatic",
    name: "Prismatic Spire",
    type: "prop",
    icon: "fa-gem",
    modelPath: "/models/cosmic/crystal-spire-prismatic.glb",
    fallbackGeometry: "cone",
    defaultScale: 2.0,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x88ccff,
  },
  {
    key: "crystal-spire-cyan",
    name: "Cyan Spire",
    type: "prop",
    icon: "fa-gem",
    modelPath: "/models/cosmic/crystal-spire-cyan.glb",
    fallbackGeometry: "cone",
    defaultScale: 2.0,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x22ccdd,
  },
  {
    key: "crystal-spire-amethyst",
    name: "Amethyst Spire",
    type: "prop",
    icon: "fa-gem",
    modelPath: "/models/cosmic/crystal-spire-amethyst.glb",
    fallbackGeometry: "cone",
    defaultScale: 2.2,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x9944cc,
  },
  {
    key: "crystal-pyramid-blue",
    name: "Blue Pyramid",
    type: "prop",
    icon: "fa-gem",
    modelPath: "/models/cosmic/crystal-pyramid-blue.glb",
    fallbackGeometry: "cone",
    defaultScale: 2.0,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x2266cc,
  },
];

const clusterItems: ObjectDefinition[] = [
  {
    key: "crystal-cluster-aurora",
    name: "Aurora Cluster",
    type: "prop",
    icon: "fa-diamond",
    modelPath: "/models/cosmic/crystal-cluster-aurora.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1.5,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x00ccaa,
  },
  {
    key: "crystal-cluster-emerald",
    name: "Emerald Cluster",
    type: "prop",
    icon: "fa-diamond",
    modelPath: "/models/cosmic/crystal-cluster-emerald.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1.5,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x22aa66,
  },
  {
    key: "crystal-branch-moonlit",
    name: "Moonlit Branch",
    type: "prop",
    icon: "fa-snowflake",
    modelPath: "/models/cosmic/crystal-branch-moonlit.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 1.8,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xaabbdd,
  },
];

const categories: CatalogCategory[] = [
  { id: "spires", label: "Spires", icon: "fa-gem", items: spireItems },
  {
    id: "clusters",
    label: "Clusters",
    icon: "fa-diamond",
    items: clusterItems,
  },
];

const allItems = categories.flatMap((c) => c.items);

const catalog: ComposerCatalog = {
  categories,
  getDefinition(key: string) {
    return allItems.find((d) => d.key === key);
  },
  allItems() {
    return allItems;
  },
};

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    const name = (mesh.name ?? "").toLowerCase();
    return (
      name.includes("ground") ||
      name.includes("lunar") ||
      name.includes("terrain") ||
      name.includes("floor") ||
      name.includes("platform")
    );
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.02,
};

const constraints: PlacementConstraints = {
  maxObjects: 100,
  minSpacing: 0.8,
  exclusionZones: [
    {
      center: [0, 0, 0],
      radius: 5,
      reason: "Performance stage — keep clear for performers",
    },
  ],
};

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "cosmic",
  editableRoles: new Set(),
  lockedRoles: new Set(),
  lockedNamePatterns: [/stage|platform|terrain|reliquary/i],
});

const cosmicPlugin: SceneComposerPlugin = {
  sceneId: "cosmic",
  displayName: "Cosmic Crystal Garden",
  catalog,
  surfaceRules,
  getDefaults: () =>
    COSMIC_PLACEMENTS.map((placement) => ({
      ...placement,
      source: "native" as const,
    })),
  constraints,
  nativeObjects,
};

composerRegistry.register(cosmicPlugin);

export { cosmicPlugin };
