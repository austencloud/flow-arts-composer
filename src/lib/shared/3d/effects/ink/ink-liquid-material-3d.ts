import {
  AdditiveBlending,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
} from "three";

/**
 * Wet ink: a dark glossy body lit by a hard key glint and two tall softboxes,
 * with a Fresnel sheen at grazing angles. Strands, drops and floor stains all
 * draw with it; instanced drops and stains read their per-instance colors from
 * the same attribute names the strand mesh writes per vertex. `wetness` keeps
 * the gloss on fresh ink and lets a drying stain go matte. The additive
 * variant is for glowing palettes, where the ink is the light. Colors arrive
 * in linear sRGB, like every color-managed three.js material.
 */
const vertexShader = /* glsl */ `
  attribute vec3 pigment;
  attribute vec3 edge;
  attribute float alpha;
  attribute float wetness;
  varying vec3 vPigment;
  varying vec3 vEdge;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlpha;
  varying float vWetness;
  void main() {
    vec3 transformed = position;
    vec3 objectNormal = normal;
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(position, 1.0)).xyz;
      objectNormal = mat3(instanceMatrix) * normal;
    #endif
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    vPigment = pigment;
    vEdge = edge;
    vNormal = normalize(normalMatrix * objectNormal);
    vView = normalize(-viewPosition.xyz);
    vAlpha = alpha;
    vWetness = wetness;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uGlow;
  uniform float uStain;
  varying vec3 vPigment;
  varying vec3 vEdge;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlpha;
  varying float vWetness;
  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vView);
    float facing = clamp(dot(n, v), 0.0, 1.0);
    vec3 r = reflect(-v, n);
    vec3 key = normalize(vec3(-0.42, 0.7, 0.58));
    vec3 softA = normalize(vec3(-0.75, 0.25, 0.6));
    vec3 softB = normalize(vec3(0.8, 0.3, 0.52));
    float diffuse = 0.42 + 0.5 * max(0.0, dot(n, key));
    float glint = pow(max(0.0, dot(r, key)), 90.0);
    // Tall softboxes: wide sideways, narrow up and down, so highlights run
    // as lines along a strand instead of sitting as dots.
    float boxA = pow(max(0.0, dot(normalize(r * vec3(1.0, 0.35, 1.0)), softA)), 18.0);
    float boxB = pow(max(0.0, dot(normalize(r * vec3(1.0, 0.35, 1.0)), softB)), 22.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
    float wet = clamp(vWetness, 0.0, 1.0);

    vec3 body = vPigment * diffuse;
    vec3 sheen = mix(vec3(1.0), vEdge, 0.35);
    // A stain lies flat under a dark stage, so at grazing angles it mirrors
    // the dark rather than a bright rim; only its key glint survives.
    float rim = 1.0 - 0.85 * uStain;
    vec3 color = body;
    color = mix(color, vEdge * 0.8 + sheen * 0.2, fresnel * (0.35 + 0.4 * wet) * rim);
    color += sheen * (glint * 1.25 + (boxA * 0.38 + boxB * 0.26) * rim) * (0.18 + 0.82 * wet);
    color = mix(color, vPigment * (0.9 + 0.6 * facing) + vEdge * pow(1.0 - facing, 2.0), uGlow);

    float alpha = vAlpha * mix(0.9 + 0.1 * facing, 1.0, wet);
    alpha = clamp(alpha + (glint + boxA * 0.4) * wet * vAlpha * 0.5, 0.0, 1.0);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createInkLiquidMaterial3D(additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uGlow: { value: additive ? 1 : 0 }, uStain: { value: 0 } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: FrontSide,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}

/** Floor stains: same ink, drawn just above the stage without z-fighting. */
export function createInkStainMaterial3D(additive = false): ShaderMaterial {
  const material = createInkLiquidMaterial3D(additive);
  material.uniforms.uStain!.value = 1;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  return material;
}
