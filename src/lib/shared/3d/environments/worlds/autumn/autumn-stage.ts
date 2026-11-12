import { STAGE } from "@austencloud/scene-3d/worker";
import { STAGE_DIRECTION_CUE_ROLE } from "../../domain/stage-direction-cues";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from "three";

export interface AutumnStageOptions {
  width?: number;
  depth?: number;
  height?: number;
  groundY: number;
  stageZOffset?: number;
  showDirectionCues?: boolean;
}

export interface AutumnStage {
  object: Group;
  setGroundY(groundY: number): void;
  dispose(): void;
}

const PLANK_THICKNESS = 0.055;
const PLANK_WIDTH = 0.34;
const PLANK_GAP = 0.012;
const LEG_THICKNESS = 0.14;
const LEG_INSET = 0.22;
const SKIRT_HEIGHT = 0.11;
const SKIRT_THICKNESS = 0.05;
const STRIP_HEIGHT = 0.035;
const STRIP_WIDTH = 0.05;
const TORCH_HEIGHT = 1.4;
const TORCH_POST_RADIUS = 0.04;
const STAIR_WIDTH = 0.8;
const STAIR_DEPTH = 0.22;
const STEP_COUNT = 3;

const PLANK_COLORS = [
  "#40291d",
  "#4b3021",
  "#38241a",
  "#543524",
  "#432a1c",
  "#4a2d20",
] as const;

const CUE_PALETTE = {
  downstage: "#c88950",
  upstage: "#4f4968",
  right: "#8f5258",
  left: "#637b67",
  intensity: 0.32,
  toneMapped: true,
} as const;

