import type { Mesh } from "three";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { createComposerCatalog } from "#lib/shared/3d/scene-composer/composer-catalog.js";
import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import type {
  SceneComposerPlugin,
  SurfaceRules,
} from "#lib/shared/3d/scene-composer/types.js";
import { RAINBOW_PLACEMENTS } from "./placements";

const accents: ObjectDefinition[] = [
  {
    key: "rainbow-prismatic-spire",
    name: "Prismatic Spire",
    type: "prop",
    icon: "fa-gem",
    modelPath: "/models/cosmic/crystal-spire-prismatic.glb",
    fallbackGeometry: "cone",
    defaultScale: 0.7,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x9de8ff,
  },
  {
    key: "rainbow-crystal-plate",
    name: "Golden Crystal Plate",
    type: "prop",
    icon: "fa-diamond",
    modelPath: "/models/cosmic/crystal-plate-golden.glb",
    fallbackGeometry: "sphere",
    defaultScale: 0.6,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xffd46a,
  },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    return (
      /ground|floor|platform|prism/i.test(mesh.name) ||
      mesh.geometry?.type === "CircleGeometry"
    );
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.01,
};

export const rainbowPlugin: SceneComposerPlugin = {
  sceneId: "rainbow",
  displayName: "Rainbow Aurora",
  catalog: createComposerCatalog([
    {
      id: "accents",
      label: "Prismatic Accents",
      icon: "fa-rainbow",
      items: accents,
    },
  ]),
  surfaceRules,
  getDefaults: () => [...RAINBOW_PLACEMENTS],
  constraints: {
    maxObjects: 60,
    minSpacing: 0.5,
    exclusionZones: [
      { center: [0, 0, 0], radius: 4, reason: "Performance platform" },
    ],
  },
  nativeObjects: createMetadataSceneObjectAdapter({
    sceneId: "rainbow",
    editableRoles: new Set(),
    lockedRoles: new Set(),
    lockedNamePatterns: [/ground|floor|platform|prism|light/i],
  }),
};

composerRegistry.register(rainbowPlugin);
