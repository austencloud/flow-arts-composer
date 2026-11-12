import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type WebGLRenderer,
} from "three";
import type {
  EarthConfig,
  EarthGodRaysConfig,
  EnergyParticlesConfig,
  MeteorStreaksConfig,
  NebulaConfig,
  StarfieldConfig,
} from "../../domain/models/scene-configs";
import type { SkyGradientConfig } from "../../domain/models/environment-models";
import {
  COSMIC_ENERGY_FRAGMENT_SHADER,
  COSMIC_ENERGY_VERTEX_SHADER,
  COSMIC_GOD_RAY_FRAGMENT_SHADER,
  COSMIC_GOD_RAY_VERTEX_SHADER,
  COSMIC_METEOR_FRAGMENT_SHADER,
  COSMIC_METEOR_VERTEX_SHADER,
  COSMIC_NEBULA_FRAGMENT_SHADER,
  COSMIC_NEBULA_VERTEX_SHADER,
  COSMIC_SKY_FRAGMENT_SHADER,
  COSMIC_SKY_VERTEX_SHADER,
  COSMIC_STARFIELD_FRAGMENT_SHADER,
  COSMIC_STARFIELD_VERTEX_SHADER,
} from "./cosmic-world-shaders";

export interface CosmicWorldElement {
  object: Group | Mesh | Points;
  update(deltaSeconds: number, camera: Camera): void;
  dispose(): void;
}

