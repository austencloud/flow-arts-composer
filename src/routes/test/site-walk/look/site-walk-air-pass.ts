/**
 * The air between you and the site, and the shade where things touch.
 *
 * One pass over the finished frame, from its depth alone:
 *
 * - contact shade (horizon-based ambient occlusion at half size, blurred along
 *   surfaces so it never leaks past an edge), which is what plants feet, posts
 *   and grass on the ground;
 * - haze: a thin even haze and a low ground mist, coloured by the sky in that
 *   direction, so distance turns warm toward the sun and the far ground melts
 *   into the horizon instead of ending at a line;
 * - light shafts: the bright sky near the sun, smeared away from it wherever
 *   something stands in front.
 *
 * Depth only: nothing is drawn a second time for normals, which matters with
 * eighty people on the lawn.
 */

import { Pass } from "postprocessing";
import {
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  SKY_BASE_GLSL,
  createSkyUniforms,
  applySky,
} from "./site-walk-sky-shader";
import type { LookRecipe } from "./site-walk-look";

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const DEPTH_GLSL = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uInvProj;
  vec3 viewAt(vec2 uv, float z) {
    vec4 p = uInvProj * vec4(vec3(uv, z) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
`;

const AO_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  ${DEPTH_GLSL}
  uniform vec2 uTexel;
  uniform float uPixelScale; // pixels one metre covers at one metre away
  uniform float uRadius;

  const float PI = 3.14159265;
  const int SLICES = 3;
  const int STEPS = 5;

  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  void main() {
    float z = texture2D(tDepth, vUv).r;
    if (z >= 0.99999) { gl_FragColor = vec4(1.0, 1e5, 0.0, 1.0); return; }
    vec3 p = viewAt(vUv, z);

    // The surface's own slope from its neighbours, taking the nearer of each pair so edges stay sharp.
    vec3 l = viewAt(vUv - vec2(uTexel.x, 0.0), texture2D(tDepth, vUv - vec2(uTexel.x, 0.0)).r);
    vec3 r = viewAt(vUv + vec2(uTexel.x, 0.0), texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).r);
    vec3 b = viewAt(vUv - vec2(0.0, uTexel.y), texture2D(tDepth, vUv - vec2(0.0, uTexel.y)).r);
    vec3 t = viewAt(vUv + vec2(0.0, uTexel.y), texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).r);
    vec3 dx = abs(l.z - p.z) < abs(r.z - p.z) ? p - l : r - p;
    vec3 dy = abs(b.z - p.z) < abs(t.z - p.z) ? p - b : t - p;
    vec3 n = normalize(cross(dx, dy));

    vec3 v = normalize(-p);
    float reach = clamp(uRadius * uPixelScale / -p.z, 3.0, 110.0);
    float spin = ign(gl_FragCoord.xy);
    float jitter = fract(spin * 7.31 + 0.37);
    float seen = 0.0;

    for (int s = 0; s < SLICES; s++) {
      float phi = (float(s) + spin) * PI / float(SLICES);
      vec2 w = vec2(cos(phi), sin(phi));
      vec3 dir = vec3(w, 0.0);
      vec3 ortho = dir - dot(dir, v) * v;
      vec3 axis = cross(dir, v);
      vec3 proj = n - axis * dot(n, axis) / max(dot(axis, axis), 1e-5);
      float len = length(proj);
      float signN = sign(dot(ortho, proj));
      float cosN = clamp(dot(proj, v) / max(len, 1e-4), 0.0, 1.0);
      float nAngle = signN * acos(cosN);
      for (int side = 0; side < 2; side++) {
        float way = side == 0 ? -1.0 : 1.0;
        float horizon = -1.0;
        for (int k = 0; k < STEPS; k++) {
          float f = (float(k) + jitter) / float(STEPS);
          // Bunched close in: the crisp line under a shoe and the soft dark round a tent in one go.
          vec2 at = vUv + way * w * uTexel * max(1.0, f * f * reach);
          if (at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0) break;
          float sz = texture2D(tDepth, at).r;
          vec3 q = viewAt(at, sz) - p;
          float dist = length(q);
          float fall = clamp(1.0 - dist * dist / (uRadius * uRadius), 0.0, 1.0);
          float c = mix(-1.0, dot(q / max(dist, 1e-4), v), fall);
          horizon = max(horizon, c);
        }
        float h = nAngle + clamp(way * acos(clamp(horizon, -1.0, 1.0)) - nAngle, -PI * 0.5, PI * 0.5);
        seen += len * (cosN + 2.0 * h * sin(nAngle) - cos(2.0 * h - nAngle)) * 0.25;
      }
    }
    seen = clamp(seen / float(SLICES), 0.0, 1.0);
    // Far away the radius is a pixel or two: let it go rather than shimmer.
    seen = mix(seen, 1.0, smoothstep(45.0, 110.0, -p.z));
    gl_FragColor = vec4(seen, -p.z, 0.0, 1.0);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tAo;
  uniform vec2 uStep;
  void main() {
    vec2 centre = texture2D(tAo, vUv).rg;
    float sum = centre.r;
    float weight = 1.0;
    for (int i = -3; i <= 3; i++) {
      if (i == 0) continue;
      vec2 s = texture2D(tAo, vUv + uStep * float(i)).rg;
      float w = exp(-float(i * i) * 0.12) * max(0.0, 1.0 - abs(s.g - centre.g) / (0.06 + centre.g * 0.035));
      sum += s.r * w;
      weight += w;
    }
    gl_FragColor = vec4(sum / weight, centre.g, 0.0, 1.0);
  }
`;

const SHAFT_MASK_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColour;
  uniform sampler2D tDepth;
  uniform vec2 uSun;
  uniform float uAspect;
  void main() {
    float sky = step(0.99999, texture2D(tDepth, vUv).r);
    vec3 c = min(texture2D(tColour, vUv).rgb, vec3(6.0));
    vec2 q = (vUv - uSun) * vec2(uAspect, 1.0);
    float near = exp(-dot(q, q) * 7.0);
    gl_FragColor = vec4(max(c - 0.55, vec3(0.0)) * sky * near, 1.0);
  }
`;

const SHAFT_BLUR_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColour;
  uniform vec2 uSun;
  uniform float uSpan;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    vec2 stepUv = (uSun - vUv) * uSpan / 14.0;
    vec2 at = vUv + stepUv * ign(gl_FragCoord.xy);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 14; i++) {
      sum += texture2D(tColour, at).rgb;
      at += stepUv;
    }
    gl_FragColor = vec4(sum / 14.0, 1.0);
  }
`;

const AIR_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  ${DEPTH_GLSL}
  ${SKY_BASE_GLSL}
  uniform sampler2D tColour;
  uniform sampler2D tAo;
  uniform sampler2D tShafts;
  uniform vec2 uAoTexel;
  uniform float uOcclusion;
  uniform float uShafts;
  uniform mat4 uInvView;
  uniform vec3 uEye;
  uniform float uDensity;
  uniform float uMist;
  uniform float uMistHeight;

  void main() {
    vec4 source = texture2D(tColour, vUv);
    vec3 col = source.rgb;
    float z = texture2D(tDepth, vUv).r;
    float shaft = 1.0;
    if (z < 0.99999) {
      vec3 p = viewAt(vUv, z);
      float depth = -p.z;
      // A beam is lit air: there is little of it in front of someone an arm's length away.
      shaft = smoothstep(1.0, 30.0, depth);

      // The four half-size samples round this pixel, weighted to the ones on its own surface.
      vec2 grid = vUv / uAoTexel - 0.5;
      vec2 f = fract(grid);
      vec2 base = (floor(grid) + 0.5) * uAoTexel;
      float sum = 0.0;
      float weight = 1e-4;
      for (int j = 0; j < 2; j++) {
        for (int i = 0; i < 2; i++) {
          vec2 s = texture2D(tAo, base + vec2(float(i), float(j)) * uAoTexel).rg;
          float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
          w *= max(1e-3, 1.0 - abs(s.g - depth) / (0.08 + depth * 0.05));
          sum += s.r * w;
          weight += w;
        }
      }
      float ao = pow(clamp(sum / weight, 0.0, 1.0), uOcclusion);
      // Sunlit and glowing surfaces are lit straight on, so the sky's shade hardly touches them;
      // and shade between bright surfaces picks up their colour instead of going grey.
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      ao = mix(ao, 1.0, 0.65 * smoothstep(0.5, 2.6, lum));
      vec3 bounce = clamp(col / (lum + 0.35), 0.0, 1.0);
      vec3 a = 2.0404 * bounce - 0.3324;
      vec3 b = -4.7951 * bounce + 0.6417;
      vec3 c = 2.7552 * bounce + 0.6903;
      col *= max(vec3(ao), ((ao * a + b) * ao + c) * ao);

      vec3 world = (uInvView * vec4(p, 1.0)).xyz;
      vec3 ray = world - uEye;
      float dist = length(ray);
      vec3 d = ray / max(dist, 1e-4);
      // Mist thins with height; summed along the ray in closed form.
      float ky = d.y / uMistHeight;
      float through = abs(ky) * dist < 1e-3 ? dist : (1.0 - exp(-clamp(ky * dist, -40.0, 40.0))) / ky;
      float mist = uMist * exp(-max(uEye.y, 0.0) / uMistHeight) * through;
      // The first metres are clear, so nobody near you looks washed out.
      float amount = 1.0 - exp(-(uDensity * dist + mist * smoothstep(6.0, 40.0, dist)));
      vec3 air = skyBase(normalize(vec3(d.x, max(d.y, 0.0) + 0.012, d.z)), 0.75);
      col = mix(col, air, clamp(amount, 0.0, 1.0));
    }
    col += texture2D(tShafts, vUv).rgb * uShafts * shaft;
    gl_FragColor = vec4(col, source.a);
  }
`;

const target = (
  type = HalfFloatType,
  filter: typeof LinearFilter | typeof NearestFilter = LinearFilter
) =>
  new WebGLRenderTarget(1, 1, {
    type,
    format: RGBAFormat,
    depthBuffer: false,
    minFilter: filter,
    magFilter: filter,
  });

const material = (
  fragmentShader: string,
  uniforms: ShaderMaterial["uniforms"]
) =>
  new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

export class SiteWalkAirPass extends Pass {
  private readonly ao = target(HalfFloatType, NearestFilter);
  private readonly aoBlur = target(HalfFloatType, NearestFilter);
  private readonly shaftA = target();
  private readonly shaftB = target();
  private readonly sky = createSkyUniforms();
  private readonly invProj = new Matrix4();
  private readonly aoMaterial = material(AO_FRAGMENT, {
    tDepth: { value: null },
    uInvProj: { value: this.invProj },
    uTexel: { value: new Vector2() },
    uPixelScale: { value: 1 },
    uRadius: { value: 1.1 },
  });
  private readonly blurMaterial = material(BLUR_FRAGMENT, {
    tAo: { value: null },
    uStep: { value: new Vector2() },
  });
  private readonly sun = new Vector2();
  private readonly maskMaterial = material(SHAFT_MASK_FRAGMENT, {
    tColour: { value: null },
    tDepth: { value: null },
    uSun: { value: this.sun },
    uAspect: { value: 1 },
  });
  private readonly shaftMaterial = material(SHAFT_BLUR_FRAGMENT, {
    tColour: { value: null },
    uSun: { value: this.sun },
    uSpan: { value: 0.6 },
  });
  private readonly airMaterial = material(AIR_FRAGMENT, {
    ...this.sky,
    tColour: { value: null },
    tDepth: { value: null },
    tAo: { value: null },
    tShafts: { value: null },
    uAoTexel: { value: new Vector2() },
    uOcclusion: { value: 1 },
    uShafts: { value: 0 },
    uInvProj: { value: this.invProj },
    uInvView: { value: new Matrix4() },
    uEye: { value: new Vector3() },
    uDensity: { value: 0 },
    uMist: { value: 0 },
    uMistHeight: { value: 5 },
  });
  private look: LookRecipe | null = null;
  private readonly point = new Vector3();
  private readonly forward = new Vector3();

  constructor(private view: Camera) {
    super("SiteWalkAirPass");
    this.needsDepthTexture = true;
    this.needsSwap = true;
  }

  setView(view: Camera): void {
    this.view = view;
  }

  setLook(look: LookRecipe): void {
    this.look = look;
    applySky(this.sky, look);
    const u = this.airMaterial.uniforms;
    u.uOcclusion!.value = look.occlusion;
    u.uDensity!.value = look.haze.density;
    u.uMist!.value = look.haze.mist;
    u.uMistHeight!.value = look.haze.mistHeight;
  }

  override setDepthTexture(depth: Texture): void {
    this.aoMaterial.uniforms.tDepth!.value = depth;
    this.maskMaterial.uniforms.tDepth!.value = depth;
    this.airMaterial.uniforms.tDepth!.value = depth;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    this.ao.setSize(w, h);
    this.aoBlur.setSize(w, h);
    this.shaftA.setSize(
      Math.max(1, Math.round(width / 4)),
      Math.max(1, Math.round(height / 4))
    );
    this.shaftB.setSize(
      Math.max(1, Math.round(width / 4)),
      Math.max(1, Math.round(height / 4))
    );
    (this.aoMaterial.uniforms.uTexel!.value as Vector2).set(1 / w, 1 / h);
    (this.airMaterial.uniforms.uAoTexel!.value as Vector2).set(1 / w, 1 / h);
    this.maskMaterial.uniforms.uAspect!.value = width / Math.max(1, height);
  }

  private draw(
    renderer: WebGLRenderer,
    m: ShaderMaterial,
    to: WebGLRenderTarget | null
  ): void {
    this.fullscreenMaterial = m;
    renderer.setRenderTarget(to);
    renderer.render(this.scene, this.camera);
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget
  ): void {
    const view = this.view as PerspectiveCamera;
    this.invProj.copy(view.projectionMatrixInverse);
    this.aoMaterial.uniforms.uPixelScale!.value =
      this.ao.height * 0.5 * (view.projectionMatrix.elements[5] ?? 1);
    this.draw(renderer, this.aoMaterial, this.ao);
    const stepUv = this.blurMaterial.uniforms.uStep!.value as Vector2;
    this.blurMaterial.uniforms.tAo!.value = this.ao.texture;
    stepUv.set(1 / this.ao.width, 0);
    this.draw(renderer, this.blurMaterial, this.aoBlur);
    this.blurMaterial.uniforms.tAo!.value = this.aoBlur.texture;
    stepUv.set(0, 1 / this.ao.height);
    this.draw(renderer, this.blurMaterial, this.ao);

    const u = this.airMaterial.uniforms;
    // Shafts only while you look toward the sun; they fade as it leaves the frame.
    const sunDir = this.sky.uSunDir!.value as Vector3;
    view.getWorldDirection(this.forward);
    const toward = this.forward.dot(sunDir);
    const strength =
      (this.look?.shafts ?? 0) *
      Math.min(1, Math.max(0, (toward - 0.15) / 0.5));
    if (strength > 0.002) {
      this.point
        .copy(view.position)
        .addScaledVector(sunDir, 1000)
        .project(view);
      this.sun.set(this.point.x * 0.5 + 0.5, this.point.y * 0.5 + 0.5);
      this.maskMaterial.uniforms.tColour!.value = inputBuffer.texture;
      this.draw(renderer, this.maskMaterial, this.shaftA);
      this.shaftMaterial.uniforms.tColour!.value = this.shaftA.texture;
      this.shaftMaterial.uniforms.uSpan!.value = 0.75;
      this.draw(renderer, this.shaftMaterial, this.shaftB);
      this.shaftMaterial.uniforms.tColour!.value = this.shaftB.texture;
      this.shaftMaterial.uniforms.uSpan!.value = 0.3;
      this.draw(renderer, this.shaftMaterial, this.shaftA);
    }
    u.uShafts!.value = strength > 0.002 ? strength : 0;
    u.tShafts!.value = this.shaftA.texture;
    u.tAo!.value = this.ao.texture;
    u.tColour!.value = inputBuffer.texture;
    (u.uInvView!.value as Matrix4).copy(view.matrixWorld);
    (u.uEye!.value as Vector3).setFromMatrixPosition(view.matrixWorld);
    this.draw(
      renderer,
      this.airMaterial,
      this.renderToScreen ? null : outputBuffer
    );
  }

  override dispose(): void {
    for (const t of [this.ao, this.aoBlur, this.shaftA, this.shaftB])
      t.dispose();
    for (const m of [
      this.aoMaterial,
      this.blurMaterial,
      this.maskMaterial,
      this.shaftMaterial,
      this.airMaterial,
    ])
      m.dispose();
    super.dispose();
  }
}
