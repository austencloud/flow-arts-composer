import type { Mesh, Object3D } from "three";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { createComposerCatalog } from "#lib/shared/3d/scene-composer/composer-catalog.js";
import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import type {
  CatalogCategory,
  SceneComposerPlugin,
  SurfaceRules,
} from "#lib/shared/3d/scene-composer/types.js";
import { BLOSSOM_PLACEMENTS } from "./placements";

const flora: ObjectDefinition[] = [
  {
    key: "blossom-purple-flower",
    name: "Purple Flower",
    type: "prop",
    icon: "fa-spa",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xb878c8,
  },
  {
    key: "blossom-red-flower",
    name: "Red Flower",
    type: "prop",
    icon: "fa-spa",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xd86478,
  },
];

const stones: ObjectDefinition[] = [
  {
    key: "blossom-stepping-stone",
    name: "Garden Stone",
    type: "prop",
    icon: "fa-circle",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x77747f,
  },
  {
    key: "blossom-lantern",
    name: "Garden Lantern",
    type: "prop",
    icon: "fa-lightbulb",
    modelPath: "/models/fixtures/lamp-classical.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 0.8,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xd6b46f,
  },
];

const categories: CatalogCategory[] = [
  { id: "flora", label: "Flowers", icon: "fa-spa", items: flora },
  { id: "garden", label: "Garden Props", icon: "fa-torii-gate", items: stones },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    return /ground|terrain|floor|garden|island/i.test(mesh.name);
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.015,
};

function blossomInstanceIdentity(
  _object: Object3D,
  geometryName: string
): string {
  return geometryName
    .replace(/Sakura (?:Trunk|Cluster Crown)/i, "Sakura")
    .replace(/Stone Lantern (?:Body|Glow)/i, "Stone Lantern");
}

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "blossom",
  editableRoles: new Set(),
  lockedRoles: new Set(),
  editableNamePatterns: [/sakura|lantern/i],
  lockedNamePatterns: [/ground|pond|water|stage|platform|light/i],
  editableInstancePatterns: [/sakura|lantern/i],
  lockedInstancePatterns: [/pond edge|stepping stone/i],
  instanceIdentityName: blossomInstanceIdentity,
});

export const blossomPlugin: SceneComposerPlugin = {
  sceneId: "blossom",
  displayName: "Moonlit Blossom Grove",
  catalog: createComposerCatalog(categories),
  surfaceRules,
  getDefaults: () => [...BLOSSOM_PLACEMENTS],
  constraints: {
    maxObjects: 160,
    minSpacing: 0.25,
    exclusionZones: [
      { center: [0, 0, 0], radius: 4.5, reason: "Performance clearing" },
    ],
  },
  nativeObjects,
};

composerRegistry.register(blossomPlugin);
