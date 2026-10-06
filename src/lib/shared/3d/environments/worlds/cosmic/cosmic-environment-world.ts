import {
  AdditiveBlending,
  BackSide,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from "three";
import { resolveCircularStageRadius } from "../../domain/performer-stage-bounds";
import {
  createDefaultCosmicNightConfig,
  type CosmicSceneConfig,
  type PlatformConfig,
} from "../../domain/models/scene-configs";
import { createRainbowParticleField } from "../rainbow/rainbow-particle-field";
import {
  createCosmicEnergyParticles,
  createCosmicGodRays,
  createCosmicMeteorStreaks,
  createCosmicNebula,
  createCosmicSky,
  createCosmicStarfield,
  type CosmicWorldElement,
} from "./cosmic-atmosphere";
import {
  createCosmicAudience,
  type CosmicAudience,
  type CosmicAudienceLoader,
} from "./cosmic-audience";
import {
  loadCosmicEnvironmentAssets,
  type CosmicEnvironmentAssets,
} from "./cosmic-environment-assets";
import {
  COSMIC_EARTH_FRAGMENT_SHADER,
  COSMIC_EARTH_GLOW_FRAGMENT_SHADER,
  COSMIC_EARTH_GLOW_VERTEX_SHADER,
  COSMIC_EARTH_VERTEX_SHADER,
  COSMIC_PLATFORM_FRAGMENT_SHADER,
  COSMIC_PLATFORM_VERTEX_SHADER,
} from "./cosmic-world-shaders";

export interface CosmicEnvironmentWorldOptions {
  renderer: WebGLRenderer;
  groundY: number;
  config?: CosmicSceneConfig;
  stageRadius?: number;
  stageRadiusGrowth?: number;
  motionScale?: number;
  random?: () => number;
  assets?: CosmicEnvironmentAssets;
  audienceLoader?: CosmicAudienceLoader;
  onAssetProgress?: (fraction: number) => void;
  onAudienceReady?: () => void;
  onAudienceError?: (error: unknown) => void;
  /** Holds the audience's loading until it settles, e.g. until the first
   * frame is on screen. */
  audienceGate?: Promise<void>;
  /** Runs before a finished audience joins the root, e.g. to compile it when
   * it arrives after the first frame. A failure here never drops the audience. */
  prepareAudience?: (audience: Object3D) => Promise<void>;
}

export interface CosmicEnvironmentWorld {
  root: Group;
  fog: FogExp2;
  config: CosmicSceneConfig;
  platformExpanded: boolean;
  audienceReady: Promise<void>;
  update(deltaSeconds: number, elapsedSeconds: number, camera: Camera): void;
  setGroundY(groundY: number): void;
  dispose(): void;
}

interface GroundedElement {
  object: Group;
  update(deltaSeconds: number): void;
  setGroundY(groundY: number): void;
  dispose(): void;
}

function createStationPlatform(
  config: PlatformConfig,
  groundY: number
): GroundedElement {
  const object = new Group();
  object.name = "CosmicStationPlatform";
  object.position.y = groundY;
  const segments =
    config.shape === "hexagon" ? 6 : config.shape === "octagon" ? 8 : 64;
  const mainGeometry = new CylinderGeometry(
    config.radius,
    config.radius,
    config.height,
    segments
  );
  const mainMaterial = new ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new Color(config.baseColor) },
      uEmissiveColor: { value: new Color(config.emissiveColor) },
      uEmissiveIntensity: { value: config.emissiveIntensity },
      uEdgeGlowWidth: { value: config.edgeGlowWidth },
      uRadius: { value: config.radius },
      uHeight: { value: config.height },
      uMetallic: { value: config.metallic },
      uRoughness: { value: config.roughness },
      uPulse: { value: 0 },
      uGridDensity: { value: config.gridDensity },
      uGridIntensity: { value: config.gridIntensity },
    },
    vertexShader: COSMIC_PLATFORM_VERTEX_SHADER,
    fragmentShader: COSMIC_PLATFORM_FRAGMENT_SHADER,
    side: DoubleSide,
  });
  const surface = new Mesh(mainGeometry, mainMaterial);
  surface.name = "CosmicPlatformSurface";
  surface.position.y = config.height / 2;

  const borderGeometry = new CylinderGeometry(
    config.radius + 0.15,
    config.radius + 0.15,
    config.height * 0.4,
    segments
  );
  const borderMaterial = new MeshStandardMaterial({
    color: new Color(config.baseColor).multiplyScalar(1.3),
    metalness: config.metallic,
    roughness: config.roughness,
    emissive: new Color(config.emissiveColor),
    emissiveIntensity: config.emissiveIntensity * 0.4,
  });
  const border = new Mesh(borderGeometry, borderMaterial);
  border.name = "CosmicPlatformBorder";
  border.position.y = config.height * 0.2;
  object.add(surface, border);

  const dotGeometry = new SphereGeometry(0.04, 8, 8);
  const dotMaterial = new MeshStandardMaterial({
    color: config.emissiveColor,
    emissive: config.emissiveColor,
    emissiveIntensity: 2,
  });
  for (let index = 0; index < config.accentLightCount; index += 1) {
    const angle = (index / config.accentLightCount) * Math.PI * 2;
    const x = Math.cos(angle) * (config.radius + 0.1);
    const z = Math.sin(angle) * (config.radius + 0.1);
    const light = new PointLight(
      config.emissiveColor,
      config.accentLightIntensity,
      config.accentLightDistance,
      2
    );
    light.name = `CosmicPlatformAccentLight-${index}`;
    light.position.set(x, config.height + 0.05, z);
    const dot = new Mesh(dotGeometry, dotMaterial);
    dot.name = `CosmicPlatformAccentDot-${index}`;
    dot.position.set(x, config.height + 0.02, z);
    object.add(light, dot);
  }

  let pulseTime = 0;
  object.visible = config.enabled;
  return {
    object,
    update(deltaSeconds) {
      if (config.pulseSpeed === 0) return;
      pulseTime += deltaSeconds * config.pulseSpeed * Math.PI * 2;
      mainMaterial.uniforms.uPulse!.value = pulseTime;
    },
    setGroundY(value) {
      object.position.y = value;
    },
    dispose() {
      mainGeometry.dispose();
      mainMaterial.dispose();
      borderGeometry.dispose();
      borderMaterial.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
      object.clear();
    },
  };
}

