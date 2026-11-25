/**
 * The ground underfoot, with real relief.
 *
 * The site's own canvas textures are flat colour at about a centimetre a pixel,
 * so a low sun had nothing to catch. Here the graphics card draws each surface
 * once at a couple of millimetres: every stone, chip and blade has a height, and
 * the height becomes a normal map the sun rakes across.
 *
 * Where a photographed surface arrived (`site-walk-dressing.ts`), the material
 * wears that at its true size instead, and the drawn one is not baked at all.
 *
 * `refineSurfaces` finds the site's materials by the picture they wear and gives
 * them the better one, plus three things a tiled picture cannot have on its own:
 * a second turned sample blended in so the repeat never shows, slow patches of
 * lighter and darker ground, and, on the lawn and the lot, a bright edge when
 * you look into the sun.
 */

import {
  Color,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  AROUND_TILE,
  grassTexture,
  mulchTexture,
  slabTexture,
  walkTexture,
  wallTexture,
} from "../site-walk-around-textures";
import {
  TILE,
  asphaltMaps,
  gravelMaps,
  paverMaps,
} from "../site-walk-textures";
import { WALL_TILE } from "../site-walk-buildings";
import type { WallKind } from "../site-walk-around";
import type { Scan } from "./site-walk-dressing";
import {
  WALL_SCAN,
  scanRelief,
  scanRepeat,
  type ScanName,
} from "./site-walk-scan-list";
import { skyNoise } from "./site-walk-sky-shader";

type Kind = "gravel" | "asphalt" | "mulch" | "grass" | "pavers" | "concrete";

interface Surface {
  kind: Kind;
  /** Metres one repeat covers: fixed by the mesh's own UVs. */
  tile: number;
  /** How far the relief is pushed. */
  relief: number;
  /** How strong the slow light and dark patches are. */
  patches: number;
  roughness: number;
  /** Pavers and slabs have joints that must stay where they are. */
  turned: boolean;
  /** Poured joints cut into a photographed slab: every `every` metres, one way or both. */
  joints?: { every: number; both: boolean };
}

const SURFACES: Record<Kind, Omit<Surface, "kind" | "tile">> = {
  gravel: { relief: 1, patches: 0.2, roughness: 0.95, turned: true },
  asphalt: { relief: 0.8, patches: 0.16, roughness: 0.92, turned: true },
  mulch: { relief: 1, patches: 0.22, roughness: 0.96, turned: true },
  grass: { relief: 1, patches: 0.3, roughness: 1, turned: true },
  pavers: { relief: 0.9, patches: 0.12, roughness: 0.88, turned: false },
  concrete: { relief: 0.6, patches: 0.14, roughness: 0.9, turned: false },
};

