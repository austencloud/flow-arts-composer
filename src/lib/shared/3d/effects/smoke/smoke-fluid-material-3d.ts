import {
  BackSide,
  Color,
  GLSL3,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from "three";

const VERTEX_SHADER = /* glsl */ `
  out vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Ray march through one smoke volume. Light is single scattering from the key
 * light (its transmittance precomputed per cell) plus a soft sky term; the
 * march stops at the scene's depth so props and floor sit in front of smoke
 * behind them.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uSmoke;
  uniform sampler2D uLight;
  uniform sampler2D uSceneDepth;
  uniform vec3 uGrid;
  uniform float uColumns;
  uniform vec2 uAtlas;
  uniform vec3 uMin;
  uniform float uCell;
  uniform float uExtinction;
  uniform float uAlbedo;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform vec3 uLightDirection;
  uniform float uHueShift;
  uniform float uTime;
  uniform vec4 uViewport;
  uniform float uSceneDepthReady;
  uniform float uCameraNear;
  uniform float uCameraFar;

  in vec3 vWorldPosition;
  out vec4 outColor;

  vec2 tileOrigin(float k) {
    float row = floor((k + 0.5) / uColumns);
    return vec2(k - row * uColumns, row) * uGrid.xy;
  }

  vec2 sampleGrid(vec3 p) {
    vec3 q = clamp(p, vec3(0.5), uGrid - 0.5);
    float z = q.z - 0.5;
    float k0 = floor(z);
    float k1 = min(k0 + 1.0, uGrid.z - 1.0);
    vec2 a0 = (tileOrigin(k0) + q.xy) / uAtlas;
    vec2 a1 = (tileOrigin(k1) + q.xy) / uAtlas;
    float f = z - k0;
    float smoke = mix(texture(uSmoke, a0).r, texture(uSmoke, a1).r, f);
    float light = mix(texture(uLight, a0).r, texture(uLight, a1).r, f);
    return vec2(smoke, light);
  }

  float hash12(vec2 value) {
    vec3 p = fract(vec3(value.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float viewZFromPerspectiveDepth(float depth) {
    return (uCameraNear * uCameraFar) / ((uCameraFar - uCameraNear) * depth - uCameraFar);
  }

  /** Turns a color's hue by angle radians around the grey axis, keeping
   * its saturation and brightness. */
  vec3 hueTravel(vec3 color, float angle) {
    const vec3 grey = vec3(0.57735);
    float c = cos(angle);
    return color * c + cross(grey, color) * sin(angle) + grey * dot(grey, color) * (1.0 - c);
  }

  void main() {
    vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
    vec3 boxMax = uMin + uGrid * uCell;
    vec3 inverse = 1.0 / (sign(rayDirection) * max(abs(rayDirection), vec3(1e-5)));
    vec3 t0 = (uMin - cameraPosition) * inverse;
    vec3 t1 = (boxMax - cameraPosition) * inverse;
    vec3 tNear = min(t0, t1);
    vec3 tFar = max(t0, t1);
    float start = max(max(max(tNear.x, tNear.y), tNear.z), 0.0);
    float end = min(min(tFar.x, tFar.y), tFar.z);

    if (uSceneDepthReady > 0.5) {
      vec2 screenUv = (gl_FragCoord.xy - uViewport.xy) / max(uViewport.zw, vec2(1.0));
      float sceneDepth = texture(uSceneDepth, clamp(screenUv, vec2(0.001), vec2(0.999))).r;
      if (sceneDepth < 0.999999) {
        float sceneViewZ = viewZFromPerspectiveDepth(sceneDepth);
        vec3 viewDirection = normalize((viewMatrix * vec4(rayDirection, 0.0)).xyz);
        end = min(end, (-sceneViewZ) / max(0.0001, -viewDirection.z));
      }
    }
    if (end <= start) discard;

    float stepLength = uCell * 0.7;
    int steps = int(min(220.0, ceil((end - start) / stepLength)));
    float travel = start + stepLength * hash12(gl_FragCoord.xy);
    vec3 lightDirection = normalize(uLightDirection);
    // Henyey-Greenstein: smoke scatters mostly forward.
    float g = 0.35;
    float cosine = dot(rayDirection, lightDirection);
    float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosine, 1.5) * 0.5;

    vec3 color = vec3(0.0);
    float transmittance = 1.0;
    for (int i = 0; i < 220; i++) {
      if (i >= steps || travel > end || transmittance < 0.01) break;
      vec3 world = cameraPosition + rayDirection * travel;
      vec3 cell = (world - uMin) / uCell;
      vec2 s = sampleGrid(cell);
      // Smoke thins out across the drain band of the round, domed column the
      // solver keeps it in, so the box never shows.
      vec2 mid = 0.5 * uGrid.xz;
      float r = length((cell.xz - mid) / mid);
      float side = (1.0 - r) / 0.3;
      float top = (uGrid.y * (1.0 - 0.22 * r * r) - cell.y) / (uGrid.y * 0.24);
      float wall = smoothstep(0.0, 1.0, side) * smoothstep(0.0, 1.0, top);
      float density = max(s.x - 0.002, 0.0) * wall;
      if (density > 0.0) {
        float sigma = density * uExtinction;
        float opacity = 1.0 - exp(-sigma * stepLength);
        // Thin wisps take the edge color, dense cores the core color.
        vec3 tint = mix(uEdge, uCore, smoothstep(0.005, 0.12, density));
        tint = max(hueTravel(tint, uHueShift * 0.9 * sin(uTime * 1.35 + world.y * 4.0)), vec3(0.0));
        // Sky light is shadowed by the smoke around it too, so a thick core
        // reads darker than its lit rim instead of flat white.
        float sky = (0.2 + 0.1 * clamp(rayDirection.y + 0.5, 0.0, 1.0)) * (0.3 + 0.7 * sqrt(s.y));
        vec3 lit = tint * uAlbedo * (s.y * phase * 1.8 + sky);
        // Genie smoke is magic: it carries a soft glow of its own.
        lit += tint * uHueShift * 0.45;
        color += transmittance * opacity * lit;
        transmittance *= 1.0 - opacity;
      }
      travel += stepLength;
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.002) discard;
    outColor = vec4(color, alpha);
  }
`;

export interface SmokeFluidMaterial3D extends ShaderMaterial {
  uniforms: {
    uSmoke: { value: Texture | null };
    uLight: { value: Texture | null };
    uSceneDepth: { value: Texture | null };
    uGrid: { value: Vector3 };
    uColumns: { value: number };
    uAtlas: { value: Vector2 };
    uMin: { value: Vector3 };
    uCell: { value: number };
    uExtinction: { value: number };
    uAlbedo: { value: number };
    uCore: { value: Color };
    uEdge: { value: Color };
    uLightDirection: { value: Vector3 };
    uHueShift: { value: number };
    uTime: { value: number };
    uViewport: { value: Vector4 };
    uSceneDepthReady: { value: number };
    uCameraNear: { value: number };
    uCameraFar: { value: number };
  };
}

export const SMOKE_FLUID_LIGHT_DIRECTION = new Vector3(-0.42, 0.78, 0.46).normalize();

export function createSmokeFluidMaterial3D(): SmokeFluidMaterial3D {
  return new ShaderMaterial({
    name: "SmokeFluidMaterial3D",
    glslVersion: GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uSmoke: { value: null },
      uLight: { value: null },
      uSceneDepth: { value: null },
      uGrid: { value: new Vector3(1, 1, 1) },
      uColumns: { value: 1 },
      uAtlas: { value: new Vector2(1, 1) },
      uMin: { value: new Vector3() },
      uCell: { value: 0.04 },
      uExtinction: { value: 30 },
      uAlbedo: { value: 0.8 },
      uCore: { value: new Color("#d8d8d8") },
      uEdge: { value: new Color("#f0f0f0") },
      uLightDirection: { value: SMOKE_FLUID_LIGHT_DIRECTION.clone() },
      uHueShift: { value: 0 },
      uTime: { value: 0 },
      uViewport: { value: new Vector4(0, 0, 1, 1) },
      uSceneDepthReady: { value: 0 },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: BackSide,
    blending: NormalBlending,
    premultipliedAlpha: true,
  }) as SmokeFluidMaterial3D;
}