function createEarth(
  config: CosmicSceneConfig["earth"],
  texture: Texture
): CosmicWorldElement {
  const object = new Group();
  object.name = "CosmicEarth";
  object.position.set(...config.position);
  object.visible = config.enabled;

  const geometry = new SphereGeometry(config.radius, 48, 48);
  const material = new ShaderMaterial({
    uniforms: {
      uEarthMap: { value: texture },
      uRimColor: { value: new Color(config.rimColor) },
      uRimIntensity: { value: config.rimIntensity },
    },
    vertexShader: COSMIC_EARTH_VERTEX_SHADER,
    fragmentShader: COSMIC_EARTH_FRAGMENT_SHADER,
  });
  const earth = new Mesh(geometry, material);
  earth.name = "CosmicEarthSurface";

  const glowGeometry = new SphereGeometry(config.radius * 1.15, 32, 32);
  const glowMaterial = new ShaderMaterial({
    uniforms: {
      uRimColor: { value: new Color(config.rimColor) },
      uRimIntensity: { value: config.rimIntensity * 0.4 },
    },
    vertexShader: COSMIC_EARTH_GLOW_VERTEX_SHADER,
    fragmentShader: COSMIC_EARTH_GLOW_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    side: BackSide,
    depthWrite: false,
  });
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.name = "CosmicEarthGlow";
  object.add(earth, glow);

  return {
    object,
    update(deltaSeconds) {
      earth.rotation.y += deltaSeconds * config.rotationSpeed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      object.clear();
    },
  };
}

function resolveActiveConfig(
  config: CosmicSceneConfig,
  stageRadius: number,
  stageRadiusGrowth: number
): { config: CosmicSceneConfig; platformExpanded: boolean } {
  const radius = resolveCircularStageRadius(
    stageRadius,
    config.platform.radius,
    undefined,
    stageRadiusGrowth
  );
  if (radius <= config.platform.radius) {
    return { config, platformExpanded: false };
  }
  return {
    config: {
      ...config,
      platform: { ...config.platform, radius },
    },
    platformExpanded: true,
  };
}

function performanceDeckConfig(
  config: CosmicSceneConfig,
  expanded: boolean
): PlatformConfig {
  return {
    ...config.platform,
    shape: "circle",
    baseColor: "#070b12",
    emissiveIntensity: expanded ? config.platform.emissiveIntensity : 0.08,
    gridIntensity: expanded ? config.platform.gridIntensity : 0,
    accentLightCount: expanded ? config.platform.accentLightCount : 0,
  };
}

function addLighting(
  root: Group,
  config: CosmicSceneConfig,
  groundY: number
): { warmStation: PointLight | null } {
  let warmStation: PointLight | null = null;
  if (config.lighting.warmStation.enabled) {
    const warm = config.lighting.warmStation;
    warmStation = new PointLight(
      warm.color,
      warm.intensity,
      warm.distance,
      warm.decay
    );
    warmStation.name = "CosmicWarmStationLight";
    warmStation.position.set(0, groundY + warm.heightOffset, 0);
    root.add(warmStation);
  }
  if (config.lighting.coldDirectional.enabled) {
    const cold = config.lighting.coldDirectional;
    const light = new DirectionalLight(cold.color, cold.intensity);
    light.name = "CosmicColdDirectionalLight";
    light.position.set(...cold.position);
    root.add(light);
  }
  const ambient = config.lighting.ambient;
  const hemisphere = new HemisphereLight(
    ambient.skyColor,
    ambient.groundColor,
    ambient.intensity
  );
  hemisphere.name = "CosmicHemisphereLight";
  root.add(hemisphere);
  return { warmStation };
}

