import {
  Color,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  type Material,
  type Object3D,
} from "three";
import {
  getPlateMaterials,
  PROP_PALETTES,
  TRAIL_GEOMETRY,
} from "./worker-prop-materials";
import type {
  CanonicalWorkerPropType,
  WorkerPropFactoryOptions,
  WorkerPropVisual,
} from "./worker-prop-factory-types";
import { CANONICAL_PROP_TYPE } from "./worker-prop-factory-types";

interface PropModelEntry {
  modelUrl: string;
  scale: number;
  gripOffsetY: number;
  flipLongAxis?: boolean;
}

const CHICKEN_GLB_LENGTH_M = 0.7779893;
const CHICKEN_GLB_HEAD_TIP_Y = 0.3810001;
const CHICKEN_NECK_GRIP_FRACTION = 0.059;
const CHICKEN_SMALL_LENGTH_M = 0.52;
const CHICKEN_BIG_LENGTH_M = 0.8636;
const CHICKEN_SMALL_SCALE = CHICKEN_SMALL_LENGTH_M / CHICKEN_GLB_LENGTH_M;
const CHICKEN_SMALL_GRIP_OFFSET_Y =
  CHICKEN_GLB_HEAD_TIP_Y * CHICKEN_SMALL_SCALE -
  CHICKEN_NECK_GRIP_FRACTION * CHICKEN_SMALL_LENGTH_M;

function model(
  filename: string,
  entry: Omit<PropModelEntry, "modelUrl">
): PropModelEntry {
  return { modelUrl: `/models/props/${filename}`, ...entry };
}

export const WORKER_PROP_MODEL_REGISTRY: Partial<
  Record<CanonicalWorkerPropType, PropModelEntry>
