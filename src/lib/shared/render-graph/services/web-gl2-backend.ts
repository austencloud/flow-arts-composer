/**
 * WebGL2 render backend - Phase 1.
 *
 * Per-frame algorithm per tip (matches Canvas2D shadowBlur semantics):
 *
 *   1. Decay the accumulator (ping-pong read → write, multiplicative
 *      fade + 1/255 subtract so rgba8 pixels eventually reach true zero).
 *   2. Draw the current smoothed-tapered-polygon mesh into a scratch
 *      STAMP FBO. The stamp is cleared each frame so it holds ONLY
 *      this frame's polygon.
 *   3. If glow > 0, run a separable 2-pass Gaussian blur on the stamp
 *      into a BLUR_RESULT FBO.
 *   4. Composite (stamp + blur * GLOW_MIX) on top of the decayed
 *      accumulator via premultiplied alpha-over blend. This bakes a
 *      fresh, full-brightness halo around the current polygon into the
 *      accumulator, which then fades naturally on subsequent frames -
 *      the GPU equivalent of Canvas2D shadowBlur applied per-stroke.
 *   5. Composite accumulator onto the display.
 *
 * Persistent GPU state:
 * - One ping-pong pair per tip ("trail-tip-<id>")
 * - Three shared scratch FBOs: "stamp", "blur-temp", "blur-result"
 * - Compiled shader programs + one dynamic mesh VBO
 */

import type { RenderBackend, BackendStats } from "../domain/backend";
import type { FrameGraph } from "../domain/frame-graph";
import type {
  RenderPassDescriptor,
  RenderPassKind,
} from "../domain/render-pass";
import type {
  TrailPassPayload,
  TrailTipState,
  TrailBlendMode,
} from "../domain/trail-pass";
import type { FirePassPayload } from "../domain/fire-pass";
import type { LedPassPayload } from "../domain/led-pass";
import type { ParticlePassPayload } from "../domain/particle-pass";
import type {
  GhostPassPayload,
  BloomPassPayload,
  ZapPassPayload,
  PulsePassPayload,
  InkPassPayload,
  FrostPassPayload,
  SilkPassPayload,
} from "../domain/effect-passes";
import {
  adaptiveSubdivisions,
  buildTaperedMesh,
  createSmoothCurve,
  TRAIL_VERTEX_STRIDE,
  type Point2D,
} from "../math/trail-mesh";
import { FBOPool, type FBO } from "./fbo-pool";
import { ShaderLibrary } from "./shader-library";
import { FirePassExecutor } from "./fire-pass-executor";
import { LedPassExecutor } from "./led-pass-executor";
import { ParticlePassExecutor } from "./particle-pass-executor";
import { OverlayEffectsExecutor } from "./overlay-effects-executor";

const TRAIL_KEY_PREFIX = "trail-tip-";
const STAMP_KEY = "stamp";
const BLUR_SRC_HALF_KEY = "blur-src-half";
const BLUR_TEMP_HALF_KEY = "blur-temp-half";
const BLUR_RESULT_HALF_KEY = "blur-result-half";
const DT_CLAMP_SECONDS = 0.1;
const MAX_UNUSED_FRAMES_BEFORE_GC = 30;
const AA_WIDTH = 0.05;
/** Subtract per-frame from every channel to escape rgba8's 1/255 floor. */
const ALPHA_SUBTRACT = 1.0 / 255.0;
/** Additive gain on the blurred stamp. Fresh-per-frame so this stays bright. */
const GLOW_MIX = 1.0;
/** Downsample factor for the bloom blur. Half-res = 4× less pixels blurred,
 *  and bilinear upsample in the composite softens any residual banding. */
const BLOOM_DOWNSAMPLE = 2;
/** Effective sigma contributed by one 9-tap blur pass at 1 texel stride. */
const SIGMA_PER_PASS = 2.0;
/** Cap on blur iterations - bounds worst-case GPU cost. */
const MAX_BLUR_ITERATIONS = 8;

