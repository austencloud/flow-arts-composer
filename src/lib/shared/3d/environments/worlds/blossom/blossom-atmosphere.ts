import {
  BackSide,
  Color,
  Group,
  MathUtils,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type Texture,
} from "three";

import type { BlossomSceneConfig } from "../../domain/models/scene-configs";
import type { BlossomRuntimeConfig } from "../../scenes/cherry-blossom/blossom-runtime";
import {
  createRainbowParticleField,
  type RainbowParticleField,
} from "../rainbow/rainbow-particle-field";
import { createWinterStarfield } from "../winter/winter-starfield";

export interface BlossomAtmosphereOptions {
  config: BlossomSceneConfig;
  runtime: BlossomRuntimeConfig;
  moonTexture: Texture;
  decorativeAtmosphereEnabled: boolean;
  motionScale: number;
  random?: () => number;
}

export interface BlossomAtmosphere {
  object: Group;
  update(deltaSeconds: number, camera: Camera): void;
  setLayout(atmosphereScale: number, stageZOffset: number): void;
  dispose(): void;
}

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vSkyDirection;

  void main() {
    vSkyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uMidColor;
  uniform vec3 uBottomColor;
  uniform float uHasMid;
  uniform float uGradientStart;
  uniform float uGradientEnd;
  uniform sampler2D uMoonTexture;
  uniform vec3 uMoonDirection;
  uniform float uMoonAngularRadius;
  uniform float uMoonOpacity;
  uniform float uMoonGlowScale;
  uniform float uMoonGlowOpacity;
  uniform float uMoonSurfaceLift;
  uniform float uMoonHorizonWarmth;
  varying vec3 vSkyDirection;

  float cloudHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float cloudNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cloudHash(i), cloudHash(i + vec2(1, 0)), f.x),
      mix(cloudHash(i + vec2(0, 1)), cloudHash(i + vec2(1, 1)), f.x), f.y);
  }
  float cloudField(vec2 p) {
    float n = 0.0, weight = 0.5;
    for (int i = 0; i < 5; i++) {
      n += cloudNoise(p) * weight;
      p = mat2(1.6, -1.2, 1.2, 1.6) * p + 7.4;
      weight *= 0.5;
    }
    return n;
  }

  void main() {
    vec3 skyDirection = normalize(vSkyDirection);
    float rawHeight = skyDirection.y * 0.5 + 0.5;
    float h = clamp(
      (rawHeight - uGradientStart) / max(uGradientEnd - uGradientStart, 0.0001),
      0.0,
      1.0
    );

    vec3 color;
    if (uHasMid > 0.5) {
      if (h < 0.5) {
        color = mix(uBottomColor, uMidColor, h * 2.0);
      } else {
        color = mix(uMidColor, uTopColor, (h - 0.5) * 2.0);
      }
    } else {
      color = mix(uBottomColor, uTopColor, h);
    }

    vec2 cloudPlane = skyDirection.xz / max(0.18, skyDirection.y + 0.24);
    float clouds = smoothstep(0.44, 0.73, cloudField(cloudPlane * vec2(2.1, 3.2)));
    clouds *= smoothstep(0.01, 0.18, skyDirection.y);
    color = mix(color, vec3(0.10, 0.16, 0.24), clouds * 0.42);

    vec3 moonDirection = normalize(uMoonDirection);
    float moonFrontHemisphere = step(0.0, dot(skyDirection, moonDirection));
    vec3 referenceUp = abs(moonDirection.y) > 0.98
      ? vec3(1.0, 0.0, 0.0)
      : vec3(0.0, 1.0, 0.0);
    vec3 moonRight = normalize(cross(referenceUp, moonDirection));
    vec3 moonUp = normalize(cross(moonDirection, moonRight));
    float angularScale = max(sin(uMoonAngularRadius), 0.00001);
    vec2 moonPlane = vec2(
      dot(skyDirection, moonRight),
      dot(skyDirection, moonUp)
    ) / angularScale;
    float radialDistance = length(moonPlane);
    vec2 moonUv = moonPlane * vec2(0.5, -0.5) + 0.5;
    vec4 moonSample = texture2D(uMoonTexture, moonUv);
    // The packed moon image has a dark photographic rim; crop it into the
    // atmosphere instead of drawing a hard black outline around the disk.
    float diskEdge = 1.0 - smoothstep(0.87, 0.93, radialDistance);
    float diskAlpha = moonSample.a
      * diskEdge
      * uMoonOpacity
      * moonFrontHemisphere;
    float elevation = clamp(moonDirection.y, 0.0, 1.0);
    float atmospherePath = smoothstep(0.0, 0.42, elevation);
    float transmittance = mix(0.82, 1.0, atmospherePath);
    vec3 horizonTint = mix(
      vec3(0.94, 0.97, 1.0),
      vec3(1.0, 0.67, 0.42),
      uMoonHorizonWarmth
    );
    vec3 atmosphericTint = mix(
      horizonTint,
      vec3(0.92, 0.96, 1.0),
      atmospherePath
    );
    vec3 moonSurface = pow(max(moonSample.rgb, vec3(0.0)), vec3(0.72));
    moonSurface = mix(moonSurface, vec3(1.0), uMoonSurfaceLift);
    vec3 moonColor = moonSurface * atmosphericTint * transmittance;
    float haloRadius = max(uMoonGlowScale, 1.001);
    float halo = 1.0 - smoothstep(1.0, haloRadius, radialDistance);
    halo *= (1.0 - diskEdge) * moonFrontHemisphere;
    color += atmosphericTint * halo * uMoonGlowOpacity * transmittance;
    color = mix(color, moonColor, clamp(diskAlpha, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

function createBlossomSky(
  config: BlossomSceneConfig,
  moonTexture: Texture
): {
  object: Mesh<SphereGeometry, ShaderMaterial>;
  update(camera: Camera): void;
  dispose(): void;
} {
  const moon = {
    direction: [0.18, 0.22, 0.96] as const,
    angularDiameterDegrees: 4.8,
    opacity: 0.98,
    glowScale: 2.2,
    glowOpacity: 0.045,
    surfaceLift: 0.3,
    horizonWarmth: 0.18,
  };
  const geometry = new SphereGeometry(config.sky.radius ?? 200, 32, 32);
  const material = new ShaderMaterial({
    uniforms: {
      uTopColor: { value: new Color(config.sky.topColor) },
      uMidColor: {
        value: new Color(config.sky.midColor ?? config.sky.topColor),
      },
      uBottomColor: { value: new Color(config.sky.bottomColor) },
      uHasMid: { value: config.sky.midColor ? 1 : 0 },
      uGradientStart: { value: 0.41 },
      uGradientEnd: { value: 0.58 },
      uMoonTexture: { value: moonTexture },
      uMoonDirection: { value: new Vector3(...moon.direction).normalize() },
      uMoonAngularRadius: {
        value: MathUtils.degToRad(moon.angularDiameterDegrees * 0.5),
      },
      uMoonOpacity: { value: moon.opacity },
      uMoonGlowScale: { value: moon.glowScale },
      uMoonGlowOpacity: { value: moon.glowOpacity },
      uMoonSurfaceLift: { value: moon.surfaceLift },
      uMoonHorizonWarmth: { value: moon.horizonWarmth },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const object = new Mesh(geometry, material);
  object.name = "blossom-sky-gradient";
  object.renderOrder = -1;
  object.frustumCulled = false;
  return {
    object,
    update(camera) {
      object.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function createParticle(
  config: NonNullable<BlossomSceneConfig["distantPetals"]>,
  count: number,
  atmosphereScale: number,
  motionScale: number,
  random?: () => number
): RainbowParticleField | null {
  if (count <= 0) return null;
  return createRainbowParticleField({
    type: config.type,
    count,
    area: {
      ...config.area,
      width: config.area.width * atmosphereScale,
      depth: config.area.depth * atmosphereScale,
    },
    speed: config.speed,
    colors: config.colors,
    sizeRange: config.sizeRange,
    spin: config.spin ?? false,
    motionScale,
    random,
  });
}

/** Renderer-neutral owner of Blossom's moon sky, stars, petals, and fireflies. */
export function createBlossomAtmosphere(
  options: BlossomAtmosphereOptions
): BlossomAtmosphere {
  const root = new Group();
  root.name = "blossom-atmosphere";
  const sky = createBlossomSky(options.config, options.moonTexture);
  root.add(sky.object);

  const starfield = createWinterStarfield(
    {
      enabled: true,
      count: options.runtime.effects.stars,
      radius: 90,
      sizeRange: [0.45, 1.35],
      twinkleSpeed: 0.28,
      intensity: 0.7,
      magnitudeFalloff: 1.35,
      brightnessFloor: 0.18,
      horizonSpread: 0.5,
      elevationRangeDegrees: [-5, 18],
    },
    options.motionScale,
    options.random
  );
  starfield.object.name = "blossom-starfield";
  root.add(starfield.object);

  const fields: RainbowParticleField[] = [];
  const particleRoot = new Group();
  particleRoot.name = "blossom-decorative-atmosphere";
  particleRoot.position.z = options.runtime.stage.position[2];
  const initialAtmosphereScale = options.runtime.stage.atmosphereScale;
  if (options.decorativeAtmosphereEnabled) {
    const definitions = [
      [options.config.petals, options.runtime.particles.petals, "petals"],
      [
        options.config.distantPetals,
        options.runtime.particles.distantPetals,
        "distant-petals",
      ],
      [
        options.config.fireflies,
        options.runtime.particles.fireflies,
        "fireflies",
      ],
    ] as const;
    for (const [config, count, name] of definitions) {
      if (!config) continue;
      const field = createParticle(
        config,
        count,
        options.runtime.stage.atmosphereScale,
        options.motionScale,
        options.random
      );
      if (!field) continue;
      field.points.name = `blossom-${name}`;
      fields.push(field);
      particleRoot.add(field.points);
    }
  }
  root.add(particleRoot);

  return {
    object: root,
    update(deltaSeconds, camera) {
      sky.update(camera);
      starfield.update(deltaSeconds);
      for (const field of fields) field.update(deltaSeconds);
    },
    setLayout(atmosphereScale, stageZOffset) {
      const ratio = atmosphereScale / initialAtmosphereScale;
      particleRoot.scale.set(ratio, 1, ratio);
      particleRoot.position.z = stageZOffset;
    },
    dispose() {
      sky.dispose();
      starfield.dispose();
      for (const field of fields) field.dispose();
      root.clear();
    },
  };
}
