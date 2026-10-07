import {
  Color,
  DoubleSide,
  ShaderMaterial,
  type IUniform,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import { QualityTier } from "../types";

export interface GhostAgeVisual {
  fillAlpha: number;
  rimAlpha: number;
  emission: number;
  saturation: number;
}

export const GHOST_POOL_SIZE_BY_TIER: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 10,
  [QualityTier.MEDIUM]: 6,
  [QualityTier.LOW]: 4,
};

export function resolveGhostPoolSize(qualityTier: QualityTier): number {
  return GHOST_POOL_SIZE_BY_TIER[qualityTier];
}

export function resolveGhostAgeVisual(
  ageSeconds: number,
  lifetimeSeconds: number,
  intensity: number
): GhostAgeVisual {
  const life = Math.max(0.001, lifetimeSeconds);
  const age = Math.max(0, Math.min(1, ageSeconds / life));
  const strength = Math.max(0, Math.min(1, intensity));
  const bodyVisibility = Math.pow(1 - age, 1.8);
  const rimVisibility = Math.pow(1 - age, 1.35);
  const sheddingProgress = Math.max(0, Math.min(1, (age - 0.22) / 0.53));
  const smoothShedding =
    sheddingProgress * sheddingProgress * (3 - 2 * sheddingProgress);
  const body = 1 - smoothShedding;

  return {
    fillAlpha: 0.62 * strength * body * bodyVisibility,
    rimAlpha: 0.54 * strength * rimVisibility,
    emission: 0.9 + 0.45 * body,
    saturation: Math.max(0, 1 - age / 0.68),
  };
}

/** The frost breakup belongs to the captured pose, never its reusable slot. */
export function resolveGhostPoseFrostSeed(poseKey: string): number {
  let hash = 2166136261;
  for (let index = 0; index < poseKey.length; index += 1) {
    hash = Math.imul(hash ^ poseKey.charCodeAt(index), 16777619);
  }
  return ((hash >>> 0) / 4294967295) * 1024;
}

/**
 * How far an aged ghost leans toward frost white. The prop's own texture and
 * color carry the rest, so an old ghost still reads as that prop.
 */
export const GHOST_FROST_DRAIN = 0.35;

interface ChronoFrostUniforms extends Record<string, IUniform> {
  uBaseColor: IUniform<Color>;
  uMap: IUniform<Texture | null>;
  uUseMap: IUniform<number>;
  uSourceOpacity: IUniform<number>;
  uFillAlpha: IUniform<number>;
  uRimAlpha: IUniform<number>;
  uEmission: IUniform<number>;
  uSaturation: IUniform<number>;
  uRimPower: IUniform<number>;
  uFrostSeed: IUniform<number>;
}

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vUv = uv;
    vLocalPosition = position;
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform sampler2D uMap;
  uniform float uUseMap;
  uniform float uSourceOpacity;
  uniform float uFillAlpha;
  uniform float uRimAlpha;
  uniform float uEmission;
  uniform float uSaturation;
  uniform float uRimPower;
  uniform float uFrostSeed;

  varying vec2 vUv;
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  float frozenGrain(vec3 p) {
    float a = sin(dot(p, vec3(41.7, 73.1, 29.3)) + uFrostSeed);
    float b = sin(dot(p, vec3(87.9, 19.7, 61.3)) - uFrostSeed * 0.71);
    return 0.72 + 0.28 * (0.5 + 0.25 * (a + b));
  }

  void main() {
    // The prop's own surface: its texture (bark, tape, print) times its color.
    vec4 texel = uUseMap > 0.5 ? texture2D(uMap, vUv) : vec4(1.0);
    vec3 propColor = uBaseColor * texel.rgb;
    float coverage = texel.a * uSourceOpacity;

    float facing = abs(dot(normalize(vViewNormal), normalize(vViewDirection)));
    float fresnel = pow(clamp(1.0 - facing, 0.0, 1.0), uRimPower);
    float grain = frozenGrain(vLocalPosition);
    float backFillWeight = gl_FrontFacing ? 1.0 : 0.55;
    float backRimWeight = gl_FrontFacing ? 1.0 : 0.18;
    float fill = uFillAlpha * grain * backFillWeight * coverage;
    float rim = uRimAlpha * fresnel * backRimWeight * coverage;
    float combinedAlpha = max(fill + rim, 0.00001);
    float alpha = 1.0 - (1.0 - clamp(fill, 0.0, 1.0)) *
      (1.0 - clamp(rim, 0.0, 1.0));
    if (alpha <= 0.001) discard;

    vec3 coldWhite = vec3(0.72, 0.90, 1.0);
    vec3 agedColor = mix(
      propColor,
      coldWhite,
      ${GHOST_FROST_DRAIN.toFixed(2)} * (1.0 - uSaturation)
    );
    vec3 bodyRadiance = agedColor * (0.84 + 0.14 * grain);
    vec3 rimRadiance = agedColor * (0.72 + fresnel * uEmission);
    vec3 radiance =
      (bodyRadiance * fill + rimRadiance * rim) / combinedAlpha;
    gl_FragColor = vec4(radiance, alpha);
    #include <colorspace_fragment>
  }