interface TipLiveness {
  lastSeenFrame: number;
}

export class WebGL2Backend implements RenderBackend {
  readonly kind = "webgl2" as const;

  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private shaders: ShaderLibrary | null = null;
  private fbos: FBOPool | null = null;
  private emptyVAO: WebGLVertexArrayObject | null = null;
  private meshVAO: WebGLVertexArrayObject | null = null;
  private meshVBO: WebGLBuffer | null = null;

  private readonly smoothPathBuffer: Point2D[] = [];
  private previousTime = -1;
  private frameCount = 0;
  private lastFrameMs = 0;
  private longestPassMs = 0;
  private readonly tipLiveness = new Map<string, TipLiveness>();
  private readonly unsupportedKindsWarned = new Set<RenderPassKind>();
  private fireExecutor: FirePassExecutor | null = null;
  private ledExecutor: LedPassExecutor | null = null;
  private particleExecutor: ParticlePassExecutor | null = null;
  private overlayExecutor: OverlayEffectsExecutor | null = null;

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    if (this.gl) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
      // Required for the `__TKA_TRAIL_DEPTH` path's per-pixel age ordering.
      // Cheap even when the flag is off - the existing accumulator path
      // never enables DEPTH_TEST so the depth buffer just goes unused.
      depth: true,
    });
    if (!gl) throw new Error("WebGL2Backend: failed to acquire WebGL2 context");

    this.canvas = canvas;
    this.gl = gl;
    const shaders = new ShaderLibrary(gl);
    this.shaders = shaders;
    this.fbos = new FBOPool(gl, canvas.width, canvas.height);

    this.emptyVAO = gl.createVertexArray();
    if (!this.emptyVAO) throw new Error("WebGL2Backend: createVertexArray null");

    this.meshVBO = gl.createBuffer();
    this.meshVAO = gl.createVertexArray();
    if (!this.meshVBO || !this.meshVAO) {
      throw new Error("WebGL2Backend: mesh VAO/VBO allocation failed");
    }

    // The driver compiles these on its own threads while the page keeps
    // painting; reading each status in turn here held the main thread
    // ~200 ms whenever an animation canvas mounted.
    shaders.compileInBackground([
      "decay",
      "composite",
      "trail-mesh",
      "gaussian-blur",
      "trail-composite",
      "fire-splat",
      "fire-advection",
      "fire-curl",
      "fire-vorticity",
      "fire-curl-noise",
      "fire-buoyancy",
      "fire-combustion",
      "fire-divergence",
      "fire-jacobi",
      "fire-gradient-subtract",
      "fire-clear",
      "fire-display",
      "fire-bloom-composite",
      "led-sprite",
      "led-trail-accumulate",
      "led-display",
      "particle-sprite",
      "bloom-downsample",
      "bloom-upsample",
      "effect-halo",
      "effect-ring",
      "effect-frost",
    ]);
    await shaders.settle();
    if (this.shaders !== shaders) return;

    const mesh = shaders.get("trail-mesh");
    gl.bindVertexArray(this.meshVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVBO);

    const aPos = mesh.attribs["a_position"];
    const aZ = mesh.attribs["a_z"];
    const aEdge = mesh.attribs["a_edge_t"];
    const aAlpha = mesh.attribs["a_alpha"];
    if (aPos === undefined || aZ === undefined || aEdge === undefined || aAlpha === undefined
        || aPos < 0 || aZ < 0 || aEdge < 0 || aAlpha < 0) {
      throw new Error("WebGL2Backend: trail-mesh shader attribute locations missing");
    }

    const stride = TRAIL_VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    const fSize = Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aZ);
    gl.vertexAttribPointer(aZ, 1, gl.FLOAT, false, stride, 2 * fSize);
    gl.enableVertexAttribArray(aEdge);
    gl.vertexAttribPointer(aEdge, 1, gl.FLOAT, false, stride, 3 * fSize);
    gl.enableVertexAttribArray(aAlpha);
    gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride, 4 * fSize);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  executeFrame(graph: FrameGraph, time: number): void {
    const gl = this.gl;
    const fbos = this.fbos;
    const shaders = this.shaders;
    if (!gl || !fbos || !shaders) {
      throw new Error("WebGL2Backend: executeFrame before initialize");
    }

    const frameStart = performance.now();
    this.longestPassMs = 0;

    const dt = this.computeDt(time);
    this.frameCount += 1;

    const orderedPasses = [...graph.passes].sort((a, b) => a.order - b.order);

    for (const pass of orderedPasses) {
      const passStart = performance.now();
      this.dispatch(pass, dt);
      const passMs = performance.now() - passStart;
      if (passMs > this.longestPassMs) this.longestPassMs = passMs;
    }

    this.garbageCollectTips();
    this.lastFrameMs = performance.now() - frameStart;
  }

  resize(width: number, height: number): void {
    if (!this.gl || !this.fbos || !this.canvas) return;
    this.canvas.width = Math.max(1, width);
    this.canvas.height = Math.max(1, height);
    this.fbos.resize(width, height);
  }

  clearScreen(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    if (!this.gl) return;
    const gl = this.gl;
    this.fireExecutor?.dispose();
    this.fireExecutor = null;
    this.ledExecutor?.dispose();
    this.ledExecutor = null;
    this.particleExecutor?.dispose();
    this.particleExecutor = null;
    this.overlayExecutor?.dispose();
    this.overlayExecutor = null;
    this.fbos?.dispose();
    this.shaders?.dispose();
    if (this.emptyVAO) gl.deleteVertexArray(this.emptyVAO);
    if (this.meshVAO) gl.deleteVertexArray(this.meshVAO);
    if (this.meshVBO) gl.deleteBuffer(this.meshVBO);
    this.emptyVAO = null;
    this.meshVAO = null;
    this.meshVBO = null;
    this.shaders = null;
    this.fbos = null;
    this.gl = null;
    this.canvas = null;
    this.tipLiveness.clear();
  }

  getStats(): BackendStats {
    return {
      lastFrameMs: this.lastFrameMs,
      longestPassMs: this.longestPassMs,
      fboCount: this.fbos?.count ?? 0,
    };
  }

  private dispatch(pass: RenderPassDescriptor, dt: number): void {
    switch (pass.kind) {
      case "trail":
        this.executeTrailPass(pass.payload as TrailPassPayload, dt);
        return;
      case "fire":
        this.executeFirePass(pass.payload as FirePassPayload, dt);
        return;
      case "led":
        this.executeLedPass(pass.payload as LedPassPayload, dt);
        return;
      case "goo":
      case "bubbles":
      case "petals":
      case "smoke":
      case "charcoal":
      case "sparkles":
        this.executeParticlePass(pass.kind, pass.payload as ParticlePassPayload, dt);
        return;
      case "ghost":
        this.executeGhostPass(pass.payload as GhostPassPayload, dt);
        return;
      case "bloom":
        this.executeBloomPass(pass.payload as BloomPassPayload, dt);
        return;
      case "zap":
        this.executeZapPass(pass.payload as ZapPassPayload, dt);
        return;
      case "pulse":
        this.executePulsePass(pass.payload as PulsePassPayload, dt);
        return;
      case "ink":
        this.executeInkPass(pass.payload as InkPassPayload, dt);
        return;
      case "frost":
        this.executeFrostPass(pass.payload as FrostPassPayload, dt);
        return;
      case "silk":
        this.executeSilkPass(pass.payload as SilkPassPayload, dt);
        return;
      case "composite":
        return;
      default:
        this.warnUnsupportedOnce(pass.kind);
        return;
    }
  }

  private executeTrailPass(payload: TrailPassPayload, dt: number): void {
    const gl = this.gl!;
    const fbos = this.fbos!;
    const shaders = this.shaders!;
    const canvas = this.canvas!;

    // Dev flag: when true, skip the per-tip ping-pong accumulator and draw
    // every tip's current leading-edge polygon directly to the canvas with
    // depth test enabled. Per-vertex z (0=newest, 1=oldest) gives global
    // "newest-wins" compositing across tips - red strokes over blue when
    // red is newer, and vice versa. Glow is intentionally absent in this
    // path; it gets restored in a follow-up by rendering into a sceneTrail
    // FBO with depth and post-blurring.
    const depthFlag =
      typeof window !== "undefined"
        ? (window as { __TKA_TRAIL_DEPTH?: boolean }).__TKA_TRAIL_DEPTH
        : undefined;
    if (depthFlag === true) {
      this.executeTrailPassDepth(payload, gl, shaders);
      return;
    }

    // Clear the screen once; each tip composites in order on top.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const tip of payload.tips) {
      this.markTipSeen(tip.tipId);
      this.renderTip(tip, dt, gl, fbos, shaders);
    }
  }

  /**
   * Direct-to-canvas trail rendering with age-based depth test.
   *
   * Each tip's leading-edge polygon is drawn this frame only (no
   * accumulator). Per-vertex z is already age-normalized by
   * `buildTaperedMesh`, so `depthFunc(LEQUAL)` with depth cleared to 1.0
   * makes newer fragments overwrite older ones regardless of tip draw
   * order. Alpha blend is kept on so semi-transparent tail ends still
   * composite over the canvas clear color.
   */
  private executeTrailPassDepth(
    payload: TrailPassPayload,
    gl: WebGL2RenderingContext,
    shaders: ShaderLibrary,
  ): void {
    const canvas = this.canvas!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const prog = shaders.get("trail-mesh");
    gl.useProgram(prog.program);
    gl.bindVertexArray(this.meshVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVBO);
    gl.uniform1f(prog.uniforms["u_aaWidth"]!, AA_WIDTH);

    for (const tip of payload.tips) {
      this.markTipSeen(tip.tipId);
      if (tip.path.length < 2) continue;

      const buf = this.smoothPathBuffer;
      buf.length = tip.path.length;
      for (let i = 0; i < tip.path.length; i += 1) {
        const p = tip.path[i]!;
        const existing = buf[i];
        if (existing) {
          existing.x = p[0];
          existing.y = p[1];
        } else {
          buf[i] = { x: p[0], y: p[1] };
        }
      }

      const smooth = createSmoothCurve(buf, {
        subdivisionsPerSegment: adaptiveSubdivisions(buf.length),
      });
      if (smooth.length < 2) continue;

      const mesh = buildTaperedMesh(smooth, {
        thickness: tip.thickness,
        taperTailRatio: tip.taperTailRatio,
        maxAlpha: tip.color[3],
        fadeExponent: tip.fadeExponent,
      });
      if (mesh.vertexCount < 2) continue;

      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
      gl.uniform3f(
        prog.uniforms["u_color"]!,
        tip.color[0],
        tip.color[1],
        tip.color[2],
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, mesh.vertexCount);
    }

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private renderTip(
    tip: TrailTipState,
    dt: number,
    gl: WebGL2RenderingContext,
    fbos: FBOPool,
    shaders: ShaderLibrary,
  ): void {
    const accumulator = fbos.getOrAllocatePair(TRAIL_KEY_PREFIX + tip.tipId, "rgba8");
    const stamp = fbos.getOrAllocate(STAMP_KEY, "rgba8");

    // 1. Decay previous accumulator into the write target.
    this.decayInto(accumulator.write, accumulator.read, tip.decayPerSecond, dt, gl, shaders);

    // 2. Stamp this frame's polygon on a clean scratch FBO.
    this.drawStamp(tip, stamp, gl, shaders);

    // 3. If glow enabled, blur the stamp.
    const canvas = this.canvas!;
    const glowPx = this.glowRadiusPixels(tip.glow, canvas.width, canvas.height);
    const blur = glowPx > 0.5
      ? this.runSeparableBlur(stamp, glowPx, gl, fbos, shaders)
      : null;

    // 4. Composite (stamp + blur * GLOW_MIX) onto the decayed accumulator.
    this.bakeStampIntoAccumulator(accumulator.write, stamp, blur, gl, shaders);

    accumulator.swap();

    // 5. Blit the fresh accumulator (now in read slot after swap) to screen.
    const blitAlpha = tip.blitAlpha ?? 1;
    this.blitToScene(accumulator.read, tip.blendMode, blitAlpha, gl, shaders);
  }

  private decayInto(
    write: FBO,
    read: FBO,
    decayPerSecond: number,
    dt: number,
    gl: WebGL2RenderingContext,
    shaders: ShaderLibrary,
  ): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.viewport(0, 0, write.width, write.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const factor = decayPerSecond > 0 ? Math.exp(-decayPerSecond * dt) : 1.0;
    const prog = shaders.get("decay");
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.uniform1i(prog.uniforms["u_src"]!, 0);
    gl.uniform1f(prog.uniforms["u_alphaFactor"]!, factor);
    gl.uniform1f(prog.uniforms["u_alphaSubtract"]!, ALPHA_SUBTRACT);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private drawStamp(
    tip: TrailTipState,
    stamp: FBO,
    gl: WebGL2RenderingContext,
    shaders: ShaderLibrary,
  ): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, stamp.framebuffer);
    gl.viewport(0, 0, stamp.width, stamp.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (tip.path.length < 2) return;

    const buf = this.smoothPathBuffer;
    buf.length = tip.path.length;
    for (let i = 0; i < tip.path.length; i += 1) {
      const p = tip.path[i]!;
      const existing = buf[i];
      if (existing) {
        existing.x = p[0];
        existing.y = p[1];
      } else {
        buf[i] = { x: p[0], y: p[1] };
      }
    }

    const smooth = createSmoothCurve(buf, {
      subdivisionsPerSegment: adaptiveSubdivisions(buf.length),
    });
    if (smooth.length < 2) return;

    const mesh = buildTaperedMesh(smooth, {
      thickness: tip.thickness,
      taperTailRatio: tip.taperTailRatio,
      maxAlpha: tip.color[3],
      fadeExponent: tip.fadeExponent,
    });
    if (mesh.vertexCount < 2) return;

    const prog = shaders.get("trail-mesh");
    gl.useProgram(prog.program);
    gl.bindVertexArray(this.meshVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVBO);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);

    gl.uniform3f(
      prog.uniforms["u_color"]!,
      tip.color[0],
      tip.color[1],
      tip.color[2],
    );
    gl.uniform1f(prog.uniforms["u_aaWidth"]!, AA_WIDTH);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, mesh.vertexCount);
    gl.disable(gl.BLEND);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private bakeStampIntoAccumulator(
    accumulator: FBO,
    stamp: FBO,
    blur: FBO | null,
    gl: WebGL2RenderingContext,
    shaders: ShaderLibrary,
  ): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumulator.framebuffer);
    gl.viewport(0, 0, accumulator.width, accumulator.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.emptyVAO);

    if (blur) {
      const prog = shaders.get("trail-composite");
      gl.useProgram(prog.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stamp.texture);
      gl.uniform1i(prog.uniforms["u_sharp"]!, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blur.texture);
      gl.uniform1i(prog.uniforms["u_blur"]!, 1);
      gl.uniform1f(prog.uniforms["u_glowMix"]!, GLOW_MIX);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      const prog = shaders.get("composite");
      gl.useProgram(prog.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stamp.texture);
      gl.uniform1i(prog.uniforms["u_src"]!, 0);
      gl.uniform4f(prog.uniforms["u_tint"]!, 1, 1, 1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  private blitToScene(
    source: FBO,
    blendMode: TrailBlendMode,
    blitAlpha: number,
    gl: WebGL2RenderingContext,
    shaders: ShaderLibrary,
  ): void {
    if (blitAlpha <= 0) return;
    const canvas = this.canvas!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    this.setBlendMode(gl, blendMode);
    gl.bindVertexArray(this.emptyVAO);

    const prog = shaders.get("composite");
    gl.useProgram(prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(prog.uniforms["u_src"]!, 0);
    // Source is premultiplied alpha, so scaling opacity means scaling
    // all four channels uniformly.
    const a = Math.max(0, Math.min(1, blitAlpha));
    gl.uniform4f(prog.uniforms["u_tint"]!, a, a, a, a);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Produce a blurred version of `source` matching the requested halo radius.
   *
   * Pipeline:
   *   1. Downsample `source` to a half-res FBO via a single LINEAR-filtered
   *      fullscreen triangle (correct 2×2 box average, no aliasing).
   *   2. Iterate a 9-tap separable Gaussian at stride=1 texel in half-res
   *      space. Multi-pass Gaussians add variances, so effective sigma is
   *      `sqrt(N) * SIGMA_PER_PASS`. Iteration count is chosen from the
   *      requested radius so small halos stay crisp and large halos stay
   *      smooth without ringing.
   *   3. Return the half-res result. Composite samples it at full-res UVs;
   *      LINEAR filtering on the FBO texture upsamples smoothly for free.
   *
   * This replaces a single-pass large-stride blur, which produced visible
   * ribbing at thick-trail halo radii (stride > 5px with only 9 taps).
   */
  private runSeparableBlur(
    source: FBO,
    radiusPx: number,
    gl: WebGL2RenderingContext,
    fbos: FBOPool,
    shaders: ShaderLibrary,
  ): FBO {
    const halfW = Math.max(1, Math.floor(source.width / BLOOM_DOWNSAMPLE));
    const halfH = Math.max(1, Math.floor(source.height / BLOOM_DOWNSAMPLE));
    const src = fbos.getOrAllocateSized(BLUR_SRC_HALF_KEY, halfW, halfH, "rgba8");
    const temp = fbos.getOrAllocateSized(BLUR_TEMP_HALF_KEY, halfW, halfH, "rgba8");
    const result = fbos.getOrAllocateSized(BLUR_RESULT_HALF_KEY, halfW, halfH, "rgba8");

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVAO);

    // 1. Downsample full-res stamp → half-res blur source.
    const downsample = shaders.get("composite");
    gl.useProgram(downsample.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, src.framebuffer);
    gl.viewport(0, 0, src.width, src.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(downsample.uniforms["u_src"]!, 0);
    gl.uniform4f(downsample.uniforms["u_tint"]!, 1, 1, 1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Iterate separable Gaussian. stride=1 texel in half-res = ~2px in
    //    full-res - no aliasing between taps.
    const radiusHalfRes = radiusPx / BLOOM_DOWNSAMPLE;
    const targetSigma = Math.max(0.5, radiusHalfRes / 2);
    const iterations = Math.min(
      MAX_BLUR_ITERATIONS,
      Math.max(1, Math.ceil((targetSigma * targetSigma) / (SIGMA_PER_PASS * SIGMA_PER_PASS))),
    );

    const blur = shaders.get("gaussian-blur");
    gl.useProgram(blur.program);
    const strideX = 1 / src.width;
    const strideY = 1 / src.height;

    let inputTex = src.texture;
    for (let i = 0; i < iterations; i += 1) {
      // Horizontal: inputTex → temp
      gl.bindFramebuffer(gl.FRAMEBUFFER, temp.framebuffer);
      gl.viewport(0, 0, temp.width, temp.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(blur.uniforms["u_src"]!, 0);
      gl.uniform2f(blur.uniforms["u_direction"]!, 1, 0);
      gl.uniform1f(blur.uniforms["u_stride"]!, strideX);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Vertical: temp → result
      gl.bindFramebuffer(gl.FRAMEBUFFER, result.framebuffer);
      gl.viewport(0, 0, result.width, result.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, temp.texture);
      gl.uniform2f(blur.uniforms["u_direction"]!, 0, 1);
      gl.uniform1f(blur.uniforms["u_stride"]!, strideY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      inputTex = result.texture;
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return result;
  }

  private glowRadiusPixels(glowNdc: number, width: number, height: number): number {
    if (glowNdc <= 0) return 0;
    const minAxis = Math.min(width, height);
    return glowNdc * 0.5 * minAxis;
  }

  private setBlendMode(gl: WebGL2RenderingContext, mode: TrailBlendMode): void {
    gl.enable(gl.BLEND);
    switch (mode) {
      case "additive":
        gl.blendFunc(gl.ONE, gl.ONE);
        return;
      case "screen":
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        return;
      case "alpha":
      default:
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        return;
    }
  }

  private computeDt(time: number): number {
    if (this.previousTime < 0) {
      this.previousTime = time;
      return 1 / 60;
    }
    const raw = (time - this.previousTime) / 1000;
    this.previousTime = time;
    if (raw <= 0) return 0;
    return raw > DT_CLAMP_SECONDS ? DT_CLAMP_SECONDS : raw;
  }

  private markTipSeen(tipId: string): void {
    this.tipLiveness.set(tipId, { lastSeenFrame: this.frameCount });
  }

  private garbageCollectTips(): void {
    const fbos = this.fbos;
    if (!fbos) return;
    for (const [tipId, info] of this.tipLiveness) {
      if (this.frameCount - info.lastSeenFrame > MAX_UNUSED_FRAMES_BEFORE_GC) {
        fbos.release(TRAIL_KEY_PREFIX + tipId);
        this.tipLiveness.delete(tipId);
      }
    }
  }


  private executeFirePass(payload: FirePassPayload, dt: number): void {
    if (!this.fireExecutor) {
      this.fireExecutor = new FirePassExecutor(
        this.gl!, this.fbos!, this.shaders!, this.emptyVAO!,
      );
    }
    this.fireExecutor.execute(payload, dt);
  }

  private executeLedPass(payload: LedPassPayload, dt: number): void {
    if (!this.ledExecutor) {
      this.ledExecutor = new LedPassExecutor(
        this.gl!, this.fbos!, this.shaders!, this.emptyVAO!,
      );
    }
    this.ledExecutor.execute(payload, dt);
  }

  private executeParticlePass(
    kind: string,
    payload: ParticlePassPayload,
    dt: number,
  ): void {
    if (!this.particleExecutor) {
      this.particleExecutor = new ParticlePassExecutor(this.gl!, this.shaders!);
    }
    this.particleExecutor.execute(kind, payload, dt);
  }

  private getOverlay(): OverlayEffectsExecutor {
    if (!this.overlayExecutor) {
      this.overlayExecutor = new OverlayEffectsExecutor(
        this.gl!, this.fbos!, this.shaders!, this.emptyVAO!,
      );
    }
    return this.overlayExecutor;
  }

  private executeGhostPass(payload: GhostPassPayload, _dt: number): void {
    this.getOverlay().executeGhost(payload);
  }

  private executeBloomPass(payload: BloomPassPayload, _dt: number): void {
    this.getOverlay().executeBloom(payload);
  }

  private executeZapPass(payload: ZapPassPayload, _dt: number): void {
    this.getOverlay().executeZap(payload);
  }

  private executePulsePass(payload: PulsePassPayload, _dt: number): void {
    this.getOverlay().executePulse(payload);
  }

  private executeInkPass(payload: InkPassPayload, dt: number): void {
    this.getOverlay().executeInk(payload, dt);
  }

  private executeFrostPass(payload: FrostPassPayload, dt: number): void {
    this.getOverlay().executeFrost(payload, dt);
  }

  private executeSilkPass(payload: SilkPassPayload, dt: number): void {
    this.getOverlay().executeSilk(payload, dt);
  }

  private warnUnsupportedOnce(kind: RenderPassKind): void {
    if (this.unsupportedKindsWarned.has(kind)) return;
    this.unsupportedKindsWarned.add(kind);
    if (typeof window !== "undefined") {
       
      console.warn(
        `[WebGL2Backend] pass kind "${kind}" not implemented yet - skipped`,
      );
    }
  }
}

export type { FBO };
