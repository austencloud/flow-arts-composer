import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  UniformsLib,
  UniformsUtils,
  type BufferGeometry,
  type Object3D,
} from "three";

import { QualityTier } from "../../../effects/types";
import { createMidflankLava } from "./ember-midflank-finish";
import { createObsidianPillarField } from "./ember-obsidian-pillars";
import type {
  EmberSceneConfig,
  LavaCracksConfig,
  LavaPoolConfig,
  LavaRiversConfig,
  ObsidianPillarsConfig,
} from "../../domain/models/scene-configs";
import type { ObsidianPlatformConfig } from "../../domain/models/scene-configs/shared-scene-config";
import {
  createLavaRiverStripGeometry,
  createLavaTerrainSampler,
  LAVA_RIVER_BANK_MARGIN_FRACTION,
} from "../../scenes/ember/lava-river-geometry";
import {
  EMBER_CRACKS_FRAGMENT_SHADER,
  EMBER_CRACKS_VERTEX_SHADER,
  EMBER_PLATFORM_FRAGMENT_SHADER,
  EMBER_PLATFORM_VERTEX_SHADER,
  EMBER_POOL_FRAGMENT_SHADER,
  EMBER_POOL_VERTEX_SHADER,
  EMBER_RIVER_FRAGMENT_SHADER,
  EMBER_RIVER_GLOW_FRAGMENT_SHADER,
  EMBER_RIVER_GLOW_VERTEX_SHADER,
  EMBER_RIVER_VERTEX_SHADER,
} from "./ember-shaders";

export interface EmberWorldElement {
  object: Object3D;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  setGroundY(groundY: number): void;
  dispose(): void;
}

export function createEmberLavaCracks(
  config: LavaCracksConfig,
  groundSize: number,
  groundY: number
): EmberWorldElement | null {
  if (!config.enabled) return null;
  const geometry = new PlaneGeometry(groundSize * 0.7, groundSize * 0.7);
  const material = new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCrackColor: { value: new Color(config.crackColor) },
      uIntensity: { value: config.intensity },
      uScale: { value: config.scale },
      uPulseSpeed: { value: config.pulseSpeed },
      uPulseIntensity: { value: config.pulseIntensity },
      uEdgeFade: { value: 1 },
    },
    vertexShader: EMBER_CRACKS_VERTEX_SHADER,
    fragmentShader: EMBER_CRACKS_FRAGMENT_SHADER,
  });
  const object = new Mesh(geometry, material);
  object.name = "EmberLavaCracks";
  object.rotation.x = -Math.PI / 2;
  object.position.y = groundY + 0.02;
  return {
    object,
    update(deltaSeconds) {
      material.uniforms.uTime!.value += deltaSeconds * config.speed * 10;
    },
    setGroundY(value) {
      object.position.y = value + 0.02;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createPoolShape(radius: number, seed: number): Shape {
  const shape = new Shape();
  const count = 20;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const jagged =
      Math.sin(index * 3.7 + seed) * 0.25 +
      Math.cos(index * 5.3 + seed * 1.5) * 0.15 +
      Math.sin(index * 7.1 + seed * 0.7) * 0.08 +
      Math.cos(index * 11.3 + seed * 2.1) * 0.05;
    const r = radius * (1 + jagged);
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });
  shape.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 0; index < count; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % count]!;
    const previous = points[(index - 1 + count) % count]!;
    const after = points[(index + 2) % count]!;
    shape.bezierCurveTo(
      point.x + (next.x - previous.x) / 8,
      point.y + (next.y - previous.y) / 8,
      next.x - (after.x - point.x) / 8,
      next.y - (after.y - point.y) / 8,
      next.x,
      next.y
    );
  }
  return shape;
}

