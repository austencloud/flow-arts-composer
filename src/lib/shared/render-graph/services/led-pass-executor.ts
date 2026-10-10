/**
 * LED pass executor for the render-graph WebGL2 backend.
 *
 * Instanced glow-sprite rendering with motion-streak capsules,
 * max()-based trail accumulation, and PBR bloom post-processing.
 *
 * Pipeline per frame (~12 draw calls):
 *   1. Fill instance buffer from LedPassPayload segments
 *   2. Instanced sprite pass: additive glow capsules → sprite FBO
 *   3. Trail accumulation: max(sprite, trail * fadeRate) → ping-pong
 *   4. Bloom downsample: 5-level 13-tap energy-preserving mip chain
 *   5. Bloom upsample: 3x3 tent filter with additive accumulation
 *   6. Display composite: trail + bloom → screen (premultiplied alpha)
 */

import type { LedPassPayload } from "../domain/led-pass";
import {
  EYE_TIME_CONSTANT_S,
  GLARE_WEIGHT_MAX,
  GLARE_WEIGHT_MIN,
  PROP_REFERENCE_FLUX,
  type LedShutter,
} from "#lib/shared/animation-engine/domain/led-photometry.js";
import type { FBO, FBOPool } from "./fbo-pool";
import type { ShaderLibrary } from "./shader-library";

const MAX_LEDS = 400;
const INSTANCE_STRIDE_FLOATS = 9;
const BLOOM_MIP_COUNT = 5;
const MAX_STREAK_DISTANCE_SQ = 400 * 400;

/**
 * Sprite radius as a fraction of the smaller canvas axis.
 *
 * A per-LED constant, so a 200-LED staff paints 200 overlapping orbs along a
 * shaft only as long as one of them. The photometric fix is to derive the
 * footprint from LED pitch and renormalize the splat by it — this executor and
 * its `led-sprite` shader still owe the rewrite the 2D renderer and the WebGPU
 * executor already carry.
 */
const DEFAULT_GLOW_FACTOR = 0.06;

/**
 * Weight of the glare pyramid at the display composite. The composite here is
 * additive rather than a lerp, so this is not the look's `glare` — that is the
 * pyramid's per-mip weight and is applied at the upsample blend.
 */
const BLOOM_COMPOSITE_INTENSITY = 0.5;

export class LedPassExecutor {
  private gl: WebGL2RenderingContext;
  private fbos: FBOPool;
  private shaders: ShaderLibrary;
  private emptyVAO: WebGLVertexArrayObject;
  private initialized = false;

  private quadBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private spriteVAO: WebGLVertexArrayObject | null = null;
  private instanceData = new Float32Array(MAX_LEDS * INSTANCE_STRIDE_FLOATS);

  private prevPositions = new Map<string, { x: number; y: number }>();

  constructor(
    gl: WebGL2RenderingContext,
    fbos: FBOPool,
    shaders: ShaderLibrary,
    emptyVAO: WebGLVertexArrayObject,
  ) {
    this.gl = gl;
    this.fbos = fbos;
    this.shaders = shaders;
    this.emptyVAO = emptyVAO;
  }

  execute(payload: LedPassPayload, dt: number): void {
    const gl = this.gl;
    if (!this.initialized) {
      this.initGeometry();
      this.initialized = true;
    }

    const canvasW = (gl.canvas as HTMLCanvasElement).width;
    const canvasH = (gl.canvas as HTMLCanvasElement).height;

    const ledCount = this.fillInstanceBuffer(payload, canvasW, canvasH, dt);
    if (ledCount === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER, 0,
      this.instanceData.subarray(0, ledCount * INSTANCE_STRIDE_FLOATS),
    );

    this.renderSprites(ledCount, canvasW, canvasH);

    const fadeRate = this.computeFadeRate(payload.shutter, dt);
    this.trailAccumulate(fadeRate, canvasW, canvasH);

    const glare = Math.min(
      GLARE_WEIGHT_MAX,
      Math.max(GLARE_WEIGHT_MIN, payload.glare),
    );
    this.bloomPass(canvasW, canvasH, glare);

    this.displayComposite(BLOOM_COMPOSITE_INTENSITY, canvasW, canvasH);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    if (this.spriteVAO) gl.deleteVertexArray(this.spriteVAO);
    this.quadBuffer = null;
    this.instanceBuffer = null;
    this.spriteVAO = null;

    this.fbos.release("led-sprite");
    this.fbos.release("led-trail");
    for (let i = 0; i < BLOOM_MIP_COUNT; i++) this.fbos.release(`led-bloom-${i}`);
    this.prevPositions.clear();
    this.initialized = false;
  }

  // ── Geometry ──────────────────────────────────────────────────────────

