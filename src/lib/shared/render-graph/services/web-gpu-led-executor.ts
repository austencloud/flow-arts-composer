/**
 * WebGPU LED pass executor.
 *
 * WGSL port of the photometric LED pipeline. Every quantity comes from
 * `animation-engine/domain/led-photometry.ts`, the same module the WebGL2
 * reference renderer (`animation-engine/services/led/web-gl-led-renderer.ts`)
 * consumes, so the two backends cannot drift on physics; only the plumbing
 * differs. Structure and stage order below mirror that renderer deliberately.
 *
 * Pipeline per frame:
 *   1. Streak pass:  one Gaussian capsule per LED per sub-step, additive, HDR
 *   2. Accumulate:   history * exp(-dt/tau) + deposit, at a fixed detector gain
 *   3. Downsample:   5-level 13-tap chain, partial Karis on the first level
 *   4. Upsample:     3x3 tent mixed upward by the glare weight
 *   5. Display:      lerp composite, AgX tone map, straight-alpha output
 */

import type { LedPassPayload } from "../domain/led-pass";
import {
  BLOOM_COMPOSITE_STRENGTH,
  BLOOM_TENT_RADIUS_FRAME_FRACTION,
  DISPLAY_EXPOSURE_GAIN,
  EYE_TIME_CONSTANT_S,
  GLARE_WEIGHT_MAX,
  GLARE_WEIGHT_MIN,
  MAX_SUB_STEPS,
  effectiveSigmaPx,
  emitterSigmaPx,
  perLedFlux,
  shutterNormalization,
  streakDensity,
  subStepCount,
  type LedShutter,
} from "#lib/shared/animation-engine/domain/led-photometry.js";

const MAX_LEDS = 400;
const BLOOM_MIP_COUNT = 5;

/** Floats per instance. One instance is one sub-step of one LED.
 *  Layout: [ax, ay, bx, by, r, g, b, density, sigma, capStart, capEnd] */
const INSTANCE_STRIDE_FLOATS = 11;

/** Instances allocated up front. The buffer grows on demand up to
 *  MAX_LEDS * MAX_SUB_STEPS; a typical spin asks for 1-4 sub-steps, so
 *  reserving the ceiling would waste half a megabyte permanently. */
const INITIAL_SEGMENT_CAPACITY = MAX_LEDS * 2;
const MAX_SEGMENT_CAPACITY = MAX_LEDS * MAX_SUB_STEPS;

/** If the gap between frames exceeds this (seconds), or an LED jumps further
 *  than MAX_STREAK_PX, the frame is a discontinuity: the capsule collapses to
 *  a stationary splat rather than stretching across a pause or a reset. */
const MAX_STREAK_DT = 0.1;
const MAX_STREAK_PX = 400;

/** Substituted for the reported elapsed time across a discontinuity, where the
 *  measured gap says nothing about motion. */
const FALLBACK_DT = 1 / 60;
const MIN_DT = 1 / 240;

const HDR_FORMAT: GPUTextureFormat = "rgba16float";
const PRESENT_FORMAT: GPUTextureFormat = "bgra8unorm";


/** One instance is one sub-step of one LED: the capsule swept between two
 *  consecutive points on that LED's path this frame. Geometry is in device
 *  pixels, because the photometry is in device pixels - sigma, chord length and
 *  linear density all lose meaning under an NDC-space quad. The quad is padded
 *  by 3 sigma on every side so the Gaussian's tail is not clipped by the quad
 *  boundary rather than by its own falloff. */
const LED_STREAK_VERT_WGSL = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) pixelPos: vec2f,
  @location(1) @interpolate(flat) segA: vec2f,
  @location(2) @interpolate(flat) segB: vec2f,
  @location(3) @interpolate(flat) color: vec3f,
  @location(4) @interpolate(flat) density: f32,
  @location(5) @interpolate(flat) sigma: f32,
  @location(6) @interpolate(flat) capStart: f32,
  @location(7) @interpolate(flat) capEnd: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn main(
  @location(0) quadPos: vec2f,
  @location(1) segA: vec2f,
  @location(2) segB: vec2f,
  @location(3) color: vec3f,
  @location(4) density: f32,
  @location(5) sigma: f32,
  @location(6) capStart: f32,
  @location(7) capEnd: f32,
) -> VertexOutput {
  var out: VertexOutput;
  out.segA = segA;
  out.segB = segB;
  out.color = color;
  out.density = density;
  out.sigma = sigma;
  out.capStart = capStart;
  out.capEnd = capEnd;

  let dir = segB - segA;
  let segLen = length(dir);
  let axis = select(vec2f(1.0, 0.0), dir / max(segLen, 1e-4), segLen > 1e-4);
  let perp = vec2f(-axis.y, axis.x);

  let center = (segA + segB) * 0.5;
  let pad = sigma * 3.0;
  let halfLen = segLen * 0.5 + pad;

  let pixelPos = center
    + axis * (quadPos.x * halfLen)
    + perp * (quadPos.y * pad);
  out.pixelPos = pixelPos;

  // Pixel space is y-down; clip space is y-up.
  let clipPos = (pixelPos / u.resolution) * 2.0 - 1.0;
  out.position = vec4f(clipPos.x, -clipPos.y, 0.0, 1.0);
  return out;
}
`;

const LED_STREAK_FRAG_WGSL = /* wgsl */ `
const INV_SQRT_TWO_PI = 0.3989422804014327;

