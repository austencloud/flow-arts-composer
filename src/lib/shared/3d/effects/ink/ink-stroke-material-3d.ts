import {
  AdditiveBlending,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
} from "three";

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
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vPigment = pigment;
    vEdge = edge;
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-viewPosition.xyz);
    vAlpha = alpha;
    vWetness = wetness;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vPigment;
  varying vec3 vEdge;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlpha;
  varying float vWetness;
  void main() {
    float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.3);
    vec3 key = normalize(vec3(-0.38, 0.66, 0.65));
    float light = 0.54 + 0.38 * max(0.0, dot(normalize(vNormal), key));
    float wetGlint = pow(max(0.0, dot(reflect(-key, normalize(vNormal)), normalize(vView))), 24.0);
    vec3 color = vPigment * light;
    color = mix(color, vEdge * (0.85 + 0.15 * light), rim * 0.58);
    color += vEdge * wetGlint * (0.10 + 0.24 * vWetness);
    float alpha = vAlpha * (0.82 + 0.18 * facing);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createInkStrokeMaterial3D(additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: FrontSide,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}