  private initGeometry(): void {
    const gl = this.gl;

    const quadVerts = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);
    this.quadBuffer = gl.createBuffer();
    if (!this.quadBuffer) throw new Error("LedPassExecutor: quadBuffer alloc failed");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    this.instanceBuffer = gl.createBuffer();
    if (!this.instanceBuffer) throw new Error("LedPassExecutor: instanceBuffer alloc failed");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    const prog = this.shaders.get("led-sprite");
    this.spriteVAO = gl.createVertexArray();
    if (!this.spriteVAO) throw new Error("LedPassExecutor: spriteVAO alloc failed");
    gl.bindVertexArray(this.spriteVAO);

    const aPos = prog.attribs["a_position"]!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const stride = INSTANCE_STRIDE_FLOATS * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    const aLedPos = prog.attribs["a_ledPos"]!;
    gl.enableVertexAttribArray(aLedPos);
    gl.vertexAttribPointer(aLedPos, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aLedPos, 1);

    const aPrev = prog.attribs["a_ledPrevPos"]!;
    gl.enableVertexAttribArray(aPrev);
    gl.vertexAttribPointer(aPrev, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(aPrev, 1);

    const aColor = prog.attribs["a_ledColor"]!;
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(aColor, 1);

    const aBright = prog.attribs["a_brightness"]!;
    gl.enableVertexAttribArray(aBright);
    gl.vertexAttribPointer(aBright, 1, gl.FLOAT, false, stride, 28);
    gl.vertexAttribDivisor(aBright, 1);

    const aGlow = prog.attribs["a_glowRadius"]!;
    gl.enableVertexAttribArray(aGlow);
    gl.vertexAttribPointer(aGlow, 1, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(aGlow, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // ── Instance buffer fill ──────────────────────────────────────────────

  private fillInstanceBuffer(
    payload: LedPassPayload,
    canvasW: number,
    canvasH: number,
    dt: number,
  ): number {
    const glowRadius = DEFAULT_GLOW_FACTOR * Math.min(canvasW, canvasH);
    const seenKeys = new Set<string>();
    let ledIdx = 0;

    for (const tip of payload.tips) {
      // The sprite shader wants a 0..1 multiplier, and the flux budget is that
      // multiplier times the reference flux. Recovering it is exact; dividing
      // the budget by LED count is the photometry this executor does not do yet.
      const propBrightness = tip.propFlux / PROP_REFERENCE_FLUX;

      for (let segIdx = 0; segIdx < tip.segments.length; segIdx++) {
        if (ledIdx >= MAX_LEDS) break;

        const seg = tip.segments[segIdx]!;
        const key = `${tip.tipId}:${segIdx}`;
        seenKeys.add(key);

        const px = (seg.position[0] + 1.0) * 0.5 * canvasW;
        const py = (1.0 - seg.position[1]) * 0.5 * canvasH;

        let prevX = px;
        let prevY = py;
        if (tip.motionStreak && dt > 0) {
          const prev = this.prevPositions.get(key);
          if (prev) {
            const dx = px - prev.x;
            const dy = py - prev.y;
            if (dx * dx + dy * dy <= MAX_STREAK_DISTANCE_SQ) {
              prevX = prev.x;
              prevY = prev.y;
            }
          }
        }

        const stored = this.prevPositions.get(key);
        if (stored) { stored.x = px; stored.y = py; }
        else this.prevPositions.set(key, { x: px, y: py });

        const offset = ledIdx * INSTANCE_STRIDE_FLOATS;
        this.instanceData[offset + 0] = px;
        this.instanceData[offset + 1] = py;
        this.instanceData[offset + 2] = prevX;
        this.instanceData[offset + 3] = prevY;
        this.instanceData[offset + 4] = seg.color[0];
        this.instanceData[offset + 5] = seg.color[1];
        this.instanceData[offset + 6] = seg.color[2];
        this.instanceData[offset + 7] = seg.brightness * propBrightness;
        this.instanceData[offset + 8] = glowRadius;

        ledIdx++;
      }
    }

    for (const key of this.prevPositions.keys()) {
      if (!seenKeys.has(key)) this.prevPositions.delete(key);
    }

    return ledIdx;
  }

  // ── Sprite pass ───────────────────────────────────────────────────────

  private renderSprites(ledCount: number, w: number, h: number): void {
    const gl = this.gl;
    const spriteFBO = this.fbos.getOrAllocateSized("led-sprite", w, h, "rgba16f");

    gl.bindFramebuffer(gl.FRAMEBUFFER, spriteFBO.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    const prog = this.shaders.get("led-sprite");
    gl.useProgram(prog.program);
    gl.uniform2f(prog.uniforms["u_resolution"]!, w, h);
    gl.uniform2f(prog.uniforms["u_viewboxSize"]!, w, h);

    gl.bindVertexArray(this.spriteVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ledCount);
    gl.bindVertexArray(null);
  }

  // ── Trail accumulation ────────────────────────────────────────────────

  private trailAccumulate(fadeRate: number, w: number, h: number): void {
    const gl = this.gl;
    const trail = this.fbos.getOrAllocatePair("led-trail", "rgba16f");
    const spriteFBO = this.fbos.getOrAllocateSized("led-sprite", w, h, "rgba16f");

    gl.disable(gl.BLEND);
    const prog = this.shaders.get("led-trail-accumulate");
    gl.useProgram(prog.program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, trail.write.framebuffer);
    gl.viewport(0, 0, trail.write.width, trail.write.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, spriteFBO.texture);
    gl.uniform1i(prog.uniforms["u_currentFrame"]!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, trail.read.texture);
    gl.uniform1i(prog.uniforms["u_previousTrail"]!, 1);

    gl.uniform1f(prog.uniforms["u_fadeRate"]!, fadeRate);

    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    trail.swap();
  }

  // ── Bloom pass ────────────────────────────────────────────────────────

  private bloomPass(canvasW: number, canvasH: number, glare: number): void {
    const gl = this.gl;
    const trail = this.fbos.getOrAllocatePair("led-trail", "rgba16f");

    const mips: FBO[] = [];
    const sizes: [number, number][] = [];
    let w = canvasW;
    let h = canvasH;
    for (let i = 0; i < BLOOM_MIP_COUNT; i++) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      mips.push(this.fbos.getOrAllocateSized(`led-bloom-${i}`, w, h, "rgba16f"));
      sizes.push([w, h]);
    }
    if (mips.length === 0) return;

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVAO);

    const downProg = this.shaders.get("bloom-downsample");
    gl.useProgram(downProg.program);

    let srcTex = trail.read.texture;
    let srcW = canvasW;
    let srcH = canvasH;

    for (let i = 0; i < mips.length; i++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(downProg.uniforms["u_source"]!, 0);
      gl.uniform2f(downProg.uniforms["u_texelSize"]!, 1.0 / srcW, 1.0 / srcH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mips[i]!.framebuffer);
      gl.viewport(0, 0, sizes[i]![0], sizes[i]![1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      srcTex = mips[i]!.texture;
      srcW = sizes[i]![0];
      srcH = sizes[i]![1];
    }

    // mix(upper, tent(lower), glare) at every level, so the composite falloff is
    // the geometric progression the glare weight names. Accumulating additively
    // weights every mip alike, which flattens the kernel into a formless blob.
    gl.enable(gl.BLEND);
    gl.blendColor(0, 0, 0, glare);
    gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    const upProg = this.shaders.get("bloom-upsample");
    gl.useProgram(upProg.program);
    gl.uniform1f(upProg.uniforms["u_bloomRadius"]!, 1.0);

    for (let i = mips.length - 1; i > 0; i--) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mips[i]!.texture);
      gl.uniform1i(upProg.uniforms["u_source"]!, 0);
      gl.uniform2f(upProg.uniforms["u_texelSize"]!, 1.0 / sizes[i]![0], 1.0 / sizes[i]![1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mips[i - 1]!.framebuffer);
      gl.viewport(0, 0, sizes[i - 1]![0], sizes[i - 1]![1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // ── Display composite ─────────────────────────────────────────────────

  private displayComposite(bloomIntensity: number, canvasW: number, canvasH: number): void {
    const gl = this.gl;
    const trail = this.fbos.getOrAllocatePair("led-trail", "rgba16f");

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,
    );

    const prog = this.shaders.get("led-display");
    gl.useProgram(prog.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trail.read.texture);
    gl.uniform1i(prog.uniforms["u_ledTrail"]!, 0);

    const bloomMip0 = this.fbos.getOrAllocateSized(
      "led-bloom-0",
      Math.max(1, Math.floor(canvasW / 2)),
      Math.max(1, Math.floor(canvasH / 2)),
      "rgba16f",
    );
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomMip0.texture);
    gl.uniform1i(prog.uniforms["u_bloom"]!, 1);

    gl.uniform1f(prog.uniforms["u_bloomIntensity"]!, bloomIntensity);

    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Per-frame trail multiplier for the shutter, as `exp(-dt/tau)`. The shutter
   * is a property of the frame, not of a tip, so a mixed set of props can no
   * longer average its own persistence away.
   *
   * Camera mode falls back to the eye time constant: a box shutter holds every
   * contribution at full weight until it leaves the exposure, which a decaying
   * `max()` accumulation cannot represent at any rate. TODO(led-camera-shutter):
   * this pass needs the normalized additive accumulation below before the
   * staggered pair the 2D renderer ships (`advanceBoxShutter`) can be ported —
   * `max()` has no sum to divide by an age.
   *
   * The accumulation itself is `max(current, trail * fadeRate)`, not a
   * normalized sum, so trail length still trades against brightness here. That
   * is the rest of the photometric rewrite this executor owes.
   */
  private computeFadeRate(shutter: LedShutter, dt: number): number {
    const tau =
      shutter.mode === "camera"
        ? EYE_TIME_CONSTANT_S
        : Math.max(shutter.timeConstantSeconds, 1e-6);
    return Math.exp(-Math.max(dt, 0) / tau);
  }
}