@fragment
fn main(
  @location(0) pixelPos: vec2f,
  @location(1) @interpolate(flat) segA: vec2f,
  @location(2) @interpolate(flat) segB: vec2f,
  @location(3) @interpolate(flat) color: vec3f,
  @location(4) @interpolate(flat) density: f32,
  @location(5) @interpolate(flat) sigma: f32,
  @location(6) @interpolate(flat) capStart: f32,
  @location(7) @interpolate(flat) capEnd: f32,
) -> @location(0) vec4f {
  let pa = pixelPos - segA;
  let ba = segB - segA;
  let baLenSq = dot(ba, ba);
  let t = select(0.0, dot(pa, ba) / max(baLenSq, 1e-6), baLenSq > 1e-6);

  // Butt caps at a sub-step join, round caps only where the path ends.
  // Rounding both would deposit the join's half-Gaussian twice.
  if (capStart < 0.5 && t < 0.0) { discard; }
  if (capEnd < 0.5 && t > 1.0) { discard; }

  let d = length(pa - ba * clamp(t, 0.0, 1.0));
  let s = max(sigma, 1e-4);
  if (d > s * 4.0) { discard; }

  // Normalized cross-section: integrates to 1 across the perpendicular, so the
  // splat integrates to exactly the density the CPU computed.
  let profile = exp(-0.5 * d * d / (s * s)) * INV_SQRT_TWO_PI / s;
  let energy = density * profile;
  return vec4f(color * energy, energy);
}
`;

const LED_FULLSCREEN_VERT_WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var out: VertexOutput;
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  out.position = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2f(x, y);
  return out;
}
`;

/** Decay is exp(-dt/tau) and the deposit is divided by the sum of the weights
 *  the shutter will apply, so neither trail length nor frame rate can act as a
 *  brightness control. */
const LED_ACCUMULATE_FRAG_WGSL = /* wgsl */ `
struct Uniforms {
  decay: f32,
  depositScale: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var t_deposit: texture_2d<f32>;
@group(0) @binding(3) var t_history: texture_2d<f32>;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let history = textureSample(t_history, samp, uv);
  let deposit = textureSample(t_deposit, samp, uv);
  return history * u.decay + deposit * u.depositScale;
}
`;

/** 13-tap kernel, Froyok/LearnOpenGL layout. No threshold and no knee: a
 *  threshold would make glare depend on how bright an LED happens to be, and
 *  the whole HDR buffer is emitter light already. */
const BLOOM_DOWNSAMPLE_FRAG_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize: vec2f,
  karis: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var t_src: texture_2d<f32>;

fn sanitize(c: vec3f) -> vec3f {
  // Half-float overflow produces inf/NaN, and one bad texel would otherwise
  // bloom across the whole frame.
  var v = select(c, vec3f(0.0), c != c);
  v = clamp(v, vec3f(0.0), vec3f(65504.0));
  return max(v, vec3f(1e-4));
}

fn tap(uv: vec2f, offset: vec2f) -> vec3f {
  return sanitize(textureSample(t_src, samp, uv + u.texelSize * offset).rgb);
}

