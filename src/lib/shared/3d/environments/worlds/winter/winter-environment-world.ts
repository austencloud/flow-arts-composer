import {
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Camera,
  type InstancedMesh,
  type Object3D,
  type Texture,
} from "three";
import { QualityTier } from "../../../effects/types";
import { VolumetricFireMesh } from "../../../effects/fire/volumetric-fire-mesh";
import {
  createRainbowParticleField,
  type RainbowParticleField,
} from "../rainbow/rainbow-particle-field";
import { resolveCircularStageRadius } from "../../domain/performer-stage-bounds";
import {
  createDefaultWinterConfig,
  type WinterSceneConfig,
} from "../../domain/models/scene-configs";
import {
  capWinterDetailTier,
  winterDetailTierFromAmount,
  winterObjectIsVisible,
  type WinterDetailTier,
} from "../../scenes/winter/authored/winter-layout";
import { getWinterQualityConfig } from "../../scenes/winter/quality/winter-quality";
import { createWinterIcePlatform } from "./winter-ice-platform";
import { createWinterPond } from "./winter-pond";
import { createWinterSky } from "./winter-sky";
import { createWinterStarfield } from "./winter-starfield";

export interface WinterEnvironmentWorldOptions {
  environmentRoot: Object3D;
  config?: WinterSceneConfig;
  groundY: number;
  stageRadius?: number;
  stageRadiusGrowth?: number;
  stageZOffset?: number;
  platformVisible?: boolean;
  deviceTier: WinterDetailTier;
  motionScale?: number;
  random?: () => number;
  outputColorSpace?: Texture["colorSpace"];
  assetUrl?: (path: string) => string;
  loadTexture?: (url: string) => Texture;
}

export interface WinterEnvironmentWorld {
  root: Group;
  fog: FogExp2;
  background: Color;
  tier: WinterDetailTier;
  update(deltaSeconds: number, camera: Camera): void;
  setGroundY(groundY: number): void;
  setMotionScale(scale: number): void;
  setLayout(
    groundY: number,
    radius: number,
    growth: number,
    worldYOffset?: number
  ): void;
  dispose(): void;
}

function configureFire(fire: VolumetricFireMesh): void {
  fire.name = "SharedVolumetricFire";
  fire.setIntensity(1.34);
  fire.setTurbulence(1.16);
  fire.setScrollSpeed(1.34);
  fire.setWarp(0.94);
  fire.setErosion(0.39);
  fire.setEmission(3.1);
  fire.setFlameRadius(0.74);
}

export const WINTER_ENVIRONMENT_URL = "/models/winter/blue-hour-lodge.glb";
export const WINTER_COURT_RADIUS = 7.7;

/** Shared by both renderers so the lodge and pond remain outside a larger cast. */
export function getWinterVenueScale(
  radius: number,
  growth = 0,
  minimumRadius = WINTER_COURT_RADIUS
): number {
  return (
    resolveCircularStageRadius(
      radius,
      Math.max(WINTER_COURT_RADIUS, minimumRadius),
      undefined,
      growth
    ) / WINTER_COURT_RADIUS
  );
}

