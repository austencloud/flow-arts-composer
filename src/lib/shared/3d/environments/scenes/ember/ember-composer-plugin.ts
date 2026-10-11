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
import { EMBER_PLACEMENTS } from "./placements";

const props: ObjectDefinition[] = [
  {
    key: "ember-obsidian-rock-a",
    name: "Obsidian Rock A",
    type: "prop",
    icon: "fa-mountain",
    modelPath: "/models/winter/rock_largeA.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1.4,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x1d1718,
  },
  {
    key: "ember-charred-log",
    name: "Charred Log",
    type: "prop",
    icon: "fa-minus",
    modelPath: "/models/camping/tree-log.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 0.7,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x241313,
  },
  {
    key: "ember-coal-cluster",
    name: "Coal Cluster",
    type: "prop",
    icon: "fa-fire",
    modelPath: "/models/first-fire/props/coal-lump-cluster-a.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x3c211d,
  },
  {
    key: "ember-cinder-lamp",
    name: "Cinder Lamp",
    type: "prop",
    icon: "fa-fire-flame-curved",
    modelPath: "/models/first-fire/props/cinder-lamp.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xb84a22,
  },
];

const categories: CatalogCategory[] = [
  {
    id: "volcanic-props",
    label: "Volcanic Props",
    icon: "fa-fire",
    items: props,
  },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    return /ground|terrain|crater|floor/i.test(mesh.name);
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.02,
};

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "ember",
  editableRoles: new Set(["rock", "deadwood"]),
  lockedRoles: new Set(),
  lockedNamePatterns: [/ground|crater|lava|river|platform|stage|fire|light/i],
});

export const emberPlugin: SceneComposerPlugin = {
  sceneId: "ember",
  displayName: "Ember Caldera",
  catalog: createComposerCatalog(categories),
  surfaceRules,
  getDefaults: () => [...EMBER_PLACEMENTS],
  constraints: {
    maxObjects: 120,
    minSpacing: 0.4,
    exclusionZones: [
      { center: [0, 0, 0], radius: 5.5, reason: "Performance platform" },
    ],
  },
  nativeObjects,
};

composerRegistry.register(emberPlugin);
