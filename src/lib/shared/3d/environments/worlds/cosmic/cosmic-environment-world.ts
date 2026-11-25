import {
  Box3,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  PointLight,
  SpotLight,
  Vector3,
  type Camera,
  type WebGLRenderer,
} from "three";
import { resolveCircularStageRadius } from "../../domain/performer-stage-bounds";
import {
  createDefaultCosmicNightConfig,
  type CosmicSceneConfig,
} from "../../domain/models/scene-configs";
import {
  detectWinterQuality,
  getWinterQualityConfig,
} from "../../scenes/winter/quality/winter-quality";
import type { WinterDetailTier } from "../../scenes/winter/authored/winter-layout";
import {
  createCosmicAudience,
  type CosmicAudience,
  type CosmicAudienceLoader,
} from "./cosmic-audience";
import {
  loadCosmicEnvironmentAssets,
  type CosmicEnvironmentAssets,
} from "./cosmic-environment-assets";
import { createMoonPad, type MoonPad } from "./moon-pad";
import {
  createMoonEarth,
  createMoonOrbiter,
  createMoonSky,
  createMoonStars,
  type MoonSkyElement,
} from "./moon-sky";
import {
  createMoonSurfaceMaterial,
  setMoonPadRadius,
  type MoonSurfaceKind,
} from "./moon-surface-materials";
import {
  MOON_APRON_HEIGHT,
  MOON_AUDIENCE_SPREAD,
  MOON_EARTH_DIRECTION,
  MOON_FLOOD_ANGLE,
  MOON_FLOOD_TARGET_HEIGHT,
  MOON_SUN_DIRECTION,
  moonAudienceArcRadius,
  moonBeaconLevel,
  moonBenchPlacements,
  moonCargoPlacements,
  moonMastPlacements,
  moonPadRadius,
  type GroundPlacement,
} from "./moon-outpost-layout";

export type CosmicQualityTier = WinterDetailTier;

export interface CosmicEnvironmentWorldOptions {
  renderer: WebGLRenderer;
  groundY: number;
  config?: CosmicSceneConfig;
  stageRadius?: number;
  stageRadiusGrowth?: number;
  motionScale?: number;
  /** Device tier for shadows and star count. Detected from the renderer when omitted. */
  qualityTier?: CosmicQualityTier;
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
  /** The active config: its platform radius is the stage the pad is sized for. */
  readonly config: CosmicSceneConfig;
  /** True when the cast needs more room than the default pad. */
  readonly platformExpanded: boolean;
  /** The one sun direction everything sunlit reads. */
  readonly sunDirection: Readonly<Vector3>;
  audienceReady: Promise<void>;
  update(deltaSeconds: number, elapsedSeconds: number, camera: Camera): void;
  setGroundY(groundY: number): void;
  /** Regrows the pad and moves the outpost's edge pieces for a new cast. */
  setStageBounds(radius: number, growth: number): void;
  dispose(): void;
}

/** Authored node names the runtime relies on. */
const TERRAIN_NAME = "MO_Terrain";
const TEMPLATE_PREFIX = "MO_Template";
const SURFACE_BY_MATERIAL: Record<string, MoonSurfaceKind> = {
  MO_Regolith: "regolith",
  MO_Rock: "rock",
  MO_Track: "track",
  MO_Boot: "boot",
};
/**
 * Surfaces chosen by the authored object rather than its material: the GLB
 * optimiser merges identical materials, so the bootprints arrive wearing
 * MO_Track and only their node name still says what they are.
 */
const SURFACE_BY_OWNER: Record<string, MoonSurfaceKind> = {
  MO_Bootprints: "boot",
  MO_RoverTracks: "track",
};
/** Pieces too large or too far to be worth a place in the shadow map. */
const NO_SHADOW_CAST = new Set(["MO_Bootprints", "MO_RoverTracks"]);

/** Lamp position on a flood mast template, in its own frame (Three axes). */
const MAST_LAMP = new Vector3(0, 4.68, 0.16);
/** A flood fades out this far past its aim point, so its beam leaves no pool
 * on the far ground to fill the performer's shadow. */
const FLOOD_REACH = 1.2;

const SUN_DISTANCE = 60;
const SHADOW_EXTENT = 35;

function resolveStageRadius(
  config: CosmicSceneConfig,
  stageRadius: number,
  stageRadiusGrowth: number
): number {
  return resolveCircularStageRadius(
    stageRadius,
    config.platform.radius,
    undefined,
    stageRadiusGrowth
  );
}