> = {
  [CANONICAL_PROP_TYPE.BUUGENG]: model("buugeng.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.CHICKEN]: model("chicken.glb", {
    scale: CHICKEN_SMALL_SCALE,
    gripOffsetY: CHICKEN_SMALL_GRIP_OFFSET_Y,
    flipLongAxis: true,
  }),
  [CANONICAL_PROP_TYPE.BIGCHICKEN]: model("chicken.glb", {
    scale: CHICKEN_BIG_LENGTH_M / CHICKEN_GLB_LENGTH_M,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.GUITAR]: model("guitar.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.UKULELE]: model("ukulele.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.SWORD]: model("sword.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.SICKLES]: model("sickles.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.TRIGENG]: model("trigeng.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.DOUBLESTAR]: model("doublestar.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.DOUBLECONTACTBALL]: model("double-contact-ball.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.CAPSULE_BATON]: model("capsule-baton.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
  [CANONICAL_PROP_TYPE.FIRE_DOUBLE_STAFF]: model("fire-double-staff.glb", {
    scale: 1,
    gripOffsetY: 0,
  }),
};

export interface WorkerPropModelResolution {
  entry: PropModelEntry;
  scale: number;
}

const MODEL_VARIANTS: Partial<
  Record<
    CanonicalWorkerPropType,
    { base: CanonicalWorkerPropType; scale: number }
  >
> = {
  [CANONICAL_PROP_TYPE.BIGBUUGENG]: {
    base: CANONICAL_PROP_TYPE.BUUGENG,
    scale: 1.4,
  },
  [CANONICAL_PROP_TYPE.BIGDOUBLESTAR]: {
    base: CANONICAL_PROP_TYPE.DOUBLESTAR,
    scale: 1.4,
  },
  [CANONICAL_PROP_TYPE.BIGDOUBLECONTACTBALL]: {
    base: CANONICAL_PROP_TYPE.DOUBLECONTACTBALL,
    scale: 1.4,
  },
};

export const REGISTRY_WORKER_PROP_TYPES = [
  CANONICAL_PROP_TYPE.BUUGENG,
  CANONICAL_PROP_TYPE.BIGBUUGENG,
  CANONICAL_PROP_TYPE.CHICKEN,
  CANONICAL_PROP_TYPE.BIGCHICKEN,
  CANONICAL_PROP_TYPE.GUITAR,
  CANONICAL_PROP_TYPE.UKULELE,
  CANONICAL_PROP_TYPE.SWORD,
  CANONICAL_PROP_TYPE.SICKLES,
  CANONICAL_PROP_TYPE.TRIGENG,
  CANONICAL_PROP_TYPE.DOUBLESTAR,
  CANONICAL_PROP_TYPE.BIGDOUBLESTAR,
  CANONICAL_PROP_TYPE.DOUBLECONTACTBALL,
  CANONICAL_PROP_TYPE.BIGDOUBLECONTACTBALL,
  CANONICAL_PROP_TYPE.CAPSULE_BATON,
  CANONICAL_PROP_TYPE.FIRE_DOUBLE_STAFF,
] as const;

export function resolveWorkerPropModel(
  propType: string
): WorkerPropModelResolution | null {
  const canonicalType = propType as CanonicalWorkerPropType;
  const direct = WORKER_PROP_MODEL_REGISTRY[canonicalType];
  if (direct) return { entry: direct, scale: direct.scale };

  const variant = MODEL_VARIANTS[canonicalType];
  if (!variant) return null;
  const base = WORKER_PROP_MODEL_REGISTRY[variant.base];
  return base ? { entry: base, scale: base.scale * variant.scale } : null;
}

function cloneMaterial(material: Material | Material[]): Material | Material[] {
  return Array.isArray(material)
    ? material.map((entry) => entry.clone())
    : material.clone();
}

function recolorRegistryScene(
  scene: Object3D,
  color: "blue" | "red",
  ownedMaterials: Set<Material>
): void {
  const target = new Color(PROP_PALETTES[color].main);
  let hasExplicitRecolorMaterial = false;
  let usesExactPalette = false;

  scene.traverse((child) => {
    if (child.userData?.tka_recolor_mode === "palette-main") {
      usesExactPalette = true;
    }
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    if (
      materials.some(
        (material) =>
          material instanceof MeshStandardMaterial &&
          material.name.includes("Recolor")
      )
    ) {
      hasExplicitRecolorMaterial = true;
    }
  });

  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const usesArray = Array.isArray(mesh.material);
    const materials: Material[] = usesArray
      ? (mesh.material as Material[])
      : [mesh.material as Material];
    const recolored = materials.map((material) => {
      if (!(material instanceof MeshStandardMaterial)) return material;
      if (hasExplicitRecolorMaterial && !material.name.includes("Recolor")) {
        return material;
      }

      const cloned = material.clone();
      ownedMaterials.add(cloned);
      if (hasExplicitRecolorMaterial && usesExactPalette) {
        cloned.color.copy(target);
        cloned.emissive.set(0x000000);
        cloned.emissiveIntensity = 0;
        return cloned;
      }

      const original = { h: 0, s: 0, l: 0 };
      cloned.color.getHSL(original);
      if (original.l < 0.15 || original.l > 0.85) {
        cloned.color.lerp(target, 0.2);
      } else {
        const targetHsl = { h: 0, s: 0, l: 0 };
        target.getHSL(targetHsl);
        const visibilityFloor = color === "red" ? 0.6 : 0.55;
        const lightness = hasExplicitRecolorMaterial
          ? Math.max(original.l, visibilityFloor)
          : original.l;
        const saturationScale =
          hasExplicitRecolorMaterial && color === "red" ? 1 : 0.8;
        cloned.color.setHSL(
          targetHsl.h,
          targetHsl.s * saturationScale,
          lightness
        );
        if (hasExplicitRecolorMaterial) {
          cloned.roughness = Math.max(cloned.roughness, 0.62);
          cloned.metalness = 0;
          cloned.emissive.copy(target);
          cloned.emissiveIntensity = color === "red" ? 0.18 : 0.08;
        }
      }
      return cloned;
    });
    mesh.material = usesArray ? recolored : (recolored[0] ?? mesh.material);
  });
}