const BAKE = /* glsl */ `
  varying vec2 vUv;
  uniform float uTile;
  uniform float uTexel;
  uniform float uRelief;
  uniform bool uNormal;
  uniform sampler2D uPicture;

  float h11(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec3 h33(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
  float vnoise(vec2 uv, float n, float s) {
    vec2 p = uv * n;
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = h11(mod(i, n) + s);
    float b = h11(mod(i + vec2(1.0, 0.0), n) + s);
    float c = h11(mod(i + vec2(0.0, 1.0), n) + s);
    float d = h11(mod(i + vec2(1.0, 1.0), n) + s);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 uv, float n, float s) {
    return vnoise(uv, n, s) * 0.5 + vnoise(uv, n * 2.0, s + 3.0) * 0.26 + vnoise(uv, n * 4.0, s + 7.0) * 0.15 + vnoise(uv, n * 8.0, s + 11.0) * 0.09;
  }

  struct S { vec3 albedo; float height; float open; };

  // Round stones lying in a layer; each is a little dome of its own colour.
  void stones(inout S s, vec2 uv, float n, float seed, float share, float size, vec3 a, vec3 b, float lift) {
    vec2 p = uv * n;
    vec2 i = floor(p);
    float metres = uTile / n;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(float(x), float(y));
      vec3 r = h33(mod(c, n) + seed);
      vec3 q = h33(mod(c, n) + seed + 57.0);
      if (q.z > share) continue;
      vec2 d = p - (c + 0.15 + 0.7 * r.xy);
      float turn = r.z * 6.283;
      d = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * d;
      d.x *= 1.0 + 0.55 * q.x;
      float radius = size * (0.55 + 0.45 * q.y);
      float k = length(d) / radius;
      // A chipped outline rather than a perfect round.
      k += (vnoise(uv, n * 3.0, seed + 5.0) - 0.5) * 0.35;
      if (k >= 1.0) continue;
      float dome = sqrt(1.0 - k * k);
      float hgt = lift + (dome - 0.35) * radius * metres * 0.75;
      if (hgt > s.height) {
        s.height = hgt;
        vec3 tone = mix(a, b, q.x) * (0.78 + 0.44 * r.z);
        tone *= 0.86 + 0.28 * vnoise(uv, n * 9.0, seed + 2.0);
        s.albedo = tone;
        s.open = 0.72 + 0.28 * dome;
      }
    }
  }

  // Slivers thrown down any which way: wood chips, leaves, blades.
  void slivers(inout S s, vec2 uv, float n, float seed, float share, vec2 size, vec3 a, vec3 b, float lift, float thick, float grain) {
    vec2 p = uv * n;
    vec2 i = floor(p);
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec2 c = i + vec2(float(x), float(y));
      vec3 r = h33(mod(c, n) + seed);
      vec3 q = h33(mod(c, n) + seed + 91.0);
      if (q.z > share) continue;
      vec2 d = p - (c + r.xy);
      float turn = r.z * 6.283;
      d = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * d;
      vec2 half2 = size * (vec2(0.55, 0.6) + vec2(0.45, 0.4) * q.xy);
      vec2 k = abs(d) / half2;
      float taper = 1.0 - 0.45 * k.x * k.x;
      float edge = max(k.x, k.y / taper);
      if (edge >= 1.0) continue;
      // Tipped a little along its length, so one end shades the next.
      float tip = (q.y - 0.5) * d.x / half2.x;
      float round_ = 1.0 - (k.y / taper) * (k.y / taper);
      float hgt = lift + thick * (0.5 + 0.8 * q.x + 0.7 * tip + 0.35 * round_);
      if (hgt > s.height) {
        s.height = hgt;
        float fibre = vnoise(vec2(d.x * 0.15 + r.x, d.y * 3.0 + r.y), 64.0, seed);
        vec3 tone = mix(a, b, fract(q.x * 7.7 + r.x)) * (0.72 + 0.5 * r.y);
        s.albedo = tone * mix(1.0, 0.74 + 0.52 * fibre, grain);
        s.open = 0.55 + 0.45 * smoothstep(1.0, 0.55, edge);
      }
    }
  }

  S surface(vec2 uv) {
    S s;
    s.open = 1.0;
  #if KIND == 0
    float grit = fbm(uv, 48.0, 1.0);
    s.height = (grit - 0.5) * 0.006 + (fbm(uv, 6.0, 4.0) - 0.5) * 0.014;
    s.albedo = mix(vec3(0.115, 0.096, 0.076), vec3(0.25, 0.215, 0.172), fbm(uv, 24.0, 9.0)) * (0.7 + 0.6 * vnoise(uv, 500.0, 2.0));
    s.open = 0.6 + 0.4 * grit;
    float bed = s.height;
    stones(s, uv, 300.0, 11.0, 0.8, 0.62, vec3(0.16, 0.14, 0.115), vec3(0.4, 0.36, 0.3), bed - 0.001);
    stones(s, uv, 150.0, 23.0, 0.55, 0.6, vec3(0.17, 0.15, 0.13), vec3(0.46, 0.42, 0.36), bed);
    stones(s, uv, 72.0, 37.0, 0.22, 0.5, vec3(0.2, 0.18, 0.16), vec3(0.5, 0.46, 0.41), bed + 0.001);
  #elif KIND == 1
    float tar = fbm(uv, 40.0, 1.0);
    s.height = (tar - 0.5) * 0.002;
    s.albedo = vec3(0.036, 0.037, 0.04) * (0.8 + 0.4 * tar);
    stones(s, uv, 340.0, 5.0, 0.9, 0.66, vec3(0.06), vec3(0.16, 0.155, 0.148), s.height - 0.0012);
    stones(s, uv, 210.0, 15.0, 0.5, 0.6, vec3(0.07), vec3(0.19, 0.18, 0.17), s.height - 0.001);
    s.height *= 0.55;
  #elif KIND == 2
    float soil = fbm(uv, 24.0, 1.0);
    s.height = (soil - 0.5) * 0.012 - 0.008;
    s.albedo = vec3(0.03, 0.022, 0.016) * (0.6 + 0.8 * soil);
    s.open = 0.4;
    slivers(s, uv, 70.0, 3.0, 1.0, vec2(0.95, 0.24), vec3(0.078, 0.048, 0.031), vec3(0.2, 0.126, 0.082), -0.006, 0.006, 1.0);
    slivers(s, uv, 48.0, 19.0, 0.85, vec2(1.05, 0.25), vec3(0.09, 0.054, 0.035), vec3(0.235, 0.148, 0.097), 0.0, 0.008, 1.0);
    slivers(s, uv, 34.0, 41.0, 0.34, vec2(0.95, 0.2), vec3(0.11, 0.07, 0.047), vec3(0.3, 0.205, 0.142), 0.005, 0.008, 1.0);
    slivers(s, uv, 21.0, 67.0, 0.09, vec2(0.52, 0.3), vec3(0.17, 0.09, 0.04), vec3(0.34, 0.22, 0.1), 0.012, 0.006, 0.35);
  #elif KIND == 3
    float soil = fbm(uv, 30.0, 1.0);
    float lush = smoothstep(0.35, 0.65, fbm(uv, 5.0, 31.0));
    s.height = (soil - 0.5) * 0.016 - 0.012;
    s.albedo = vec3(0.04, 0.034, 0.02) * (0.6 + 0.8 * soil);
    s.open = 0.45;
    vec3 dryA = vec3(0.15, 0.122, 0.06), dryB = vec3(0.33, 0.28, 0.16);
    vec3 liveA = vec3(0.065, 0.085, 0.028), liveB = vec3(0.16, 0.175, 0.066);
    vec3 a = mix(dryA, liveA, lush), b = mix(dryB, liveB, lush);
    slivers(s, uv, 84.0, 3.0, 1.0, vec2(1.6, 0.13), a * 0.7, b * 0.75, -0.01, 0.012, 0.5);
    slivers(s, uv, 84.0, 29.0, 1.0, vec2(1.7, 0.1), a, b, -0.002, 0.014, 0.5);
    slivers(s, uv, 62.0, 53.0, 0.9, vec2(1.6, 0.08), dryA, dryB, 0.004, 0.014, 0.4);
    slivers(s, uv, 22.0, 71.0, 0.07, vec2(0.36, 0.2), vec3(0.16, 0.08, 0.03), vec3(0.32, 0.2, 0.09), 0.014, 0.005, 0.3);
  #else
    // A picture with joints that must stay put: its own colours, its darkness read as depth, and a grain.
    vec3 c = texture2D(uPicture, uv).rgb;
    float l = dot(c, vec3(0.333));
    float grain = fbm(uv, 90.0, 3.0);
    s.albedo = c * (0.82 + 0.36 * grain);
    s.height = l * 0.012 + (grain - 0.5) * 0.0026 + (vnoise(uv, 400.0, 8.0) - 0.5) * 0.0008;
  #endif
    return s;
  }

  void main() {
    S s = surface(vUv);
    if (uNormal) {
      float e = uTexel;
      float hx = surface(vUv + vec2(e, 0.0)).height - s.height;
      float hy = surface(vUv + vec2(0.0, e)).height - s.height;
      vec3 n = normalize(vec3(-hx, -hy, e * uTile / uRelief));
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
    } else {
      gl_FragColor = vec4(s.albedo * s.open, 1.0);
    }
  }
`;