export function createEmberLavaPool(
  config: LavaPoolConfig,
  groundY: number
): EmberWorldElement | null {
  if (!config.enabled) return null;
  const root = new Group();
  root.name = "EmberLavaPool";
  root.position.y = groundY;
  const seed = config.position.x * 0.7 + config.position.z * 1.3;
  const geometry = new ShapeGeometry(createPoolShape(config.radius, seed), 64);
  const material = new ShaderMaterial({
    transparent: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new Color(config.baseColor) },
      uHotColor: { value: new Color(config.hotColor) },
      uCrustColor: { value: new Color(config.crustColor) },
      uWarpIntensity: { value: config.warpIntensity },
    },
    vertexShader: EMBER_POOL_VERTEX_SHADER,
    fragmentShader: EMBER_POOL_FRAGMENT_SHADER,
  });
  const surface = new Mesh(geometry, material);
  surface.name = "EmberLavaPoolSurface";
  surface.position.set(
    config.position.x,
    -(config.craterDepth ?? 0) + 0.03,
    config.position.z
  );
  surface.rotation.x = -Math.PI / 2;
  const primary = new PointLight(config.hotColor, 0, config.lightDistance, 1.5);
  primary.name = "EmberLavaPoolLight";
  primary.position.set(config.position.x, 0.5, config.position.z);
  const fill = new PointLight(
    config.baseColor,
    0,
    config.lightDistance * 0.6,
    2
  );
  fill.name = "EmberLavaPoolFillLight";
  fill.position.set(config.position.x + 2, 0.3, config.position.z - 1);
  root.add(surface, primary, fill);
  return {
    object: root,
    update(deltaSeconds) {
      material.uniforms.uTime!.value += deltaSeconds * config.flowSpeed * 10;
      const time = performance.now() * 0.001 * config.pulseSpeed;
      const intensity =
        config.lightIntensity * (0.85 + 0.15 * Math.sin(time * Math.PI * 2));
      primary.intensity = intensity;
      fill.intensity = intensity * 0.4;
    },
    setGroundY(value) {
      root.position.y = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      root.clear();
    },
  };
}

const DEFAULT_BANK_LIGHT = {
  count: 3,
  intensity: 40,
  distance: 52,
  heightOffset: 3.4,
} as const;
const TIER_LIGHT_BUDGET: Record<QualityTier, number> = {
  [QualityTier.HIGH]: 3,
  [QualityTier.MEDIUM]: 2,
  [QualityTier.LOW]: 1,
};

function selectLights<T>(positions: T[], budget: number): T[] {
  if (budget >= positions.length) return positions;
  if (budget <= 0) return [];
  if (budget === 1) return [positions[Math.floor(positions.length / 2)]!];
  return Array.from(
    { length: budget },
    (_, index) =>
      positions[Math.round((index / (budget - 1)) * (positions.length - 1))]!
  );
}

interface RiverInstance {
  geometry: BufferGeometry;
  ventGeometry: BufferGeometry | null;
  glowGeometry: BufferGeometry | null;
  material: ShaderMaterial;
  glowMaterial: ShaderMaterial | null;
}

