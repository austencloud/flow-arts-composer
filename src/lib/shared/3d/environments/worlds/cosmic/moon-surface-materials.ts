import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from "three";

/**
 * Lunar surface materials. The outpost model carries no textures: every
 * ground surface is shaded here from layered value noise in world space, at
 * scales from metres down to centimetres, so nothing tiles. The track, boot
 * and pad materials compute the same regolith first and darken or lighten it,
 * so their edges melt into the ground around them.
 */

export type MoonSurfaceKind = "regolith" | "rock" | "track" | "boot" | "pad";

/** Metres the tracks and bootprints float above the terrain they drape. */
const GROUND_DECAL_LIFT = 0.035;

const NOISE_CHUNK = /* glsl */ `
varying vec3 vMoonWorld;
float moonHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float moonNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(moonHash(i), moonHash(i + vec3(1, 0, 0)), f.x),
        mix(moonHash(i + vec3(0, 1, 0)), moonHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(moonHash(i + vec3(0, 0, 1)), moonHash(i + vec3(1, 0, 1)), f.x),
        mix(moonHash(i + vec3(0, 1, 1)), moonHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float moonFbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * moonNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum;
}
// Regolith albedo multiplier around 1: broad patches of lighter and darker
// dust, mid-scale mottling, fine grain. World-space xz keeps it seamless
// across the terrain, the tracks and the pad.
// Detail finer than a pixel fades out, so the far ground does not sparkle.
float moonFade(vec3 w, float frequency) {
  return 1.0 - smoothstep(0.2, 0.55, length(fwidth(w.xz)) * frequency);
}
// Scattered pebbles on a jittered grid of cells 1/scale metres across:
// x is a darkening (0..1), y a height in cell units. Only a share "chance" of the
// cells hold one. Faded out by the caller where a cell is under a pixel.
vec2 moonPebbles(vec2 xz, float scale, float chance, float seed) {
  vec2 g = xz * scale;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  vec2 result = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec3 id = vec3(cell + o, seed);
      if (moonHash(id + 0.37) > chance) continue;
      vec2 centre = o + 0.15 + 0.7 * vec2(moonHash(id + 1.3), moonHash(id + 2.9));
      float radius = mix(0.14, 0.32, moonHash(id + 4.1));
      float d = length((f - centre) * vec2(1.0, mix(0.7, 1.3, moonHash(id + 6.7))));
      float body = smoothstep(radius, radius * 0.55, d);
      float dome = sqrt(max(0.0, 1.0 - d * d / (radius * radius)));
      result.x = max(result.x, body * mix(0.25, 0.55, moonHash(id + 8.3)));
      result.y = max(result.y, dome * radius);
    }
  }
  return result;
}
float moonRegolithTone(vec3 w) {
  float broad = moonFbm(vec3(w.xz * 0.035, 0.3), 4);
  float mid = moonFbm(vec3(w.xz * 0.45, 2.1), 4);
  float grain = moonNoise(vec3(w.xz * 9.0, 5.7));
  float fine = moonNoise(vec3(w.xz * 31.0, 3.3));
  float tone = 0.78 + broad * 0.38 + (mid - 0.5) * 0.22
    + (grain - 0.5) * 0.12 * moonFade(w, 9.0)
    + (fine - 0.5) * 0.18 * moonFade(w, 31.0);
  // Pebbles: a light scatter of gravel and rarer stones, colour only (a bump
  // this small breaks into pixel blocks), gone well before they are a few
  // pixels across so the far ground stays clean.
  float gravel = moonPebbles(w.xz, 7.0, 0.24, 1.0).x * moonFade(w, 28.0);
  float stones = moonPebbles(w.xz, 2.2, 0.07, 2.0).x * moonFade(w, 9.0);
  return tone * (1.0 - max(gravel, stones) * 0.42);
}
// Small relief for the bump: pocks, ripples and grit at three scales.
float moonRegolithHeight(vec3 w) {
  float mid = moonFbm(vec3(w.xz * 0.9, 7.3), 4);
  float fine = moonFbm(vec3(w.xz * 6.0, 1.9), 3);
  float grit = moonNoise(vec3(w.xz * 31.0, 9.1));
  return mid * 0.05 * moonFade(w, 4.0) + fine * 0.012 * moonFade(w, 24.0)
    + grit * 0.002 * moonFade(w, 62.0);
}
// 0 inside the landing pad's painted edge, rising to 1 just outside it: the
// tracks and bootprints end there whatever size the pad has grown to.
float moonOffPad(vec3 w, float padRadius) {
  return smoothstep(padRadius, padRadius + 0.7, length(w.xz));
}
vec3 moonPerturbNormal(vec3 surfPos, vec3 surfNorm, float h, float faceDirection) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1) * faceDirection;
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** Per-kind fragment code: sets `moonTone` (albedo multiplier) and `moonH`. */
const KIND_CHUNKS: Record<MoonSurfaceKind, string> = {
  regolith: /* glsl */ `
    float moonTone = moonRegolithTone(vMoonWorld);
    float moonH = moonRegolithHeight(vMoonWorld);
  `,
  rock: /* glsl */ `
    float rockBase = moonFbm(vMoonWorld * 1.7, 5);
    float rockFine = moonNoise(vMoonWorld * 14.0);
    float moonTone = 0.72 + rockBase * 0.55 + (rockFine - 0.5) * 0.16 * moonFade(vMoonWorld, 14.0);
    float moonH = rockBase * 0.06 + rockFine * 0.008;
  `,
  // UV: x across the tread (0..1), y along it in metres.
  track: /* glsl */ `
    float across = vMoonUv.x;
    float edge = smoothstep(0.0, 0.18, across) * smoothstep(1.0, 0.82, across);
    float chevron = fract(vMoonUv.y * 4.0 + abs(across - 0.5) * 0.9);
    // Cleats fade before they are small enough to alias into stair steps.
    float cleat = smoothstep(0.35, 0.45, chevron) * smoothstep(0.75, 0.65, chevron)
      * moonFade(vMoonWorld, 8.0);
    float offPad = moonOffPad(vMoonWorld, uPadRadius);
    if (offPad <= 0.0) discard;
    edge *= offPad;
    float moonTone = moonRegolithTone(vMoonWorld) * mix(1.0, 0.68 - cleat * 0.1, edge);
    float moonH = moonRegolithHeight(vMoonWorld) * (1.0 - edge * 0.7) - edge * (0.012 + cleat * 0.01);
  `,
  // UV: x across the sole, y along it (0..1), one print per quad.
  boot: /* glsl */ `
    vec2 q = vMoonUv - 0.5;
    float width = mix(0.36, 0.44, smoothstep(-0.2, 0.3, abs(q.y)));
    float sole = smoothstep(0.5, 0.42, length(vec2(q.x / width, q.y * 1.05)))
      * moonOffPad(vMoonWorld, uPadRadius);
    float lug = step(0.5, fract(q.y * 9.0));
    float moonTone = moonRegolithTone(vMoonWorld) * mix(1.0, 0.7 - lug * 0.06, sole);
    float moonH = moonRegolithHeight(vMoonWorld) * (1.0 - sole * 0.8) - sole * (0.006 + lug * 0.003);
    if (sole < 0.01) discard;
  `,
  // Pad: packed, lighter, smoother regolith with worn paint, fading into the
  // ground beyond its painted edge. vPadLocal is in metres from the pad centre.
  pad: /* glsl */ `
    float r = length(vPadLocal);
    float rn = r / uPadRadius;
    float a = atan(vPadLocal.y, vPadLocal.x);
    float packedMask = smoothstep(1.16, 1.0, rn);
    float wear = moonFbm(vec3(vMoonWorld.xz * 1.3, 4.4), 4);
    float scuff = moonFbm(vec3(vMoonWorld.xz * 7.0, 8.1), 3);
    float paintKeep = smoothstep(0.3, 0.55, wear + scuff * 0.35);
    // Outer dashed ring, inner thin ring, four diagonal ticks.
    float ringOuter = smoothstep(0.012, 0.0, abs(rn - 0.93) - 0.022);
    float dashes = step(0.38, fract(a / 6.2831853 * 24.0));
    float ringInner = smoothstep(0.008, 0.0, abs(rn - 0.5) - 0.007);
    float tickAngle = abs(fract(a / 6.2831853 * 4.0) - 0.5) * 6.2831853 / 4.0 * r;
    float ticks = smoothstep(0.03, 0.0, tickAngle - 0.06) * step(0.6, rn) * step(rn, 0.8);
    float white = max(ringOuter * dashes, max(ringInner, ticks)) * paintKeep;
    float amberArc = smoothstep(0.012, 0.0, abs(rn - 0.87) - 0.012)
      * step(0.5, fract(a / 6.2831853 * 2.0 + 0.05)) * step(fract(a / 6.2831853 * 2.0 + 0.05), 0.62);
    float amber = amberArc * paintKeep;
    float base = moonRegolithTone(vMoonWorld);
    // Packed: the same regolith, a touch lighter, with boot scuffs (short
    // dark streaks), drag marks and the gravel trodden in rather than gone.
    float streak = moonFbm(vec3(vMoonWorld.x * 2.2, vMoonWorld.z * 9.0, 6.6), 3);
    float scuffs = smoothstep(0.58, 0.7, streak) * moonFade(vMoonWorld, 9.0);
    float packedTone = base * (1.04 + (wear - 0.5) * 0.24) * (1.0 - scuffs * 0.16);
    float moonTone = mix(base, packedTone, packedMask);
    float moonH = moonRegolithHeight(vMoonWorld) * mix(1.0, 0.6, packedMask)
      - scuffs * 0.004 * packedMask;
    vec3 paintColour = mix(vec3(0.86, 0.85, 0.82), vec3(0.95, 0.55, 0.14), amber / (white + amber + 1e-4));
    float paint = clamp(white + amber, 0.0, 1.0) * packedMask;
  `,
};

interface MoonSurfaceSpec {
  color: string;
  roughness: number;
}

const SPECS: Record<MoonSurfaceKind, MoonSurfaceSpec> = {
  regolith: { color: "#8a8784", roughness: 1 },
  rock: { color: "#6f6c69", roughness: 0.92 },
  track: { color: "#8a8784", roughness: 1 },
  boot: { color: "#8a8784", roughness: 1 },
  pad: { color: "#858280", roughness: 0.97 },
};

export interface MoonSurfaceMaterial extends MeshStandardMaterial {
  userData: { moonSurface: MoonSurfaceKind; padRadius?: { value: number } };
}

/**
 * One lunar surface material. `padRadius` only matters for the pad, which
 * needs it to place its markings; `setMoonPadRadius` changes it later.
 */
export function createMoonSurfaceMaterial(
  kind: MoonSurfaceKind,
  padRadius = 1
): MoonSurfaceMaterial {
  const spec = SPECS[kind];
  const material = new MeshStandardMaterial({
    color: new Color(spec.color),
    roughness: spec.roughness,
    metalness: 0,
  }) as MoonSurfaceMaterial;
  material.name = `MoonSurface-${kind}`;
  material.userData.moonSurface = kind;
  const padUniform = { value: padRadius };
  material.userData.padRadius = padUniform;
  if (kind === "track" || kind === "boot") {
    // The Blender builder winds these quads clockwise seen from above, so
    // their front faces point into the ground. Draw both sides; three flips
    // the normal for the side it sees.
    material.side = DoubleSide;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
  }
  if (kind === "pad") {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
  }
  const usesUv = kind === "track" || kind === "boot";
  material.customProgramCacheKey = () => `moon-surface-${kind}`;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uPadRadius = padUniform;
    const uvDecl = usesUv ? "varying vec2 vMoonUv;\n" : "";
    const uvVert = usesUv ? "vMoonUv = uv;\n" : "";
    const padDecl = kind === "pad" ? "varying vec2 vPadLocal;\n" : "";
    const padVert = kind === "pad" ? "vPadLocal = position.xy;\n" : "";
    // Tracks and prints are draped on the terrain's exact height, but the
    // terrain mesh is coarser and its flat triangles can rise a few
    // centimetres above them. Lift them in world space so they never sink.
    const liftVert =
      kind === "track" || kind === "boot"
        ? `vec4 moonLifted = modelMatrix * vec4(transformed, 1.0);
        moonLifted.y += ${GROUND_DECAL_LIFT.toFixed(3)};
        mvPosition = viewMatrix * moonLifted;
        gl_Position = projectionMatrix * mvPosition;
        `
        : "";
    shader.vertexShader =
      `varying vec3 vMoonWorld;\n${uvDecl}${padDecl}` +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vMoonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ${liftVert}${uvVert}${padVert}`
      );
    shader.fragmentShader =
      `${uvDecl}${padDecl}uniform float uPadRadius;\n` +
      shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE_CHUNK}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          ${KIND_CHUNKS[kind]}
          diffuseColor.rgb *= moonTone;
          ${kind === "pad" ? "diffuseColor.rgb = mix(diffuseColor.rgb, paintColour * 0.7, paint);" : ""}`
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          normal = moonPerturbNormal(-vViewPosition, normal, moonH, faceDirection);`
        );
  };
  return material;
}

/** Re-point the pad's markings at a new radius. */
export function setMoonPadRadius(material: MeshStandardMaterial, radius: number): void {
  const uniform = material.userData.padRadius as { value: number } | undefined;
  if (uniform) uniform.value = radius;
}