fn karisWeight(c: vec3f) -> f32 {
  return 1.0 / (1.0 + dot(c, vec3f(0.2126, 0.7152, 0.0722)));
}

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let a = tap(uv, vec2f(-2.0,  2.0));
  let b = tap(uv, vec2f( 0.0,  2.0));
  let c = tap(uv, vec2f( 2.0,  2.0));
  let d = tap(uv, vec2f(-2.0,  0.0));
  let e = tap(uv, vec2f( 0.0,  0.0));
  let f = tap(uv, vec2f( 2.0,  0.0));
  let g = tap(uv, vec2f(-2.0, -2.0));
  let h = tap(uv, vec2f( 0.0, -2.0));
  let i = tap(uv, vec2f( 2.0, -2.0));
  let j = tap(uv, vec2f(-1.0,  1.0));
  let k = tap(uv, vec2f( 1.0,  1.0));
  let l = tap(uv, vec2f(-1.0, -1.0));
  let m = tap(uv, vec2f( 1.0, -1.0));

  let plain = e * 0.125
            + (a + c + g + i) * 0.03125
            + (b + d + f + h) * 0.0625
            + (j + k + l + m) * 0.125;

  // Partial Karis: firefly suppression applied per box, and only on the first
  // level. Applying it at every level averages the tiny LED cores away - here
  // the fireflies ARE the subject.
  let g0 = (a + b + d + e) * 0.03125;
  let g1 = (b + c + e + f) * 0.03125;
  let g2 = (d + e + g + h) * 0.03125;
  let g3 = (e + f + h + i) * 0.03125;
  let g4 = (j + k + l + m) * 0.125;
  let karis = g0 * karisWeight(g0)
            + g1 * karisWeight(g1)
            + g2 * karisWeight(g2)
            + g3 * karisWeight(g3)
            + g4 * karisWeight(g4);

  return vec4f(mix(plain, karis, u.karis), 1.0);
}
`;

/** 3x3 tent. The caller blends the result into the level above with a constant
 *  blend factor equal to the glare weight, which is the `mix(up, tent(lower), w)`
 *  the geometric falloff needs; additive accumulation would flatten the kernel
 *  and turn every LED into a formless blob. */
const BLOOM_UPSAMPLE_FRAG_WGSL = /* wgsl */ `
struct Uniforms {
  tentOffset: vec2f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var t_src: texture_2d<f32>;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = u.tentOffset;

  var sum = vec4f(0.0);
  sum += textureSample(t_src, samp, uv + vec2f(-ts.x, -ts.y)) * 1.0;
  sum += textureSample(t_src, samp, uv + vec2f(  0.0, -ts.y)) * 2.0;
  sum += textureSample(t_src, samp, uv + vec2f( ts.x, -ts.y)) * 1.0;
  sum += textureSample(t_src, samp, uv + vec2f(-ts.x,   0.0)) * 2.0;
  sum += textureSample(t_src, samp, uv)                       * 4.0;
  sum += textureSample(t_src, samp, uv + vec2f( ts.x,   0.0)) * 2.0;
  sum += textureSample(t_src, samp, uv + vec2f(-ts.x,  ts.y)) * 1.0;
  sum += textureSample(t_src, samp, uv + vec2f(  0.0,  ts.y)) * 2.0;
  sum += textureSample(t_src, samp, uv + vec2f( ts.x,  ts.y)) * 1.0;

