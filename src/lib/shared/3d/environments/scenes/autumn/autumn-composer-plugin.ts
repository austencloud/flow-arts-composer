import type { Mesh } from "three";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import type {
  SceneComposerPlugin,
  ComposerCatalog,
  CatalogCategory,
  SurfaceRules,
  PlacementConstraints,
  ComposerPlacement,
} from "#lib/shared/3d/scene-composer/types.js";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { AUTUMN_PLACEMENTS } from "./placements";
import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";

const vegetationItems: ObjectDefinition[] = [
  {
    key: "oak-tree",
    name: "Oak Tree",
    type: "prop",
    icon: "fa-tree",
    modelPath: "/models/autumn/hero-tree-a.glb",
    fallbackGeometry: "cone",
    defaultScale: 1.5,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xc87533,
  },
  {
    key: "birch-tree",
    name: "Birch Tree",
    type: "prop",
    icon: "fa-tree",
    modelPath: "/models/autumn/hero-tree-b.glb",
    fallbackGeometry: "cone",
    defaultScale: 1.2,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xe8c170,
  },
  {
    key: "bush-large",
    name: "Large Bush",
    type: "prop",
    icon: "fa-leaf",
    modelPath: "/models/autumn/fern-clump.glb",
    fallbackGeometry: "sphere",
    defaultScale: 0.6,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: false,
    canScale: true,
    color: 0x8b6914,
  },
  {
    key: "bush-small",
    name: "Small Bush",
    type: "prop",
    icon: "fa-seedling",
    modelPath: "/models/autumn/fern-clump.glb",
    fallbackGeometry: "sphere",
    defaultScale: 0.3,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: false,
    canScale: true,
    color: 0xa07828,
  },
  {
    key: "mushroom-cluster",
    name: "Small Mushroom Drift",
    type: "prop",
    icon: "fa-fan",
    modelPath: "/models/autumn/mushroom-grove.glb",
    fallbackGeometry: "sphere",
    defaultScale: 0.08,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xd4a574,
  },
];

const terrainItems: ObjectDefinition[] = [
  {
    key: "rock-large",
    name: "Large Rock",
    type: "prop",
    icon: "fa-mountain",
    fallbackGeometry: "sphere",
    defaultScale: 0.5,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x6b6b6b,
  },
  {
    key: "rock-small",
    name: "Small Rock",
    type: "prop",
    icon: "fa-gem",
    fallbackGeometry: "sphere",
    defaultScale: 0.2,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x7a7a7a,
  },
  {
    key: "fallen-log",
    name: "Fallen Log",
    type: "prop",
    icon: "fa-minus",
    modelPath: "/models/autumn/fallen-log.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 0.4,
    defaultHeight: 0.1,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x5c3a1e,
  },
];

const atmosphereItems: ObjectDefinition[] = [
  {
    key: "campfire",
    name: "Campfire",
    type: "prop",
    icon: "fa-fire",
    fallbackGeometry: "cylinder",
    defaultScale: 0.4,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: false,
    canScale: true,
    color: 0xcc5500,
  },
  {
    key: "lantern",
    name: "Lantern",
    type: "prop",
    icon: "fa-lightbulb",
    fallbackGeometry: "sphere",
    defaultScale: 0.15,
    defaultHeight: 0.3,
    snapToGround: true,
    canRotate: false,
    canScale: true,
    color: 0xffcc44,
  },
  {
    key: "mist-patch",
    name: "Mist Patch",
    type: "zone",
    icon: "fa-cloud",
    fallbackGeometry: "cylinder",
    defaultScale: 1.5,
    defaultHeight: 0.05,
    snapToGround: true,
    canRotate: false,
    canScale: true,
    color: 0xcccccc,
  },
];

const categories: CatalogCategory[] = [
  {
    id: "vegetation",
    label: "Vegetation",
    icon: "fa-tree",
    items: vegetationItems,
  },
  { id: "terrain", label: "Terrain", icon: "fa-mountain", items: terrainItems },
  {
    id: "atmosphere",
    label: "Atmosphere",
    icon: "fa-fire",
    items: atmosphereItems,
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
      name.includes("terrain") ||
      name.includes("floor")
    );
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.02,
};

const constraints: PlacementConstraints = {
  maxObjects: 200,
  minSpacing: 0.5,
};

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "autumn",
  editableRoles: new Set(["settlement-detail"]),
  lockedRoles: new Set(["terrain", "settlement-path", "settlement-stage"]),
  lockedNamePatterns: [/terrain|ground|floor|path|stage|pond|water/i],
  editableInstancePatterns: [/.+/],
});

const autumnPlugin: SceneComposerPlugin = {
  sceneId: "autumn",
  displayName: "Autumn Forest",
  catalog,
  surfaceRules,
  getDefaults(): ComposerPlacement[] {
    return [...AUTUMN_PLACEMENTS];
  },
  constraints,
  nativeObjects,
};

composerRegistry.register(autumnPlugin);

export { autumnPlugin };