function activeConfig(
  base: CosmicSceneConfig,
  radius: number
): CosmicSceneConfig {
  if (radius <= base.platform.radius) return base;
  return { ...base, platform: { ...base.platform, radius } };
}

function detectTier(renderer: WebGLRenderer): CosmicQualityTier {
  try {
    return detectWinterQuality(renderer);
  } catch {
    return "medium";
  }
}

function meshMaterialName(mesh: Mesh): string {
  const material = mesh.material as Material | Material[];
  return Array.isArray(material) ? (material[0]?.name ?? "") : material.name;
}

/** Topmost named child below the authored root that holds this object. */
function authoredOwner(object: Object3D, authoredRoot: Object3D): string {
  let node: Object3D | null = object;
  while (node && node.parent && node.parent !== authoredRoot) node = node.parent;
  return node?.name ?? "";
}

function placeOnGround(object: Object3D, placement: GroundPlacement): void {
  object.position.set(placement.x, MOON_APRON_HEIGHT, placement.z);
  object.rotation.set(0, placement.yaw, 0);
}

/**
 * The Moon: a small lunar outpost in hard low sunlight. The performer stands
 * on its landing pad. Builds the complete scene graph once for either
 * renderer. The authored model stays cached by the renderer; this owner swaps
 * its surface materials in and back out, and frees only what it made.
 */
