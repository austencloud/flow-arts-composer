/**
 * The print: bright light rolled off like film, then the hour's own colour.
 *
 * AgX keeps a low sun from clipping to flat yellow, but on its own it prints
 * grey. The slope, power and saturation here are its "look" step, done where
 * AgX means it to be done, before its last matrix. A split tone, a soft corner
 * shade and a hair of grain (which also stops the sky banding) finish it.
 */

import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Uniform, Vector3 } from "three";
import type { LookRecipe } from "./site-walk-look";

const FRAGMENT = /* glsl */ `
  uniform float exposure;
  uniform vec3 slope;
  uniform float power;
  uniform float sat;
  uniform float vignette;
  uniform vec3 shadowTone;
  uniform vec3 highlightTone;

  vec3 agxCurve(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }

  vec3 agxLook(vec3 color) {
    const mat3 toRec2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
    const mat3 fromRec2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
    const mat3 inset = mat3(
      vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
      vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
      vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
    const mat3 outset = mat3(
      vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
      vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
      vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
    color = inset * (toRec2020 * color);
    color = clamp((log2(max(color, vec3(1e-10))) + 12.47393) / 16.5, 0.0, 1.0);
    color = agxCurve(color);
    color = pow(max(color * slope, vec3(0.0)), vec3(power));
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = max(luma + sat * (color - luma), vec3(0.0));
    color = outset * color;
    color = pow(max(color, vec3(0.0)), vec3(2.2));
    return clamp(fromRec2020 * color, 0.0, 1.0);
  }

  float dice(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = agxLook(max(inputColor.rgb, vec3(0.0)) * exposure);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c *= mix(shadowTone, highlightTone, smoothstep(0.02, 0.6, l));
    vec2 q = (uv - 0.5) * vec2(1.0, 0.86);
    c *= 1.0 - vignette * smoothstep(0.12, 0.55, dot(q, q) * 1.7);
    // Two white dice, not one: a triangular spread hides banding without showing as a pattern.
    vec2 cell = gl_FragCoord.xy + floor(fract(time) * 60.0) * vec2(37.0, 17.0);
    float grain = dice(cell) + dice(cell + 191.7) - 1.0;
    c += grain * (0.004 + 0.014 * (1.0 - l) * l);
    outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
  }
`;

export class SiteWalkGradeEffect extends Effect {
  constructor() {
    super("SiteWalkGradeEffect", FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.NONE,
      uniforms: new Map<string, Uniform>([
        ["exposure", new Uniform(1)],
        ["slope", new Uniform(new Vector3(1, 1, 1))],
        ["power", new Uniform(1)],
        ["sat", new Uniform(1)],
        ["vignette", new Uniform(0)],
        ["shadowTone", new Uniform(new Vector3(1, 1, 1))],
        ["highlightTone", new Uniform(new Vector3(1, 1, 1))],
      ]),
    });
  }

  setLook({ grade }: LookRecipe): void {
    const u = this.uniforms;
    u.get("exposure")!.value = grade.exposure;
    (u.get("slope")!.value as Vector3).set(...grade.slope);
    u.get("power")!.value = grade.power;
    u.get("sat")!.value = grade.saturation;
    u.get("vignette")!.value = grade.vignette;
    (u.get("shadowTone")!.value as Vector3).set(...grade.shadows);
    (u.get("highlightTone")!.value as Vector3).set(...grade.highlights);
  }
}
