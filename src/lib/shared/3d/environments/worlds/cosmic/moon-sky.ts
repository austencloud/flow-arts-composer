import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type Texture,
} from "three";
import {
  MOON_EARTH_DIRECTION,
  MOON_EARTH_DISTANCE,
  MOON_EARTH_RADIUS,
  MOON_EARTH_VIEWER_LEAN,
} from "./moon-outpost-layout";

/**
 * Space as seen from the Moon: a black sky with a faint Milky Way and the
 * sun's disc, sharp stars, a sunlit Earth, and an orbiter that crosses now
 * and then. No air, so no glow shells, no haze and no fog.
 */

export interface MoonSkyElement {
  object: Group;
  update(deltaSeconds: number, camera: Camera): void;
  dispose(): void;
}

const SKY_RADIUS = 460;
const STAR_RADIUS = 440;

/** The galactic plane's pole, chosen so the band arcs low across the back sky. */
const GALACTIC_POLE = new Vector3(0.32, 0.55, 0.77).normalize();
const BAND_AXIS_A = new Vector3(0, 1, 0).cross(GALACTIC_POLE).normalize();
const BAND_AXIS_B = GALACTIC_POLE.clone().cross(BAND_AXIS_A).normalize();

export function createMoonSky(sunDirection: Readonly<Vector3>): MoonSkyElement {
  const object = new Group();
  object.name = "MoonSky";
  const geometry = new SphereGeometry(SKY_RADIUS, 48, 24);
  const material = new ShaderMaterial({
    name: "MoonSkyMaterial",
    uniforms: {
      uSunDirection: { value: new Vector3().copy(sunDirection) },
      uGalacticPole: { value: GALACTIC_POLE.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      uniform vec3 uGalacticPole;
      varying vec3 vDirection;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
              mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
              mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      void main() {
        vec3 d = normalize(vDirection);
        float band = 1.0 - abs(dot(d, uGalacticPole));
        band = pow(band, 9.0);
        float clouds = noise(d * 6.0) * 0.6 + noise(d * 15.0) * 0.4;
        float dust = smoothstep(0.35, 0.75, noise(d * 9.0 + 3.0));
        float milky = band * (0.35 + clouds * 0.65) * (1.0 - dust * 0.55);
        vec3 colour = vec3(0.016, 0.017, 0.021) * milky;
        // The sun: a hard white disc with a thin corona, no atmosphere.
        float s = dot(d, normalize(uSunDirection));
        colour += vec3(30.0, 28.0, 25.0) * smoothstep(0.99994, 0.99997, s);
        colour += vec3(0.5, 0.46, 0.4) * pow(max(s, 0.0), 2400.0);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new Mesh(geometry, material);
  sky.name = "MoonSkySphere";
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  object.add(sky);
  return {
    object,
    update(_deltaSeconds, camera) {
      object.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      object.clear();
    },
  };
}

export interface MoonStarsOptions {
  count: number;
  random: () => number;
}

/** Sharp fixed-size points with a steep magnitude spread, plus a denser band. */
export function createMoonStars(options: MoonStarsOptions): MoonSkyElement {
  const object = new Group();
  object.name = "MoonStars";
  const positions = new Float32Array(options.count * 3);
  const brightness = new Float32Array(options.count);
  const tint = new Float32Array(options.count * 3);
  const direction = new Vector3();
  const warm = new Color("#ffd9b0");
  const cool = new Color("#cfe0ff");
  const white = new Color("#ffffff");
  const colour = new Color();
  for (let index = 0; index < options.count; index += 1) {
    // A third of the stars crowd the Milky Way's band.
    // Direct sampling, no rejection loop, so any random source terminates.
    const inBand = options.random() < 0.33;
    const theta = options.random() * Math.PI * 2;
    if (inBand) {
      direction
        .copy(BAND_AXIS_A)
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(BAND_AXIS_B, Math.sin(theta))
        .addScaledVector(GALACTIC_POLE, (options.random() - 0.5) * 0.3)
        .normalize();
    } else {
      // Uniform in height is uniform on the sphere; skip what the ground hides.
      const y = -0.12 + options.random() * 1.12;
      const ring = Math.sqrt(1 - y * y);
      direction.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring);
    }
    positions.set(
      [direction.x * STAR_RADIUS, direction.y * STAR_RADIUS, direction.z * STAR_RADIUS],
      index * 3
    );
    const magnitude = Math.pow(options.random(), 5);
    brightness[index] = 0.12 + magnitude * 2.4;
    const pick = options.random();
    colour.copy(white).lerp(pick < 0.5 ? warm : cool, options.random() * 0.7);
    tint.set([colour.r, colour.g, colour.b], index * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("brightness", new BufferAttribute(brightness, 1));
  geometry.setAttribute("tint", new BufferAttribute(tint, 3));
  const material = new ShaderMaterial({
    name: "MoonStarsMaterial",
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float brightness;
      attribute vec3 tint;
      varying vec3 vColour;
      void main() {
        vColour = tint * brightness;
        gl_PointSize = brightness > 1.2 ? 2.6 : (brightness > 0.5 ? 1.9 : 1.4);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float falloff = smoothstep(0.5, 0.15, length(c));
        gl_FragColor = vec4(vColour * falloff, 1.0);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const points = new Points(geometry, material);
  points.name = "MoonStarPoints";
  points.frustumCulled = false;
  points.renderOrder = -9;
  object.add(points);
  return {
    object,
    update(_deltaSeconds, camera) {
      object.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      object.clear();
    },
  };
}

export interface MoonEarth extends MoonSkyElement {
  material: ShaderMaterial;
}

/**
 * The Earth, lit by the same sun as the ground: a day side, a dark night side,
 * a soft terminator and a thin crisp atmosphere line at the sunlit limb.
 */
export function createMoonEarth(
  texture: Texture,
  sunDirection: Readonly<Vector3>,
  options: { rotationSpeed: number; motionScale: number }
): MoonEarth {
  const object = new Group();
  object.name = "MoonEarth";
  object.position
    .copy(MOON_EARTH_DIRECTION)
    .multiplyScalar(MOON_EARTH_DISTANCE);
  // Tilt the axis a little so the terminator does not read as a vertical cut.
  object.rotation.z = 0.41;
  const geometry = new SphereGeometry(MOON_EARTH_RADIUS, 64, 48);
  const material = new ShaderMaterial({
    name: "MoonEarthMaterial",
    uniforms: {
      uEarthMap: { value: texture },
      uSunDirection: { value: new Vector3().copy(sunDirection) },
      uViewerLean: { value: MOON_EARTH_VIEWER_LEAN },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vEarthCentre;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        // modelMatrix exists only in the vertex stage of a ShaderMaterial.
        vEarthCentre = modelMatrix[3].xyz;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uEarthMap;
      uniform vec3 uSunDirection;
      uniform float uViewerLean;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vEarthCentre;
      void main() {
        vec3 n = normalize(vWorldNormal);
        vec3 v = normalize(cameraPosition - vWorldPosition);
        // The sun, leaned towards the viewer (see MOON_EARTH_VIEWER_LEAN).
        vec3 toViewer = normalize(cameraPosition - vEarthCentre);
        vec3 l = normalize(normalize(uSunDirection) + toViewer * uViewerLean);
        float sun = dot(n, l);
        float day = smoothstep(-0.08, 0.22, sun);
        // The map is loaded without a colour space, so decode its sRGB by hand.
        vec3 albedo = pow(texture2D(uEarthMap, vUv).rgb, vec3(2.2));
        // Oceans glint a little where the sun sits behind the viewer.
        float ocean = smoothstep(0.12, 0.02, albedo.r - albedo.b * 0.6);
        vec3 h = normalize(l + v);
        float glint = pow(max(dot(n, h), 0.0), 60.0) * ocean * day * 0.35;
        vec3 lit = albedo * (0.1 + 1.65 * max(sun, 0.0)) * day + glint;
        vec3 night = albedo * 0.006;
        vec3 colour = mix(night, lit, day);
        // Thin atmosphere line: only at the very limb, only where lit.
        float rim = 1.0 - max(dot(n, v), 0.0);
        float limb = smoothstep(0.86, 0.985, rim) * smoothstep(-0.25, 0.35, sun);
        colour += vec3(0.32, 0.55, 1.15) * limb * 0.8;
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: false,
  });
  const earth = new Mesh(geometry, material);
  earth.name = "MoonEarthSurface";
  object.add(earth);
  return {
    object,
    material,
    update(deltaSeconds) {
      earth.rotation.y +=
        deltaSeconds * options.rotationSpeed * Math.max(0, options.motionScale);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      object.clear();
    },
  };
}

/**
 * A small point of reflected sunlight that drifts across the sky: one pass
 * every `period` seconds, taking `crossing` seconds. Off with motion off.
 */
export function createMoonOrbiter(options: {
  motionScale: number;
  period?: number;
  crossing?: number;
}): MoonSkyElement {
  const period = options.period ?? 46;
  const crossing = options.crossing ?? 22;
  const object = new Group();
  object.name = "MoonOrbiter";
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
  const material = new ShaderMaterial({
    name: "MoonOrbiterMaterial",
    uniforms: { uLevel: { value: 0 } },
    vertexShader: /* glsl */ `
      void main() {
        gl_PointSize = 2.8;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLevel;
      void main() {
        float falloff = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(1.6, 1.55, 1.45) * uLevel * falloff, 1.0);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const point = new Points(geometry, material);
  point.name = "MoonOrbiterPoint";
  point.frustumCulled = false;
  object.add(point);
  // A great-circle arc high over the pad, from the back right to the left.
  const start = new Vector3(0.75, 0.32, -0.58).normalize();
  const end = new Vector3(-0.7, 0.5, -0.5).normalize();
  const along = new Vector3();
  let clock = period - crossing * 0.8;
  object.visible = options.motionScale > 0;
  return {
    object,
    update(deltaSeconds, camera) {
      object.position.copy(camera.position);
      if (options.motionScale <= 0) return;
      clock = (clock + deltaSeconds * options.motionScale) % period;
      const t = clock / crossing;
      if (t > 1) {
        material.uniforms.uLevel!.value = 0;
        return;
      }
      along.copy(start).lerp(end, t).normalize().multiplyScalar(STAR_RADIUS - 5);
      geometry.attributes.position!.setXYZ(0, along.x, along.y, along.z);
      geometry.attributes.position!.needsUpdate = true;
      // Fades in and out, with a slow tumble glint.
      const fade = Math.sin(Math.PI * t);
      material.uniforms.uLevel!.value =
        fade * (0.6 + 0.4 * Math.sin(clock * 2.1) ** 2);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      object.clear();
    },
  };
}