/** Exact imperative form of Stage3D's Autumn appearance. */
export function createAutumnStage(options: AutumnStageOptions): AutumnStage {
  const width = options.width ?? 6;
  const depth = options.depth ?? 6;
  const height = options.height ?? STAGE.STAGE_DECK_HEIGHT;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const deckTop = height;
  const root = new Group();
  root.name = "autumn-stage";
  root.position.set(0, options.groundY, options.stageZOffset ?? 0);

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();

  function material(
    color: string,
    parameters: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}
  ): MeshStandardMaterial {
    const created = new MeshStandardMaterial({ color, ...parameters });
    materials.add(created);
    return created;
  }

  function mesh(
    name: string,
    geometry: BufferGeometry,
    surface: Material,
    position: readonly [number, number, number],
    options: { cast?: boolean; receive?: boolean } = {}
  ): Mesh {
    geometries.add(geometry);
    materials.add(surface);
    const created = new Mesh(geometry, surface);
    created.name = name;
    created.position.set(...position);
    created.castShadow = options.cast ?? false;
    created.receiveShadow = options.receive ?? false;
    root.add(created);
    return created;
  }

  const legCenterY = deckTop - PLANK_THICKNESS - height / 2 + 0.02;
  for (const [x, z] of [
    [halfWidth - LEG_INSET, halfDepth - LEG_INSET],
    [-(halfWidth - LEG_INSET), halfDepth - LEG_INSET],
    [halfWidth - LEG_INSET, -(halfDepth - LEG_INSET)],
    [-(halfWidth - LEG_INSET), -(halfDepth - LEG_INSET)],
  ] as const) {
    mesh(
      "autumn-stage-leg",
      new BoxGeometry(LEG_THICKNESS, height, LEG_THICKNESS),
      material("#3d2a18", { roughness: 0.92, metalness: 0.02 }),
      [x, legCenterY, z],
      { cast: true }
    );
  }

  const skirtCenterY = deckTop - PLANK_THICKNESS - SKIRT_HEIGHT / 2;
  const skirtInset = LEG_THICKNESS * 0.3;
  for (const [name, geometry, position] of [
    [
      "autumn-stage-front-skirt",
      new BoxGeometry(width - skirtInset * 2, SKIRT_HEIGHT, SKIRT_THICKNESS),
      [0, skirtCenterY, halfDepth - skirtInset],
    ],
    [
      "autumn-stage-back-skirt",
      new BoxGeometry(width - skirtInset * 2, SKIRT_HEIGHT, SKIRT_THICKNESS),
      [0, skirtCenterY, -(halfDepth - skirtInset)],
    ],
    [
      "autumn-stage-right-skirt",
      new BoxGeometry(SKIRT_THICKNESS, SKIRT_HEIGHT, depth - skirtInset * 2),
      [halfWidth - skirtInset, skirtCenterY, 0],
    ],
    [
      "autumn-stage-left-skirt",
      new BoxGeometry(SKIRT_THICKNESS, SKIRT_HEIGHT, depth - skirtInset * 2),
      [-(halfWidth - skirtInset), skirtCenterY, 0],
    ],
  ] as const) {
    mesh(name, geometry, material("#3d2a18", { roughness: 0.9 }), position);
  }

  const stride = PLANK_WIDTH + PLANK_GAP;
  const plankCount = Math.max(1, Math.round(depth / stride));
  const totalSpan = plankCount * PLANK_WIDTH + (plankCount - 1) * PLANK_GAP;
  const plankStart = -totalSpan / 2 + PLANK_WIDTH / 2;
  for (let index = 0; index < plankCount; index += 1) {
    mesh(
      `autumn-stage-plank-${index}`,
      new BoxGeometry(width, PLANK_THICKNESS, PLANK_WIDTH),
      material(PLANK_COLORS[index % PLANK_COLORS.length]!, {
        roughness: 0.88,
        metalness: 0.03,
      }),
      [0, deckTop - PLANK_THICKNESS / 2, plankStart + index * stride],
      { cast: true, receive: true }
    );
  }

  if (options.showDirectionCues ?? true) {
    function cue(
      name: string,
      color: string,
      intensity: number,
      geometry: BufferGeometry,
      position: readonly [number, number, number]
    ): void {
      const created = mesh(
        name,
        geometry,
        material(color, {
          emissive: new Color(color),
          emissiveIntensity: intensity * CUE_PALETTE.intensity,
          toneMapped: CUE_PALETTE.toneMapped,
        }),
        position
      );
      // Tagged like the Blender-exported cues so a recording can hide them.
      created.userData.tka_role = STAGE_DIRECTION_CUE_ROLE;
    }

    cue(
      "autumn-stage-downstage-cue",
      CUE_PALETTE.downstage,
      1.4,
      new BoxGeometry(width * 0.94, STRIP_HEIGHT, STRIP_WIDTH),
      [0, deckTop + STRIP_HEIGHT / 2, halfDepth - 0.01]
    );
    cue(
      "autumn-stage-upstage-cue",
      CUE_PALETTE.upstage,
      0.45,
      new BoxGeometry(width * 0.94, STRIP_HEIGHT, STRIP_WIDTH),
      [0, deckTop + STRIP_HEIGHT / 2, -(halfDepth - 0.01)]
    );
    cue(
      "autumn-stage-right-cue",
      CUE_PALETTE.right,
      0.75,
      new BoxGeometry(STRIP_WIDTH, STRIP_HEIGHT, depth * 0.94),
      [halfWidth - 0.01, deckTop + STRIP_HEIGHT / 2, 0]
    );
    cue(
      "autumn-stage-left-cue",
      CUE_PALETTE.left,
      0.75,
      new BoxGeometry(STRIP_WIDTH, STRIP_HEIGHT, depth * 0.94),
      [-(halfWidth - 0.01), deckTop + STRIP_HEIGHT / 2, 0]
    );
  }

  for (const x of [halfWidth, -halfWidth]) {
    mesh(
      "autumn-stage-torch-post",
      new CylinderGeometry(
        TORCH_POST_RADIUS,
        TORCH_POST_RADIUS * 1.3,
        TORCH_HEIGHT,
        8
      ),
      material("#3d2a18", { roughness: 0.9 }),
      [x, deckTop + TORCH_HEIGHT / 2, halfDepth]
    );
    mesh(
      "autumn-stage-torch-holder",
      new CylinderGeometry(0.08, 0.06, 0.1, 8),
      material("#2a1a0c", { roughness: 0.85, metalness: 0.15 }),
      [x, deckTop + TORCH_HEIGHT - 0.05, halfDepth]
    );
    mesh(
      "autumn-stage-torch-flame",
      new SphereGeometry(0.1, 8, 6),
      material("#ff8822", {
        emissive: new Color("#ff6600"),
        emissiveIntensity: 2.5,
        toneMapped: false,
      }),
      [x, deckTop + TORCH_HEIGHT + 0.08, halfDepth]
    );
    const light = new PointLight("#ff7722", 15, 8, 1.5);
    light.name = "autumn-stage-torch-light";
    light.position.set(x, deckTop + TORCH_HEIGHT + 0.15, halfDepth);
    root.add(light);
  }

  const stepHeight = deckTop / STEP_COUNT;
  for (let index = 0; index < STEP_COUNT; index += 1) {
    const top = deckTop - index * stepHeight;
    mesh(
      `autumn-stage-step-${index}`,
      new BoxGeometry(STAIR_WIDTH, stepHeight, STAIR_DEPTH),
      material(PLANK_COLORS[(index + 2) % PLANK_COLORS.length]!, {
        roughness: 0.88,
        metalness: 0.03,
      }),
      [0, top - stepHeight / 2, -(halfDepth + STAIR_DEPTH * (index + 0.5))],
      { cast: true, receive: true }
    );
  }

  let disposed = false;
  return {
    object: root,
    setGroundY(groundY) {
      root.position.y = groundY;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      root.clear();
    },
  };
}