/** Renderer-neutral owner of Blue Hour Lodge and Winter's living atmosphere. */
export function createWinterEnvironmentWorld(
  options: WinterEnvironmentWorldOptions
): WinterEnvironmentWorld {
  const root = new Group();
  root.name = "winter-environment-world";
  const land = new Group();
  land.name = "winter-cast-layout";
  root.add(land);
  const config = options.config ?? createDefaultWinterConfig();
  const tier = capWinterDetailTier(
    winterDetailTierFromAmount(config.forestDetail ?? 1),
    options.deviceTier
  );
  const quality = getWinterQualityConfig(tier);
  const assetUrl = options.assetUrl ?? ((path: string) => path);
  const textureLoader = new TextureLoader();
  const textures = new Set<Texture>();
  const particles: RainbowParticleField[] = [];
  let groundY = options.groundY;
  let fireElapsed = 0;
  let motionScale = options.motionScale ?? 1;
  let disposed = false;

  function loadTexture(
    path: string,
    colorSpace?: Texture["colorSpace"]
  ): Texture {
    const url = assetUrl(path);
    const value = options.loadTexture
      ? options.loadTexture(url)
      : textureLoader.load(url, (loaded) => {
          if (colorSpace) loaded.colorSpace = colorSpace;
          loaded.needsUpdate = true;
        });
    if (colorSpace) value.colorSpace = colorSpace;
    textures.add(value);
    return value;
  }

  const moonTexture = loadTexture(
    config.moon.texture ?? "/textures/moon.png",
    options.outputColorSpace ?? SRGBColorSpace
  );
  const sky = createWinterSky(config.sky, config.moon, moonTexture);
  root.add(sky.object);

  const starfield = createWinterStarfield(config.starfield, 1, options.random);
  if (config.starfield.enabled) root.add(starfield.object);

  const environment = options.environmentRoot;
  environment.name ||= "winter-authored-environment";
  environment.position.y = groundY;
  environment.traverse((child: Object3D) => {
    if ("isInstancedMesh" in child && child.isInstancedMesh) {
      const instance = child as InstancedMesh;
      const maximumCount =
        typeof instance.userData.winterMaximumCount === "number"
          ? instance.userData.winterMaximumCount
          : instance.count;
      instance.userData.winterMaximumCount = maximumCount;
      instance.count = Math.max(
        1,
        Math.ceil(
          maximumCount *
            (instance.userData.bluehourRole ? 1 : quality.sceneryMultiplier)
        )
      );
      child.visible = instance.count > 0;
    } else {
      child.visible = winterObjectIsVisible(child.name, tier);
    }
    if (!("isMesh" in child) || !child.isMesh) return;
    if (child instanceof Mesh && child.userData.bluehourRole === "court") {
      child.visible =
        options.platformVisible !== false && config.platform.enabled;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) {
          material.emissive.set(config.platform.primaryColor);
          material.emissiveIntensity = config.platform.glowIntensity * 0.025;
        }
      }
    }
    const mesh = child as Object3D & {
      castShadow: boolean;
      receiveShadow: boolean;
    };
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = true;
  });
  land.add(environment);

  const pond = config.pond?.enabled
    ? createWinterPond(config.pond, groundY, quality.pondSurfaceDetail, {
        colorMap: loadTexture("/textures/winter/ice-surface.webp"),
        roughnessMap: loadTexture("/textures/winter/ice-roughness.webp"),
        bodyNormal: null,
        coatNormal: null,
      })
    : null;
  if (pond) land.add(pond.object);

  const snow = createRainbowParticleField({
    ...config.snow,
    count: Math.round(config.snow.count * quality.snowMultiplier),
    spin: config.snow.spin ?? true,
    motionScale: 1,
    random: options.random,
  });
  snow.points.name = "winter-snow";
  particles.push(snow);
  root.add(snow.points);

  const campfire = config.campfire?.enabled ? config.campfire : null;
  const fire = campfire
    ? new VolumetricFireMesh({
        preset: "classic",
        qualityTier: QualityTier.MEDIUM,
        boxScale: new Vector3(
          campfire.fireScale,
          campfire.fireHeight * campfire.fireScale,
          campfire.fireScale
        ),
      })
    : null;
  if (fire && campfire) {
    configureFire(fire);
    fire.scale.set(
      campfire.fireScale,
      campfire.fireHeight * campfire.fireScale,
      campfire.fireScale
    );
    land.add(fire);
  }

  const fireSteam = campfire
    ? createRainbowParticleField({
        type: "steam",
        count: campfire.smokeCount,
        area: { width: 1.8, height: 5, depth: 1.8 },
        speed: 0.08,
        colors: campfire.smokeColors,
        sizeRange: [0.18, 0.42],
        spin: false,
        opacity: 0.22,
        motionScale: 1,
        random: options.random,
      })
    : null;
  const fireSteamGroup = fireSteam ? new Group() : null;
  if (fireSteam && fireSteamGroup) {
    fireSteam.points.name = "winter-campfire-steam";
    fireSteamGroup.name = "winter-campfire-steam-group";
    fireSteamGroup.add(fireSteam.points);
    particles.push(fireSteam);
    land.add(fireSteamGroup);
  }

  const primaryFireLight = campfire
    ? new PointLight(
        campfire.primaryLight.color,
        campfire.primaryLight.intensity,
        campfire.primaryLight.distance,
        campfire.primaryLight.decay
      )
    : null;
  const fillFireLight = campfire
    ? new PointLight(
        campfire.fillLight.color,
        campfire.fillLight.intensity,
        campfire.fillLight.distance,
        campfire.fillLight.decay
      )
    : null;
  if (primaryFireLight) {
    primaryFireLight.name = "winter-campfire-primary-light";
    land.add(primaryFireLight);
  }
  if (fillFireLight) {
    fillFireLight.name = "winter-campfire-fill-light";
    land.add(fillFireLight);
  }

  const cabinSmoke =
    config.cabin.enabled && config.cabin.smoke.enabled
      ? createRainbowParticleField({
          type: "smoke",
          count: config.cabin.smoke.count,
          area: config.cabin.smoke.area,
          speed: config.cabin.smoke.speed,
          colors: config.cabin.smoke.colors,
          sizeRange: config.cabin.smoke.sizeRange,
          spin: false,
          opacity: config.cabin.smoke.opacity,
          emissionShape: "ellipse",
          motionScale: 1,
          random: options.random,
        })
      : null;
  const cabinSmokeGroup = cabinSmoke ? new Group() : null;
  if (cabinSmoke && cabinSmokeGroup) {
    cabinSmoke.points.name = "winter-cabin-smoke";
    cabinSmokeGroup.name = "winter-cabin-smoke-group";
    cabinSmokeGroup.add(cabinSmoke.points);
    particles.push(cabinSmoke);
    land.add(cabinSmokeGroup);
  }

  const cabinWindowLight =
    config.cabin.enabled && config.cabin.windowLight.enabled
      ? new PointLight(
          config.cabin.windowLight.color,
          config.cabin.windowLight.intensity,
          config.cabin.windowLight.distance,
          config.cabin.windowLight.decay
        )
      : null;
  if (cabinWindowLight) {
    cabinWindowLight.name = "winter-cabin-window-light";
    land.add(cabinWindowLight);
  }

  const hemisphere = new HemisphereLight(
    config.hemisphereLight.skyColor,
    config.hemisphereLight.groundColor,
    config.hemisphereLight.intensity
  );
  hemisphere.name = "winter-hemisphere-light";
  root.add(hemisphere);
  for (const x of [-14, -6, 2]) {
    const light = new PointLight("#ffbb78", 42, 18, 2);
    light.position.set(x, groundY + 3.3, -12.7);
    light.name = "winter-lodge-promenade-light";
    land.add(light);
  }
  const moonLight = config.moonLight?.enabled
    ? new DirectionalLight(config.moonLight.color, config.moonLight.intensity)
    : null;
  if (moonLight && config.moonLight) {
    moonLight.name = "winter-moon-light";
    moonLight.position.set(...config.moonLight.position);
    moonLight.castShadow = quality.shadows;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.left = -35;
    moonLight.shadow.camera.right = 35;
    moonLight.shadow.camera.top = 35;
    moonLight.shadow.camera.bottom = -35;
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 100;
    moonLight.shadow.normalBias = 0.08;
    moonLight.shadow.bias = -0.00015;
    moonLight.shadow.camera.updateProjectionMatrix();
    root.add(moonLight);
  }

  const stageRadius = resolveCircularStageRadius(
    options.stageRadius ?? 3,
    config.platform.radius,
    undefined,
    options.stageRadiusGrowth ?? 0
  );
  const platformConfig =
    stageRadius === config.platform.radius
      ? config.platform
      : { ...config.platform, radius: stageRadius };
  let authoredCourt = false;
  environment.traverse((object) => {
    if (object.userData.bluehourRole === "court") authoredCourt = true;
  });
  const platform =
    !authoredCourt &&
    options.platformVisible !== false &&
    platformConfig.enabled
      ? createWinterIcePlatform(
          platformConfig,
          groundY,
          options.stageZOffset ?? 0
        )
      : null;
  if (platform) land.add(platform.object);

  const fog = new FogExp2(config.fog.color, config.fog.density);
  const background = new Color(config.fog.color);

  function setGroundY(nextGroundY: number): void {
    groundY = nextGroundY;
    environment.position.y = groundY;
    pond?.setGroundY(groundY);
    platform?.setGroundY(groundY);
    if (campfire && fire) {
      const halfHeight = (campfire.fireHeight * campfire.fireScale) / 2;
      fire.position.set(
        campfire.position.x,
        groundY + (campfire.groundOffset ?? 0) + halfHeight,
        campfire.position.z
      );
    }
    if (campfire && fireSteamGroup) {
      fireSteamGroup.position.set(
        campfire.position.x,
        groundY +
          (campfire.groundOffset ?? 0) +
          (campfire.fireHeight * campfire.fireScale) / 2 +
          0.4,
        campfire.position.z
      );
    }
    if (campfire && primaryFireLight) {
      primaryFireLight.position.set(
        campfire.position.x,
        groundY +
          (campfire.groundOffset ?? 0) +
          campfire.primaryLight.heightOffset,
        campfire.position.z
      );
    }
    if (campfire && fillFireLight) {
      fillFireLight.position.set(
        campfire.position.x,
        groundY +
          (campfire.groundOffset ?? 0) +
          campfire.fillLight.heightOffset,
        campfire.position.z
      );
    }
    if (cabinSmokeGroup) {
      cabinSmokeGroup.position.set(
        config.cabin.smoke.position.x,
        groundY + config.cabin.smoke.heightOffset,
        config.cabin.smoke.position.z
      );
    }
    if (cabinWindowLight) {
      cabinWindowLight.position.set(
        config.cabin.windowLight.position.x,
        groundY + config.cabin.windowLight.heightOffset,
        config.cabin.windowLight.position.z
      );
    }
  }
  setGroundY(groundY);
  function setLayout(
    nextGroundY: number,
    radius: number,
    growth: number,
    worldYOffset = 0
  ): void {
    setGroundY(nextGroundY);
    const scale = getWinterVenueScale(radius, growth, config.platform.radius);
    land.scale.set(scale, 1, scale);
    land.position.y = worldYOffset;
    for (const child of land.children) {
      if (child.name === "winter-lodge-promenade-light")
        child.position.y = nextGroundY + 3.3;
    }
  }
  setLayout(groundY, options.stageRadius ?? 3, options.stageRadiusGrowth ?? 0);

  return {
    root,
    fog,
    background,
    tier,
    update(deltaSeconds, camera) {
      if (disposed) return;
      const motionDelta = deltaSeconds * motionScale;
      sky.update(camera);
      starfield.update(motionDelta);
      for (const field of particles) field.update(motionDelta);
      platform?.update(motionDelta);
      if (fire) {
        fireElapsed +=
          Math.min(Math.max(deltaSeconds, 0), 1 / 15) * motionScale;
        fire.setTime(fireElapsed);
      }
    },
    setGroundY,
    setMotionScale(scale) {
      motionScale = Number.isFinite(scale) ? Math.max(0, scale) : 1;
    },
    setLayout,
    dispose() {
      if (disposed) return;
      disposed = true;
      sky.dispose();
      starfield.dispose();
      for (const field of particles) field.dispose();
      pond?.dispose();
      platform?.dispose();
      fire?.dispose();
      for (const texture of textures) texture.dispose();
      root.clear();
    },
  };
}
