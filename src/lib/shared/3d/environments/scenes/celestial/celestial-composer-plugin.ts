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
import { CELESTIAL_PLACEMENTS } from "./placements";

const accents: ObjectDefinition[] = [
  {
    key: "celestial-root-stone",
    name: "Cloudbreak Root Stone",
    type: "prop",
    icon: "fa-gem",
    fallbackGeometry: "sphere",
    defaultScale: 1.2,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xb9b3a2,
  },
  {
    key: "celestial-golden-lamp",
    name: "Golden Terrace Lamp",
    type: "prop",
    icon: "fa-lightbulb",
    modelPath: "/models/fixtures/lamp-classical.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 0.8,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0xd5b56c,
  },
];

const categories: CatalogCategory[] = [
  { id: "accents", label: "Terrace Accents", icon: "fa-star", items: accents },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    const value = `${mesh.name} ${mesh.userData?.tka_role ?? ""}`;
    return /terrace|surface|landmass|floor|island/i.test(value);
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.02,
};

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "celestial",
  editableRoles: new Set([
    "cloudbreak-root-stone",
    "cloudbreak-distant-mesa",
    "cloudbreak-distant-mesa-cap",
    "stage-fragment",
  ]),
  lockedRoles: new Set([
    "performance-floor",
    "cloudbreak-landmass",
    "cloudbreak-landmass-strata",
    "cloudbreak-weathered-surface",
    "cloudbreak-surface-stone",
    "cloudbreak-performance-terrace",
    "cloudbreak-lagoon-water",
    "cloudbreak-lagoon-rim",
    "cloudbreak-waterfall",
    "cloudbreak-olive-trunk",
    "cloudbreak-olive-canopy",
  ]),
  lockedNamePatterns: [
    /water|waterfall|floor|terrace|landmass|olive|stage|light/i,
  ],
});

export const celestialPlugin: SceneComposerPlugin = {
  sceneId: "celestial",
  displayName: "Seraphic Vault",
  catalog: createComposerCatalog(categories),
  surfaceRules,
  getDefaults: () => [...CELESTIAL_PLACEMENTS],
  constraints: { maxObjects: 80, minSpacing: 0.5 },
  nativeObjects,
};

composerRegistry.register(celestialPlugin);