export function createCosmicSky(config: SkyGradientConfig): CosmicWorldElement {
  const geometry = new SphereGeometry(200, 32, 32);
  // Cosmic never shows a moon (uMoonEnabled stays 0), but the shared sky
  // shader still declares the sampler. A 1x1 texture made here satisfies it
  // without downloading the 1.9 MB moon image the scene never draws.
  const moonPlaceholder = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  moonPlaceholder.needsUpdate = true;
  const material = new ShaderMaterial({
    uniforms: {
      uTopColor: { value: new Color(config.topColor) },
      uMidColor: { value: new Color(config.midColor ?? config.topColor) },
      uBottomColor: { value: new Color(config.bottomColor) },
      uHasMid: { value: config.midColor ? 1 : 0 },
      uGradientStart: { value: 0 },
      uGradientEnd: { value: 1 },
      uMoonEnabled: { value: 0 },
      uMoonTexture: { value: moonPlaceholder },
      uMoonDirection: { value: new Vector3(0, 0.25, -1).normalize() },
      uMoonAngularRadius: { value: MathUtils.degToRad(0.52 * 0.5) },
      uMoonOpacity: { value: 1 },
      uMoonGlowScale: { value: 1.12 },
      uMoonGlowOpacity: { value: 0.025 },
      uMoonSurfaceLift: { value: 0 },
      uMoonHorizonWarmth: { value: 1 },
      uSunEnabled: { value: 0 },
      uSunDirection: { value: new Vector3(0, 0.5, -1).normalize() },
      uSunAngularRadius: { value: MathUtils.degToRad(0.53 * 0.5) },
      uSunColor: { value: new Color("#fff4d2") },
      uSunOpacity: { value: 1 },
      uSunGlowScale: { value: 6 },
      uSunGlowOpacity: { value: 0.12 },
      uHorizonGlowColor: { value: new Color("#000000") },
      uHorizonGlowBearing: { value: new Vector2(0, -1) },
      uHorizonGlowHeight: { value: 0.2 },
      uHorizonGlowSpread: { value: 0.5 },
      uHorizonGlowIntensity: { value: 0 },
    },
    vertexShader: COSMIC_SKY_VERTEX_SHADER,
    fragmentShader: COSMIC_SKY_FRAGMENT_SHADER,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const object = new Mesh(geometry, material);
  object.name = "CosmicSkyGradient";
  object.renderOrder = -1;
  object.frustumCulled = false;

  return {
    object,
    update(_deltaSeconds, camera) {
      object.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      moonPlaceholder.dispose();
    },
  };
}

export function createCosmicNebula(config: NebulaConfig): CosmicWorldElement {
  const geometry = new SphereGeometry(70, 32, 32);
  const material = new ShaderMaterial({
    uniforms: {
      uColor1: { value: new Color(config.color1) },
      uColor2: { value: new Color(config.color2) },
      uOpacity: { value: config.opacity },
      uScale: { value: config.scale },
      uTime: { value: 0 },
    },
    vertexShader: COSMIC_NEBULA_VERTEX_SHADER,
    fragmentShader: COSMIC_NEBULA_FRAGMENT_SHADER,
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const object = new Mesh(geometry, material);
  object.name = "CosmicNebula";
  object.renderOrder = -0.5;
  object.frustumCulled = false;
  object.visible = config.enabled;
  let time = 0;

  return {
    object,
    update(deltaSeconds) {
      time += deltaSeconds * config.animationSpeed;
      material.uniforms.uTime!.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createCosmicStarfield(
  config: StarfieldConfig,
  options: { motionScale?: number; random?: () => number } = {}
): CosmicWorldElement {
  const random = options.random ?? Math.random;
  const magnitudeFalloff = config.magnitudeFalloff ?? 3;
  const brightnessFloor = config.brightnessFloor ?? 0.3;
  const horizonSpread = config.horizonSpread ?? 0.6;
  const intensity = config.intensity ?? 1;
  const positions = new Float32Array(config.count * 3);
  const sizes = new Float32Array(config.count);
  const phases = new Float32Array(config.count);
  const brightnesses = new Float32Array(config.count);

  for (let index = 0; index < config.count; index += 1) {
    const theta = random() * Math.PI * 2;
    if (config.elevationRangeDegrees) {
      const [minimumElevation, maximumElevation] = config.elevationRangeDegrees;
      const elevation =
        ((minimumElevation + random() * (maximumElevation - minimumElevation)) *
          Math.PI) /
        180;
      const horizontalRadius = config.radius * Math.cos(elevation);
      positions[index * 3] = horizontalRadius * Math.cos(theta);
      positions[index * 3 + 1] = config.radius * Math.sin(elevation);
      positions[index * 3 + 2] = horizontalRadius * Math.sin(theta);
    } else {
      const phi = Math.acos(2 * random() - 1) * horizonSpread;
      const sinPhi = Math.sin(phi);
      positions[index * 3] = config.radius * sinPhi * Math.cos(theta);
      positions[index * 3 + 1] = config.radius * Math.cos(phi);
      positions[index * 3 + 2] = config.radius * sinPhi * Math.sin(theta);
    }
    const magnitude = Math.pow(random(), magnitudeFalloff);
    sizes[index] =
      config.sizeRange[0] +
      magnitude * (config.sizeRange[1] - config.sizeRange[0]);
    brightnesses[index] = brightnessFloor + magnitude * (1 - brightnessFloor);
    phases[index] = random() * Math.PI * 2;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new Float32BufferAttribute(phases, 1));
  geometry.setAttribute(
    "aBrightness",
    new Float32BufferAttribute(brightnesses, 1)
  );
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTwinkleSpeed: { value: config.twinkleSpeed },
      uIntensity: { value: intensity },
    },
    vertexShader: COSMIC_STARFIELD_VERTEX_SHADER,
    fragmentShader: COSMIC_STARFIELD_FRAGMENT_SHADER,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const object = new Points(geometry, material);
  object.name = "CosmicStarfield";
  object.visible = config.enabled;
  object.frustumCulled = false;
  let elapsed = 0;

  return {
    object,
    update(deltaSeconds) {
      elapsed += deltaSeconds * Math.max(0, options.motionScale ?? 1);
      material.uniforms.uTime!.value = elapsed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

interface EnergyParticle {
  angle: number;
  radius: number;
  y: number;
  speed: number;
  size: number;
  colorIndex: number;
  phase: number;
}

export function createCosmicEnergyParticles(
  config: EnergyParticlesConfig,
  groundY: number,
  random: () => number = Math.random
): CosmicWorldElement & { setGroundY(value: number): void } {
  const particles: EnergyParticle[] = [];
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array(config.count * 3), 3)
  );
  geometry.setAttribute(
    "aSize",
    new Float32BufferAttribute(new Float32Array(config.count), 1)
  );
  geometry.setAttribute(
    "aAlpha",
    new Float32BufferAttribute(new Float32Array(config.count), 1)
  );
  geometry.setAttribute(
    "aColorIndex",
    new Float32BufferAttribute(new Float32Array(config.count), 1)
  );
  const colors = config.colors.slice(0, 4).map((color) => new Color(color));
  while (colors.length < 4) colors.push(colors[0] ?? new Color("#ffffff"));
  const material = new ShaderMaterial({
    uniforms: { uColors: { value: colors } },
    vertexShader: COSMIC_ENERGY_VERTEX_SHADER,
    fragmentShader: COSMIC_ENERGY_FRAGMENT_SHADER,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const object = new Points(geometry, material);
  object.name = "CosmicEnergyParticles";
  object.position.y = groundY;
  object.visible = config.enabled;
  object.frustumCulled = false;

  function spawnParticle(): EnergyParticle {
    return {
      angle: random() * Math.PI * 2,
      radius: config.spawnRadius + (random() - 0.5) * 0.5,
      y: 0,
      speed: config.riseSpeed * (0.7 + random() * 0.6),
      size:
        config.sizeRange[0] +
        random() * (config.sizeRange[1] - config.sizeRange[0]),
      colorIndex: Math.floor(random() * config.colors.length),
      phase: random() * Math.PI * 2,
    };
  }

  for (let index = 0; index < config.count; index += 1) {
    const particle = spawnParticle();
    particle.y = random() * config.maxHeight;
    particles.push(particle);
  }

  function update(deltaSeconds: number): void {
    const position = geometry.getAttribute(
      "position"
    ) as Float32BufferAttribute;
    const size = geometry.getAttribute("aSize") as Float32BufferAttribute;
    const alpha = geometry.getAttribute("aAlpha") as Float32BufferAttribute;
    const color = geometry.getAttribute(
      "aColorIndex"
    ) as Float32BufferAttribute;

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index]!;
      particle.y += particle.speed * deltaSeconds;
      if (particle.y > config.maxHeight)
        Object.assign(particle, spawnParticle());
      const fadeIn = Math.min(particle.y / 0.5, 1);
      const fadeOut =
        1 -
        Math.max(
          (particle.y - config.maxHeight * 0.7) / (config.maxHeight * 0.3),
          0
        );
      const sway = Math.sin(particle.y * 3 + particle.phase) * 0.15;
      position.setXYZ(
        index,
        Math.cos(particle.angle + sway) * particle.radius,
        particle.y,
        Math.sin(particle.angle + sway) * particle.radius
      );
      size.setX(index, particle.size);
      alpha.setX(index, fadeIn * fadeOut);
      color.setX(index, particle.colorIndex);
    }
    position.needsUpdate = true;
    size.needsUpdate = true;
    alpha.needsUpdate = true;
    color.needsUpdate = true;
    geometry.computeBoundingSphere();
  }
  update(0);

  return {
    object,
    update,
    setGroundY(value) {
      object.position.y = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

interface Meteor {
  active: boolean;
  age: number;
  duration: number;
  startX: number;
  startY: number;
  angle: number;
  horizontalDirection: -1 | 1;
  travelDistance: number;
  material: ShaderMaterial;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createCosmicMeteorStreaks(
  config: MeteorStreaksConfig,
  renderer: WebGLRenderer,
  random: () => number = Math.random
): CosmicWorldElement {
  const object = new Group();
  object.name = "CosmicMeteorStreaks";
  object.visible = config.enabled;
  const geometry = new PlaneGeometry(1, 1);
  const viewportSize = new Vector2();

  function createMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uHead: { value: new Vector2() },
        uDirection: { value: new Vector2(1, 0) },
        uNormal: { value: new Vector2(0, 1) },
        uTrailLength: { value: 0.2 },
        uTrailWidth: { value: 0.01 },
        uColor: { value: new Color("#ffffff") },
        uBrightness: { value: 1 },
        uOpacity: { value: 0 },
      },
      vertexShader: COSMIC_METEOR_VERTEX_SHADER,
      fragmentShader: COSMIC_METEOR_FRAGMENT_SHADER,
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
  }

  const pool: Meteor[] = Array.from({ length: 5 }, () => {
    const material = createMaterial();
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = -0.5;
    mesh.frustumCulled = false;
    object.add(mesh);
    return {
      active: false,
      age: 0,
      duration: 1,
      startX: 0,
      startY: 0,
      angle: 0,
      horizontalDirection: 1,
      travelDistance: 1,
      material,
    };
  });
  let timeSinceSpawn = 0;
  let nextSpawnIn = randomSpawnInterval();

  function randomSpawnInterval(): number {
    return config.frequency * (0.65 + random() * 0.7);
  }

  function spawnMeteor(meteor: Meteor): void {
    const direction: -1 | 1 = random() < 0.5 ? -1 : 1;
    const color =
      config.colors[Math.floor(random() * config.colors.length)] ?? "#ffffff";
    meteor.active = true;
    meteor.age = 0;
    meteor.duration = Math.max(0.55, Math.min(1.2, 1.4 - config.speed * 0.04));
    meteor.angle = 0.16 + random() * 0.18;
    meteor.horizontalDirection = direction;
    meteor.travelDistance = 0.95 + random() * 0.35;
    meteor.startX = direction * (-0.9 + random() * 0.45);
    meteor.startY = 0.18 + random() * 0.62;
    meteor.material.uniforms.uColor!.value.set(color);
    meteor.material.uniforms.uBrightness!.value = config.brightness ?? 1;
  }

  function hideMeteor(meteor: Meteor): void {
    meteor.active = false;
    meteor.material.uniforms.uOpacity!.value = 0;
  }

  function update(deltaSeconds: number): void {
    renderer.getSize(viewportSize);
    const height = Math.max(1, viewportSize.y);
    const aspect = Math.max(1, viewportSize.x) / height;
    timeSinceSpawn += deltaSeconds;
    if (timeSinceSpawn >= nextSpawnIn) {
      const idle = pool.find((meteor) => !meteor.active);
      if (idle) spawnMeteor(idle);
      timeSinceSpawn = 0;
      nextSpawnIn = randomSpawnInterval();
    }

    for (const meteor of pool) {
      if (!meteor.active) continue;
      meteor.age += deltaSeconds;
      const progress = meteor.age / meteor.duration;
      if (progress >= 1) {
        hideMeteor(meteor);
        continue;
      }
      const cos = Math.cos(meteor.angle);
      const sin = Math.sin(meteor.angle);
      const directionX = (meteor.horizontalDirection * cos) / aspect;
      const directionY = -sin;
      const normalX = sin / aspect;
      const normalY = meteor.horizontalDirection * cos;
      const headX =
        meteor.startX + directionX * meteor.travelDistance * progress;
      const headY =
        meteor.startY + directionY * meteor.travelDistance * progress;
      const trailLength = Math.max(
        0.16,
        Math.min(0.34, 0.1 + config.trailLength * 0.012)
      );
      const trailWidthPixels = Math.max(4, (config.headSize ?? 7) * 0.85);
      meteor.material.uniforms.uHead!.value.set(headX, headY);
      meteor.material.uniforms.uDirection!.value.set(directionX, directionY);
      meteor.material.uniforms.uNormal!.value.set(normalX, normalY);
      meteor.material.uniforms.uTrailLength!.value = trailLength;
      meteor.material.uniforms.uTrailWidth!.value =
        (trailWidthPixels * 2) / height;
      meteor.material.uniforms.uBrightness!.value = config.brightness ?? 1;
      meteor.material.uniforms.uOpacity!.value =
        smoothstep(0, 0.08, progress) * (1 - smoothstep(0.7, 1, progress));
    }
  }

  return {
    object,
    update,
    dispose() {
      geometry.dispose();
      for (const meteor of pool) meteor.material.dispose();
    },
  };
}

export function createCosmicGodRays(
  config: EarthGodRaysConfig,
  earthConfig: EarthConfig
): CosmicWorldElement {
  const geometry = new PlaneGeometry(30, 20, 1, 1);
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(config.color) },
      uIntensity: { value: config.intensity },
      uCount: { value: config.count },
    },
    vertexShader: COSMIC_GOD_RAY_VERTEX_SHADER,
    fragmentShader: COSMIC_GOD_RAY_FRAGMENT_SHADER,
    side: DoubleSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const object = new Mesh(geometry, material);
  object.name = "CosmicEarthGodRays";
  object.position.y = 8;
  object.rotation.y = Math.atan2(
    -earthConfig.position[0],
    -earthConfig.position[2]
  );
  const horizontalDistance = Math.hypot(
    earthConfig.position[0],
    earthConfig.position[2]
  );
  object.rotation.x =
    -Math.atan2(earthConfig.position[1] - 8, horizontalDistance) * 0.4;
  object.visible = config.enabled && earthConfig.enabled;

  return {
    object,
    update(deltaSeconds) {
      material.uniforms.uTime!.value += deltaSeconds * config.speed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