function createRotatedVisual(
  options: WorkerPropFactoryOptions,
  body: Group,
  source: "registry-gltf" | "fan-gltf",
  ownedMaterials: Set<Material>
): WorkerPropVisual {
  const root = new Group();
  const layer = options.layer ?? 0;
  root.name = `worker-prop-${options.propType}`;
  root.layers.set(layer);
  body.name = `worker-prop-${options.propType}-rotated-body`;
  body.layers.set(layer);
  root.add(body);
  const horizontal = new Quaternion().setFromEuler(
    new Euler(0, 0, Math.PI / 2)
  );
  const finalQuaternion = new Quaternion();
  return {
    root,
    source,
    setState(state) {
      finalQuaternion.copy(state.worldRotation).multiply(horizontal);
      body.quaternion.copy(finalQuaternion);
    },
    dispose() {
      for (const material of ownedMaterials) material.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}

export async function createRegistryWorkerProp(
  options: WorkerPropFactoryOptions,
  resolution: WorkerPropModelResolution
): Promise<WorkerPropVisual | null> {
  if (!options.loadModel) return null;
  const source = await options.loadModel(resolution.entry.modelUrl);
  const scene = source.clone(true);
  const ownedMaterials = new Set<Material>();
  recolorRegistryScene(scene, options.color, ownedMaterials);
  scene.traverse((child) => {
    const renderable = child as Mesh;
    if (renderable.isMesh) renderable.castShadow = true;
  });

  const body = new Group();
  const modelTransform = new Group();
  modelTransform.name = "worker-prop-model-transform";
  modelTransform.scale.setScalar(resolution.scale);
  modelTransform.position.y = resolution.entry.gripOffsetY;
  modelTransform.rotation.x = resolution.entry.flipLongAxis ? Math.PI : 0;
  modelTransform.add(scene);
  body.add(modelTransform);
  return createRotatedVisual(options, body, "registry-gltf", ownedMaterials);
}

function forEachNamedMaterial(
  scene: Object3D,
  name: string,
  visit: (material: MeshStandardMaterial) => void
): void {
  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (material.name === name) visit(material as MeshStandardMaterial);
    }
  });
}

export async function createFanModelWorkerProp(
  options: WorkerPropFactoryOptions,
  scale: number
): Promise<WorkerPropVisual | null> {
  if (!options.loadModel) return null;
  const source = await options.loadModel(
    options.build.fanBuild === "flat-grip"
      ? "/models/props/fan-flat-grip.glb"
      : "/models/props/fan.glb"
  );
  const scene = source.clone(true);
  const ownedMaterials = new Set<Material>();
  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = cloneMaterial(mesh.material);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) ownedMaterials.add(material);
    mesh.castShadow = true;
  });

  const build = options.build;
  const fire = scene.getObjectByName("Fan_Fire");
  const lotus = scene.getObjectByName("Fan_Lotus");
  const day = scene.getObjectByName("Fan_Day");
  const moon = scene.getObjectByName("Fan_Moon");
  const cover = scene.getObjectByName("Fan_Cover");
  if (fire) fire.visible = build.fanBuild === "fire";
  if (lotus) lotus.visible = build.fanBuild === "lotus";
  if (day) day.visible = build.fanBuild === "day";
  if (moon) moon.visible = build.fanBuild === "moon";
  if (cover) {
    cover.visible =
      (build.fanBuild === "fire" || build.fanBuild === "day") &&
      build.fanCover === "covered";
  }

  forEachNamedMaterial(scene, "TKA_Fan_Day_Frame", (material) => {
    material.color.set(build.fanFrameColor === "black" ? "#11141a" : "#f0f1f4");
  });
  forEachNamedMaterial(scene, "TKA_Fan_Cover_Solid_Recolor", (material) => {
    material.color.set(PROP_PALETTES[options.color].main);
  });
  forEachNamedMaterial(scene, "TKA_Fan_Moon_Frame", (material) => {
    material.color.set(PROP_PALETTES[options.color].main);
  });

  const body = new Group();
  const modelTransform = new Group();
  modelTransform.name = "worker-prop-fan-model-transform";
  modelTransform.scale.setScalar(scale);
  modelTransform.add(scene);
  body.add(modelTransform);
  const visual = createRotatedVisual(options, body, "fan-gltf", ownedMaterials);
  const trailMaterial = getPlateMaterials(options.color).trail;
  const indicator = new Mesh(TRAIL_GEOMETRY, trailMaterial);
  indicator.name = `worker-prop-${options.propType}-trail-indicator`;
  indicator.layers.set(options.layer ?? 0);
  visual.root.add(indicator);
  return visual;
}