const KINDS: readonly Kind[] = [
  "gravel",
  "asphalt",
  "mulch",
  "grass",
  "pavers",
  "concrete",
];

export interface Baked {
  albedo: Texture;
  normal: Texture;
  dispose(): void;
}

function bake(
  renderer: WebGLRenderer,
  kind: Kind,
  tile: number,
  size: number,
  picture: Texture | null
): Baked {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const target = (colour: boolean) => {
    const t = new WebGLRenderTarget(size, size, {
      type: UnsignedByteType,
      colorSpace: colour ? SRGBColorSpace : LinearSRGBColorSpace,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      anisotropy: Math.min(16, renderer.capabilities.getMaxAnisotropy()),
    });
    return t;
  };
  const material = new ShaderMaterial({
    defines: { KIND: KINDS.indexOf(kind) },
    uniforms: {
      uTile: { value: tile },
      uTexel: { value: 1 / size },
      uRelief: { value: SURFACES[kind].relief },
      uNormal: { value: false },
      uPicture: { value: picture },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: BAKE,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const before = renderer.getRenderTarget();
  const draw = (normal: boolean) => {
    const t = target(!normal);
    material.uniforms.uNormal!.value = normal;
    renderer.setRenderTarget(t);
    renderer.render(scene, camera);
    return t;
  };
  const albedo = draw(false);
  const normal = draw(true);
  renderer.setRenderTarget(before);
  quad.geometry.dispose();
  material.dispose();
  return {
    albedo: albedo.texture,
    normal: normal.texture,
    dispose() {
      albedo.dispose();
      normal.dispose();
    },
  };
}

/** Second sample, slow patches, and a soft edge toward the sun, added to a stock material. */
function enrich(material: MeshStandardMaterial, surface: Surface): void {
  const scale = new Vector2(surface.tile, surface.patches);
  const { joints } = surface;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundNoise = { value: skyNoise() };
    shader.uniforms.uGround2 = { value: scale };
    if (joints) shader.uniforms.uJoint = { value: joints.every };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        uniform sampler2D uGroundNoise;
        uniform vec2 uGround2;
        ${joints ? JOINTS : ""}
        const mat2 GROUND_TURN = mat2(0.5736, -0.8192, 0.8192, 0.5736);
        float groundMix = 0.0;
        vec2 groundUv2(vec2 uv) { return GROUND_TURN * uv * 0.87 + vec2(0.37, 0.71); }`
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        vec2 groundM = vMapUv * uGround2.x;
        ${surface.turned ? "groundMix = smoothstep(0.44, 0.56, texture2D(uGroundNoise, groundM * 0.041).r * 0.75 + texture2D(uGroundNoise, groundM * 0.21).b * 0.25);" : ""}
        vec4 groundA = texture2D(map, vMapUv);
        ${surface.turned ? "groundA = mix(groundA, texture2D(map, groundUv2(vMapUv)), groundMix);" : ""}
        diffuseColor *= groundA;
        float groundPatch = texture2D(uGroundNoise, groundM * 0.012).r * 0.6 + texture2D(uGroundNoise, groundM * 0.051 + 0.3).r * 0.4;
        diffuseColor.rgb *= 1.0 + (groundPatch - 0.5) * 2.6 * uGround2.y;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.9), clamp((groundPatch - 0.5) * 3.0 * uGround2.y * 2.0, 0.0, 1.0));
        ${
          joints
            ? /* glsl */ `
        vec3 groundJoint = jointAt(groundM, ${joints.both ? "1.0" : "0.0"});
        // Dirt gathers in a joint, and the trowelled edge beside it wears paler.
        diffuseColor.rgb *= mix(1.0, 0.4, groundJoint.z) * (1.0 + 0.1 * groundJoint.z * (1.0 - groundJoint.z) * 4.0);`
            : ""
        }`
      )
      .replace(
        "#include <normal_fragment_maps>",
        surface.turned
          ? /* glsl */ `
        vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
        vec3 mapN2 = texture2D(normalMap, groundUv2(vNormalMapUv)).xyz * 2.0 - 1.0;
        mapN2.xy = mapN2.xy * GROUND_TURN;
        mapN = normalize(mix(mapN, mapN2, groundMix));
        ${joints ? "mapN.xy += groundJoint.xy * 0.6;" : ""}
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`
          : "#include <normal_fragment_maps>"
      );
  };
  material.customProgramCacheKey = () =>
    `site-ground-${surface.kind}-${surface.turned}-${joints ? joints.both : "plain"}`;
  material.needsUpdate = true;
}

/** Where the poured joints run: which way their sides lean (xy), and how deep in one this is (z). */
const JOINTS = /* glsl */ `
  uniform float uJoint;
  vec3 jointAt(vec2 metres, float both) {
    vec2 d = (fract(metres / uJoint + 0.5) - 0.5) * uJoint;
    vec2 soft = max(fwidth(metres), vec2(0.004));
    vec2 in2 = 1.0 - smoothstep(vec2(0.004), vec2(0.004) + soft, abs(d));
    // A joint thinner than a pixel fades rather than crawling.
    in2 *= clamp(0.011 / soft, 0.0, 1.0);
    in2.y *= both;
    vec2 lean = -sign(d) * in2 * (1.0 - in2) * 4.0;
    return vec3(lean, max(in2.x, in2.y));
  }
`;

/** Brick, stone and boards from a photograph: courses stay true, the repeat does not show, and the foot is a little grimy. */
function facade(material: MeshStandardMaterial, name: ScanName): void {
  // Every repeat of coursed work can slide along its own bed without breaking a course.
  const slides = name !== "stone";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundNoise = { value: skyNoise() };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWall;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWall = (modelMatrix * vec4(position, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        varying vec3 vWall;
        uniform sampler2D uGroundNoise;
        vec2 wallUv(vec2 uv) {
          ${slides ? "uv.x += fract(sin(floor(uv.y) * 12.9898) * 43758.5453);" : ""}
          return uv;
        }`
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        vec2 wallSlid = wallUv(vMapUv);
        vec4 wallTexel = textureGrad(map, wallSlid, dFdx(vMapUv), dFdy(vMapUv));
        vec2 wallAt = vec2(vWall.x + vWall.z, vWall.y);
        float wallPatch = texture2D(uGroundNoise, wallAt * vec2(0.031, 0.047)).r;
        float wallStreak = texture2D(uGroundNoise, wallAt * vec2(0.21, 0.013)).b;
        wallTexel.rgb *= 1.0 + (wallPatch - 0.5) * 0.34 + (wallStreak - 0.5) * 0.1;
        wallTexel.rgb *= mix(0.82, 1.0, smoothstep(0.0, 0.7, vWall.y + (wallPatch - 0.5) * 0.5));
        diffuseColor *= wallTexel;`
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        vec3 mapN = textureGrad(normalMap, wallSlid, dFdx(vNormalMapUv), dFdy(vNormalMapUv)).xyz * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        "totalEmissiveRadiance *= wallTexel.rgb;"
      );
  };
  material.customProgramCacheKey = () => `site-facade-${slides}`;
  material.needsUpdate = true;
}

/** The mean of the bark photograph, linear: each limb keeps its own colour and takes the bark's light and shade. */
const BARK_MEAN = new Vector3(0.2081, 0.1642, 0.1284);

/** Photographed bark round a trunk and its limbs, by the trees' own UVs. */
function scannedBark(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBarkMean = { value: BARK_MEAN };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uBarkMean;"
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        // The same mesh holds the odd evergreen; its needles are not bark.
        float wood = step(vColor.g, vColor.r);
        vec3 barkShade = texture2D(map, vMapUv).rgb / uBarkMean;`
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec3 worn = mix(vec3(dot(diffuseColor.rgb, vec3(0.333))), diffuseColor.rgb, 0.7) * 0.62;
        diffuseColor.rgb = mix(diffuseColor.rgb, worn * barkShade, wood);`
      );
  };
  material.customProgramCacheKey = () => "site-bark-scan";
  material.needsUpdate = true;
}

