import type { Mesh } from "three";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { createComposerCatalog } from "#lib/shared/3d/scene-composer/composer-catalog.js";
import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import type {
  CatalogCategory,
  SceneComposerPlugin,
  SurfaceRules,
} from "#lib/shared/3d/scene-composer/types.js";
import { FOREST_PLACEMENTS } from "./placements";

const treeItems: ObjectDefinition[] = [
  {
    key: "forest-lush-oak",
    name: "Natural Broad Canopy",
    type: "prop",
    icon: "fa-tree",
    modelPath:
      "/models/forest/trees/candidates/natural-tree-family-r1/jacaranda-tree.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x315a38,
  },
  {
    key: "forest-forked-elm",
    name: "Natural Gnarled Spreader",
    type: "prop",
    icon: "fa-tree",
    modelPath:
      "/models/forest/trees/candidates/natural-tree-family-r1/island-tree-01.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x3e6840,
  },
  {
    key: "forest-young-hornbeam",
    name: "Natural Understory Spreader",
    type: "prop",
    icon: "fa-seedling",
    modelPath:
      "/models/forest/trees/candidates/natural-tree-family-r1/island-tree-03.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x4f7548,
  },
];

const groundLifeItems: ObjectDefinition[] = [
  {
    key: "forest-mushroom-colony",
    name: "Chestnut Mushroom Colony",
    type: "prop",
    icon: "fa-fan",
    modelPath: "/models/forest/ground-life/chestnut-mushroom-colony.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x8a5a38,
  },
  {
    key: "forest-sedge",
    name: "Damp Sedge Tussock",
    type: "prop",
    icon: "fa-leaf",
    modelPath: "/models/forest/ground-life/damp-sedge-tussock.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x567447,
  },
  {
    key: "forest-hazel-shrub",
    name: "Woodland Hazel Shrub",
    type: "prop",
    icon: "fa-leaf",
    modelPath: "/models/forest/ground-life/woodland-hazel-shrub.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x496943,
  },
];

const categories: CatalogCategory[] = [
  { id: "trees", label: "Trees", icon: "fa-tree", items: treeItems },
  {
    id: "ground-life",
    label: "Ground Life",
    icon: "fa-leaf",
    items: groundLifeItems,
  },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    const value = `${mesh.name} ${mesh.userData?.tka_role ?? ""}`.toLowerCase();
    return /terrain|ground|floor|moss/.test(value);
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.02,
};

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "forest",
  editableRoles: new Set(["ground-module"]),
  lockedRoles: new Set(["terrain", "stage", "path"]),
  editableNamePatterns: [
    /tree|mushroom|sedge|fern|hazel|moss|root|twig|log|rock/i,
  ],
  lockedNamePatterns: [/terrain|ground-plane|stage|path|water|light/i],
  editableInstancePatterns: [/.+/],
});

export const forestPlugin: SceneComposerPlugin = {
  sceneId: "forest",
  displayName: "Moonlit Firefly Forest",
  catalog: createComposerCatalog(categories),
  surfaceRules,
  getDefaults: () => [...FOREST_PLACEMENTS],
  constraints: { maxObjects: 900, minSpacing: 0.35 },
  nativeObjects,
};

composerRegistry.register(forestPlugin);
