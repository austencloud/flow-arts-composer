/**
 * WebGLFireRenderer - Navier-Stokes Fluid Fire Simulation
 *
 * Creates a transparent WebGL2 canvas overlaid on the Canvas2D animation canvas.
 * Runs a multi-pass fluid simulation with combustion, buoyancy, and blackbody
 * rendering to produce physically-based fire at prop tip positions.
 *
 * Architecture per frame (~30 draw calls):
 *   1. Splat fuel + velocity at each tip position
 *   2. Advect velocity through itself
 *   3. Compute curl → apply vorticity confinement
 *   4. Apply buoyancy (temperature → upward force)
 *   5. Combustion: fuel burns → heat, fuel decays, cooling
 *   6. Compute divergence → Jacobi pressure solve (30 iterations)
 *   7. Gradient subtraction → divergence-free velocity
 *   8. Advect temperature + fuel through velocity field
 *   9. Display render: temperature → blackbody color
 *
 * References:
 *   - GPU Gems Ch. 38 (Harris, 2004)
 *   - andrewkchan.dev/posts/fire.html
 *   - Pavel Dobryakov's WebGL-Fluid-Simulation
 *
 * The render-graph WebGPU executor remains an experimental port. This renderer
 * stays the production owner until that path reaches visual and timing parity.
 */

import { FireFrameCache } from "./fire-frame-cache";
import {
  decayResidualHeat,
  FIRE_RESIDUAL_PEAK_HEAT,
} from "./fire-emitter-fade";
import type {
  FireFrameInput,
  FireOverlayConfig,
  FirePhysicsParams,
  FireRenderingProfile,
  PropTipData,
} from "../../domain/types/fire-types";
import { DEFAULT_PHYSICS } from "../../domain/types/fire-types";
import {
  VERTEX_SHADER,
  SPLAT_BATCH_FRAG,
  ADVECTION_FRAG,
  MACCORMACK_CORRECTION_FRAG,
  CURL_FRAG,
  VORTICITY_FRAG,
  BUOYANCY_FRAG,
  COMBUSTION_FRAG,
  FUEL_CONSUMPTION_FRAG,
  DIVERGENCE_FRAG,
  JACOBI_FRAG,
  GRADIENT_SUBTRACT_FRAG,
  CLEAR_FRAG,
  DISPLAY_FRAG,
  PROP_VISIBILITY_MATTE_FRAG,
  BLOOM_COMPOSITE_FRAG,
  CURL_NOISE_FRAG,
} from "./fluid-shader-sources";
import {
  BLOOM_DOWNSAMPLE_FRAG,
  BLOOM_UPSAMPLE_FRAG,
} from "../led/led-shader-sources";
import { BASE_COLOR_CURVE } from "../../domain/types/fire-types";
import {
  WebGLFluidSolver2D,
  type FluidAttachment,
  type FluidField,
  type FluidProgram,
  type FluidPrograms,
} from "../fluid/web-gl-fluid-solver-2d";
import {
  computeFireTipPresentation,
  type FireTipPresentation,
} from "./fire-tip-presentation";

const MAX_DPR = 2;
const _DEFAULT_JACOBI_ITERATIONS = 12;
const REFERENCE_STEP_SECONDS = 1 / 60;

interface FireSplatSample {
  x: number;
  y: number;
  radius: number;
  fuel: number;
  temperature: number;
  reactionReset: number;
  velocityX: number;
  velocityY: number;
  colorR: number;
  colorG: number;
  colorB: number;
}

export function computeFireStepDissipation(
  baseDissipation: number,
  dt: number
): number {
  const safeBase = Math.min(1, Math.max(0, baseDissipation));
  return Math.pow(safeBase, Math.max(0, dt) / REFERENCE_STEP_SECONDS);
}

export function computeFireEmissionMultiplier(brightness = 0.5): number {
  return 0.35 + Math.min(1, Math.max(0, brightness)) * 1.3;
}

export function computeFireTemperatureDissipation(
  baseDissipation: number,
  renderingProfile: FireOverlayConfig["renderingProfile"]
): number {
  return renderingProfile === "legacy"
    ? baseDissipation
    : Math.max(baseDissipation, 0.972);
}

export function computeFireCoolingRate(
  baseCoolingRate: number,
  useReaction: boolean
): number {
  return baseCoolingRate * (useReaction ? 0.4 : 1);
}

export function shouldUseMacCormackScalars(
  renderingProfile: FireOverlayConfig["renderingProfile"],
  instanceCount: number
): boolean {
  return renderingProfile !== "legacy" && instanceCount <= 4;
}

export function computeFireVisualCacheKey(
  config: FireOverlayConfig,
  input: Pick<
    FireFrameInput,
    "playbackSpeed" | "sequenceContentHash" | "propColors"
  >
): string {
  return JSON.stringify({
    rendererRevision: 7,
    fuelSourceId: config.fuelSourceId ?? "default",
    intensity: config.intensity,
    brightness: config.brightness ?? 0.5,
    flameHeight: config.flameHeight,
    quality: config.quality,
    colorBlend: config.colorBlend ?? 0,
    turbulence: config.turbulence ?? 0.5,
    bloomStrength: config.bloomStrength ?? 0.08,
    velocityReactive: config.velocityReactive,
    jacobiIterations: config.jacobiIterations ?? null,
    renderingProfile: config.renderingProfile ?? "cinematic",
    physicsPreset: config.physicsPreset ?? null,
    colorCurve: config.colorCurve ?? null,
    propColors: input.propColors ?? null,
    playbackSpeed: input.playbackSpeed ?? 1,
    sequenceContentHash: input.sequenceContentHash ?? "",
  });
}

// Active instance tracking for adaptive quality

/** Number of currently active fire renderer instances across all animation engines */
let activeFireInstanceCount = 0;

/** Read the current active instance count (used by compose module for quality decisions) */
export function getActiveFireInstanceCount(): number {
  return activeFireInstanceCount;
}

/** Pure: clamp the provided sim dt (seconds) the way the fire sim needs.
 *  Max 0.066s (30fps floor), 0.2x under reduced motion, floor 0.016s. */
export function computeFireStepDt(dt: number, reducedMotion: boolean): number {
  let d = Math.min(dt, 0.066);
  if (reducedMotion) d *= 0.2;
  if (d <= 0) d = 0.016;
  return d;
}

/**
 * Compute optimal Jacobi iterations based on how many fire renderers
 * are running simultaneously. Fire doesn't need precise pressure solving -
 * visual plausibility is all that matters.
 */
export function computeAdaptiveJacobiIterations(instanceCount: number): number {
  if (instanceCount <= 1) return 12;
  if (instanceCount <= 4) return 8;
  return 6;
}

/** Maps quality level to simulation grid resolution */
function qualityToResolution(quality: number): number {
  if (quality <= 1) return 64;
  if (quality <= 2) return 128;
  if (quality === 3) return 192;
  return 256;
}

const MAX_PRESENTATION_DIMENSION = 1024;
const MIN_PRESENTATION_DIMENSION = 64;
const PRESENTATION_DIMENSION_STEP = 64;

/**
 * Keep the fluid solve independent from the image shown on screen. The scalar
 * fields can stay compact while the display shader reconstructs their soft
 * edges into a larger HDR target before bloom and tone mapping. Bucketing the
 * target avoids reallocating several half-float textures for every tiny layout
 * change while a drawer or split pane is moving.
 */
export function computeFirePresentationResolution(
  displayWidth: number,
  displayHeight: number,
  simulationResolution = 256,
  renderingProfile: FireRenderingProfile = "cinematic"
): [number, number] {
  if (renderingProfile === "legacy") {
    const legacyResolution = Math.max(1, Math.round(simulationResolution));
    return [legacyResolution, legacyResolution];
  }

  const safeWidth = Math.max(1, Math.round(displayWidth));
  const safeHeight = Math.max(1, Math.round(displayHeight));
  const adaptiveMaximum = Math.min(
    MAX_PRESENTATION_DIMENSION,
    Math.max(512, simulationResolution * 4)
  );
  const scale = Math.min(1, adaptiveMaximum / Math.max(safeWidth, safeHeight));
  const align = (value: number) =>
    Math.min(
      adaptiveMaximum,
      Math.max(
        MIN_PRESENTATION_DIMENSION,
        Math.ceil((value * scale) / PRESENTATION_DIMENSION_STEP) *
          PRESENTATION_DIMENSION_STEP
      )
    );

  return [align(safeWidth), align(safeHeight)];
}

// Framebuffer pair for ping-pong rendering

type DoubleFBO = FluidField;
type FBOAttachment = FluidAttachment;

// Shader program with cached uniform locations

type ShaderProgram = FluidProgram;

/**
 * A program whose compile + link has been dispatched but not yet finalized.
 * Under KHR_parallel_shader_compile the driver compiles on its own threads; we
 * hold these until COMPLETION_STATUS_KHR reports done, then resolve uniforms and
 * assign the field — never touching LINK_STATUS/getUniformLocation early (those
 * force the GPU-CPU sync stall this whole dance exists to avoid).
 */
interface PendingProgram {
  program: WebGLProgram;
  fragShader: WebGLShader;
  uniformNames: string[];
  assign: (sp: ShaderProgram) => void;
}