/** Woven cloth laid by the metre, with the slack a hung panel always has. The colour stays the plan's. */
function weave(material: MeshStandardMaterial, scan: Scan): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundNoise = { value: skyNoise() };
    shader.uniforms.uWeave = { value: scan.normal };
    shader.uniforms.uWeaveSize = {
      value: new Vector4(1 / scan.wide, 1 / scan.high, 0.55, 0.05),
    };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vCloth;\nvarying vec3 vClothN;"
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vCloth = (modelMatrix * vec4(position, 1.0)).xyz;
        vClothN = mat3(modelMatrix) * normal;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        varying vec3 vCloth;
        varying vec3 vClothN;
        uniform sampler2D uGroundNoise;
        uniform sampler2D uWeave;
        uniform vec4 uWeaveSize;`
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        vec3 clothN = abs(normalize(vClothN));
        bool clothTop = clothN.y > 0.6;
        bool clothX = clothN.x > clothN.z;
        vec3 clothT = clothTop || !clothX ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
        vec3 clothB = clothTop ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
        vec2 clothAt = vec2(dot(vCloth, clothT), dot(vCloth, clothB));
        vec2 threads = texture2D(uWeave, clothAt * uWeaveSize.xy).xy * 2.0 - 1.0;
        // Slack: long soft folds that hang down a wall and run along a roof.
        vec2 slackAt = clothAt * vec2(0.23, 0.035);
        float slack0 = texture2D(uGroundNoise, slackAt).r;
        vec2 slack = vec2(
          texture2D(uGroundNoise, slackAt + vec2(0.012, 0.0)).r - slack0,
          (texture2D(uGroundNoise, slackAt + vec2(0.0, 0.012)).r - slack0) * 0.3
        ) / 0.012;
        vec2 lean = threads * uWeaveSize.z - slack * uWeaveSize.w;
        normal = normalize(normal + (viewMatrix * vec4(clothT, 0.0)).xyz * lean.x + (viewMatrix * vec4(clothB, 0.0)).xyz * lean.y);`
      );
  };
  material.customProgramCacheKey = () => "site-weave";
  material.needsUpdate = true;
}

