/**
 * FireFrameCache - Record & Playback for Looping Fire Sequences
 *
 * During the first loop of a fire-enabled sequence, the full Navier-Stokes
 * simulation runs normally. This cache captures the display shader output
 * at simulation resolution (128-256px) into a bounded ring of RGBA16F textures.
 *
 * Once one complete loop is recorded, subsequent loops blit from cache:
 * 1 draw call per frame instead of ~30 simulation passes.
 *
 * Cache invalidation: changing fuel source, intensity, transform, or quality
 * invalidates the cache and triggers a fresh recording on the next loop.
 */

import { VERTEX_SHADER } from "./fluid-shader-sources";

export const DEFAULT_FIRE_FRAME_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;
const HDR_BYTES_PER_PIXEL = 8;

/** Number of HDR frames that fit after reserving one frame for the recording
 * target. Returning zero makes the renderer stay live instead of allocating a
 * cache that cannot hold even one reusable frame. */
export function computeFireFrameCacheCapacity(width: number, height: number, budgetBytes = DEFAULT_FIRE_FRAME_CACHE_BUDGET_BYTES): number {
  const bytesPerFrame = Math.max(0, Math.floor(width)) * Math.max(0, Math.floor(height)) * HDR_BYTES_PER_PIXEL;
  if (bytesPerFrame <= 0 || budgetBytes <= bytesPerFrame) return 0;
  return Math.max(0, Math.floor(budgetBytes / bytesPerFrame) - 1);
}

export function hasReachedFireFrameCacheCapacity(frameIndex: number, capacity: number): boolean {
  return capacity <= 0 || frameIndex >= capacity;
}

/** A cache may only become warm at a known loop boundary. In particular, the
 * last recorded sample is not itself a loop duration: at 60fps it normally
 * precedes the boundary by one frame. */
export function canPromoteFireFrameRecording(
  frameTimes: readonly number[],
  loopDuration: number | undefined
): boolean {
  const firstFrameTime = frameTimes[0];
  const lastFrameTime = frameTimes.at(-1);
  const boundaryWindow =
    loopDuration === undefined ? 0 : Math.min(0.5, loopDuration * 0.1);
  return (
    firstFrameTime !== undefined &&
    Number.isFinite(firstFrameTime) &&
    lastFrameTime !== undefined &&
    Number.isFinite(lastFrameTime) &&
    loopDuration !== undefined &&
    Number.isFinite(loopDuration) &&
    firstFrameTime <= boundaryWindow &&
    lastFrameTime >= loopDuration - boundaryWindow &&
    loopDuration > lastFrameTime &&
    frameTimes.every((time, index) => index === 0 || time > frameTimes[index - 1]!)
  );
}

// Blit shader: draw a cached texture to the screen

const BLIT_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_frame;