/**
 * Builds the complete production Cosmic scene graph once for either renderer.
 * The supplied assets stay cached by the renderer; this owner disposes only the
 * generated geometry, materials, animations, and temporary groups around them.
 */
export async function createCosmicEnvironmentWorld(
  options: CosmicEnvironmentWorldOptions
): Promise<CosmicEnvironmentWorld> {
  const baseConfig = options.config ?? createDefaultCosmicNightConfig();
  const resolved = resolveActiveConfig(
    baseConfig,
    options.stageRadius ?? 3,
    options.stageRadiusGrowth ?? 0
  );
  const config = resolved.config;
  const assets =
    options.assets ??
    (await loadCosmicEnvironmentAssets(
      options.renderer,
      options.onAssetProgress
    ));
  const random = options.random ?? Math.random;
  let groundY = options.groundY;
  let disposed = false;

  const root = new Group();
  root.name = "CosmicEnvironmentWorld";
  const fog = new FogExp2(new Color(config.fog.color), config.fog.density);
  const animated: CosmicWorldElement[] = [];

  const sky = createCosmicSky(config.sky, assets.moonTexture);
  const nebula = createCosmicNebula(config.nebula);
  const authoredRoot = new Group();
  authoredRoot.name = "CosmicReliquaryRoot";
  authoredRoot.position.y = groundY;
  authoredRoot.add(assets.authoredScene);
  const authoredPlatform = assets.authoredScene.children.filter(
    (child) => child.name !== "AR_Terrain"
  );
  for (const child of authoredPlatform)
    child.visible = !resolved.platformExpanded;

  const deckConfig = performanceDeckConfig(config, resolved.platformExpanded);
  const platform = createStationPlatform(deckConfig, groundY);
  const earth = createEarth(config.earth, assets.earthTexture);
  const starfield = createCosmicStarfield(config.starfield, {
    motionScale: options.motionScale,
    random,
  });
  const godRays = createCosmicGodRays(config.godRays, config.earth);
  const energy = config.particles.energyParticles
    ? createCosmicEnergyParticles(
        config.particles.energyParticles,
        groundY,
        random
      )
    : null;
  const meteors = config.particles.meteorStreaks
    ? createCosmicMeteorStreaks(
        config.particles.meteorStreaks,
        options.renderer,
        random
      )
    : null;
  const dustConfig = config.particles.cosmicDust;
  const dust = dustConfig
    ? createRainbowParticleField({
        ...dustConfig,
        spin: dustConfig.spin ?? false,
        motionScale: options.motionScale,
        random,
      })
    : null;
  if (dust) dust.points.name = "CosmicDust";

  root.add(
    sky.object,
    nebula.object,
    authoredRoot,
    platform.object,
    earth.object
  );
  const lights = addLighting(root, config, groundY);
  root.add(starfield.object, godRays.object);
  if (dust) root.add(dust.points);
  if (energy) root.add(energy.object);
  if (meteors) root.add(meteors.object);
  animated.push(sky, nebula, earth, starfield, godRays);
  if (energy) animated.push(energy);
  if (meteors) animated.push(meteors);

  let audience: CosmicAudience | null = null;
  async function seatAudience(): Promise<void> {
    if (options.audienceGate) await options.audienceGate;
    if (disposed) return;
    const next = await createCosmicAudience({
      count: deckConfig.seatingRows * 3,
      arcRadius: deckConfig.radius + 2.5,
      arcSpread: Math.PI * 0.55,
      groundY,
      loader: options.audienceLoader,
      onPreloaded: options.onAudienceReady,
    });
    if (!disposed) {
      await options.prepareAudience?.(next.object).catch((error: unknown) => {
        console.warn("[CosmicWorld] audience preparation failed", error);
      });
    }
    if (disposed) {
      next.dispose();
      return;
    }
    audience = next;
    root.add(next.object);
  }
  const audienceReady = deckConfig.seatingEnabled
    ? seatAudience().catch((error) => {
        options.onAudienceError?.(error);
        throw error;
      })
    : Promise.resolve().then(() => options.onAudienceReady?.());

  return {
    root,
    fog,
    config,
    platformExpanded: resolved.platformExpanded,
    audienceReady,
    update(deltaSeconds, _elapsedSeconds, camera) {
      for (const element of animated) element.update(deltaSeconds, camera);
      platform.update(deltaSeconds);
      dust?.update(deltaSeconds);
      audience?.update(deltaSeconds);
    },
    setGroundY(value) {
      if (value === groundY) return;
      groundY = value;
      authoredRoot.position.y = value;
      platform.setGroundY(value);
      energy?.setGroundY(value);
      audience?.setGroundY(value);
      if (lights.warmStation) {
        lights.warmStation.position.y =
          value + config.lighting.warmStation.heightOffset;
      }
    },
    dispose() {
      disposed = true;
      for (const child of authoredPlatform) child.visible = true;
      authoredRoot.remove(assets.authoredScene);
      audience?.dispose();
      for (const element of animated) element.dispose();
      platform.dispose();
      dust?.dispose();
      root.clear();
    },
  };
}