`;

export function createChronoFrostMaterial(slotIndex: number): ShaderMaterial {
  const uniforms: ChronoFrostUniforms = {
    uBaseColor: { value: new Color("#ffffff") },
    uMap: { value: null },
    uUseMap: { value: 0 },
    uSourceOpacity: { value: 1 },
    uFillAlpha: { value: 0 },
    uRimAlpha: { value: 0 },
    uEmission: { value: 1 },
    uSaturation: { value: 1 },
    uRimPower: { value: 2.35 },
    uFrostSeed: { value: slotIndex * 11.731 + 0.37 },
  };
  const material = new ShaderMaterial({
    name: `GhostChronoFrost:${slotIndex}`,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
  });
  material.forceSinglePass = true;
  material.toneMapped = false;
  return material;
}

export function updateChronoFrostMaterial(
  material: ShaderMaterial,
  visual: GhostAgeVisual,
  rimPower: number,
  frostSeed: number
): void {
  const uniforms = material.uniforms as ChronoFrostUniforms;
  uniforms.uFillAlpha.value = visual.fillAlpha;
  uniforms.uRimAlpha.value = visual.rimAlpha;
  uniforms.uEmission.value = visual.emission;
  uniforms.uSaturation.value = visual.saturation;
  uniforms.uRimPower.value = rimPower;
  uniforms.uFrostSeed.value = frostSeed;
}

type SourceSurface = Material & {
  color?: Color;
  map?: Texture | null;
};

/** Copy what a prop material looks like onto its ghost: color, texture, cut-outs. */
export function syncChronoFrostSource(
  material: ShaderMaterial,
  source: Material
): void {
  const surface = source as SourceSurface;
  const uniforms = material.uniforms as ChronoFrostUniforms;
  if (surface.color instanceof Color) {
    uniforms.uBaseColor.value.copy(surface.color);
  } else {
    uniforms.uBaseColor.value.setRGB(1, 1, 1);
  }
  const map = surface.map ?? null;
  uniforms.uMap.value = map;
  uniforms.uUseMap.value = map ? 1 : 0;
  uniforms.uSourceOpacity.value = source.transparent ? source.opacity : 1;
  material.visible = source.visible;
}

/**
 * Re-skins a ghost phantom's prop with Chrono-Frost materials built from the
 * prop's own materials, one frost material per source material. Props can
 * swap meshes after mount (a GLTF model finishing its load, a re-clone after
 * a hand color change), so `apply` runs on every update and picks up any
 * mesh still wearing its original material.
 */
export class GhostSourceMaterials {
  private readonly frostBySource = new Map<Material, ShaderMaterial>();
  private readonly sourceByFrost = new Map<Material, Material>();
  private readonly seen = new Set<Material>();
  private readonly active: ShaderMaterial[] = [];

  constructor(private readonly slotIndex: number) {}

  /** Swap every mesh under `root` onto its frost material; returns those in use. */
  apply(root: Object3D): readonly ShaderMaterial[] {
    this.seen.clear();
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (Array.isArray(mesh.material)) {
        const materials = mesh.material;
        for (let index = 0; index < materials.length; index += 1) {
          materials[index] = this.frostFor(materials[index]!);
        }
      } else {
        mesh.material = this.frostFor(mesh.material);
      }
    });

    // A source that left the graph (old GLTF clone, previous prop) frees its
    // frost material instead of piling up for the rest of the session.
    this.active.length = 0;
    for (const [source, frost] of this.frostBySource) {
      if (this.seen.has(source)) {
        this.active.push(frost);
        continue;
      }
      this.frostBySource.delete(source);
      this.sourceByFrost.delete(frost);
      frost.dispose();
    }
    return this.active;
  }

  dispose(): void {
    for (const frost of this.frostBySource.values()) frost.dispose();
    this.frostBySource.clear();
    this.sourceByFrost.clear();
    this.seen.clear();
    this.active.length = 0;
  }

  private frostFor(material: Material): ShaderMaterial {
    const source = this.sourceByFrost.get(material) ?? material;
    this.seen.add(source);
    let frost = this.frostBySource.get(source);
    if (!frost) {
      frost = createChronoFrostMaterial(this.slotIndex);
      this.frostBySource.set(source, frost);
      this.sourceByFrost.set(frost, source);
    }
    syncChronoFrostSource(frost, source);
    return frost;
  }
}
