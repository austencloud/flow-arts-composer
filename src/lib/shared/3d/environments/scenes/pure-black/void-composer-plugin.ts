import type { Mesh } from "three";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { createComposerCatalog } from "#lib/shared/3d/scene-composer/composer-catalog.js";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import type {
  SceneComposerPlugin,
  SurfaceRules,
} from "#lib/shared/3d/scene-composer/types.js";
import { VOID_PLACEMENTS } from "./placements";

const markers: ObjectDefinition[] = [
  {
    key: "void-cinder-lamp",
    name: "Cinder Lamp",
    type: "prop",
    icon: "fa-fire-flame-curved",
    modelPath: "/models/first-fire/props/cinder-lamp.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 0.8,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xc55a2d,
  },
  {
    key: "void-crystal",
    name: "Isolated Crystal",
    type: "prop",
    icon: "fa-gem",
    modelPath: "/models/cosmic/crystal-spire-cyan.glb",
    fallbackGeometry: "cone",
    defaultScale: 0.45,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x36cde0,
  },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    return mesh.geometry?.type === "CircleGeometry";
  },
  orientationMode: "upright",
  gridSize: 0.25,
  surfaceOffset: 0.01,
};

export const voidPlugin: SceneComposerPlugin = {
  sceneId: "void",
  displayName: "Pure Black Void",
  catalog: createComposerCatalog([
    {
      id: "markers",
      label: "Isolated Props",
      icon: "fa-square",
      items: markers,
    },
  ]),
  surfaceRules,
  getDefaults: () => [...VOID_PLACEMENTS],
  constraints: { maxObjects: 12, minSpacing: 0.5 },
};

composerRegistry.register(voidPlugin);