export function createEmberLavaRivers(
  config: LavaRiversConfig | null,
  poolPosition: { x: number; z: number },
  terrain: Object3D,
  groundY: number,
  qualityTier: QualityTier
): EmberWorldElement | null {
  if (!config?.enabled) return null;
  if (terrain.getObjectByName("EMBER_LavaSimulatorDeposit")) {
    return createMidflankLava(terrain, groundY);
  }
  const root = new Group();
  root.name = "EmberLavaRivers";
  const bankLight = { ...DEFAULT_BANK_LIGHT, ...config.bankLight };
  const lightBudget = Math.min(bankLight.count, TIER_LIGHT_BUDGET[qualityTier]);
  const marginFraction =
    config.bankMarginFraction ?? LAVA_RIVER_BANK_MARGIN_FRACTION;
  const drape = config.drape ?? {};
  const thermal = config.thermal ?? {};
  const terminus = config.terminus ?? {};
  const source = config.source ?? {};
  const bankGlow = config.bankGlow ?? {};
  const glowReach = bankGlow.reach ?? 5.2;
  const toeFraction = terminus.fraction ?? 0.085;
  const sampler =
    drape.enabled === false ? null : createLavaTerrainSampler(terrain);
  const rivers: RiverInstance[] = [];

  for (const channel of config.channels) {
    const built = createLavaRiverStripGeometry({
      channel,
      poolPosition,
      groundY,
      width: config.width,
      terrain: sampler,
      surfaceOffset: drape.surfaceOffset,
      bankMarginFraction: marginFraction,
      bankPlunge: config.bankPlunge,
      marginBury: drape.marginBury,
      maxMarginDrop: drape.maxMarginDrop,
      longitudinalSegments: drape.longitudinalSegments,
      lateralSegments: drape.lateralSegments,
      terminus,
      source: { ...source, enabled: source.enabled ?? true },
      glow: { enabled: bankGlow.enabled ?? true, reach: glowReach },
      lightCount: bankLight.count,
    });
    const material = new ShaderMaterial({
      side: DoubleSide,
      depthWrite: true,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        uTime: { value: 0 },
        uBaseColor: { value: new Color(config.baseColor) },
        uHotColor: { value: new Color(config.hotColor) },
        uCrustColor: { value: new Color(config.crustColor) },
        uLeveeColor: {
          value: new Color(config.leveeColor ?? config.crustColor),
        },
        uWarpIntensity: { value: config.warpIntensity },
        uCrustCoverage: { value: config.crustCoverage },
        uEdgeCooling: { value: config.edgeCooling ?? 0.34 },
        uBankRadiance: { value: config.bankRadiance ?? 0.5 },
        uMarginFraction: { value: marginFraction },
        uThermalFalloff: { value: thermal.falloff ?? 0.42 },
        uCrustGain: { value: thermal.crustGain ?? 0.1 },
        uGradeRidges: { value: thermal.gradeRidges ?? 0.55 },
        uSourceRadiance: { value: source.radiance ?? 1 },
        uToeStart: { value: 1 - toeFraction },
      },
      vertexShader: EMBER_RIVER_VERTEX_SHADER,
      fragmentShader: EMBER_RIVER_FRAGMENT_SHADER,
    });
    const glowMaterial = built.glowGeometry
      ? new ShaderMaterial({
          side: DoubleSide,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          fog: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
          uniforms: {
            ...UniformsUtils.clone(UniformsLib.fog),
            uTime: { value: 0 },
            uBaseColor: { value: new Color(config.baseColor) },
            uHotColor: { value: new Color(config.hotColor) },
            uReach: { value: glowReach },
            uIntensity: { value: bankGlow.intensity ?? 0.85 },
            uSoftness: { value: bankGlow.softness ?? 2.1 },
            uThermalFalloff: { value: thermal.falloff ?? 0.42 },
          },
          vertexShader: EMBER_RIVER_GLOW_VERTEX_SHADER,
          fragmentShader: EMBER_RIVER_GLOW_FRAGMENT_SHADER,
        })
      : null;
    if (built.glowGeometry && glowMaterial) {
      const glow = new Mesh(built.glowGeometry, glowMaterial);
      glow.name = "EmberLavaRiverBankGlow";
      root.add(glow);
    }
    const surface = new Mesh(built.geometry, material);
    surface.name = "EmberLavaRiverSurface";
    root.add(surface);
    if (built.ventGeometry) {
      const vent = new Mesh(built.ventGeometry, material);
      vent.name = "EmberLavaRiverVent";
      root.add(vent);
    }
    for (const [index, position] of selectLights(
      built.lightPositions,
      lightBudget
    ).entries()) {
      const light = new PointLight(
        index % 2 === 0 ? config.hotColor : config.baseColor,
        bankLight.intensity,
        bankLight.distance,
        2
      );
      light.name = `EmberLavaRiverLight-${index}`;
      light.position.set(
        position.x,
        position.y + bankLight.heightOffset,
        position.z
      );
      root.add(light);
    }
    rivers.push({
      geometry: built.geometry,
      ventGeometry: built.ventGeometry,
      glowGeometry: built.glowGeometry,
      material,
      glowMaterial,
    });
  }

  let currentGroundY = groundY;
  return {
    object: root,
    update(deltaSeconds) {
      const step = deltaSeconds * config.flowSpeed * 10;
      for (const river of rivers) {
        river.material.uniforms.uTime!.value += step;
        if (river.glowMaterial) {
          river.glowMaterial.uniforms.uTime!.value += step;
        }
      }
    },
    setGroundY(value) {
      root.position.y += value - currentGroundY;
      currentGroundY = value;
    },
    dispose() {
      for (const river of rivers) {
        river.geometry.dispose();
        river.ventGeometry?.dispose();
        river.glowGeometry?.dispose();
        river.material.dispose();
        river.glowMaterial?.dispose();
      }
      root.clear();
    },
  };
}