  return sum / 16.0;
}
`;

/** The only tone map in the pipeline, applied once, last. AgX is the published
 *  minimal fit (three.js / Filament / Benjamin Wrensch): it desaturates toward
 *  white as a channel clips, which is what makes an LED core read as blinding
 *  while its halo keeps hue. */
const LED_DISPLAY_FRAG_WGSL = /* wgsl */ `
struct Uniforms {
  bloomStrength: f32,
  exposure: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var t_scene: texture_2d<f32>;
@group(0) @binding(3) var t_bloom: texture_2d<f32>;

const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;

fn agxCurve(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
       - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

fn agx(cIn: vec3f) -> vec3f {
  let SRGB_TO_2020 = mat3x3f(
    vec3f(0.6274, 0.0691, 0.0164),
    vec3f(0.3293, 0.9195, 0.0880),
    vec3f(0.0433, 0.0113, 0.8956),
  );
  let AGX_IN = mat3x3f(
    vec3f(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3f(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3f(0.0482516061458583, 0.101439036467562, 0.811302368396859),
  );
  let AGX_OUT = mat3x3f(
    vec3f(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3f(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3f(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405),
  );
  let REC2020_TO_SRGB = mat3x3f(
    vec3f(1.6605, -0.1246, -0.0182),
    vec3f(-0.5876, 1.1329, -0.1006),
    vec3f(-0.0728, -0.0083, 1.1187),
  );

  var c = SRGB_TO_2020 * cIn;
  c = AGX_IN * c;
  c = max(c, vec3f(1e-10));
  c = (log2(c) - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  c = agxCurve(c);
  // The published AgX look, between the curve and the outset matrix. Base AgX
  // is a working space, not a finished image; without this, overlapping
  // coloured passes average to neutral grey.
  let luma = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = pow(max(c, vec3f(0.0)), vec3f(1.35));
  c = vec3f(luma) + 1.4 * (c - vec3f(luma));
  c = AGX_OUT * c;
  c = pow(max(vec3f(0.0), c), vec3f(2.2));
  c = REC2020_TO_SRGB * c;
  return clamp(c, vec3f(0.0), vec3f(1.0));
}

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let scene = textureSample(t_scene, samp, uv).rgb;
  let bloom = textureSample(t_bloom, samp, uv).rgb;

  // Added, not lerped: scattering puts light where the source is not.
  var combined = scene + bloom * u.bloomStrength;
  combined = select(combined, vec3f(0.0), combined != combined);

  let mapped = agx(max(combined, vec3f(0.0)) * u.exposure);

  // Straight alpha. Alpha is the peak channel rather than Rec.709 luminance:
  // reconstruction divides RGB by alpha, and luminance sits below the peak for
  // any saturated hue, so a luminance alpha would push blue past 1.0 and clip it.
  let a = max(mapped.r, max(mapped.g, mapped.b));
  let rgb = select(vec3f(0.0), mapped / max(a, 1e-6), a > 0.001);
  return vec4f(rgb, a);
}
`;


interface GPUTextureEntry {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
}

export class WebGPULedExecutor {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private initialized = false;

  private streakPipeline: GPURenderPipeline | null = null;
  private accumPipeline: GPURenderPipeline | null = null;
  private downPipeline: GPURenderPipeline | null = null;
  private upPipeline: GPURenderPipeline | null = null;
  private displayPipeline: GPURenderPipeline | null = null;

  private streakLayout: GPUBindGroupLayout | null = null;
  private accumLayout: GPUBindGroupLayout | null = null;
  private downLayout: GPUBindGroupLayout | null = null;
  private upLayout: GPUBindGroupLayout | null = null;
  private displayLayout: GPUBindGroupLayout | null = null;

  private quadBuffer: GPUBuffer | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private segmentCapacity = INITIAL_SEGMENT_CAPACITY;
  private instanceData = new Float32Array(
    INITIAL_SEGMENT_CAPACITY * INSTANCE_STRIDE_FLOATS,
  );

  private streakUniform: GPUBuffer | null = null;
  private accumUniform: GPUBuffer | null = null;
  private downUniforms: GPUBuffer[] = [];
  private upUniform: GPUBuffer | null = null;
  private displayUniform: GPUBuffer | null = null;

  private depositTexture: GPUTextureEntry | null = null;
  private accumTextures: [GPUTextureEntry, GPUTextureEntry] | null = null;
  private accumReadIdx = 0;
  private bloomMips: GPUTextureEntry[] = [];

  /** Per-LED previous-frame positions in NDC, keyed by `tipId:segmentIndex`.
   *  NDC rather than pixels so a resize between frames cannot fabricate a
   *  streak. */
  private prevPositions = new Map<string, { x: number; y: number }>();
  /** This frame's positions in device pixels, filled per tip. */
  private currScratch = new Float32Array(MAX_LEDS * 2);
  private prevScratch = new Float32Array(MAX_LEDS * 2);
  /** Sub-step rotation and center tables, indexed 0..subSteps. */
  private stepCos = new Float32Array(MAX_SUB_STEPS + 1);
  private stepSin = new Float32Array(MAX_SUB_STEPS + 1);
  private stepCx = new Float32Array(MAX_SUB_STEPS + 1);
  private stepCy = new Float32Array(MAX_SUB_STEPS + 1);

  private reducedMotion = false;

  constructor(device: GPUDevice, sampler: GPUSampler) {
    this.device = device;
    this.sampler = sampler;
    if (typeof window !== "undefined" && window.matchMedia) {
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }

  execute(
    payload: LedPassPayload,
    dt: number,
    presentView: GPUTextureView,
    canvasW: number,
    canvasH: number,
  ): void {
    if (!this.initialized) {
      this.init();
      this.initialized = true;
    }
    this.ensureTextures(canvasW, canvasH);

    const isDiscontinuity = !(dt > 0) || dt > MAX_STREAK_DT;
    const frameDt = isDiscontinuity
      ? FALLBACK_DT
      : Math.min(Math.max(dt, MIN_DT), MAX_STREAK_DT);

    const segmentCount = this.buildSegments(
      payload,
      canvasW,
      canvasH,
      frameDt,
      isDiscontinuity,
    );
    if (segmentCount === 0) return;

    this.device.queue.writeBuffer(
      this.instanceBuffer!,
      0,
      this.instanceData,
      0,
      segmentCount * INSTANCE_STRIDE_FLOATS,
    );

    const shutter = this.resolveShutter(payload.shutter);
    const tau = Math.max(shutter.timeConstantSeconds, 1e-6);
    // exp(-dt/tau), not a per-frame constant: the constant made the same look
    // decay differently at 30 and 60fps.
    const decay = this.reducedMotion ? 0 : Math.exp(-frameDt / tau);
    // Scales to a fixed detector gain, not to the persistence window — see
    // `shutterNormalization`. With persistence suppressed the accumulation holds
    // exactly one frame instead of integrating, so that branch is scaled by the
    // frame's own weight to land where a dwelling emitter lands at the reference
    // constant.
    const normalization = this.reducedMotion
      ? frameDt
      : shutterNormalization(shutter, frameDt);
    const glare = Math.min(GLARE_WEIGHT_MAX, Math.max(GLARE_WEIGHT_MIN, payload.glare));

    this.writeFrameUniforms(canvasW, canvasH, decay, normalization);

    const encoder = this.device.createCommandEncoder();
    this.encodeStreak(encoder, segmentCount);
    this.encodeAccumulate(encoder);
    this.encodeBloom(encoder, glare);
    this.encodeDisplay(encoder, presentView);
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.quadBuffer?.destroy();
    this.instanceBuffer?.destroy();
    this.streakUniform?.destroy();
    this.accumUniform?.destroy();
    for (const buffer of this.downUniforms) buffer.destroy();
    this.upUniform?.destroy();
    this.displayUniform?.destroy();
    this.destroyTextures();

    this.quadBuffer = null;
    this.instanceBuffer = null;
    this.streakUniform = null;
    this.accumUniform = null;
    this.downUniforms = [];
    this.upUniform = null;
    this.displayUniform = null;
    this.prevPositions.clear();
    this.initialized = false;
  }


  private init(): void {
    const device = this.device;
    const F = Float32Array.BYTES_PER_ELEMENT;

    const quadVerts = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);
    this.quadBuffer = device.createBuffer({
      size: quadVerts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, quadVerts);

    this.instanceBuffer = device.createBuffer({
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // Uniform blocks are padded to 16 bytes, the minimum binding size.
    const uniform = (): GPUBuffer =>
      device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    this.streakUniform = uniform();
    this.accumUniform = uniform();
    this.upUniform = uniform();
    this.displayUniform = uniform();
    // One per mip: the level index selects the Karis flag and the texel size,
    // and every downsample draw is encoded before any of them executes.
    this.downUniforms = Array.from({ length: BLOOM_MIP_COUNT }, uniform);

    this.streakLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      ],
    });
    this.accumLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    const singleTextureLayout = (): GPUBindGroupLayout =>
      device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        ],
      });
    this.downLayout = singleTextureLayout();
    this.upLayout = singleTextureLayout();
    this.displayLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });

    const fullscreenVert = device.createShaderModule({ code: LED_FULLSCREEN_VERT_WGSL });

    this.streakPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.streakLayout] }),
      vertex: {
        module: device.createShaderModule({ code: LED_STREAK_VERT_WGSL }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 2 * F,
            stepMode: "vertex",
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
          {
            arrayStride: INSTANCE_STRIDE_FLOATS * F,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, offset: 0, format: "float32x2" },
              { shaderLocation: 2, offset: 2 * F, format: "float32x2" },
              { shaderLocation: 3, offset: 4 * F, format: "float32x3" },
              { shaderLocation: 4, offset: 7 * F, format: "float32" },
              { shaderLocation: 5, offset: 8 * F, format: "float32" },
              { shaderLocation: 6, offset: 9 * F, format: "float32" },
              { shaderLocation: 7, offset: 10 * F, format: "float32" },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: LED_STREAK_FRAG_WGSL }),
        entryPoint: "main",
        // Additive, because two emitters lighting the same pixel deposit the
        // sum of their energy.
        targets: [
          {
            format: HDR_FORMAT,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    this.accumPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.accumLayout] }),
      vertex: { module: fullscreenVert, entryPoint: "main" },
      fragment: {
        module: device.createShaderModule({ code: LED_ACCUMULATE_FRAG_WGSL }),
        entryPoint: "main",
        targets: [{ format: HDR_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.downPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.downLayout] }),
      vertex: { module: fullscreenVert, entryPoint: "main" },
      fragment: {
        module: device.createShaderModule({ code: BLOOM_DOWNSAMPLE_FRAG_WGSL }),
        entryPoint: "main",
        targets: [{ format: HDR_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.upPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.upLayout] }),
      vertex: { module: fullscreenVert, entryPoint: "main" },
      fragment: {
        module: device.createShaderModule({ code: BLOOM_UPSAMPLE_FRAG_WGSL }),
        entryPoint: "main",
        // Constant-factor blending performs mix(up, tent, w) with w the per-mip
        // glare weight, whose geometric progression sets the falloff exponent.
        targets: [
          {
            format: HDR_FORMAT,
            blend: {
              color: {
                srcFactor: "constant",
                dstFactor: "one-minus-constant",
                operation: "add",
              },
              alpha: {
                srcFactor: "constant",
                dstFactor: "one-minus-constant",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    this.displayPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.displayLayout] }),
      vertex: { module: fullscreenVert, entryPoint: "main" },
      fragment: {
        module: device.createShaderModule({ code: LED_DISPLAY_FRAG_WGSL }),
        entryPoint: "main",
        targets: [
          {
            format: PRESENT_FORMAT,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }


  private ensureTextures(w: number, h: number): void {
    if (this.depositTexture?.width === w && this.depositTexture.height === h) return;
    this.destroyTextures();

    // RGBA16F throughout: the chain is linear HDR, and an 8-bit stage anywhere
    // in it would clip the emitter cores before the tone map.
    this.depositTexture = this.createTexture(w, h);
    this.accumTextures = [this.createTexture(w, h), this.createTexture(w, h)];
    this.accumReadIdx = 0;

    let mipW = w;
    let mipH = h;
    for (let i = 0; i < BLOOM_MIP_COUNT; i++) {
      mipW = Math.max(1, Math.floor(mipW / 2));
      mipH = Math.max(1, Math.floor(mipH / 2));
      this.bloomMips.push(this.createTexture(mipW, mipH));
    }
  }

  private createTexture(w: number, h: number): GPUTextureEntry {
    const texture = this.device.createTexture({
      size: { width: w, height: h },
      format: HDR_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { texture, view: texture.createView(), width: w, height: h };
  }

  private destroyTextures(): void {
    this.depositTexture?.texture.destroy();
    this.accumTextures?.[0].texture.destroy();
    this.accumTextures?.[1].texture.destroy();
    for (const mip of this.bloomMips) mip.texture.destroy();
    this.depositTexture = null;
    this.accumTextures = null;
    this.bloomMips = [];
  }


  private writeFrameUniforms(
    canvasW: number,
    canvasH: number,
    decay: number,
    normalization: number,
  ): void {
    const queue = this.device.queue;
    queue.writeBuffer(
      this.streakUniform!,
      0,
      new Float32Array([canvasW, canvasH, 0, 0]),
    );
    queue.writeBuffer(
      this.accumUniform!,
      0,
      new Float32Array([decay, 1 / Math.max(normalization, 1e-6), 0, 0]),
    );

    let srcW = canvasW;
    let srcH = canvasH;
    for (let i = 0; i < this.bloomMips.length; i++) {
      queue.writeBuffer(
        this.downUniforms[i]!,
        0,
        // Karis on the first level only. The LED cores are the fireflies;
        // suppressing them at every level averages the subject away.
        new Float32Array([1 / srcW, 1 / srcH, i === 0 ? 1 : 0, 0]),
      );
      srcW = this.bloomMips[i]!.width;
      srcH = this.bloomMips[i]!.height;
    }

    const tentY = BLOOM_TENT_RADIUS_FRAME_FRACTION;
    const tentX = tentY * (canvasH / Math.max(canvasW, 1));
    queue.writeBuffer(this.upUniform!, 0, new Float32Array([tentX, tentY, 0, 0]));
    queue.writeBuffer(
      this.displayUniform!,
      0,
      new Float32Array([BLOOM_COMPOSITE_STRENGTH, DISPLAY_EXPOSURE_GAIN, 0, 0]),
    );
  }

  private encodeStreak(encoder: GPUCommandEncoder, segmentCount: number): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.streakLayout!,
      entries: [{ binding: 0, resource: { buffer: this.streakUniform! } }],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.depositTexture!.view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(this.streakPipeline!);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, this.quadBuffer!);
    pass.setVertexBuffer(1, this.instanceBuffer!);
    pass.draw(6, segmentCount);
    pass.end();
  }

  private encodeAccumulate(encoder: GPUCommandEncoder): void {
    const read = this.accumTextures![this.accumReadIdx]!;
    const write = this.accumTextures![this.accumReadIdx ^ 1]!;

    const bindGroup = this.device.createBindGroup({
      layout: this.accumLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.accumUniform! } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.depositTexture!.view },
        { binding: 3, resource: read.view },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: write.view,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(this.accumPipeline!);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    this.accumReadIdx ^= 1;
  }

  private encodeBloom(encoder: GPUCommandEncoder, glare: number): void {
    let srcView = this.accumTextures![this.accumReadIdx]!.view;

    for (let i = 0; i < this.bloomMips.length; i++) {
      const bindGroup = this.device.createBindGroup({
        layout: this.downLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.downUniforms[i]! } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: srcView },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.bloomMips[i]!.view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });
      pass.setPipeline(this.downPipeline!);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      srcView = this.bloomMips[i]!.view;
    }

    for (let i = this.bloomMips.length - 1; i > 0; i--) {
      const bindGroup = this.device.createBindGroup({
        layout: this.upLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.upUniform! } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.bloomMips[i]!.view },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: this.bloomMips[i - 1]!.view, loadOp: "load", storeOp: "store" },
        ],
      });
      pass.setPipeline(this.upPipeline!);
      pass.setBlendConstant({ r: glare, g: glare, b: glare, a: glare });
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
  }

  private encodeDisplay(encoder: GPUCommandEncoder, presentView: GPUTextureView): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.displayLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.displayUniform! } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.accumTextures![this.accumReadIdx]!.view },
        { binding: 3, resource: this.bloomMips[0]!.view },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: presentView, loadOp: "load", storeOp: "store" }],
    });
    pass.setPipeline(this.displayPipeline!);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  // ── Photometry -> instance data ───────────────────────────────────────

  /**
   * Camera mode falls back to the eye time constant here. A box shutter holds
   * every contribution at full weight until it falls off the end of the
   * exposure, which an exponential accumulation buffer cannot represent at any
   * decay rate.
   *
   * The 2D renderer now does it properly, with two plain additive accumulators
   * staggered half an exposure apart and blended under complementary triangular
   * weights (`advanceBoxShutter`, `LED_BOX_RESOLVE_FRAG`). Porting that here is
   * two more storage textures and one resolve pipeline.
   *
   * TODO(led-camera-shutter): port the staggered pair. It is deliberately not
   * done blind — this executor's WGSL has never been compiled by a device and
   * has no test harness, so an unverified port would be a second unproven path
   * rather than a fix. Faking a box shutter with a decay stays forbidden: it
   * produces a trail that is neither of the two things the control names.
   */
  private resolveShutter(shutter: LedShutter): Extract<LedShutter, { mode: "eye" }> {
    if (shutter.mode === "camera") {
      return { mode: "eye", timeConstantSeconds: EYE_TIME_CONSTANT_S };
    }
    return shutter;
  }

  /**
   * Fills the instance buffer with one capsule per LED per sub-step and returns
   * how many were written. Photometry is per-prop: flux, footprint and sub-step
   * count all depend on how many LEDs share this strip and how long it is on
   * screen, so nothing is computed until a whole tip is resolved.
   */
  private buildSegments(
    payload: LedPassPayload,
    canvasW: number,
    canvasH: number,
    dt: number,
    isDiscontinuity: boolean,
  ): number {
    const seenKeys = new Set<string>();
    let written = 0;

    for (const tip of payload.tips) {
      const count = Math.min(tip.segments.length, MAX_LEDS);
      if (count === 0) continue;

      for (let i = 0; i < count; i++) {
        const seg = tip.segments[i]!;
        const key = `${tip.tipId}:${i}`;
        seenKeys.add(key);

        const ndcX = seg.position[0];
        const ndcY = seg.position[1];
        const px = (ndcX + 1) * 0.5 * canvasW;
        const py = (1 - ndcY) * 0.5 * canvasH;

        let prevX = px;
        let prevY = py;
        const stored = this.prevPositions.get(key);
        if (stored && tip.motionStreak && !isDiscontinuity) {
          const sx = (stored.x + 1) * 0.5 * canvasW;
          const sy = (1 - stored.y) * 0.5 * canvasH;
          const ddx = px - sx;
          const ddy = py - sy;
          if (ddx * ddx + ddy * ddy <= MAX_STREAK_PX * MAX_STREAK_PX) {
            prevX = sx;
            prevY = sy;
          }
        }

        if (stored) {
          stored.x = ndcX;
          stored.y = ndcY;
        } else {
          this.prevPositions.set(key, { x: ndcX, y: ndcY });
        }

        this.currScratch[i * 2] = px;
        this.currScratch[i * 2 + 1] = py;
        this.prevScratch[i * 2] = prevX;
        this.prevScratch[i * 2 + 1] = prevY;
      }

      const last = count - 1;
      const currFirstX = this.currScratch[0]!;
      const currFirstY = this.currScratch[1]!;
      const currLastX = this.currScratch[last * 2]!;
      const currLastY = this.currScratch[last * 2 + 1]!;
      const prevFirstX = this.prevScratch[0]!;
      const prevFirstY = this.prevScratch[1]!;
      const prevLastX = this.prevScratch[last * 2]!;
      const prevLastY = this.prevScratch[last * 2 + 1]!;

      const stripLengthPx = Math.hypot(currLastX - currFirstX, currLastY - currFirstY);
      const sigmaEff = effectiveSigmaPx(emitterSigmaPx(stripLengthPx, count));
      const flux = perLedFlux(tip.propFlux, count);

      // The strip is rigid, so its motion this frame is a rotation about its
      // own axis plus a translation of its midpoint. Recovering both is what
      // lets a sub-step follow the arc instead of chording it.
      const currAngle = Math.atan2(currLastY - currFirstY, currLastX - currFirstX);
      const prevAngle = Math.atan2(prevLastY - prevFirstY, prevLastX - prevFirstX);
      let deltaAngle = currAngle - prevAngle;
      if (!Number.isFinite(deltaAngle)) deltaAngle = 0;
      deltaAngle -= Math.round(deltaAngle / (Math.PI * 2)) * Math.PI * 2;

      const prevCx = (prevFirstX + prevLastX) * 0.5;
      const prevCy = (prevFirstY + prevLastY) * 0.5;
      const currCx = (currFirstX + currLastX) * 0.5;
      const currCy = (currFirstY + currLastY) * 0.5;

      const angularSpeed = Math.abs(deltaAngle) / dt;
      const subSteps = subStepCount(angularSpeed, dt, stripLengthPx * 0.5, sigmaEff);
      const subDt = dt / subSteps;

      for (let k = 0; k <= subSteps; k++) {
        const t = k / subSteps;
        const angle = deltaAngle * t;
        this.stepCos[k] = Math.cos(angle);
        this.stepSin[k] = Math.sin(angle);
        this.stepCx[k] = prevCx + (currCx - prevCx) * t;
        this.stepCy[k] = prevCy + (currCy - prevCy) * t;
      }
      const endCos = this.stepCos[subSteps]!;
      const endSin = this.stepSin[subSteps]!;

      for (let i = 0; i < count; i++) {
        const seg = tip.segments[i]!;
        const currX = this.currScratch[i * 2]!;
        const currY = this.currScratch[i * 2 + 1]!;
        const relX = this.prevScratch[i * 2]! - prevCx;
        const relY = this.prevScratch[i * 2 + 1]! - prevCy;

        // The sagitta the sub-step count answers to is this LED's own, and an
        // LED near the pivot has none: it needs one segment however fast the
        // tip is moving. Subdividing it anyway splits the splat that surrounds
        // it into wedges of dt/N and costs real energy, which breaks the
        // subdivision invariant. Steps merge in groups rather than being
        // recounted so the prop's rotation table stays shared, and merged
        // segments still tile the same path.
        const ledSteps = subStepCount(angularSpeed, dt, Math.hypot(relX, relY), sigmaEff);
        const stepGroup = Math.max(1, Math.ceil(subSteps / ledSteps));

        // The rigid model lands close to the payload's own end position but not
        // exactly on it. Distributing the residual linearly over the path keeps
        // the sub-steps continuous with the next frame.
        const modeledEndX = relX * endCos - relY * endSin + currCx;
        const modeledEndY = relX * endSin + relY * endCos + currCy;
        const correctX = currX - modeledEndX;
        const correctY = currY - modeledEndY;

        let ax = relX * this.stepCos[0]! - relY * this.stepSin[0]! + this.stepCx[0]!;
        let ay = relX * this.stepSin[0]! + relY * this.stepCos[0]! + this.stepCy[0]!;

        for (let k = 0; k < subSteps; k += stepGroup) {
          const kNext = Math.min(k + stepGroup, subSteps);
          const t = kNext / subSteps;
          const bx =
            relX * this.stepCos[kNext]! - relY * this.stepSin[kNext]! + this.stepCx[kNext]! + correctX * t;
          const by =
            relX * this.stepSin[kNext]! + relY * this.stepCos[kNext]! + this.stepCy[kNext]! + correctY * t;

          if (written >= MAX_SEGMENT_CAPACITY) break;
          this.ensureSegmentCapacity(written + 1);

          const chordPx = Math.hypot(bx - ax, by - ay);
          // Subdivision-invariant: dt/N over chord/N deposits the same total
          // energy as the single undivided segment.
          const density =
            streakDensity(flux, subDt * (kNext - k), chordPx, sigmaEff) * seg.brightness;

          const offset = written * INSTANCE_STRIDE_FLOATS;
          this.instanceData[offset + 0] = ax;
          this.instanceData[offset + 1] = ay;
          this.instanceData[offset + 2] = bx;
          this.instanceData[offset + 3] = by;
          this.instanceData[offset + 4] = seg.color[0];
          this.instanceData[offset + 5] = seg.color[1];
          this.instanceData[offset + 6] = seg.color[2];
          this.instanceData[offset + 7] = density;
          this.instanceData[offset + 8] = sigmaEff;
          // Round caps only at the path ends; a round cap at a join would
          // deposit that join's half-Gaussian twice.
          this.instanceData[offset + 9] = k === 0 ? 1 : 0;
          this.instanceData[offset + 10] = kNext === subSteps ? 1 : 0;
          written++;

          ax = bx;
          ay = by;
        }
      }
    }

    // Drop state for LEDs that disappeared this frame so they start fresh next
    // time they reappear rather than streaking across the gap.
    for (const key of this.prevPositions.keys()) {
      if (!seenKeys.has(key)) this.prevPositions.delete(key);
    }

    return written;
  }

  private ensureSegmentCapacity(needed: number): void {
    if (needed <= this.segmentCapacity) return;

    let capacity = this.segmentCapacity;
    while (capacity < needed && capacity < MAX_SEGMENT_CAPACITY) capacity *= 2;
    capacity = Math.min(capacity, MAX_SEGMENT_CAPACITY);

    const grown = new Float32Array(capacity * INSTANCE_STRIDE_FLOATS);
    grown.set(this.instanceData);
    this.instanceData = grown;
    this.segmentCapacity = capacity;

    this.instanceBuffer?.destroy();
    this.instanceBuffer = this.device.createBuffer({
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}