void main() {
  fragColor = texture(u_frame, v_uv);
}
`;

type CacheState = "idle" | "recording" | "warm" | "bypassed";

interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

export class FireFrameCache {
  private gl: WebGL2RenderingContext;
  private state: CacheState = "idle";

  // Cache textures (RGBA8, one per frame) - pre-allocated in batches
  private frames: WebGLTexture[] = [];
  /** Relative sequence phases for each cached frame */
  private frameTimes: number[] = [];
  /** Total loop phase span from recording */
  private loopDuration: number = 0;
  private frameIndex = 0;
  private totalFrames = 0;

  // Pre-allocated texture pool to avoid per-frame GPU resource creation
  private texturePool: WebGLTexture[] = [];
  private texturePoolSize = 0;
  private maxFrames = 0;
  private static readonly TEXTURE_BATCH_SIZE = 120;

  // Recording FBO: display shader renders here during recording
  private recordingFBO: WebGLFramebuffer | null = null;
  private recordingTexture: WebGLTexture | null = null;
  private cacheWidth = 0;
  private cacheHeight = 0;

  // Persistent copy FBO reused every frame during recording (avoids create/delete per frame)
  private copyFBO: WebGLFramebuffer | null = null;

  // Blit program for playback
  private blitProgram: ShaderProgram | null = null;

  // Config hash for invalidation
  private configHash = "";

  // Display dimensions for viewport during blit
  private displayWidth = 0;
  private displayHeight = 0;

  constructor(
    gl: WebGL2RenderingContext,
    private readonly budgetBytes = DEFAULT_FIRE_FRAME_CACHE_BUDGET_BYTES
  ) {
    this.gl = gl;
    this.blitProgram = this.compileBlitProgram();
  }

  /**
   * Start recording frames for a new loop.
   * @param width - Cache texture width (typically simulation resolution)
   * @param height - Cache texture height
   * @param displayWidth - Actual canvas width (for blit viewport)
   * @param displayHeight - Actual canvas height (for blit viewport)
   * @param configHash - Hash of fire config for invalidation
   */
  startRecording(width: number, height: number, displayWidth: number, displayHeight: number, configHash: string): boolean {
    // Clean up any previous recording
    this.releaseFrames();

    this.cacheWidth = width;
    this.cacheHeight = height;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.configHash = configHash;
    this.frameIndex = 0;
    this.totalFrames = 0;
    this.maxFrames = computeFireFrameCacheCapacity(width, height, this.budgetBytes);
    if (this.maxFrames === 0) {
      this.state = "bypassed";
      return false;
    }
    this.state = "recording";

    // Create the recording FBO at cache resolution
    this.createRecordingFBO();

    // Pre-allocate texture pool and persistent copy FBO to avoid per-frame GPU resource creation
    this.ensureTexturePool(Math.min(FireFrameCache.TEXTURE_BATCH_SIZE, this.maxFrames));
    this.ensureCopyFBO();
    return true;
  }

  /**
   * Whether the cache has a complete loop recorded and ready for playback.
   */
  isWarm(): boolean {
    return this.state === "warm";
  }

  /**
   * Whether the cache is currently recording frames.
   */
  isRecording(): boolean {
    return this.state === "recording";
  }

  /** The loop exceeded the memory budget and should keep simulating live until
   * a visual input changes and invalidates the cache. */
  isBypassed(): boolean {
    return this.state === "bypassed";
  }

  getDiagnostics(): {
    state: CacheState;
    totalFrames: number;
    maxFrames: number;
    allocatedBytes: number;
    budgetBytes: number;
  } {
    return {
      state: this.state,
      totalFrames: this.totalFrames,
      maxFrames: this.maxFrames,
      allocatedBytes: (this.texturePoolSize + (this.recordingTexture ? 1 : 0)) * this.cacheWidth * this.cacheHeight * HDR_BYTES_PER_PIXEL,
      budgetBytes: this.budgetBytes,
    };
  }

  /**
   * Get the FBO to render the display pass into during recording.
   * The display pass should bind this FBO instead of the default framebuffer.
   */
  getRecordingFBO(): WebGLFramebuffer | null {
    return this.recordingFBO;
  }

  /** Cache resolution width (for viewport during recording) */
  getCacheWidth(): number {
    return this.cacheWidth;
  }

  /** Cache resolution height */
  getCacheHeight(): number {
    return this.cacheHeight;
  }

  getRecordingTexture(): WebGLTexture | null {
    return this.recordingTexture;
  }

  /**
   * Called after the display pass renders to the recording FBO.
   * Copies the recording FBO content into a reusable HDR cache texture.
   */
  commitFrame(relativeTime: number): boolean {
    if (this.state !== "recording") return false;
    const gl = this.gl;

    // Cache lookup is binary-search based, so a seek or reverse sample cannot
    // be allowed to corrupt the phase ordering of an in-progress recording.
    const previousTime = this.frameTimes.at(-1);
    if (
      !Number.isFinite(relativeTime) ||
      (previousTime !== undefined && relativeTime <= previousTime)
    ) {
      this.invalidate();
      return false;
    }

    if (hasReachedFireFrameCacheCapacity(this.frameIndex, this.maxFrames)) {
      this.bypassCurrentRecording();
      return false;
    }

    // Grow texture pool if needed (amortized O(1) - only allocates every BATCH_SIZE frames)
    if (this.frameIndex >= this.texturePoolSize) {
      this.ensureTexturePool(Math.min(this.texturePoolSize + FireFrameCache.TEXTURE_BATCH_SIZE, this.maxFrames));
    }

    // Grab pre-allocated texture from pool (zero GPU allocation this frame)
    const cacheTex = this.texturePool[this.frameIndex]!;

    // Blit recording FBO → cache texture using persistent copy FBO
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.recordingFBO);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.copyFBO);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cacheTex, 0);
    gl.blitFramebuffer(0, 0, this.cacheWidth, this.cacheHeight, 0, 0, this.cacheWidth, this.cacheHeight, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    this.frames.push(cacheTex);
    this.frameTimes.push(relativeTime);
    this.frameIndex++;
    this.totalFrames = this.frameIndex;

    return true;
  }

  /**
   * Called when the animation loop detects a sequence restart.
   * Finishes recording and switches to warm (playback) mode.
   */
  onLoopDetected(loopDuration?: number): void {
    if (this.state === "recording") {
      if (!canPromoteFireFrameRecording(this.frameTimes, loopDuration)) {
        // An interrupted or partial pass has no phase-safe playback mapping.
        // Drop it rather than replaying fire from an arbitrary point in the loop.
        this.invalidate();
        return;
      }
      this.loopDuration = loopDuration!;
      this.state = "warm";
      this.frameIndex = 0;
      // Destroy recording resources - no longer needed during playback
      this.destroyRecordingFBO();
      this.destroyCopyFBO();
      // Trim excess pool textures beyond what was actually recorded
      this.trimTexturePool(this.totalFrames);
    } else if (this.state === "warm") {
      // Reset playback to start of cached loop
      this.frameIndex = 0;
    }
  }

  /**
   * Blit the cached frame nearest to the given relative time.
   * Uses binary search for O(log N) lookup.
   * @param relativeTime - Sequence phase. Wraps via modulo.
   * @returns true if a frame was blitted
   */
  blitCachedFrame(relativeTime?: number): boolean {
    const texture = this.getCachedFrameTexture(relativeTime);
    if (!texture) return false;
    this.blitTextureToScreen(texture);
    return true;
  }

  /** Retrieve the timestamp-matched HDR frame without presenting it. The fire
   * renderer uses this to run cached and live frames through the same bloom and
   * tone-mapping pipeline. */
  getCachedFrameTexture(relativeTime?: number): WebGLTexture | null {
    if (this.state !== "warm" || this.totalFrames === 0) return null;

    let idx: number;

    if (relativeTime !== undefined && this.loopDuration > 0) {
      // Timestamp-based lookup: find nearest frame
      const t = relativeTime % this.loopDuration;
      idx = this.findNearestFrame(t);
    } else {
      // Legacy fallback: sequential frame counter
      idx = this.frameIndex % this.totalFrames;
      this.frameIndex++;
    }

    return this.frames[idx] ?? null;
  }

  /**
   * Binary search for the cached frame nearest to the target time.
   */
  private findNearestFrame(targetTime: number): number {
    const times = this.frameTimes;
    const n = times.length;
    if (n <= 1) return 0;

    let lo = 0;
    let hi = n - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! < targetTime) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo is the first frame >= targetTime. Check if lo-1 is closer.
    if (lo > 0) {
      const diffLo = times[lo]! - targetTime;
      const diffPrev = targetTime - times[lo - 1]!;
      if (diffPrev <= diffLo) return lo - 1;
    }
    return lo;
  }

  /**
   * Check if the fire config has changed. If so, invalidate the cache.
   * @returns true if cache was invalidated
   */
  checkConfigHash(newHash: string): boolean {
    if (newHash !== this.configHash) {
      this.invalidate();
      return true;
    }
    return false;
  }

  /**
   * Invalidate the cache, forcing a fresh recording on the next loop.
   */
  invalidate(): void {
    this.releaseFrames();
    this.destroyRecordingFBO();
    this.destroyCopyFBO();
    this.releaseTexturePool();
    this.state = "idle";
    this.frameIndex = 0;
    this.totalFrames = 0;
    this.maxFrames = 0;
    this.configHash = "";
    this.loopDuration = 0;
  }

  /**
   * Clean up all GL resources.
   */
  dispose(): void {
    this.releaseFrames();
    this.destroyRecordingFBO();
    this.destroyCopyFBO();
    this.releaseTexturePool();
    if (this.blitProgram) {
      this.gl.deleteProgram(this.blitProgram.program);
      this.blitProgram = null;
    }
    this.state = "idle";
  }

  // Internal

  blitTextureToScreen(texture: WebGLTexture): void {
    const gl = this.gl;
    if (!this.blitProgram) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.displayWidth, this.displayHeight);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.blitProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.blitProgram.uniforms.get("u_frame")!, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private createRecordingFBO(): void {
    const gl = this.gl;

    this.recordingTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.recordingTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.cacheWidth, this.cacheHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    this.recordingFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.recordingFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.recordingTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private destroyRecordingFBO(): void {
    const gl = this.gl;
    if (this.recordingFBO) {
      gl.deleteFramebuffer(this.recordingFBO);
      this.recordingFBO = null;
    }
    if (this.recordingTexture) {
      gl.deleteTexture(this.recordingTexture);
      this.recordingTexture = null;
    }
  }

  private releaseFrames(): void {
    // Frames reference textures from the pool - don't delete them here.
    // The pool owns their lifecycle. Just clear the reference array.
    this.frames.length = 0;
    this.frameTimes.length = 0;
  }

  private bypassCurrentRecording(): void {
    this.releaseFrames();
    this.destroyRecordingFBO();
    this.destroyCopyFBO();
    this.releaseTexturePool();
    this.state = "bypassed";
    this.frameIndex = 0;
    this.totalFrames = 0;
    this.loopDuration = 0;
  }

  /**
   * Pre-allocate textures up to the target size. Only allocates the delta.
   * Called once at recording start and again if recording exceeds initial estimate.
   */
  private ensureTexturePool(targetSize: number): void {
    const gl = this.gl;
    for (let i = this.texturePoolSize; i < targetSize; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.cacheWidth, this.cacheHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);
      this.texturePool.push(tex);
    }
    this.texturePoolSize = targetSize;
  }

  /** Delete unused pool textures beyond the recorded frame count */
  private trimTexturePool(keepCount: number): void {
    const gl = this.gl;
    for (let i = keepCount; i < this.texturePoolSize; i++) {
      gl.deleteTexture(this.texturePool[i]!);
    }
    this.texturePool.length = keepCount;
    this.texturePoolSize = keepCount;
  }

  /** Release all pool textures (GPU memory cleanup) */
  private releaseTexturePool(): void {
    const gl = this.gl;
    for (const tex of this.texturePool) {
      gl.deleteTexture(tex);
    }
    this.texturePool.length = 0;
    this.texturePoolSize = 0;
  }

  /** Create the persistent copy FBO reused during recording */
  private ensureCopyFBO(): void {
    if (this.copyFBO) return;
    this.copyFBO = this.gl.createFramebuffer();
  }

  /** Destroy the persistent copy FBO */
  private destroyCopyFBO(): void {
    if (this.copyFBO) {
      this.gl.deleteFramebuffer(this.copyFBO);
      this.copyFBO = null;
    }
  }

  private compileBlitProgram(): ShaderProgram | null {
    const gl = this.gl;

    const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, BLIT_FRAG);
    if (!vertShader || !fragShader) return null;

    const program = gl.createProgram()!;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Fire blit shader link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      return null;
    }

    gl.detachShader(program, vertShader);
    gl.detachShader(program, fragShader);
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    const uniforms = new Map<string, WebGLUniformLocation>();
    const loc = gl.getUniformLocation(program, "u_frame");
    if (loc) uniforms.set("u_frame", loc);

    return { program, uniforms };
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const typeName = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
      console.error(`Fire blit ${typeName} shader error:`, gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}