export async function createCosmicEnvironmentWorld(
  options: CosmicEnvironmentWorldOptions
): Promise<CosmicEnvironmentWorld> {
  const baseConfig = options.config ?? createDefaultCosmicNightConfig();
  let stageRadius = resolveStageRadius(
    baseConfig,
    options.stageRadius ?? 3,
    options.stageRadiusGrowth ?? 0
  );
  let config = activeConfig(baseConfig, stageRadius);
  const assets =
    options.assets ??
    (await loadCosmicEnvironmentAssets(
      options.renderer,
      options.onAssetProgress
    ));
  const random = options.random ?? Math.random;
  const motionScale = options.motionScale ?? 1;
  const tier = options.qualityTier ?? detectTier(options.renderer);
  const shadows = getWinterQualityConfig(tier).shadows;
  const sunDirection = MOON_SUN_DIRECTION;
  let groundY = options.groundY;
  let disposed = false;
  let clock = 0;

  const root = new Group();
  root.name = "CosmicEnvironmentWorld";
  // No air, no fog. The object stays because both renderers expect one.
  const fog = new FogExp2(new Color("#000000"), 0);
  const ownedMaterials: Material[] = [];

  // ---- Sky: black space, stars, the Earth and an orbiter.
  const sky = createMoonSky(sunDirection);
  const stars = createMoonStars({
    count: tier === "low" ? 1400 : tier === "medium" ? 2400 : 3200,
    random,
  });
  const earth = createMoonEarth(assets.earthTexture, sunDirection, {
    rotationSpeed: baseConfig.earth.rotationSpeed,
    motionScale,
  });
  earth.object.visible = baseConfig.earth.enabled;
  const orbiter = createMoonOrbiter({ motionScale });
  const skyElements: MoonSkyElement[] = [sky, stars, earth, orbiter];

  // ---- Everything that stands on the ground moves with groundY.
  const ground = new Group();
  ground.name = "MoonGround";
  ground.position.y = groundY;

  const authored = assets.authoredScene;
  authored.updateMatrixWorld(true);
  const restoreMaterials: [Mesh, Mesh["material"]][] = [];
  const restoreShadows: [Mesh, boolean, boolean][] = [];
  const surfaceMaterials = new Map<MoonSurfaceKind, Material>();
  const templates = new Map<string, Object3D>();
  let beaconMaterial: MeshStandardMaterial | null = null;
  let beaconBase = 0;
  const airlockBox = new Box3();
  const scratchBox = new Box3();

  for (const child of authored.children) {
    if (child.name.startsWith(TEMPLATE_PREFIX)) {
      templates.set(child.name, child);
      child.visible = false;
    }
  }
  authored.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const owner = authoredOwner(object, authored);
    if (owner.startsWith(TEMPLATE_PREFIX)) return;
    restoreShadows.push([object, object.castShadow, object.receiveShadow]);
    object.receiveShadow = true;
    object.castShadow = shadows && !NO_SHADOW_CAST.has(owner);
    const name = meshMaterialName(object);
    const kind = SURFACE_BY_OWNER[owner] ?? SURFACE_BY_MATERIAL[name];
    if (kind) {
      let material = surfaceMaterials.get(kind);
      if (!material) {
        // Tracks and prints stop at the pad's painted edge.
        material = createMoonSurfaceMaterial(kind, moonPadRadius(stageRadius));
        surfaceMaterials.set(kind, material);
        ownedMaterials.push(material);
      }
      restoreMaterials.push([object, object.material]);
      object.material = material;
    } else if (name === "MO_Beacon" && object.material instanceof MeshStandardMaterial) {
      if (!beaconMaterial) {
        beaconMaterial = object.material.clone();
        beaconBase = Math.max(1, beaconMaterial.emissiveIntensity);
        ownedMaterials.push(beaconMaterial);
      }
      restoreMaterials.push([object, object.material]);
      object.material = beaconMaterial;
    } else if (name === "MO_AirlockLamp") {
      scratchBox.setFromObject(object);
      airlockBox.union(scratchBox);
    }
  });
  const outpost = new Group();
  outpost.name = "MoonOutpostRoot";
  outpost.add(authored);

  // ---- The pad and the parametric pieces round its edge.
  const pad: MoonPad = createMoonPad(moonPadRadius(stageRadius));
  const edge = new Group();
  edge.name = "MoonPadEdge";
  const masts: Object3D[] = [];
  const floods: SpotLight[] = [];
  const cargo: Object3D[] = [];
  const benches: Object3D[] = [];
  const mastTemplate = templates.get("MO_TemplateFloodMast");
  const cargoTemplates = {
    A: templates.get("MO_TemplateCargoA"),
    B: templates.get("MO_TemplateCargoB"),
  };
  const benchTemplate = templates.get("MO_TemplateBench");
  const audienceCount = config.platform.seatingEnabled
    ? config.platform.seatingRows * 3
    : 0;

  function instance(template: Object3D | undefined, name: string): Object3D {
    const copy = template ? template.clone(true) : new Group();
    copy.name = name;
    copy.visible = true;
    copy.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = shadows;
        object.receiveShadow = true;
      }
    });
    edge.add(copy);
    return copy;
  }

  const mastPlacements = moonMastPlacements(pad.radius);
  mastPlacements.forEach((_, index) => {
    masts.push(instance(mastTemplate, `MoonFloodMast-${index}`));
    const flood = new SpotLight("#ffd6a6", 90, 34, MOON_FLOOD_ANGLE, 0.5, 2);
    flood.name = `MoonFloodLight-${index}`;
    edge.add(flood, flood.target);
    floods.push(flood);
  });
  moonCargoPlacements(pad.radius).forEach((spot, index) => {
    cargo.push(instance(cargoTemplates[spot.template], `MoonCargo-${index}`));
  });
  for (let index = 0; index < audienceCount; index += 1) {
    benches.push(instance(benchTemplate, `MoonBench-${index}`));
  }

  const lampWorld = new Vector3();
  function layoutEdge(): void {
    const padRadius = pad.radius;
    moonMastPlacements(padRadius).forEach((placement, index) => {
      const mast = masts[index]!;
      placeOnGround(mast, placement);
      lampWorld.copy(MAST_LAMP).applyAxisAngle(Y_AXIS, placement.yaw);
      const flood = floods[index]!;
      flood.position.set(
        placement.x + lampWorld.x,
        MOON_APRON_HEIGHT + lampWorld.y,
        placement.z + lampWorld.z
      );
      flood.target.position.set(0, MOON_APRON_HEIGHT + MOON_FLOOD_TARGET_HEIGHT, 0);
      flood.distance = flood.position.distanceTo(flood.target.position) * FLOOD_REACH;
    });
    moonCargoPlacements(padRadius).forEach((placement, index) => {
      placeOnGround(cargo[index]!, placement);
    });
    const arc = moonAudienceArcRadius(padRadius);
    moonBenchPlacements(audienceCount, arc).forEach((placement, index) => {
      placeOnGround(benches[index]!, placement);
    });
    audience?.object.children.forEach((seat, index) => {
      const placement = moonBenchPlacements(audienceCount, arc)[index];
      if (placement) seat.position.set(placement.x, 0, placement.z);
    });
  }

  // ---- Light: one sun, dim earthlight, warm floods, the airlock lamp.
  const sun = new DirectionalLight("#fff4e6", 7.5);
  sun.name = "MoonSunLight";
  sun.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -SHADOW_EXTENT;
    sun.shadow.camera.right = SHADOW_EXTENT;
    sun.shadow.camera.top = SHADOW_EXTENT;
    sun.shadow.camera.bottom = -SHADOW_EXTENT;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = SUN_DISTANCE * 2;
    // Small offsets: at a 15 degree sun every centimetre of normal bias moves
    // the shadow about 4 cm off the soles.
    sun.shadow.normalBias = 0.02;
    sun.shadow.bias = -0.0004;
    sun.shadow.camera.updateProjectionMatrix();
  }
  const earthlight = new DirectionalLight("#9db6ff", 0.16);
  earthlight.name = "MoonEarthlight";
  earthlight.position.copy(MOON_EARTH_DIRECTION).multiplyScalar(SUN_DISTANCE);
  earthlight.target.position.set(0, 0, 0);
  let airlock: PointLight | null = null;
  if (!airlockBox.isEmpty()) {
    airlock = new PointLight("#ffa050", 6, 9, 2);
    airlock.name = "MoonAirlockLight";
    airlockBox.getCenter(airlock.position);
    // Stand the light off the lamp, out in front of the hatch.
    airlock.position.y -= 0.3;
    airlock.position.add(new Vector3(-airlock.position.x, 0, -airlock.position.z).setLength(0.8));
    ground.add(airlock);
  }
  ground.add(outpost, pad.object, edge, sun, sun.target, earthlight, earthlight.target);
  // Stand-in for light bounced off the sunlit regolith; nearly nothing.
  const hemisphere = new HemisphereLight("#06080c", "#4a4846", 0.12);
  hemisphere.name = "MoonHemisphereLight";

  let audience: CosmicAudience | null = null;
  layoutEdge();

  root.add(sky.object, stars.object, earth.object, orbiter.object, ground, hemisphere);

  async function seatAudience(): Promise<void> {
    if (options.audienceGate) await options.audienceGate;
    if (disposed) return;
    const next = await createCosmicAudience({
      count: audienceCount,
      arcRadius: moonAudienceArcRadius(pad.radius),
      arcSpread: MOON_AUDIENCE_SPREAD,
      groundY: groundY + MOON_APRON_HEIGHT,
      loader: options.audienceLoader,
      onPreloaded: options.onAudienceReady,
    });
    if (shadows) {
      next.object.traverse((object) => {
        if (object instanceof Mesh) object.castShadow = true;
      });
    }
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
    next.setGroundY(groundY + MOON_APRON_HEIGHT);
    layoutEdge();
    root.add(next.object);
  }
  const audienceReady = config.platform.seatingEnabled
    ? seatAudience().catch((error) => {
        options.onAudienceError?.(error);
        throw error;
      })
    : Promise.resolve().then(() => options.onAudienceReady?.());

  return {
    root,
    fog,
    get config() {
      return config;
    },
    get platformExpanded() {
      return stageRadius > baseConfig.platform.radius;
    },
    sunDirection,
    audienceReady,
    update(deltaSeconds, _elapsedSeconds, camera) {
      clock += deltaSeconds * Math.max(0, motionScale);
      for (const element of skyElements) element.update(deltaSeconds, camera);
      pad.update(clock, motionScale);
      if (beaconMaterial) {
        beaconMaterial.emissiveIntensity =
          beaconBase * moonBeaconLevel(clock, motionScale);
      }
      audience?.update(deltaSeconds);
    },
    setGroundY(value) {
      if (value === groundY) return;
      groundY = value;
      ground.position.y = value;
      audience?.setGroundY(value + MOON_APRON_HEIGHT);
    },
    setStageBounds(radius, growth) {
      const next = resolveStageRadius(baseConfig, radius, growth);
      if (next === stageRadius) return;
      stageRadius = next;
      config = activeConfig(baseConfig, stageRadius);
      pad.setRadius(moonPadRadius(stageRadius));
      for (const material of surfaceMaterials.values()) {
        setMoonPadRadius(material as MeshStandardMaterial, pad.radius);
      }
      layoutEdge();
    },
    dispose() {
      disposed = true;
      for (const template of templates.values()) template.visible = true;
      for (const [mesh, material] of restoreMaterials) mesh.material = material;
      for (const [mesh, cast, receive] of restoreShadows) {
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
      }
      outpost.remove(authored);
      audience?.dispose();
      for (const element of skyElements) element.dispose();
      pad.dispose();
      for (const material of ownedMaterials) material.dispose();
      sun.dispose();
      earthlight.dispose();
      airlock?.dispose();
      for (const flood of floods) flood.dispose();
      hemisphere.dispose();
      edge.clear();
      ground.clear();
      root.clear();
    },
  };
}

const Y_AXIS = new Vector3(0, 1, 0);
