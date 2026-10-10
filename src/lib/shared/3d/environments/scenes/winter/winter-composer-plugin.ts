import type { Mesh } from "three";
import type { ObjectDefinition } from "#lib/shared/3d/procedural-engine/objects/object-catalog.js";
import { createComposerCatalog } from "#lib/shared/3d/scene-composer/composer-catalog.js";
import { createMetadataSceneObjectAdapter } from "#lib/shared/3d/scene-composer/metadata-scene-object-adapter.js";
import { composerRegistry } from "#lib/shared/3d/scene-composer/registry.js";
import { ManifestPersistence } from "#lib/shared/3d/scene-composer/persistence/manifest-persistence.js";
import type {
  CatalogCategory,
  ComposerPlacement,
  PlacementConstraints,
  SceneComposerPlugin,
  SceneObjectDescriptor,
  SurfaceRules,
} from "#lib/shared/3d/scene-composer/types.js";
import winterComposerManifest from "../../../../../../../scripts/winter-composer-placements.json";
import winterInstanceMap from "../../../../../../../scripts/winter-composer-instance-map.json";

const trees: ObjectDefinition[] = [
  {
    key: "winter-pine-tall",
    name: "Tall Snow Pine",
    type: "prop",
    icon: "fa-tree",
    modelPath: "/models/winter/tree_pineTallA.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x315544,
  },
  {
    key: "winter-pine-round",
    name: "Round Snow Pine",
    type: "prop",
    icon: "fa-tree",
    modelPath: "/models/winter/tree_pineRoundB.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x3f6752,
  },
  {
    key: "winter-pine-small",
    name: "Snow Sapling",
    type: "prop",
    icon: "fa-seedling",
    modelPath: "/models/winter/tree_pineSmallA.glb",
    fallbackGeometry: "cone",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x52745f,
  },
];

const groundProps: ObjectDefinition[] = [
  {
    key: "winter-rock-large-a",
    name: "Snow Rock A",
    type: "prop",
    icon: "fa-mountain",
    modelPath: "/models/winter/rock_largeA.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x77828a,
  },
  {
    key: "winter-rock-large-b",
    name: "Snow Rock B",
    type: "prop",
    icon: "fa-mountain",
    modelPath: "/models/winter/rock_largeB.glb",
    fallbackGeometry: "sphere",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x69757f,
  },
  {
    key: "winter-fallen-log",
    name: "Snow Log",
    type: "prop",
    icon: "fa-minus",
    modelPath: "/models/winter/log_large.glb",
    fallbackGeometry: "cylinder",
    defaultScale: 1,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x594332,
  },
];

const furnishings: ObjectDefinition[] = [
  {
    key: "winter-cedar-adirondack-chair",
    name: "Cedar Adirondack Chair",
    type: "prop",
    icon: "fa-chair",
    modelPath:
      "/models/winter/settlement/winter-cedar-adirondack-chair_raw.glb",
    fallbackGeometry: "box",
    defaultScale: 0.53,
    defaultHeight: 0,
    snapToGround: true,
    canRotate: true,
    canScale: true,
    color: 0x74563c,
  },
];

const categories: CatalogCategory[] = [
  { id: "trees", label: "Snow Trees", icon: "fa-tree", items: trees },
  {
    id: "ground-props",
    label: "Rocks and Deadwood",
    icon: "fa-mountain",
    items: groundProps,
  },
  {
    id: "furnishings",
    label: "Camp Furnishings",
    icon: "fa-chair",
    items: furnishings,
  },
];

const surfaceRules: SurfaceRules = {
  isSurface(mesh: Mesh): boolean {
    const name = `${mesh.name} ${mesh.userData?.tka_role ?? ""}`.toLowerCase();
    return /terrain|ground|snow|floor/.test(name);
  },
  orientationMode: "upright",
  gridSize: null,
  surfaceOffset: 0.02,
};

function distanceToSegment(
  x: number,
  z: number,
  start: [number, number],
  end: [number, number]
): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((x - start[0]) * dx + (z - start[1]) * dz) / lengthSquared
          )
        );
  return Math.hypot(x - (start[0] + t * dx), z - (start[1] + t * dz));
}

const protectedRoutes: Array<{
  points: [number, number][];
  halfWidth: number;
}> = [
  {
    points: [
      [8, 38],
      [5, 28],
      [2, 18],
      [0, 9],
    ],
    halfWidth: 3.5,
  },
  {
    points: [
      [-3.2, -4.2],
      [-6, -9],
      [-10, -16],
      [-15, -24],
      [-20, -32],
      [-24, -35],
    ],
    halfWidth: 2.85,
  },
  {
    points: [
      [-24, -35],
      [-27, -32],
      [-31, -30],
    ],
    halfWidth: 2.6,
  },
  {
    points: [
      [-5, -11],
      [2, -13],
      [8, -12],
    ],
    halfWidth: 2.3,
  },
];

export function validateWinterComposerPlacement(
  placement: ComposerPlacement
): string | null {
  const [x, , z] = placement.position;
  for (const route of protectedRoutes) {
    for (let index = 1; index < route.points.length; index += 1) {
      // Starting at 1 keeps both ends of the segment inside the array.
      const from = route.points[index - 1]!;
      const to = route.points[index]!;
      if (distanceToSegment(x, z, from, to) < route.halfWidth) {
        return "Protected settlement route";
      }
    }
  }
  return null;
}

const constraints: PlacementConstraints = {
  maxObjects: 700,
  minSpacing: 0.5,
  exclusionZones: [
    { center: [0, 0, 0], radius: 6.5, reason: "Performance stage" },
    { center: [16, 0, -10], radius: 7, reason: "Frozen pond" },
    { center: [-24, 0, -38], radius: 7, reason: "Lodge and yard" },
    { center: [-34, 0, -30], radius: 5.2, reason: "Caretaker hearth" },
  ],
  validate: validateWinterComposerPlacement,
};

const nativeObjects = createMetadataSceneObjectAdapter({
  sceneId: "winter",
  editableRoles: new Set([
    "rock",
    "deadwood",
    "stump",
    "settlement-seat",
    "settlement-hearth-stone",
    "settlement-hearth-fuel",
    "settlement-hearth-ember",
    "lodge-woodpile-log",
  ]),
  lockedRoles: new Set([
    "terrain",
    "settlement-path",
    "settlement-ramp",
    "settlement-lodge",
    "settlement-hearth",
    "settlement-hearth-contact-zone",
    "settlement-hearth-mineral-bed",
    "settlement-hearth-ash-bed",
  ]),
  lockedNamePatterns: [/terrain|path|ramp|lodge|pond|stage|platform|light/i],
  editableInstancePatterns: [/.+/],
  instanceDescriptorsByMatrixKey:
    winterInstanceMap.instancesByMatrixKey as Record<
      string,
      SceneObjectDescriptor
    >,
});

export const winterPlugin: SceneComposerPlugin = {
  sceneId: "winter",
  displayName: "Moonlit Winter Hollow",
  catalog: createComposerCatalog(categories),
  surfaceRules,
  getDefaults: () => [
    ...(winterComposerManifest.placements as ComposerPlacement[]),
  ],
  constraints,
  nativeObjects,
  persistence: new ManifestPersistence(),
};

composerRegistry.register(winterPlugin);