export function createEmberObsidianPillars(
  config: ObsidianPillarsConfig,
  groundY: number
): EmberWorldElement | null {
  const field = createObsidianPillarField(config);
  if (!field) return null;
  field.object.position.y = groundY;
  return {
    object: field.object,
    update(deltaSeconds) {
      field.update(deltaSeconds);
    },
    setGroundY(value) {
      field.object.position.y = value;
    },
    dispose() {
      field.dispose();
    },
  };
}

export function createEmberObsidianPlatform(
  config: ObsidianPlatformConfig,
  groundY: number,
  embedded: boolean
): EmberWorldElement | null {
  if (!config.enabled) return null;
  const root = new Group();
  root.name = "EmberObsidianPlatform";
  root.position.y = groundY;
  const segments = embedded ? 64 : 6;
  const geometry = new CircleGeometry(config.radius, segments);
  if (embedded) {
    const positions = geometry.getAttribute("position");
    for (let vertex = 1; vertex < positions.count; vertex += 1) {
      const angle = (((vertex - 1) % segments) / segments) * Math.PI * 2;
      const edgeVariation =
        1 +
        Math.sin(angle * 3 + 0.7) * 0.045 +
        Math.sin(angle * 7 - 0.4) * 0.025 +
        Math.sin(angle * 11 + 1.2) * 0.012;
      const radius = config.radius * edgeVariation;
      positions.setXY(
        vertex,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPrimaryColor: { value: new Color(config.primaryColor) },
      uGlowIntensity: { value: config.glowIntensity },
      uCrackIntensity: { value: config.crackIntensity },
      uLavaSpeed: { value: config.lavaSpeed },
      uEmbedded: { value: embedded ? 1 : 0 },
    },
    vertexShader: EMBER_PLATFORM_VERTEX_SHADER,
    fragmentShader: EMBER_PLATFORM_FRAGMENT_SHADER,
    transparent: embedded,
    depthWrite: !embedded,
    side: DoubleSide,
  });
  if (!embedded) {
    const bodyGeometry = new CylinderGeometry(
      config.radius,
      config.radius,
      config.height,
      6,
      1,
      true
    );
    const bodyMaterial = new MeshStandardMaterial({
      color: "#0a0a0a",
      roughness: 0.3,
      metalness: 0.7,
      emissive: "#ff3300",
      emissiveIntensity: 0.05,
    });
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.name = "EmberObsidianPlatformBody";
    body.position.y = config.height / 2;
    const rimGeometry = new RingGeometry(
      config.radius - 0.025,
      config.radius + 0.025,
      6
    );
    const rimMaterial = new MeshStandardMaterial({
      color: "#ff4400",
      emissive: "#ff3300",
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.5,
    });
    const rim = new Mesh(rimGeometry, rimMaterial);
    rim.name = "EmberObsidianPlatformRim";
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = config.height + 0.001;
    root.add(body, rim);
    root.userData.ownedResources = [
      bodyGeometry,
      bodyMaterial,
      rimGeometry,
      rimMaterial,
    ];
  }
  const surface = new Mesh(geometry, material);
  surface.name = "EmberObsidianPlatformSurface";
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = config.height + (embedded ? 0.018 : 0);
  root.add(surface);
  return {
    object: root,
    update(deltaSeconds) {
      material.uniforms.uTime!.value += deltaSeconds;
    },
    setGroundY(value) {
      root.position.y = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      const owned = root.userData.ownedResources as
        | Array<{ dispose(): void }>
        | undefined;
      owned?.forEach((resource) => resource.dispose());
      root.clear();
    },
  };
}

export function resolveEmberConfig(
  baseConfig: EmberSceneConfig,
  radius: number,
  enabled: boolean
): EmberSceneConfig {
  if (
    radius <= baseConfig.platform.radius &&
    enabled === baseConfig.platform.enabled
  ) {
    return baseConfig;
  }
  return {
    ...baseConfig,
    platform: {
      ...baseConfig.platform,
      enabled,
      radius,
      ...(baseConfig.platform.enabled
        ? {}
        : {
            primaryColor: "#202c3b",
            glowIntensity: 0.11,
            crackIntensity: 0.16,
            lavaSpeed: 0.18,
          }),
    },
  };
}