export class WebGLFireRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private initialized = false;

  // Simulation grid resolution (independent of display resolution)
  private simWidth = 256;
  private simHeight = 256;

  // Display dimensions
  private dpr = 1;
  private presentationWidth = 1;
  private presentationHeight = 1;
  private presentationProfile: FireRenderingProfile = "cinematic";

  // Shader programs
  private splatBatchProgram: ShaderProgram | null = null;
  private advectionProgram: ShaderProgram | null = null;
  private macCormackCorrectionProgram: ShaderProgram | null = null;
  private curlProgram: ShaderProgram | null = null;
  private vorticityProgram: ShaderProgram | null = null;
  private buoyancyProgram: ShaderProgram | null = null;
  private curlNoiseProgram: ShaderProgram | null = null;
  private combustionProgram: ShaderProgram | null = null;
  private fuelConsumptionProgram: ShaderProgram | null = null;
  private divergenceProgram: ShaderProgram | null = null;
  private jacobiProgram: ShaderProgram | null = null;
  private gradientSubtractProgram: ShaderProgram | null = null;
  private clearProgram: ShaderProgram | null = null;
  private displayProgram: ShaderProgram | null = null;
  private propVisibilityMatteProgram: ShaderProgram | null = null;
  private bloomDownsampleProgram: ShaderProgram | null = null;
  private bloomUpsampleProgram: ShaderProgram | null = null;
  private bloomCompositeProgram: ShaderProgram | null = null;

  // Async shader compilation (KHR_parallel_shader_compile). Compiling fire's
  // ~15 fluid-sim programs synchronously froze the page for ~1s on the click
  // that enabled the effect (Windows/ANGLE). Instead we dispatch all compiles,
  // then poll the non-blocking COMPLETION_STATUS_KHR in renderFire and only
  // resolve uniforms once the driver is done — the props never stop animating.
  private parallelCompileExt: { COMPLETION_STATUS_KHR: number } | null = null;
  private pendingPrograms: PendingProgram[] = [];
  private pendingVertexShader: WebGLShader | null = null;
  private shadersReady = false;
  private shaderCompileFailed = false;

  // Double-buffered simulation fields
  private velocity: DoubleFBO | null = null;
  private pressure: DoubleFBO | null = null;
  private temperature: DoubleFBO | null = null;
  private fuel: DoubleFBO | null = null;
  private colorField: DoubleFBO | null = null;
  private fluidSolver: WebGLFluidSolver2D | null = null;

  // Soot density field (combustion byproduct, rendered as dark smoke)

  // Single-buffered fields (no ping-pong needed)
  private divergenceFBO: FBOAttachment | null = null;
  private curlFBO: FBOAttachment | null = null;

  // Bloom pipeline FBOs
  private displayFBO: FBOAttachment | null = null;
  private propVisibilityMatteFBO: FBOAttachment | null = null;
  private bloomMips: FBOAttachment[] = [];
  private bloomMipSizes: [number, number][] = [];
  private propVisibilityMatteActive = false;
  private readonly propVisibilityTextures = new Map<
    TexImageSource,
    WebGLTexture
  >();

  // Timing
  private lastRenderTime = -1;
  private reducedMotion = false;
  // Wall-clock timestamp of the previous sim step, used only as the fallback dt
  // source when the caller does not supply an explicit input.dt (live path).
  private lastTime = 0;

  // Turbulence clock for idle-fire flickering (cheap deterministic noise)
  private turbulenceClock = 0;

  // Per-frame tip data shared by the fire display and prop-aware composite.
  private displayTipUVs: Float32Array = new Float32Array(32); // 16 tips * 2 (x,y)
  private displayTipFlameScales: Float32Array = new Float32Array(16);
  private displayTipColors: Float32Array = new Float32Array(48); // 16 tips * 3 (r,g,b)
  // direction.xy, stretch, breakup. This replaces the old unused speed uniform,
  // so Natural Fire gains motion shaping without another per-tip GL call.
  private displayTipShapes: Float32Array = new Float32Array(64);
  private readonly tipPresentation: FireTipPresentation = {
    directionX: 0,
    directionY: 1,
    stretch: 1,
    breakup: 0,
  };
  private displayTipCount = 0;
  private displayCanvasWidth = 1;
  private displayCanvasHeight = 1;

  // Reused uniform payloads for swept-tip splat batching.
  // Pre-cached uniform locations for tip arrays (avoids getUniformLocation per frame)
  // On Windows/ANGLE, each getUniformLocation call triggers a GPU-CPU sync stall.
  // With 4 tips × 4 uniforms = 16 calls per frame, this was costing 1.6-8ms of pure stall.
  private tipPositionLocs: (WebGLUniformLocation | null)[] = [];
  private tipShapeLocs: (WebGLUniformLocation | null)[] = [];
  private tipFlameScaleLocs: (WebGLUniformLocation | null)[] = [];
  private tipColorLocs: (WebGLUniformLocation | null)[] = [];

  // Mutable physics parameters - set via config.physicsPreset or defaults
  private physics: FirePhysicsParams = { ...DEFAULT_PHYSICS };
  private readonly AMBIENT_TEMP = 0.0;
  private readonly BURN_TEMP = 0.1;

  // Frame cache for loop replay (Tier 3 optimization)
  private frameCache: FireFrameCache | null = null;
  private lastConfigHash = "";

  /** Estimated heat still in the field once the emitters stop. Drives the
   *  natural fade after a fire-capable prop is swapped for hands; see
   *  fire-emitter-fade.ts for what the number means. */
  private residualHeat = 0;

  initialize(container: HTMLElement, width: number, height: number): boolean {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    // Fire's material default is an enveloping front layer. The effect layer
    // controller can still move this canvas behind the prop on explicit user
    // request once the renderer is registered.
    this.canvas.style.zIndex = "4";
    this.canvas.style.background = "transparent";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.dataset.overlayType = "emissive";

    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);

    container.appendChild(this.canvas);

    return this.initGLContext(width, height, true);
  }

  initializeHeadless(width: number, height: number): boolean {
    this.canvas = new OffscreenCanvas(
      width,
      height
    ) as unknown as HTMLCanvasElement;
    this.dpr = 1;
    return this.initGLContext(width, height, false);
  }

  private initGLContext(
    width: number,
    height: number,
    isDom: boolean
  ): boolean {
    this.gl = this.canvas!.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;

    if (!this.gl) {
      console.warn("WebGL2 not available for fire overlay");
      this.cleanup();
      return false;
    }

    const gl = this.gl;

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) {
      console.warn(
        "EXT_color_buffer_float not available - fire simulation requires float FBOs"
      );
      this.cleanup();
      return false;
    }
    gl.getExtension("OES_texture_float_linear");

    // Dispatch all shader compiles + links without blocking on their status.
    // The DOM path finalizes lazily via pollShaderCompletion() in renderFire;
    // the headless export path finalizes synchronously below (it renders frames
    // deterministically right after init and can't tolerate an async fade-in).
    this.kickoffProgramCompiles();

    this.createSimulationBuffers();

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.disable(gl.DEPTH_TEST);

    if (isDom && typeof window !== "undefined" && window.matchMedia) {
      this.reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }

    // Headless/export renders immediately after init, so finalize now (one
    // blocking compile — acceptable with no user watching). The DOM path leaves
    // shadersReady=false and polls without blocking on the next frames.
    if (!isDom && !this.finalizePrograms()) {
      this.cleanup();
      return false;
    }

    this.initialized = true;
    activeFireInstanceCount++;

    this.frameCache = new FireFrameCache(gl);

    return true;
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.resizePresentationBuffers(this.presentationProfile);
    // Simulation buffers stay independent of display resolution.
    // Invalidate frame cache since display dimensions changed
    this.frameCache?.invalidate();
  }

  // --- EXPORT DIAGNOSTIC (remove after debugging) ---
  private _diagFrameCount = 0;
  private _diagEnabled = false;
  enableDiagnostics(): void {
    this._diagEnabled = true;
    this._diagFrameCount = 0;
  }
  disableDiagnostics(): void {
    this._diagEnabled = false;
  }
  resetDiagnosticCounter(): void {
    this._diagFrameCount = 0;
  }

  /**
   * Capture fire canvas as a downloadable PNG for visual debugging.
   * Also captures the composited result (main canvas + fire overlay)
   * using the same blend as the export pipeline. Triggered via
   * window.__tka_fire_snapshot() (wired in AnimatorCanvas).
   */
  snapshotFireCanvas(): void {
    const gl = this.gl;
    const c = this.canvas;
    if (!gl || !c) {
      return;
    }

    // 1. Fire canvas only
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fire-canvas-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // 2. Composited frame (main + fire) using export blend
    const container = c.parentElement;
    if (container) {
      const mainCanvas = container.querySelector(
        "canvas:not([data-overlay-type])"
      ) as HTMLCanvasElement | null;
      if (mainCanvas) {
        const comp = document.createElement("canvas");
        const size = Math.max(mainCanvas.width, mainCanvas.height);
        comp.width = size;
        comp.height = size;
        const ctx = comp.getContext("2d")!;
        ctx.drawImage(
          mainCanvas,
          0,
          0,
          mainCanvas.width,
          mainCanvas.height,
          0,
          0,
          size,
          size
        );
        // Fire overlay with same "lighter" blend as export uses
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, size, size);
        ctx.globalCompositeOperation = "source-over";
        comp.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `fire-composited-lighter-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
        // Also save source-over version for comparison
        const comp2 = document.createElement("canvas");
        comp2.width = size;
        comp2.height = size;
        const ctx2 = comp2.getContext("2d")!;
        ctx2.drawImage(
          mainCanvas,
          0,
          0,
          mainCanvas.width,
          mainCanvas.height,
          0,
          0,
          size,
          size
        );
        ctx2.drawImage(c, 0, 0, c.width, c.height, 0, 0, size, size);
        comp2.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `fire-composited-srcover-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
      }
    }
  }

  sampleFireCanvas(): string {
    const gl = this.gl;
    const c = this.canvas;
    if (!gl || !c) return "[fire-sample] no gl/canvas";
    const px = new Uint8Array(4);
    const w = c.width,
      h = c.height;
    const points: [string, number, number][] = [
      ["center", Math.floor(w / 2), Math.floor(h / 2)],
      ["quarter", Math.floor(w / 2), Math.floor(h * 0.25)],
      ["edge", Math.floor(w * 0.1), Math.floor(h / 2)],
      ["corner", 5, 5],
    ];
    const lines: string[] = [`[fire-sample] canvas=${w}x${h} dpr=${this.dpr}`];
    for (const [name, x, y] of points) {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      lines.push(
        `  ${name}(${x},${y}): rgba(${px[0]},${px[1]},${px[2]},${px[3]})`
      );
    }
    const result = lines.join("\n");
    return result;
  }

  renderFire(input: FireFrameInput, config: FireOverlayConfig): void {
    const gl = this.gl;
    if (!gl || !this.initialized) return;

    // Shaders compile asynchronously so enabling fire never blocked the click.
    // Until the driver finishes, skip the frame — the props keep animating and
    // fire fades in within a few frames. pollShaderCompletion() only touches the
    // non-blocking COMPLETION_STATUS_KHR, so polling here costs nothing.
    if (!this.shadersReady && !this.pollShaderCompletion()) return;

    // Deduplicate: during export, two RAF callbacks fire with the same
    // virtualTime. Running the Navier-Stokes simulation twice doubles
    // fuel/velocity/temperature injection, producing concentric pressure
    // ring artifacts. preserveDrawingBuffer keeps display pixels from
    // the first call, so skipping the second is safe.
    if (input.currentTime === this.lastRenderTime) {
      if (this._diagEnabled)
        console.log("[fire-diag] DEDUP SKIP, currentTime=", input.currentTime);
      return;
    }
    this.lastRenderTime = input.currentTime;

    // No tips means no emitter this frame — every fire-carrying tip went away,
    // which is what switching a fire-capable prop to hands looks like from
    // here. The plume that is already burning keeps being stepped and drawn
    // until it dies out; stepSimulation() does the decay, this flag decides
    // which paths below are still allowed to run.
    const emitting = input.tips.length > 0;
    const hadResidualHeat = this.residualHeat > 0;
    if (emitting) this.residualHeat = FIRE_RESIDUAL_PEAK_HEAT;

    this.resizePresentationBuffers(config.renderingProfile ?? "cinematic");
    this.updateDisplayTipData(input.tips, input);
    this.renderPropVisibilityMatte(input);

    if (this._diagEnabled && this._diagFrameCount < 5) {
      this._diagFrameCount++;
      const tip0 = input.tips[0];
      const tipStr = tip0
        ? `tip0=(${Math.round(tip0.x)},${Math.round(tip0.y)}) spd=${Math.round(tip0.speed)} fs=${tip0.flameScale?.toFixed(2)}`
        : "no-tips";
      const rawDt = input.dt ?? 0;
      const subSteps = Math.max(
        1,
        Math.ceil(Math.min(Math.abs(rawDt), 0.066) / 0.017)
      );
      console.log(
        `[fire-diag] frame ${this._diagFrameCount} | t=${input.currentTime.toFixed(1)} rawDt=${rawDt.toFixed(4)} subSteps=${subSteps} | ` +
          `canvas=${this.canvas?.width}x${this.canvas?.height} sim=${this.simWidth}x${this.simHeight} | ` +
          `tips=${input.tips.length} ${tipStr} | ` +
          `intensity=${config.intensity} bloom=${config.bloomStrength ?? 0.08} cacheDisabled=${config.disableFrameCache} loopDet=${input.loopDetected}`
      );
    }

    // Apply physics preset if provided
    if (config.physicsPreset) {
      this.physics = config.physicsPreset;
    }

    // --- Frame cache logic ---
    // The cache only ever records emitting frames, so a warm cache would keep
    // replaying the burning loop after the emitters stopped and the plume
    // would never fade. Once emission ends the fade runs on the live solver
    // and the recorded loop is dropped.
    const cache = this.frameCache;
    if (cache && !config.disableFrameCache && emitting) {
      // Compute config hash for invalidation (includes playback speed - different BPM = different fire physics)
      const hash = computeFireVisualCacheKey(config, input);

      // Invalidate cache if config changed
      if (hash !== this.lastConfigHash) {
        cache.checkConfigHash(hash);
        this.lastConfigHash = hash;
      }

      // Handle loop detection
      if (input.loopDetected) {
        if (cache.isRecording()) {
          // First loop complete - switch to playback
          cache.onLoopDetected();
        } else if (cache.isWarm()) {
          // Subsequent loop - reset playback index
          cache.onLoopDetected();
        } else if (!cache.isBypassed()) {
          // Cache is idle - start recording this loop
          cache.startRecording(
            this.simWidth,
            this.simHeight,
            this.canvas!.width,
            this.canvas!.height,
            hash
          );
        }

        // For seamless loops, fire should continue naturally - props don't teleport,
        // so there's no velocity spike or positional discontinuity to fix.
        // For non-seamless loops, clear only velocity/pressure (physics fields) so
        // residual velocity doesn't push fire away from prop tips, but let
        // temperature/fuel/soot fade out naturally through dissipation physics.
        if (!cache.isWarm()) {
          if (input.isSeamlesslyLoopable) {
            // Don't clear anything - fire continues seamlessly
          } else {
            this.clearVelocityFields();
          }
        }
      }

      // If cache is warm, skip simulation entirely and blit from cache
      if (cache.isWarm()) {
        const cachedTexture = cache.getCachedFrameTexture(input.relativeTime);
        if (cachedTexture) {
          this.presentFireTexture(
            cachedTexture,
            config,
            cache.getCacheWidth(),
            cache.getCacheHeight()
          );
          if (this._diagEnabled && this._diagFrameCount <= 5)
            console.log(
              `[fire-path] CACHE-BLIT (warm, frame ${this._diagFrameCount})`
            );
          return; // Done - no simulation needed
        }
        // Cache exhausted (shouldn't happen), fall through to live simulation
      }

      // If recording, render display to cache FBO after simulation
      if (cache.isRecording()) {
        if (this._diagEnabled && this._diagFrameCount <= 5)
          console.log(
            `[fire-path] CACHE-RECORD (HDR parity, frame ${this._diagFrameCount})`
          );
        this.stepSimulation(input.tips, input, config);
        this.renderDisplayToCache(config, input, cache);
        return;
      }
    } else if (cache && (cache.isRecording() || cache.isWarm())) {
      // Caching turned off, or emission stopped: drop whatever was recorded.
      cache.invalidate();
    }

    // Default path: no cache, run full simulation + display
    // On loop: seamless sequences keep fire continuous; non-seamless clear only
    // velocity to prevent drift while letting visible fire fade naturally.
    if (input.loopDetected && !input.isSeamlesslyLoopable) {
      this.clearVelocityFields();
    }
    const bloomStr = config.bloomStrength ?? 0.08;
    const useBloom =
      bloomStr > 0 && this.displayFBO && this.bloomMips.length > 0;
    if (this._diagEnabled && this._diagFrameCount <= 5) {
      console.log(
        `[fire-path] DEFAULT (bloom=${useBloom}, bloomStr=${bloomStr}, displayFBO=${!!this.displayFBO}, mips=${this.bloomMips.length}, frame ${this._diagFrameCount})`
      );
    }
    this.stepSimulation(input.tips, input, config);
    this.renderDisplay(config, input);

    // Fade finished: nothing visible is left in the field. Zero it (which also
    // blanks the visible framebuffer that preserveDrawingBuffer would
    // otherwise hold) so the render loop can stop driving this renderer until
    // a fire-capable prop comes back.
    if (!emitting && hadResidualHeat && this.residualHeat === 0) {
      this.clearSimulation();
    }
  }

  /**
   * True while the simulation still holds heat the user can see after its
   * emitters stopped. The render loop keeps calling renderFire() with an empty
   * tip list for as long as this is true, which is what lets fire age out
   * naturally when a fire-capable prop is switched to hands instead of
   * freezing on the canvas.
   */
  hasResidualFire(): boolean {
    return this.residualHeat > 0;
  }

  /**
   * Render the display pass to the cache's recording FBO, then blit to screen.
   * Used during the recording phase of the first loop.
   */
  private renderDisplayToCache(
    config: FireOverlayConfig,
    input: FireFrameInput,
    cache: FireFrameCache
  ): void {
    const gl = this.gl!;

    // Render display pass to the cache recording FBO at sim resolution
    gl.bindFramebuffer(gl.FRAMEBUFFER, cache.getRecordingFBO());
    gl.viewport(0, 0, cache.getCacheWidth(), cache.getCacheHeight());
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Run the same display shader, but output goes to cache FBO
    this.renderDisplayPass(config, input);

    // Commit HDR data, then present through the same bloom/tone-map path used
    // by live fire. If the loop exceeded the cache budget, stay live.
    const committed = cache.commitFrame(input.relativeTime ?? 0);
    const recordingTexture = cache.getRecordingTexture();
    if (committed && recordingTexture) {
      this.presentFireTexture(
        recordingTexture,
        config,
        cache.getCacheWidth(),
        cache.getCacheHeight()
      );
    } else {
      this.renderDisplay(config, input);
    }
  }

  setQuality(level: number): void {
    const newRes = qualityToResolution(level);
    if (newRes !== this.simWidth && this.gl) {
      this.simWidth = newRes;
      this.simHeight = newRes;
      this.destroySimulationBuffers();
      this.createSimulationBuffers();
      this.frameCache?.invalidate();
    }
  }

  /**
   * Clear only velocity and pressure fields, preserving visual fire trails.
   * Used on non-seamless loop boundaries: prevents residual velocity from
   * pushing fire away from prop tips, while letting temperature/fuel/soot
   * fade out naturally through dissipation physics.
   */
  private clearVelocityFields(): void {
    const gl = this.gl;
    if (!gl || !this.initialized) return;

    const physicsFields = [this.velocity, this.pressure];
    for (const field of physicsFields) {
      if (!field) continue;
      for (const buf of [field.read, field.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, buf.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    // Divergence and curl are derived from velocity - clear them too
    if (this.divergenceFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceFBO.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (this.curlFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.curlFBO.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Note: frame cache is NOT invalidated here - velocity-only clearing
    // is compatible with continued recording.
  }

  invalidateFrameCache(): void {
    this.frameCache?.invalidate();
  }

  // Clears accumulated thermal energy (temp, fuel, velocity, color) while
  // preserving the converged pressure field. Used after export warmup: 60
  // frames of fuel at stationary tips builds unrealistic energy that the
  // live preview never accumulates. Pressure convergence is the entire
  // purpose of warmup — keep it, discard the visual residue.
  clearThermalFields(): void {
    const gl = this.gl;
    if (!gl || !this.initialized) return;

    const thermalFields = [
      this.velocity,
      this.temperature,
      this.fuel,
      this.colorField,
    ];
    for (const field of thermalFields) {
      if (!field) continue;
      for (const buf of [field.read, field.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, buf.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    if (this.divergenceFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceFBO.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (this.curlFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.curlFBO.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.lastRenderTime = -1;
    this.residualHeat = 0;
    this.frameCache?.invalidate();
  }

  clearSimulation(): void {
    const gl = this.gl;
    if (!gl || !this.initialized) return;

    // Clear each double-buffered simulation field to zero
    const fields = [
      this.velocity,
      this.temperature,
      this.fuel,
      this.pressure,
      this.colorField,
    ];

    for (const field of fields) {
      if (!field) continue;
      for (const buf of [field.read, field.write]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, buf.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }

    // Clear single-buffered fields
    if (this.divergenceFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceFBO.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (this.curlFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.curlFBO.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Clear the display canvas so stale pixels from the last render don't
    // persist (the FBOs above are off-screen; this clears what's visible).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Reset dedup guard so the first post-clear frame runs
    this.lastRenderTime = -1;

    // The field is empty, so there is no fade left to run. Anything that
    // hard-clears (keep-warm parking, gap detection, error recovery) lands
    // here and hands the renderer back in its idle state.
    this.residualHeat = 0;

    // Invalidate frame cache so stale fire frames from old effort/position
    // aren't served after the simulation is cleared
    this.frameCache?.invalidate();
  }

  dispose(): void {
    this.cleanup();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  setCanvasZIndex(z: number): void {
    if (this.canvas) this.canvas.style.zIndex = String(z);
  }

  getGl(): WebGL2RenderingContext | null {
    return this.gl;
  }

  /** Snapshot of internal state for diagnostic reports. */
  getDiagnostics(): Record<string, unknown> {
    return {
      initialized: this.initialized,
      shadersReady: this.shadersReady,
      simResolution: [this.simWidth, this.simHeight],
      presentationResolution: [this.presentationWidth, this.presentationHeight],
      dpr: this.dpr,
      activeTips: this.displayTipCount,
      residualHeat: this.residualHeat,
      canvasSize: [this.displayCanvasWidth, this.displayCanvasHeight],
      cacheState: this.frameCache?.getDiagnostics() ?? null,
      propVisibilityMatteActive: this.propVisibilityMatteActive,
      contextLost: this.gl?.isContextLost() ?? null,
      lastConfigHash: this.lastConfigHash,
    };
  }

  // ============================================================
  // Simulation pipeline
  // ============================================================

  private updateDisplayTipData(
    tips: PropTipData[],
    input: FireFrameInput
  ): void {
    this.displayTipCount = Math.min(tips.length, 16);
    this.displayCanvasWidth = input.canvasWidth;
    this.displayCanvasHeight = input.canvasHeight;

    for (let index = 0; index < this.displayTipCount; index++) {
      const tip = tips[index]!;
      this.displayTipUVs[index * 2] = tip.x / input.canvasWidth;
      this.displayTipUVs[index * 2 + 1] = 1 - tip.y / input.canvasHeight;
      this.displayTipFlameScales[index] = tip.flameScale;

      const presentation = computeFireTipPresentation(
        tip,
        input.canvasWidth,
        input.canvasHeight,
        this.tipPresentation
      );
      this.displayTipShapes[index * 4] = presentation.directionX;
      this.displayTipShapes[index * 4 + 1] = presentation.directionY;
      this.displayTipShapes[index * 4 + 2] = presentation.stretch;
      this.displayTipShapes[index * 4 + 3] = presentation.breakup;

      const color = input.propColors?.[tip.propIndex];
      this.displayTipColors[index * 3] = color?.r ?? 1;
      this.displayTipColors[index * 3 + 1] = color?.g ?? 0.65;
      this.displayTipColors[index * 3 + 2] = color?.b ?? 0.12;
    }
  }

  private stepSimulation(
    tips: PropTipData[],
    input: FireFrameInput,
    config: FireOverlayConfig
  ): void {
    const gl = this.gl!;
    // Deterministic when an explicit dt is supplied (export); otherwise derive
    // the wall-clock delta so the live path is byte-identical to before.
    const srcDt =
      input.dt ??
      (this.lastTime > 0 ? (input.currentTime - this.lastTime) / 1000 : 0);
    this.lastTime = input.currentTime;
    const totalDt = computeFireStepDt(srcDt, this.reducedMotion);

    gl.viewport(0, 0, this.simWidth, this.simHeight);
    gl.disable(gl.BLEND);

    const texelSize: [number, number] = [
      1.0 / this.simWidth,
      1.0 / this.simHeight,
    ];

    // Sub-step to keep dt ≤ 16ms. The Navier-Stokes solver is nonlinear —
    // larger time steps cause numerical instability that makes the fire
    // plume "explode" outward. At 30fps export (dt=33ms), this produced
    // massive bloom halos absent from the 60fps live preview.
    const MAX_SUB_DT = 0.017;
    const subSteps = Math.max(1, Math.ceil(totalDt / MAX_SUB_DT));
    const subDt = totalDt / subSteps;

    // 1. Inject fuel + velocity at tip positions (ONCE per frame, not per sub-step).
    const p = this.physics;
    const baseSplatRadius = p.splatRadius;
    const stepUV = baseSplatRadius;
    const useReaction = config.renderingProfile !== "legacy";
    const splats: FireSplatSample[] = [];

    this.turbulenceClock += totalDt;

    for (const tip of tips) {
      const curUvX = tip.x / input.canvasWidth;
      const curUvY = 1.0 - tip.y / input.canvasHeight;
      const prevUvX = tip.prevX / input.canvasWidth;
      const prevUvY = 1.0 - tip.prevY / input.canvasHeight;
      const fs = tip.flameScale;

      const dxUV = curUvX - prevUvX;
      const dyUV = curUvY - prevUvY;
      const distUV = Math.sqrt(dxUV * dxUV + dyUV * dyUV);

      const splatCount = Math.min(32, Math.max(1, Math.ceil(distUV / stepUV)));

      const velScale = config.velocityReactive ? p.velocityInjectScale : 0;
      const injectVx = -tip.velocityX * velScale * fs;
      const injectVy =
        tip.velocityY * velScale * fs + p.upwardBias * config.flameHeight * fs;

      const fuelPerSplat = (p.fuelAmount * config.intensity * fs) / splatCount;
      const baseTempPerSplat =
        (p.temperatureInjection * config.intensity * fs) / splatCount;

      const tc = this.turbulenceClock;
      const tipPhase = tip.propIndex * 3.7 + tip.tipIndex * 2.3;

      for (let s = 0; s < splatCount; s++) {
        const t = splatCount === 1 ? 1.0 : s / (splatCount - 1);
        const uvX = prevUvX + dxUV * t;
        const uvY = prevUvY + dyUV * t;

        const tempNoise =
          Math.sin(tc * 8.3 + tipPhase) * 0.15 +
          Math.sin(tc * 13.7 + tipPhase * 1.4) * 0.1;
        const tempPerSplat = baseTempPerSplat * (1.0 + tempNoise);

        const propColor = input.propColors?.[tip.propIndex];
        splats.push({
          x: uvX,
          y: uvY,
          radius: baseSplatRadius * fs,
          fuel: fuelPerSplat,
          temperature: tempPerSplat,
          reactionReset: useReaction ? -0.55 / splatCount : 0,
          velocityX: injectVx / splatCount,
          velocityY: injectVy / splatCount,
          colorR: propColor?.r ?? 0,
          colorG: propColor?.g ?? 0,
          colorB: propColor?.b ?? 0,
        });
      }
    }

    this.splatBatch(this.fuel!, splats, "fuel");
    this.splatBatch(this.velocity!, splats, "velocity");
    this.splatBatch(this.temperature!, splats, "temperature");
    if ((config.colorBlend ?? 0) > 0 && input.propColors && this.colorField) {
      this.splatBatch(this.colorField, splats, "color");
    }

    // 2-7. Physics sub-stepping: run advection, buoyancy, vorticity,
    // combustion, and pressure solve at ≤16ms increments.
    const iterations =
      config.jacobiIterations ??
      computeAdaptiveJacobiIterations(activeFireInstanceCount);
    const useMacCormack = shouldUseMacCormackScalars(
      config.renderingProfile,
      activeFireInstanceCount
    );
    const temperatureDissipation = computeFireTemperatureDissipation(
      p.temperatureDissipation,
      config.renderingProfile
    );

    // With no tips there were no splats above, so this frame only cools what is
    // already burning. Track that decay with the same dissipation the solver
    // applies, so hasResidualFire() reports false the moment the plume stops
    // being visible instead of after a guessed timeout.
    if (tips.length === 0) {
      this.residualHeat = decayResidualHeat(
        this.residualHeat,
        temperatureDissipation,
        subSteps
      );
    }

    for (let step = 0; step < subSteps; step++) {
      this.advect(
        this.velocity!,
        this.velocity!.read,
        p.velocityDissipation,
        subDt,
        texelSize
      );
      this.computeCurl(texelSize);
      this.applyVorticity(subDt, texelSize, config.flameHeight);
      this.applyBuoyancy(subDt, config.flameHeight);
      this.applyCurlNoiseTurbulence(
        subDt,
        texelSize,
        config.flameHeight,
        config.turbulence ?? 0.5
      );
      this.applyCombustion(subDt, config.intensity, useReaction);
      this.computeDivergence(texelSize);
      this.scalePressure();
      for (let i = 0; i < iterations; i++) {
        this.jacobiStep(texelSize);
      }
      this.gradientSubtract(texelSize);
      if (useMacCormack) {
        this.advectMacCormack(
          this.temperature!,
          this.temperature!.read,
          temperatureDissipation,
          subDt,
          texelSize
        );
        this.advectMacCormack(
          this.fuel!,
          this.fuel!.read,
          p.fuelDissipation,
          subDt,
          texelSize
        );
        if (this.colorField && (config.colorBlend ?? 0) > 0) {
          this.advectMacCormack(
            this.colorField,
            this.colorField.read,
            p.fuelDissipation,
            subDt,
            texelSize
          );
        }
      } else {
        this.advect(
          this.temperature!,
          this.temperature!.read,
          temperatureDissipation,
          subDt,
          texelSize
        );
        this.advect(
          this.fuel!,
          this.fuel!.read,
          p.fuelDissipation,
          subDt,
          texelSize
        );
        if (this.colorField && (config.colorBlend ?? 0) > 0) {
          this.advect(
            this.colorField,
            this.colorField.read,
            p.fuelDissipation,
            subDt,
            texelSize
          );
        }
      }
    }
  }

  // ============================================================
  // Simulation passes
  // ============================================================

  private splatBatch(
    target: DoubleFBO,
    samples: FireSplatSample[],
    field: "fuel" | "velocity" | "temperature" | "color"
  ): void {
    this.fluidSolver?.splatMapped(target, samples, (sample) => {
      if (field === "fuel") return [sample.fuel, 0, 0];
      if (field === "velocity") return [sample.velocityX, sample.velocityY, 0];
      if (field === "temperature") {
        return [sample.temperature, sample.reactionReset, 0];
      }
      return [sample.colorR, sample.colorG, sample.colorB];
    });
  }

  private advect(
    target: DoubleFBO,
    source: FBOAttachment,
    dissipation: number,
    dt: number,
    _texelSize: [number, number]
  ): void {
    this.fluidSolver?.advect(target, source, dissipation, dt);
  }

  private advectMacCormack(
    target: DoubleFBO,
    source: FBOAttachment,
    dissipation: number,
    dt: number,
    _texelSize: [number, number]
  ): void {
    this.fluidSolver?.advectMacCormack(target, source, dissipation, dt);
  }

  private computeCurl(texelSize: [number, number]): void {
    void texelSize;
    this.fluidSolver?.computeCurl();
  }

  private applyVorticity(
    dt: number,
    texelSize: [number, number],
    heightMult: number
  ): void {
    void texelSize;
    this.fluidSolver?.confineVorticity(
      dt,
      this.physics.vorticityStrength * heightMult,
      this.turbulenceClock
    );
  }

  private applyBuoyancy(dt: number, heightMult: number): void {
    const termVel = this.physics.gravity < 0 ? 14.0 : 6.0;
    this.fluidSolver?.applyBuoyancy({
      temperature: this.temperature!.read,
      dt,
      buoyancy: this.physics.buoyancyStrength * heightMult,
      ambientTemperature: this.AMBIENT_TEMP,
      terminalVelocity: termVel,
      gravity: this.physics.gravity,
    });
  }

  /**
   * Apply curl-noise turbulence: divergence-free velocity perturbation
   * concentrated at flame boundaries. This is what makes stationary fire
   * flicker naturally - the rising plume gets pushed by spatially-coherent
   * vortical forces while the wick stays still.
   */
  private applyCurlNoiseTurbulence(
    dt: number,
    texelSize: [number, number],
    heightMult: number,
    turbulence: number
  ): void {
    void texelSize;
    const strength =
      this.physics.vorticityStrength * heightMult * turbulence * 8.0;
    this.fluidSolver?.applyCurlNoise(
      this.temperature!.read,
      dt,
      strength,
      this.turbulenceClock
    );
  }

  private applyCombustion(
    dt: number,
    intensityMult: number,
    useReaction: boolean
  ): void {
    const gl = this.gl!;
    const prog = this.combustionProgram!;
    gl.useProgram(prog.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.temperature!.read.texture);
    gl.uniform1i(prog.uniforms.get("u_temperature")!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fuel!.read.texture);
    gl.uniform1i(prog.uniforms.get("u_fuel")!, 1);

    gl.uniform1f(prog.uniforms.get("u_dt")!, dt);
    gl.uniform1f(
      prog.uniforms.get("u_burnRate")!,
      this.physics.burnRate * intensityMult
    );
    gl.uniform1f(prog.uniforms.get("u_burnTemp")!, this.BURN_TEMP);
    gl.uniform1f(
      prog.uniforms.get("u_fuelEfficiency")!,
      this.physics.fuelEfficiency
    );
    gl.uniform1f(
      prog.uniforms.get("u_coolingRate")!,
      computeFireCoolingRate(this.physics.coolingRate, useReaction)
    );
    gl.uniform1f(prog.uniforms.get("u_ambientTemp")!, this.AMBIENT_TEMP);
    gl.uniform1f(prog.uniforms.get("u_useReaction")!, useReaction ? 1 : 0);

    // Combustion shader outputs only updated temperature in .x channel.
    // Fuel decay is handled separately via advection dissipation (FUEL_DISSIPATION).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.temperature!.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapFBO(this.temperature!);

    if (!useReaction) return;

    const fuelProg = this.fuelConsumptionProgram!;
    gl.useProgram(fuelProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fuel!.read.texture);
    gl.uniform1i(fuelProg.uniforms.get("u_fuel")!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.temperature!.read.texture);
    gl.uniform1i(fuelProg.uniforms.get("u_temperature")!, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fuel!.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapFBO(this.fuel!);
  }

  private computeDivergence(texelSize: [number, number]): void {
    void texelSize;
    this.fluidSolver?.computeDivergence();
  }

  /** Scale pressure field by dissipation factor before Jacobi iterations */
  private scalePressure(): void {
    this.fluidSolver?.dissipatePressure(this.physics.pressureDissipation);
  }

  private jacobiStep(texelSize: [number, number]): void {
    void texelSize;
    this.fluidSolver?.jacobiStep();
  }

  private gradientSubtract(texelSize: [number, number]): void {
    void texelSize;
    this.fluidSolver?.subtractPressureGradient();
  }

  // ============================================================
  // Display rendering
  // ============================================================

  private getPropVisibilityTexture(image: TexImageSource): WebGLTexture | null {
    const gl = this.gl!;
    const cached = this.propVisibilityTextures.get(image);
    if (cached) return cached;

    if (
      typeof HTMLImageElement !== "undefined" &&
      image instanceof HTMLImageElement &&
      (!image.complete || image.naturalWidth === 0)
    ) {
      return null;
    }

    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    this.propVisibilityTextures.set(image, texture);
    return texture;
  }

  private trimPropVisibilityTextures(
    activeImages: ReadonlySet<TexImageSource>
  ): void {
    const gl = this.gl!;
    for (const [image, texture] of this.propVisibilityTextures) {
      if (!activeImages.has(image)) {
        gl.deleteTexture(texture);
        this.propVisibilityTextures.delete(image);
      }
    }
  }

  /**
   * Rasterize the exact alpha silhouettes that the 2D renderer painted this
   * frame. The final fire composite reads this matte after bloom, so cached and
   * live fire both react to the prop's current pose without baking prop state
   * into the fluid cache.
   */
  private renderPropVisibilityMatte(input: FireFrameInput): void {
    const gl = this.gl!;
    const program = this.propVisibilityMatteProgram;
    const target = this.propVisibilityMatteFBO;
    const sprites = input.propSprites ?? [];
    const activeImages = new Set<TexImageSource>();

    if (!program || !target || sprites.length === 0) {
      this.propVisibilityMatteActive = false;
      this.trimPropVisibilityTextures(activeImages);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, this.presentationWidth, this.presentationHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program.program);
    gl.uniform2f(
      program.uniforms.get("u_targetSize")!,
      this.presentationWidth,
      this.presentationHeight
    );
    gl.uniform1i(program.uniforms.get("u_propSprite")!, 0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.enable(gl.SCISSOR_TEST);

    const scaleX = this.presentationWidth / Math.max(input.canvasWidth, 1);
    const scaleY = this.presentationHeight / Math.max(input.canvasHeight, 1);
    let drawnSpriteCount = 0;

    for (const sprite of sprites) {
      if (sprite.opacity <= 0.001 || sprite.width <= 0 || sprite.height <= 0) {
        continue;
      }

      const texture = this.getPropVisibilityTexture(sprite.image);
      if (!texture) continue;
      activeImages.add(sprite.image);

      const centerX = sprite.centerX * scaleX;
      const centerY = sprite.centerY * scaleY;
      const width = sprite.width * scaleX;
      const height = sprite.height * scaleY;
      const cos = Math.cos(sprite.angle);
      const sin = Math.sin(sprite.angle);
      const boundsWidth = Math.abs(cos) * width + Math.abs(sin) * height;
      const boundsHeight = Math.abs(sin) * width + Math.abs(cos) * height;
      const left = Math.max(0, Math.floor(centerX - boundsWidth * 0.5) - 1);
      const top = Math.max(0, Math.floor(centerY - boundsHeight * 0.5) - 1);
      const right = Math.min(
        this.presentationWidth,
        Math.ceil(centerX + boundsWidth * 0.5) + 1
      );
      const bottom = Math.min(
        this.presentationHeight,
        Math.ceil(centerY + boundsHeight * 0.5) + 1
      );
      if (right <= left || bottom <= top) continue;

      gl.scissor(
        left,
        this.presentationHeight - bottom,
        right - left,
        bottom - top
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(program.uniforms.get("u_center")!, centerX, centerY);
      gl.uniform2f(program.uniforms.get("u_size")!, width, height);
      gl.uniform1f(program.uniforms.get("u_angle")!, sprite.angle);
      gl.uniform1f(program.uniforms.get("u_flipped")!, sprite.flipped ? 1 : 0);
      gl.uniform1f(program.uniforms.get("u_opacity")!, sprite.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      drawnSpriteCount++;
    }

    gl.disable(gl.SCISSOR_TEST);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.propVisibilityMatteActive = drawnSpriteCount > 0;
    this.trimPropVisibilityTextures(activeImages);
  }

  /**
   * Render the display pass. When bloom is enabled, renders to an intermediate
   * FBO, runs the bloom mip chain, then composites scene + bloom to screen.
   * Without bloom, renders directly to the default framebuffer.
   */
  private renderDisplay(
    config: FireOverlayConfig,
    input: FireFrameInput
  ): void {
    const gl = this.gl!;
    const bloomStrength = config.bloomStrength ?? 0.08;
    const useFilmic = config.renderingProfile !== "legacy";
    const useIntermediate =
      useFilmic || bloomStrength > 0 || this.propVisibilityMatteActive;

    if (useIntermediate && this.displayFBO) {
      // Render scene-linear fire to an HDR intermediate before bloom/output.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.displayFBO!.fbo);
      gl.viewport(0, 0, this.presentationWidth, this.presentationHeight);
      gl.enable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.renderDisplayPass(config, input);

      this.presentFireTexture(
        this.displayFBO.texture,
        config,
        this.presentationWidth,
        this.presentationHeight
      );
    } else {
      // No bloom: render directly to screen
      gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
      gl.enable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.renderDisplayPass(config, input);
    }

    // Post-render pixel sampling for diagnostics
    if (this._diagEnabled && this._diagFrameCount <= 5) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const px = new Uint8Array(4);
      const w = this.canvas!.width,
        h = this.canvas!.height;
      gl.readPixels(
        Math.floor(w / 2),
        Math.floor(h / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px
      );
      const center = `rgba(${px[0]},${px[1]},${px[2]},${px[3]})`;
      gl.readPixels(
        Math.floor(w / 2),
        Math.floor(h * 0.25),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px
      );
      const quarter = `rgba(${px[0]},${px[1]},${px[2]},${px[3]})`;
      gl.readPixels(5, 5, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const corner = `rgba(${px[0]},${px[1]},${px[2]},${px[3]})`;
      console.log(
        `[fire-pixels] post-render: center=${center} quarter=${quarter} corner=${corner} | bloom=${bloomStrength > 0}`
      );
    }
  }

  private presentFireTexture(
    sceneTexture: WebGLTexture,
    config: FireOverlayConfig,
    sourceWidth: number,
    sourceHeight: number
  ): void {
    const bloomStrength = config.bloomStrength ?? 0.08;
    const useFilmic = config.renderingProfile !== "legacy";
    if (bloomStrength > 0 && this.bloomMips.length > 0) {
      this.runBloomPipeline(
        sceneTexture,
        bloomStrength,
        useFilmic,
        sourceWidth,
        sourceHeight
      );
    } else {
      this.compositeFireTextures(sceneTexture, sceneTexture, 0, useFilmic);
    }
  }

  /**
   * PBR bloom pipeline (CoD:AW method):
   * 1. Downsample scene through mip chain with 13-tap energy-preserving kernel
   * 2. Upsample with additive 3x3 tent filter accumulation
   * 3. Composite bloom + original scene to screen
   */
  private runBloomPipeline(
    sceneTexture: WebGLTexture,
    bloomStrength: number,
    useFilmic: boolean,
    sourceWidth: number,
    sourceHeight: number
  ): void {
    const gl = this.gl!;
    const mips = this.bloomMips;
    const sizes = this.bloomMipSizes;
    if (mips.length === 0) return;

    gl.disable(gl.BLEND);

    // --- Downsample chain ---
    const downProg = this.bloomDownsampleProgram!;
    gl.useProgram(downProg.program);

    // First downsample: from displayFBO to mip[0] — with luminance prefilter.
    // The soft-knee threshold (UE4/Frostbite method) gates which pixels enter
    // the bloom chain. Only HDR values (wick cores at 4.0+) create bloom;
    // sub-HDR trail pixels are excluded, preventing the concentric halo rings
    // that appear when the fire canvas is composited onto dark backgrounds.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(downProg.uniforms.get("u_source")!, 0);
    gl.uniform2f(
      downProg.uniforms.get("u_texelSize")!,
      1.0 / sourceWidth,
      1.0 / sourceHeight
    );
    gl.uniform1f(downProg.uniforms.get("u_threshold")!, 3.0);
    gl.uniform1f(downProg.uniforms.get("u_knee")!, 0.5);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mips[0]!.fbo);
    gl.viewport(0, 0, sizes[0]![0], sizes[0]![1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Subsequent downsamples: mip[i-1] → mip[i] (no threshold)
    gl.uniform1f(downProg.uniforms.get("u_threshold")!, 0.0);
    for (let i = 1; i < mips.length; i++) {
      gl.bindTexture(gl.TEXTURE_2D, mips[i - 1]!.texture);
      gl.uniform2f(
        downProg.uniforms.get("u_texelSize")!,
        1.0 / sizes[i - 1]![0],
        1.0 / sizes[i - 1]![1]
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, mips[i]!.fbo);
      gl.viewport(0, 0, sizes[i]![0], sizes[i]![1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // --- Upsample chain (additive accumulation) ---
    const upProg = this.bloomUpsampleProgram!;
    gl.useProgram(upProg.program);
    gl.uniform1f(upProg.uniforms.get("u_bloomRadius")!, 1.0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive blend for bloom accumulation

    // Upsample: mip[last] → mip[last-1] → ... → mip[0]
    for (let i = mips.length - 1; i > 0; i--) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mips[i]!.texture);
      gl.uniform1i(upProg.uniforms.get("u_source")!, 0);
      gl.uniform2f(
        upProg.uniforms.get("u_texelSize")!,
        1.0 / sizes[i]![0],
        1.0 / sizes[i]![1]
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, mips[i - 1]!.fbo);
      gl.viewport(0, 0, sizes[i - 1]![0], sizes[i - 1]![1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // --- Composite to screen ---
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    ); // restore premultiplied alpha blend

    this.compositeFireTextures(
      sceneTexture,
      mips[0]!.texture,
      bloomStrength,
      useFilmic
    );
  }

  private compositeFireTextures(
    sceneTexture: WebGLTexture,
    bloomTexture: WebGLTexture,
    bloomStrength: number,
    useFilmic: boolean
  ): void {
    const gl = this.gl!;
    const prog = this.bloomCompositeProgram!;
    gl.useProgram(prog.program);
    gl.disable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(prog.uniforms.get("u_scene")!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
    gl.uniform1i(prog.uniforms.get("u_bloom")!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(
      gl.TEXTURE_2D,
      this.propVisibilityMatteFBO?.texture ?? sceneTexture
    );
    gl.uniform1i(prog.uniforms.get("u_propVisibilityMatte")!, 2);
    gl.uniform1f(
      prog.uniforms.get("u_propVisibilityEnabled")!,
      this.propVisibilityMatteActive ? 1 : 0
    );
    gl.uniform1i(prog.uniforms.get("u_tipCount")!, this.displayTipCount);
    if (this.displayTipCount > 0) {
      gl.uniform2fv(
        prog.uniforms.get("u_tipPositions[0]")!,
        this.displayTipUVs.subarray(0, this.displayTipCount * 2)
      );
      gl.uniform1fv(
        prog.uniforms.get("u_tipFlameScales[0]")!,
        this.displayTipFlameScales.subarray(0, this.displayTipCount)
      );
    }
    const aspect =
      this.displayCanvasWidth / Math.max(this.displayCanvasHeight, 1);
    gl.uniform2f(prog.uniforms.get("u_aspectCorrect")!, 1, aspect);
    gl.uniform1f(prog.uniforms.get("u_bloomStrength")!, bloomStrength);
    gl.uniform1f(prog.uniforms.get("u_useFilmic")!, useFilmic ? 1 : 0);
    gl.uniform1f(prog.uniforms.get("u_exposure")!, 1.0);
    gl.uniform1f(
      prog.uniforms.get("u_ditherStrength")!,
      useFilmic ? 0.5 / 255 : 0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
  }

  /**
   * The display shader pass - sets uniforms and draws.
   * Caller is responsible for binding the target framebuffer and setting viewport.
   * This allows both renderDisplay (screen) and renderDisplayToCache (FBO) to share the same logic.
   */
  private renderDisplayPass(
    config: FireOverlayConfig,
    input: FireFrameInput
  ): void {
    const gl = this.gl!;
    const prog = this.displayProgram!;
    gl.useProgram(prog.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.temperature!.read.texture);
    gl.uniform1i(prog.uniforms.get("u_temperature")!, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fuel!.read.texture);
    gl.uniform1i(prog.uniforms.get("u_fuel")!, 1);

    // Color field texture
    gl.activeTexture(gl.TEXTURE2);
    if (this.colorField && (config.colorBlend ?? 0) > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.colorField.read.texture);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.fuel!.read.texture);
    }
    gl.uniform1i(prog.uniforms.get("u_colorField")!, 2);

    // Color blend factor (0.0 = natural, 0.5 = tinted, 1.0 = fully colored)
    gl.uniform1f(prog.uniforms.get("u_colorBlend")!, config.colorBlend ?? 0);

    // Time for FBM noise animation (seconds since page load)
    gl.uniform1f(prog.uniforms.get("u_time")!, input.currentTime * 0.001);

    const useReaction = config.renderingProfile !== "legacy";
    gl.uniform1f(
      prog.uniforms.get("u_displayIntensity")!,
      useReaction
        ? computeFireEmissionMultiplier(config.brightness)
        : config.intensity
    );
    gl.uniform1f(prog.uniforms.get("u_useReaction")!, useReaction ? 1 : 0);
    gl.uniform2f(
      prog.uniforms.get("u_texelSize")!,
      1 / this.simWidth,
      1 / this.simHeight
    );

    // Wick core positions (always-bright flame at each tip)
    // Uses pre-cached uniform locations to avoid per-frame getUniformLocation stalls
    gl.uniform1i(prog.uniforms.get("u_tipCount")!, this.displayTipCount);

    for (let i = 0; i < this.displayTipCount; i++) {
      const posLoc = this.tipPositionLocs[i];
      const shapeLoc = this.tipShapeLocs[i];
      const scaleLoc = this.tipFlameScaleLocs[i];
      const colorLoc = this.tipColorLocs[i];
      if (posLoc)
        gl.uniform2f(
          posLoc,
          this.displayTipUVs[i * 2]!,
          this.displayTipUVs[i * 2 + 1]!
        );
      if (shapeLoc) {
        gl.uniform4f(
          shapeLoc,
          this.displayTipShapes[i * 4]!,
          this.displayTipShapes[i * 4 + 1]!,
          this.displayTipShapes[i * 4 + 2]!,
          this.displayTipShapes[i * 4 + 3]!
        );
      }
      if (scaleLoc) gl.uniform1f(scaleLoc, this.displayTipFlameScales[i]!);
      if (colorLoc) {
        gl.uniform3f(
          colorLoc,
          this.displayTipColors[i * 3] ?? 1.0,
          this.displayTipColors[i * 3 + 1] ?? 0.65,
          this.displayTipColors[i * 3 + 2] ?? 0.12
        );
      }
    }

    // Aspect correction so wick cores render as circles, not ellipses
    const aspect =
      this.displayCanvasWidth / Math.max(this.displayCanvasHeight, 1);
    gl.uniform2f(prog.uniforms.get("u_aspectCorrect")!, 1.0, aspect);

    // Per-fuel-source color curve (falls back to white gas = old hardcoded values)
    const curve = config.colorCurve ?? BASE_COLOR_CURVE;
    gl.uniform3fv(prog.uniforms.get("u_colorCold")!, curve.coldColor);
    gl.uniform3fv(prog.uniforms.get("u_colorMid")!, curve.midColor);
    gl.uniform3fv(prog.uniforms.get("u_colorHot")!, curve.hotColor);
    gl.uniform3fv(prog.uniforms.get("u_colorCore")!, curve.coreColor);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ============================================================
  // FBO management
  // ============================================================

  private createFBO(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    filter: number
  ): FBOAttachment {
    const gl = this.gl!;

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      w,
      h,
      0,
      format,
      type,
      null
    );

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { fbo, texture };
  }

  private swapFBO(fbo: DoubleFBO): void {
    const tmp = fbo.read;
    fbo.read = fbo.write;
    fbo.write = tmp;
  }

  private createSimulationBuffers(): void {
    const w = this.simWidth;
    const h = this.simHeight;

    this.fluidSolver = new WebGLFluidSolver2D(this.gl!, w, h);
    this.velocity = this.fluidSolver.velocity;
    this.pressure = this.fluidSolver.pressure;
    this.divergenceFBO = this.fluidSolver.divergence;
    this.curlFBO = this.fluidSolver.curl;
    this.temperature = this.fluidSolver.createField();
    this.fuel = this.fluidSolver.createField();
    this.colorField = this.fluidSolver.createField();
    if (this.shadersReady) this.connectFluidPrograms();

    this.createPresentationBuffers();
  }

  private createPresentationBuffers(): void {
    const [width, height] = computeFirePresentationResolution(
      this.canvas?.width ?? this.simWidth,
      this.canvas?.height ?? this.simHeight,
      this.simWidth,
      this.presentationProfile
    );
    this.presentationWidth = width;
    this.presentationHeight = height;
    this.displayFBO = this.createFBO(
      width,
      height,
      this.gl!.RGBA16F,
      this.gl!.RGBA,
      this.gl!.HALF_FLOAT,
      this.gl!.LINEAR
    );
    this.propVisibilityMatteFBO = this.createFBO(
      width,
      height,
      this.gl!.RGBA8,
      this.gl!.RGBA,
      this.gl!.UNSIGNED_BYTE,
      this.gl!.LINEAR
    );
    this.createBloomMipChain(width, height);
  }

  private resizePresentationBuffers(profile: FireRenderingProfile): void {
    this.presentationProfile = profile;
    const [width, height] = computeFirePresentationResolution(
      this.canvas?.width ?? this.simWidth,
      this.canvas?.height ?? this.simHeight,
      this.simWidth,
      profile
    );
    if (
      width === this.presentationWidth &&
      height === this.presentationHeight &&
      this.displayFBO &&
      this.propVisibilityMatteFBO
    ) {
      return;
    }

    this.destroyPresentationBuffers();
    this.createPresentationBuffers();
  }

  private createBloomMipChain(baseW: number, baseH: number): void {
    this.destroyBloomMipChain();
    let w = Math.max(1, baseW >> 1);
    let h = Math.max(1, baseH >> 1);
    for (let i = 0; i < 4; i++) {
      this.bloomMips.push(
        this.createFBO(
          w,
          h,
          this.gl!.RGBA16F,
          this.gl!.RGBA,
          this.gl!.HALF_FLOAT,
          this.gl!.LINEAR
        )
      );
      this.bloomMipSizes.push([w, h]);
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
  }

  private destroyBloomMipChain(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const mip of this.bloomMips) {
      gl.deleteTexture(mip.texture);
      gl.deleteFramebuffer(mip.fbo);
    }
    this.bloomMips = [];
    this.bloomMipSizes = [];
  }

  private destroyPresentationBuffers(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.displayFBO) {
      gl.deleteTexture(this.displayFBO.texture);
      gl.deleteFramebuffer(this.displayFBO.fbo);
      this.displayFBO = null;
    }
    if (this.propVisibilityMatteFBO) {
      gl.deleteTexture(this.propVisibilityMatteFBO.texture);
      gl.deleteFramebuffer(this.propVisibilityMatteFBO.fbo);
      this.propVisibilityMatteFBO = null;
    }
    this.propVisibilityMatteActive = false;
    this.destroyBloomMipChain();
    this.presentationWidth = 1;
    this.presentationHeight = 1;
  }

  private destroySimulationBuffers(): void {
    if (!this.gl) return;
    this.fluidSolver?.destroyField(this.temperature);
    this.fluidSolver?.destroyField(this.fuel);
    this.fluidSolver?.destroyField(this.colorField);
    this.fluidSolver?.dispose();
    this.destroyPresentationBuffers();

    this.velocity = null;
    this.pressure = null;
    this.temperature = null;
    this.fuel = null;
    this.colorField = null;
    this.divergenceFBO = null;
    this.curlFBO = null;
    this.fluidSolver = null;
  }

  // ============================================================
  // Shader compilation
  // ============================================================

  /**
   * Dispatch compile + link for every fire program WITHOUT blocking on status.
   * Under KHR_parallel_shader_compile the driver does this on its own threads;
   * we resolve results later in finalizePrograms(). One shared vertex shader
   * (identical source across all programs) halves the shader-object count.
   * Crucially this touches no LINK_STATUS / COMPILE_STATUS / getUniformLocation
   * call — those would force the synchronous stall this exists to eliminate.
   */
  private kickoffProgramCompiles(): void {
    const gl = this.gl!;
    this.parallelCompileExt = gl.getExtension(
      "KHR_parallel_shader_compile"
    ) as { COMPLETION_STATUS_KHR: number } | null;

    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, VERTEX_SHADER);
    gl.compileShader(vert);
    this.pendingVertexShader = vert;

    const specs: {
      frag: string;
      uniforms: string[];
      assign: (sp: ShaderProgram) => void;
    }[] = [
      {
        frag: SPLAT_BATCH_FRAG,
        uniforms: [
          "u_target",
          "u_points[0]",
          "u_values[0]",
          "u_radii[0]",
          "u_count",
        ],
        assign: (sp) => {
          this.splatBatchProgram = sp;
        },
      },
      {
        frag: ADVECTION_FRAG,
        uniforms: [
          "u_velocity",
          "u_source",
          "u_texelSize",
          "u_dt",
          "u_dissipation",
        ],
        assign: (sp) => {
          this.advectionProgram = sp;
        },
      },
      {
        frag: MACCORMACK_CORRECTION_FRAG,
        uniforms: [
          "u_velocity",
          "u_source",
          "u_forward",
          "u_reverse",
          "u_texelSize",
          "u_dt",
          "u_dissipation",
        ],
        assign: (sp) => {
          this.macCormackCorrectionProgram = sp;
        },
      },
      {
        frag: CURL_FRAG,
        uniforms: ["u_velocity", "u_texelSize"],
        assign: (sp) => {
          this.curlProgram = sp;
        },
      },
      {
        frag: VORTICITY_FRAG,
        uniforms: [
          "u_velocity",
          "u_curl",
          "u_texelSize",
          "u_dt",
          "u_strength",
          "u_time",
        ],
        assign: (sp) => {
          this.vorticityProgram = sp;
        },
      },
      {
        frag: BUOYANCY_FRAG,
        uniforms: [
          "u_velocity",
          "u_temperature",
          "u_density",
          "u_dt",
          "u_buoyancy",
          "u_densityWeight",
          "u_ambientTemp",
          "u_terminalVelocity",
          "u_gravity",
        ],
        assign: (sp) => {
          this.buoyancyProgram = sp;
        },
      },
      {
        frag: CURL_NOISE_FRAG,
        uniforms: [
          "u_velocity",
          "u_temperature",
          "u_texelSize",
          "u_dt",
          "u_time",
          "u_strength",
        ],
        assign: (sp) => {
          this.curlNoiseProgram = sp;
        },
      },
      {
        frag: COMBUSTION_FRAG,
        uniforms: [
          "u_temperature",
          "u_fuel",
          "u_dt",
          "u_burnRate",
          "u_burnTemp",
          "u_fuelEfficiency",
          "u_coolingRate",
          "u_ambientTemp",
          "u_useReaction",
        ],
        assign: (sp) => {
          this.combustionProgram = sp;
        },
      },
      {
        frag: FUEL_CONSUMPTION_FRAG,
        uniforms: ["u_fuel", "u_temperature"],
        assign: (sp) => {
          this.fuelConsumptionProgram = sp;
        },
      },
      {
        frag: DIVERGENCE_FRAG,
        uniforms: ["u_velocity", "u_texelSize"],
        assign: (sp) => {
          this.divergenceProgram = sp;
        },
      },
      {
        frag: JACOBI_FRAG,
        uniforms: ["u_pressure", "u_divergence", "u_texelSize"],
        assign: (sp) => {
          this.jacobiProgram = sp;
        },
      },
      {
        frag: GRADIENT_SUBTRACT_FRAG,
        uniforms: ["u_velocity", "u_pressure", "u_texelSize"],
        assign: (sp) => {
          this.gradientSubtractProgram = sp;
        },
      },
      {
        frag: CLEAR_FRAG,
        uniforms: ["u_clearValue"],
        assign: (sp) => {
          this.clearProgram = sp;
        },
      },
      {
        frag: DISPLAY_FRAG,
        uniforms: [
          "u_temperature",
          "u_fuel",
          "u_colorField",
          "u_displayIntensity",
          "u_tipCount",
          "u_aspectCorrect",
          "u_colorBlend",
          "u_colorCold",
          "u_colorMid",
          "u_colorHot",
          "u_colorCore",
          "u_time",
          "u_useReaction",
          "u_texelSize",
        ],
        assign: (sp) => {
          this.displayProgram = sp;
        },
      },
      {
        frag: PROP_VISIBILITY_MATTE_FRAG,
        uniforms: [
          "u_propSprite",
          "u_targetSize",
          "u_center",
          "u_size",
          "u_angle",
          "u_flipped",
          "u_opacity",
        ],
        assign: (sp) => {
          this.propVisibilityMatteProgram = sp;
        },
      },
      {
        frag: BLOOM_DOWNSAMPLE_FRAG,
        uniforms: ["u_source", "u_texelSize", "u_threshold", "u_knee"],
        assign: (sp) => {
          this.bloomDownsampleProgram = sp;
        },
      },
      {
        frag: BLOOM_UPSAMPLE_FRAG,
        uniforms: ["u_source", "u_texelSize", "u_bloomRadius"],
        assign: (sp) => {
          this.bloomUpsampleProgram = sp;
        },
      },
      {
        frag: BLOOM_COMPOSITE_FRAG,
        uniforms: [
          "u_scene",
          "u_bloom",
          "u_bloomStrength",
          "u_useFilmic",
          "u_exposure",
          "u_ditherStrength",
          "u_propVisibilityMatte",
          "u_propVisibilityEnabled",
          "u_tipPositions[0]",
          "u_tipFlameScales[0]",
          "u_tipCount",
          "u_aspectCorrect",
        ],
        assign: (sp) => {
          this.bloomCompositeProgram = sp;
        },
      },
    ];

    this.pendingPrograms = [];
    for (const spec of specs) {
      const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(frag, spec.frag);
      gl.compileShader(frag);

      const program = gl.createProgram()!;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);

      this.pendingPrograms.push({
        program,
        fragShader: frag,
        uniformNames: spec.uniforms,
        assign: spec.assign,
      });
    }
  }

  /**
   * Non-blocking readiness check called from renderFire. Returns true once all
   * programs are finalized (uniforms resolved, fields assigned). While the
   * driver is still compiling it returns false WITHOUT touching any blocking
   * query, so the caller simply skips the frame and the animation never stalls.
   */
  private pollShaderCompletion(): boolean {
    if (this.shadersReady) return true;
    if (this.shaderCompileFailed) return false;
    const gl = this.gl;
    if (!gl) return false;

    const ext = this.parallelCompileExt;
    if (ext) {
      for (const pending of this.pendingPrograms) {
        // COMPLETION_STATUS_KHR is the ONLY status safe to read before a program
        // is done — it never blocks. LINK_STATUS/getUniformLocation here would
        // reintroduce the stall.
        if (
          !gl.getProgramParameter(pending.program, ext.COMPLETION_STATUS_KHR)
        ) {
          return false; // still compiling on a driver thread — retry next frame
        }
      }
    }
    // All complete — or no parallel-compile extension, in which case finalize
    // blocks once (unavoidable fallback on browsers lacking the extension).
    return this.finalizePrograms();
  }

  /**
   * Resolve linked programs into ShaderPrograms: verify LINK_STATUS, look up
   * uniform locations, assign the named fields, and free shader objects. Safe to
   * call only once the driver has finished (after COMPLETION_STATUS_KHR, or on
   * the synchronous headless path). Returns false if any program failed to link.
   */
  private finalizePrograms(): boolean {
    const gl = this.gl!;

    for (const pending of this.pendingPrograms) {
      if (!gl.getProgramParameter(pending.program, gl.LINK_STATUS)) {
        console.error(
          "Fire shader link error:",
          gl.getProgramInfoLog(pending.program)
        );
        this.shaderCompileFailed = true;
        return false;
      }

      gl.detachShader(pending.program, this.pendingVertexShader!);
      gl.detachShader(pending.program, pending.fragShader);
      gl.deleteShader(pending.fragShader);

      const uniforms = new Map<string, WebGLUniformLocation>();
      for (const name of pending.uniformNames) {
        const loc = gl.getUniformLocation(pending.program, name);
        if (loc !== null) uniforms.set(name, loc);
      }
      pending.assign({ program: pending.program, uniforms });
    }

    if (this.pendingVertexShader) {
      gl.deleteShader(this.pendingVertexShader);
      this.pendingVertexShader = null;
    }
    this.pendingPrograms = [];

    // Pre-cache tip array uniform locations to avoid per-frame getUniformLocation
    // calls. On Windows/ANGLE each getUniformLocation triggers a GPU-CPU stall.
    this.cacheTipUniformLocations();
    this.connectFluidPrograms();
    this.shadersReady = true;
    return true;
  }

  private connectFluidPrograms(): void {
    if (!this.fluidSolver) return;
    const programs: FluidPrograms = {
      splatBatch: this.splatBatchProgram!,
      advection: this.advectionProgram!,
      macCormack: this.macCormackCorrectionProgram!,
      curl: this.curlProgram!,
      vorticity: this.vorticityProgram!,
      buoyancy: this.buoyancyProgram!,
      curlNoise: this.curlNoiseProgram!,
      divergence: this.divergenceProgram!,
      jacobi: this.jacobiProgram!,
      gradientSubtract: this.gradientSubtractProgram!,
    };
    this.fluidSolver.setPrograms(programs);
  }

  private cacheTipUniformLocations(): void {
    if (!this.displayProgram || !this.gl) return;
    const gl = this.gl;
    const prog = this.displayProgram.program;
    const MAX_TIPS = 16;

    this.tipPositionLocs = new Array(MAX_TIPS);
    this.tipShapeLocs = new Array(MAX_TIPS);
    this.tipFlameScaleLocs = new Array(MAX_TIPS);
    this.tipColorLocs = new Array(MAX_TIPS);

    for (let i = 0; i < MAX_TIPS; i++) {
      this.tipPositionLocs[i] = gl.getUniformLocation(
        prog,
        `u_tipPositions[${i}]`
      );
      this.tipShapeLocs[i] = gl.getUniformLocation(prog, `u_tipShapes[${i}]`);
      this.tipFlameScaleLocs[i] = gl.getUniformLocation(
        prog,
        `u_tipFlameScales[${i}]`
      );
      this.tipColorLocs[i] = gl.getUniformLocation(prog, `u_tipColors[${i}]`);
    }
  }

  // ============================================================
  // Cleanup
  // ============================================================

  private cleanup(): void {
    if (this.initialized) {
      activeFireInstanceCount = Math.max(0, activeFireInstanceCount - 1);
    }
    this.frameCache?.dispose();
    this.frameCache = null;
    this.destroySimulationBuffers();

    const gl = this.gl;
    if (gl) {
      const programs = [
        this.splatBatchProgram,
        this.advectionProgram,
        this.macCormackCorrectionProgram,
        this.curlProgram,
        this.vorticityProgram,
        this.buoyancyProgram,
        this.curlNoiseProgram,
        this.combustionProgram,
        this.fuelConsumptionProgram,
        this.divergenceProgram,
        this.jacobiProgram,
        this.gradientSubtractProgram,
        this.clearProgram,
        this.displayProgram,
        this.propVisibilityMatteProgram,
        this.bloomDownsampleProgram,
        this.bloomUpsampleProgram,
        this.bloomCompositeProgram,
      ];
      for (const p of programs) {
        if (p) gl.deleteProgram(p.program);
      }
      // Free any programs still pending finalize (disposed mid-compile).
      for (const pending of this.pendingPrograms) {
        gl.deleteProgram(pending.program);
        gl.deleteShader(pending.fragShader);
      }
      if (this.pendingVertexShader) gl.deleteShader(this.pendingVertexShader);
      for (const texture of this.propVisibilityTextures.values()) {
        gl.deleteTexture(texture);
      }
      this.propVisibilityTextures.clear();

      // Deleting individual objects does not require the browser to release the
      // context itself promptly. Mobile Safari's graphics budget is tight, so
      // an explicitly disposed effect gives the context back immediately.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }

    this.pendingPrograms = [];
    this.pendingVertexShader = null;
    this.parallelCompileExt = null;
    this.shadersReady = false;
    this.shaderCompileFailed = false;

    this.splatBatchProgram = null;
    this.advectionProgram = null;
    this.macCormackCorrectionProgram = null;
    this.curlProgram = null;
    this.vorticityProgram = null;
    this.buoyancyProgram = null;
    this.curlNoiseProgram = null;
    this.combustionProgram = null;
    this.fuelConsumptionProgram = null;
    this.divergenceProgram = null;
    this.jacobiProgram = null;
    this.gradientSubtractProgram = null;
    this.clearProgram = null;
    this.displayProgram = null;
    this.propVisibilityMatteProgram = null;
    this.bloomDownsampleProgram = null;
    this.bloomUpsampleProgram = null;
    this.bloomCompositeProgram = null;

    if (this.canvas) {
      if (typeof (this.canvas as any).remove === "function") {
        this.canvas.remove();
      }
      this.canvas = null;
    }

    this.gl = null;
    this.initialized = false;
  }
}

// ── EffectPlugin descriptor ──────────────────────────────────────────────────
import type { EffectPlugin } from "../effects/effect-plugin";
import type { EffectRendererManager } from "../effect-renderer-manager";
import type { FireIntent } from "$lib/shared/effects/domain/effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";

export const fireEffectPlugin: EffectPlugin<FireIntent> = {
  id: "fire",
  kind: "webgl",
  createRenderer: () => new WebGLFireRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.fire,
  configKey: "fireRenderer",
  onDisable: (mgr: EffectRendererManager) => {
    if (!mgr.isEffectEnabled("charcoal")) {
      mgr.fireTipTracker?.reset();
    }
  },
};