/** Furrows down a trunk or a pole, from the surface's own place in the world. */
function bark(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundNoise = { value: skyNoise() };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBark;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBark = (modelMatrix * vec4(position, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        varying vec3 vBark;
        uniform sampler2D uGroundNoise;
        float barkHeight(vec3 p) {
          vec2 q = vec2((p.x * 0.8 + p.z) * 1.3, p.y * 0.3);
          float a = texture2D(uGroundNoise, q).r;
          float b = texture2D(uGroundNoise, q * 2.7 + 0.4).b;
          return abs(a - 0.5) * 1.4 + abs(b - 0.5) * 0.7;
        }`
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        float barkH = barkHeight(vBark);
        float barkFar = smoothstep(26.0, 8.0, length(vViewPosition));
        // The same mesh holds the odd evergreen; its needles are not bark.
        float wood = step(diffuseColor.g, diffuseColor.r);
        barkH *= wood;
        vec3 worn = mix(vec3(dot(diffuseColor.rgb, vec3(0.333))), diffuseColor.rgb, 0.7) * 0.66;
        diffuseColor.rgb = mix(diffuseColor.rgb, worn * mix(1.0, 0.42 + 2.1 * barkH, 0.3 + 0.7 * barkFar), wood);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        vec3 barkX = dFdx(-vViewPosition);
        vec3 barkY = dFdy(-vViewPosition);
        vec3 barkR1 = cross(barkY, normal);
        vec3 barkR2 = cross(normal, barkX);
        float barkDet = dot(barkX, barkR1);
        vec3 barkG = sign(barkDet) * (dFdx(barkH) * barkR1 + dFdy(barkH) * barkR2) * 0.07 * barkFar;
        normal = normalize(abs(barkDet) * normal - barkG);`
      );
  };
  material.customProgramCacheKey = () => "site-bark";
  material.needsUpdate = true;
}

/** Surfaces that really are lights keep their own strength: windows, lamps, the stage line. */
const LIGHTS = new Set([
  "ffb460",
  "ffc27a",
  "fff2cc",
  "ff2a20",
  "ffb347",
  "ff8a2a",
  "ff9a4a",
]);
/** Window and windscreen glass, by the colour the site builds it in. */
const GLASS = new Set(["27313c", "1c242c"]);
const BARK = new Set(["5a4733"]);
/** The canopies' side walls and hems; their roofs are known by their own faint glow. */
const CLOTH = new Set(["3a3d47", "17181d"]);
const CLOTH_GLOW = "22242b";

/** What a ground material is known to be, by the drawn picture it wears. */
interface Worn {
  kind: Kind;
  tile: number;
  scan?: ScanName;
  joints?: "across" | "both";
}

export interface RefinedSurfaces {
  /** How much of each surface's painted-on glow is left; the sky now does that work. */
  setGlow(share: number): void;
  dispose(): void;
}

/** Re-dress every ground material under these roots, and the bark, glass and walls. Call once, after they are built. */
export function refineSurfaces(
  renderer: WebGLRenderer,
  site: Object3D,
  around: Object3D | null,
  size: number,
  scans: ReadonlyMap<ScanName, Scan> = new Map()
): RefinedSurfaces {
  const worn = new Map<Texture, Worn>([
    [gravelMaps().albedo, { kind: "gravel", tile: TILE.gravel }],
    [
      asphaltMaps().albedo,
      { kind: "asphalt", tile: TILE.asphalt, scan: "street" },
    ],
    [paverMaps().albedo, { kind: "pavers", tile: TILE.pavers }],
    [mulchTexture(), { kind: "mulch", tile: AROUND_TILE.mulch, scan: "mulch" }],
    [grassTexture(), { kind: "grass", tile: AROUND_TILE.grass, scan: "lawn" }],
    [
      slabTexture(),
      {
        kind: "concrete",
        tile: AROUND_TILE.slab,
        scan: "concrete",
        joints: "both",
      },
    ],
    [
      walkTexture(),
      {
        kind: "concrete",
        tile: AROUND_TILE.walk,
        scan: "concrete",
        joints: "across",
      },
    ],
  ]);
  const walls = new Map<Texture, { scan: Scan; tile: number }>();
  for (const [kind, name] of Object.entries(WALL_SCAN) as [
    WallKind,
    ScanName,
  ][]) {
    const scan = scans.get(name);
    if (scan) walls.set(wallTexture(kind), { scan, tile: WALL_TILE[kind] });
  }
  const baked = new Map<string, Baked>();
  /** One set of pictures per photograph and mesh tile; they share the picture itself. */
  const laid = new Map<string, { albedo: Texture; normal: Texture }>();
  const done = new Set<MeshStandardMaterial>();
  const glows: { material: MeshStandardMaterial; base: number }[] = [];

  /** Put a photograph on a material at its true size. */
  const lay = (material: MeshStandardMaterial, scan: Scan, tile: number) => {
    const key = `${scan.name}-${tile}`;
    let set = laid.get(key);
    if (!set && scan.albedo) {
      const { x, y } = scanRepeat(scan.name, tile);
      const albedo = scan.albedo.clone();
      const normal = scan.normal.clone();
      for (const t of [albedo, normal]) {
        t.repeat.set(x, y);
        t.needsUpdate = true;
        renderer.initTexture(t);
      }
      laid.set(key, (set = { albedo, normal }));
    }
    if (!set) return;
    material.map = set.albedo;
    material.normalMap = set.normal;
    material.normalScale.setScalar(scanRelief(scan.name));
    if (material.emissiveMap) material.emissiveMap = set.albedo;
    material.color.set("#ffffff");
    material.needsUpdate = true;
  };

  const dress = (
    material: MeshStandardMaterial,
    found: Worn,
    ground: boolean
  ) => {
    const scan = found.scan && scans.get(found.scan);
    if (scan) {
      lay(material, scan, found.tile);
      material.roughnessMap = null;
      material.roughness = SURFACES[found.kind].roughness;
      enrich(material, {
        ...SURFACES[found.kind],
        kind: found.kind,
        tile: scan.wide,
        turned: true,
        joints: found.joints && {
          every: found.tile,
          both: found.joints === "both",
        },
      });
      return;
    }
    const picture =
      found.kind === "pavers" || found.kind === "concrete"
        ? material.map
        : null;
    const key = picture ? `${found.kind}-${picture.uuid}` : found.kind;
    let maps = baked.get(key);
    if (!maps)
      baked.set(
        key,
        (maps = bake(
          renderer,
          found.kind,
          found.tile,
          picture ? Math.min(size, 1024) : size,
          picture
        ))
      );
    material.map = maps.albedo;
    material.normalMap = maps.normal;
    material.normalScale.set(1, 1);
    if (material.emissiveMap) material.emissiveMap = maps.albedo;
    material.needsUpdate = true;
    if (!ground) return;
    const surface: Surface = {
      ...SURFACES[found.kind],
      kind: found.kind,
      tile: found.tile,
    };
    // Fully matte: a rough map at a grazing sun reads as water.
    material.roughnessMap = null;
    material.roughness = surface.roughness;
    // The canvas pictures were drawn under a grey tint; these carry true ground values.
    material.color.lerp(new Color("#ffffff"), 0.6);
    enrich(material, surface);
  };

  const each = (root: Object3D, inSite: boolean) =>
    root.traverse((o) => {
      const mesh = o as Mesh;
      const material = mesh.material as MeshStandardMaterial | undefined;
      if (
        !mesh.isMesh ||
        !material?.isMeshStandardMaterial ||
        done.has(material)
      )
        return;
      done.add(material);
      const own = material.color.getHexString();
      if (
        material.emissiveIntensity > 0 &&
        !LIGHTS.has(material.emissive.getHexString())
      ) {
        glows.push({ material, base: material.emissiveIntensity });
      }
      const found = material.map ? worn.get(material.map) : undefined;
      const wall = material.map ? walls.get(material.map) : undefined;
      const cloth = scans.get("cloth");
      const barkScan = scans.get("bark");
      // Wire thinned to a haze takes the sky's colour from both sides at once; let it keep more of its own.
      if (material.alphaToCoverage) material.envMapIntensity = 0.4;
      if (found) dress(material, found, true);
      else if (wall) {
        lay(material, wall.scan, wall.tile);
        facade(material, wall.scan.name);
      } else if (
        inSite &&
        cloth &&
        (CLOTH.has(own) ||
          (material.vertexColors &&
            material.emissive.getHexString() === CLOTH_GLOW))
      ) {
        weave(material, cloth);
      } else if (
        !inSite &&
        material.map &&
        !material.transparent &&
        !material.alphaToCoverage
      ) {
        // House walls and roofs: the picture they have, with its courses cut in.
        dress(material, { kind: "concrete", tile: 2 }, false);
      } else if (GLASS.has(own)) {
        material.metalness = 0.85;
        material.roughness = 0.06;
        material.color.set("#6f7f90");
        material.envMapIntensity = 1.2;
      } else if (
        BARK.has(own) ||
        (!inSite &&
          material.vertexColors &&
          !material.map &&
          material.roughness === 1)
      ) {
        if (barkScan?.albedo && !BARK.has(own)) {
          material.map = barkScan.albedo;
          material.normalMap = barkScan.normal;
          scannedBark(material);
        } else bark(material);
      } else if (!inSite && material.vertexColors && !material.map) {
        // Car paint.
        material.roughness = 0.24;
        material.metalness = 0.35;
      }
    });
  each(site, true);
  if (around) each(around, false);

  return {
    setGlow(share) {
      for (const g of glows) g.material.emissiveIntensity = g.base * share;
    },
    dispose() {
      for (const b of baked.values()) b.dispose();
      for (const set of laid.values()) {
        set.albedo.dispose();
        set.normal.dispose();
      }
    },
  };
}
