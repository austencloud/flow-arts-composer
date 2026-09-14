import type { Smoke2DParams } from "$lib/shared/effects/translators/canvas2d-types";
import type { EmitterTip } from "$lib/shared/effects/renderers/emitter-tip";
import { emitterId } from "$lib/shared/effects/renderers/emitter-tip";
import { computeEffectScale } from "$lib/shared/effects/renderers/scale";
import {
  FLUID_PROGRAM_DEFINITIONS,
  WebGLFluidSolver2D,
  computeFluidJacobiIterations,
  getActiveFluidInstanceCount,
  shouldUseFluidMacCormack,
  type FluidField,
  type FluidProgram,
  type FluidProgramKey,
  type FluidPrograms,
  type FluidSplat,
} from "../fluid/web-gl-fluid-solver-2d";
import { VERTEX_SHADER } from "../fluid/fluid-shader-sources";
import { SMOKE_DISPLAY_FRAG } from "./smoke-shader-sources";

const MAX_DPR = 2;
const MAX_SUBSTEP = 1 / 45;

interface PendingProgram {
  key: FluidProgramKey | "display";
  program: WebGLProgram;
  fragmentShader: WebGLShader;
  uniforms: string[];
}

interface TipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function computeSmokeSimulationResolution(poolSize = 1024): number {
  if (poolSize <= 512) return 96;
  if (poolSize <= 1024) return 160;
  return 224;
}

export function computeSmokeDensityDissipation(
  lifetimeSeconds: number
): number {
  return Math.exp(-3 / (60 * Math.max(0.25, lifetimeSeconds)));
}

export interface SmokeEmitterMetrics {
  /** Splat radius in normalized [0,1] simulation space. */
  splatRadius: number;
  /** Buoyancy target in simulation grid cells per second. */
  riseGridVelocity: number;
  /** Tip speed (pane px/s) that saturates the motion emission term. */
  motionReferenceSpeedPx: number;
}

/**
 * Resolve the pane-relative emission metrics. `baseRadius`, `resolvedRiseSpeed`
 * and `motionReferenceSpeed` are authored at DEFAULT_CANVAS_SIZE like every
 * other 2D effect constant, so they pass through `computeEffectScale` before
 * being normalized against the pane. Without that step a half-width pane
 * (the disassemble solo slots) receives a puff twice the radius and four
 * times the mass of the hero's, because the fluid grid is a fixed size and
 * the Gaussian splat is not area-normalized.
 */
export function computeSmokeEmitterMetrics(
  params: Pick<
    Smoke2DParams,
    "baseRadius" | "intensity" | "resolvedRiseSpeed" | "motionReferenceSpeed"
  >,
  width: number,
  height: number,
  gridHeight: number
): SmokeEmitterMetrics {
  const scale = computeEffectScale(width, height);
  const splatRadius =
    (params.baseRadius * scale * (0.72 + params.intensity * 0.88)) /
    Math.max(width, height, 1);
  const riseGridVelocity =
    ((params.resolvedRiseSpeed * scale) / Math.max(height, 1)) * gridHeight;
  const motionReferenceSpeedPx = Math.max(
    1,
    params.motionReferenceSpeed * 60 * scale
  );
  return { splatRadius, riseGridVelocity, motionReferenceSpeedPx };
}

export function hexToLinearRgb(hex: string): readonly [number, number, number] {
  const value = hex.trim().replace(/^#/, "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : value.length >= 6
        ? value.slice(0, 6)
        : "d8d8d8";
  const channel = (offset: number) => {
    const srgb =
      Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4)];
}

/** Density-field Smoke renderer. Fire and Smoke share only the solver. */
export class WebGLSmokeRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private solver: WebGLFluidSolver2D | null = null;
  private density: FluidField | null = null;
  private temperature: FluidField | null = null;
  private displayProgram: FluidProgram | null = null;
  private pending: PendingProgram[] = [];
  private vertexShader: WebGLShader | null = null;
  private parallelCompile: { COMPLETION_STATUS_KHR: number } | null = null;
  private ready = false;
  private failed = false;
  private initialized = false;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private clock = 0;
  private tipState = new Map<string, TipState>();
  private failureHandler: (() => void) | null = null;

  initialize(container: HTMLElement, width: number, height: number): boolean {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.overlayType = "smoke";
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "2",
      background: "transparent",
    });
    container.appendChild(canvas);
    this.canvas = canvas;
    return this.initializeContext(width, height, true);
  }

  initializeHeadless(width: number, height: number): boolean {
    this.canvas = new OffscreenCanvas(
      width,
      height
    ) as unknown as HTMLCanvasElement;
    return this.initializeContext(width, height, false);
  }

  private initializeContext(
    width: number,
    height: number,
    isDom: boolean
  ): boolean {
    try {
      this.width = width;
      this.height = height;
      this.dpr = isDom ? Math.min(window.devicePixelRatio || 1, MAX_DPR) : 1;
      this.resizeCanvas(width, height);
      const gl = this.canvas!.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;
      if (!gl?.getExtension("EXT_color_buffer_float")) {
        this.dispose();
        return false;
      }
      gl.getExtension("OES_texture_float_linear");
      this.gl = gl;
      const resolution = computeSmokeSimulationResolution();
      this.solver = new WebGLFluidSolver2D(gl, resolution, resolution);
      this.density = this.solver.createField();
      this.temperature = this.solver.createField();
      this.kickoffCompiles();
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA
      );
      gl.disable(gl.DEPTH_TEST);
      this.initialized = true;
      if (!isDom && !this.finalizePrograms()) {
        this.dispose();
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Smoke fluid renderer initialization failed", error);
      this.dispose();
      return false;
    }
  }

  renderFrame(params: Smoke2DParams, emitters: EmitterTip[], dt: number): void {
    if (!this.gl || !this.solver || !this.density || !this.temperature) return;
    if (!this.ready && !this.pollPrograms()) return;
    const gl = this.gl;
    const frameDt = Math.min(Math.max(dt, 1 / 120), 0.066);
    this.clock += frameDt;
    gl.viewport(0, 0, this.solver.width, this.solver.height);
    gl.disable(gl.BLEND);
    const metrics = computeSmokeEmitterMetrics(
      params,
      this.width,
      this.height,
      this.solver.height
    );
    this.emit(params, emitters, frameDt, metrics);

    const substeps = Math.max(1, Math.ceil(frameDt / MAX_SUBSTEP));
    const stepDt = frameDt / substeps;
    const densityDissipation = computeSmokeDensityDissipation(
      params.lifetimeSeconds
    );
    const thermalLifetime = Math.max(0.45, params.lifetimeSeconds * 0.42);
    const thermalDissipation = Math.exp(-3 / (60 * thermalLifetime));
    const instanceCount = getActiveFluidInstanceCount();
    const useMacCormack = shouldUseFluidMacCormack(instanceCount);
    const iterations = computeFluidJacobiIterations(instanceCount);
    const riseGridVelocity = metrics.riseGridVelocity;
    for (let index = 0; index < substeps; index++) {
      this.solver.advect(
        this.solver.velocity,
        this.solver.velocity.read,
        0.985,
        stepDt
      );
      this.solver.applyVorticity(
        stepDt,
        5 + params.resolvedCurlStrength * 16,
        this.clock
      );
      this.solver.applyBuoyancy({
        temperature: this.temperature.read,
        density: this.density.read,
        dt: stepDt,
        buoyancy: riseGridVelocity * 1.2,
        densityWeight: 0.055,
        terminalVelocity: Math.max(8, riseGridVelocity),
      });
      this.solver.applyCurlNoise(
        this.density.read,
        stepDt,
        params.resolvedCurlStrength * 12,
        this.clock
      );
      this.solver.project(0.82, iterations);
      if (useMacCormack) {
        const densitySource = this.density.read;
        this.solver.advectMacCormack(
          this.density,
          densitySource,
          densityDissipation,
          stepDt
        );
        const temperatureSource = this.temperature.read;
        this.solver.advectMacCormack(
          this.temperature,
          temperatureSource,
          thermalDissipation,
          stepDt
        );
      } else {
        const densitySource = this.density.read;
        this.solver.advect(
          this.density,
          densitySource,
          densityDissipation,
          stepDt
        );
        const temperatureSource = this.temperature.read;
        this.solver.advect(
          this.temperature,
          temperatureSource,
          thermalDissipation,
          stepDt
        );
      }
    }
    this.display(params);
  }

  setFailureHandler(handler: (() => void) | null): void {
    this.failureHandler = handler;
  }

  private emit(
    params: Smoke2DParams,
    emitters: EmitterTip[],
    dt: number,
    metrics: SmokeEmitterMetrics
  ): void {
    const densitySplats: FluidSplat[] = [];
    const thermalSplats: FluidSplat[] = [];
    const velocitySplats: FluidSplat[] = [];
    const seen = new Set<string>();
    const sim = this.solver!;
    for (const emitter of emitters) {
      if (!this.isEndEnabled(emitter.end, params)) continue;
      const id = emitterId(emitter.propIndex, emitter.tipIndex);
      seen.add(id);
      const previous = this.tipState.get(id);
      const rawVx = previous ? (emitter.x - previous.x) / dt : 0;
      const rawVy = previous ? (emitter.y - previous.y) / dt : 0;
      const alpha = 1 - 0.6 ** (dt * 60);
      const vx = previous ? previous.vx + (rawVx - previous.vx) * alpha : rawVx;
      const vy = previous ? previous.vy + (rawVy - previous.vy) * alpha : rawVy;
      this.tipState.set(id, { x: emitter.x, y: emitter.y, vx, vy });

      const speed = Math.hypot(vx, vy);
      const reference = metrics.motionReferenceSpeedPx;
      const motion = Math.min(1, speed / reference);
      const emission =
        params.intensity *
        dt *
        (params.ambientEmission * params.ambientSpawnRate +
          params.motionEmission * motion * params.motionSpawnRate);
      if (emission <= 0) continue;

      const currentX = emitter.x / this.width;
      const currentY = 1 - emitter.y / this.height;
      const previousX = previous ? previous.x / this.width : currentX;
      const previousY = previous ? 1 - previous.y / this.height : currentY;
      const distance = Math.hypot(currentX - previousX, currentY - previousY);
      const radius = metrics.splatRadius;
      const count = Math.min(
        24,
        Math.max(1, Math.ceil(distance / Math.max(radius * 0.7, 0.002)))
      );
      for (let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
        const t = count === 1 ? 1 : sampleIndex / (count - 1);
        const x = previousX + (currentX - previousX) * t;
        const y = previousY + (currentY - previousY) * t;
        const amount = Math.min(0.85, emission * 0.34) / count;
        densitySplats.push({ x, y, radius, value: [amount, 0, 0] });
        thermalSplats.push({
          x,
          y,
          radius: radius * 0.82,
          value: [amount * 0.72, 0, 0],
        });
        velocitySplats.push({
          x,
          y,
          radius: radius * 1.15,
          value: [
            ((vx / Math.max(this.width, 1)) * sim.width * 0.28) / count,
            ((-vy / Math.max(this.height, 1)) * sim.height * 0.28) / count,
            0,
          ],
        });
      }
    }
    for (const id of this.tipState.keys())
      if (!seen.has(id)) this.tipState.delete(id);
    sim.splat(this.density!, densitySplats);
    sim.splat(this.temperature!, thermalSplats);
    sim.splat(sim.velocity, velocitySplats);
  }

  private display(params: Smoke2DParams): void {
    const gl = this.gl!;
    const program = this.displayProgram!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program.program);
    this.bindTexture(program, "u_density", this.density!.read.texture, 0);
    this.bindTexture(
      program,
      "u_temperature",
      this.temperature!.read.texture,
      1
    );
    gl.uniform3fv(
      program.uniforms.get("u_coreColor")!,
      hexToLinearRgb(params.resolvedPalette.core)
    );
    gl.uniform3fv(
      program.uniforms.get("u_edgeColor")!,
      hexToLinearRgb(params.resolvedPalette.edge)
    );
    gl.uniform1f(program.uniforms.get("u_intensity")!, params.intensity);
    gl.uniform1f(program.uniforms.get("u_time")!, this.clock);
    gl.uniform1f(
      program.uniforms.get("u_hueShift")!,
      params.resolvedPalette.hueShift ? 1 : 0
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.dpr =
      typeof window === "undefined"
        ? 1
        : Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.resizeCanvas(width, height);
  }

  private resizeCanvas(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
  }

  clear(): void {
    this.solver?.clear([this.density, this.temperature]);
    this.tipState.clear();
    if (this.gl) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }

  setVisible(visible: boolean): void {
    if (this.canvas) this.canvas.style.display = visible ? "" : "none";
  }

  setCanvasZIndex(z: number): void {
    if (this.canvas) this.canvas.style.zIndex = String(z);
  }

  isInitialized(): boolean {
    return this.initialized;
  }
  hasFailed(): boolean {
    return this.failed;
  }
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      this.solver?.destroyField(this.density);
      this.solver?.destroyField(this.temperature);
      this.solver?.dispose();
      for (const item of this.pending) {
        gl.deleteProgram(item.program);
        gl.deleteShader(item.fragmentShader);
      }
      if (this.vertexShader) gl.deleteShader(this.vertexShader);
      if (this.displayProgram) gl.deleteProgram(this.displayProgram.program);
    }
    this.canvas?.remove?.();
    this.canvas = null;
    this.gl = null;
    this.solver = null;
    this.density = null;
    this.temperature = null;
    this.displayProgram = null;
    this.pending = [];
    this.vertexShader = null;
    this.tipState.clear();
    this.initialized = false;
    this.ready = false;
  }

  private kickoffCompiles(): void {
    const gl = this.gl!;
    this.parallelCompile = gl.getExtension("KHR_parallel_shader_compile") as {
      COMPLETION_STATUS_KHR: number;
    } | null;
    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertex, VERTEX_SHADER);
    gl.compileShader(vertex);
    this.vertexShader = vertex;
    const definitions = [
      ...FLUID_PROGRAM_DEFINITIONS.map((definition) => ({
        key: definition.key,
        fragment: definition.fragment,
        uniforms: definition.uniforms,
      })),
      {
        key: "display" as const,
        fragment: SMOKE_DISPLAY_FRAG,
        uniforms: [
          "u_density",
          "u_temperature",
          "u_coreColor",
          "u_edgeColor",
          "u_intensity",
          "u_time",
          "u_hueShift",
        ],
      },
    ];
    this.pending = definitions.map((definition) => {
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fragmentShader, definition.fragment);
      gl.compileShader(fragmentShader);
      const program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      return {
        key: definition.key,
        program,
        fragmentShader,
        uniforms: [...definition.uniforms],
      };
    });
  }

  private pollPrograms(): boolean {
    if (this.ready) return true;
    if (this.failed || !this.gl) return false;
    if (this.parallelCompile) {
      for (const item of this.pending) {
        if (
          !this.gl.getProgramParameter(
            item.program,
            this.parallelCompile.COMPLETION_STATUS_KHR
          )
        ) {
          return false;
        }
      }
    }
    return this.finalizePrograms();
  }

  private finalizePrograms(): boolean {
    const gl = this.gl!;
    const fluidPrograms = {} as FluidPrograms;
    for (const item of this.pending) {
      if (!gl.getProgramParameter(item.program, gl.LINK_STATUS)) {
        console.warn(
          "Smoke shader link failed",
          gl.getProgramInfoLog(item.program)
        );
        this.failed = true;
        this.failureHandler?.();
        return false;
      }
      const uniforms = new Map<string, WebGLUniformLocation>();
      for (const name of item.uniforms) {
        const location = gl.getUniformLocation(item.program, name);
        if (location !== null) uniforms.set(name, location);
      }
      const wrapped = { program: item.program, uniforms };
      if (item.key === "display") this.displayProgram = wrapped;
      else fluidPrograms[item.key] = wrapped;
      gl.detachShader(item.program, this.vertexShader!);
      gl.detachShader(item.program, item.fragmentShader);
      gl.deleteShader(item.fragmentShader);
    }
    gl.deleteShader(this.vertexShader!);
    this.vertexShader = null;
    this.pending = [];
    this.solver!.setPrograms(fluidPrograms);
    this.ready = true;
    return true;
  }

  private bindTexture(
    program: FluidProgram,
    uniform: string,
    texture: WebGLTexture,
    unit: number
  ): void {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(program.uniforms.get(uniform)!, unit);
  }

  private isEndEnabled(end: "A" | "B", params: Smoke2DParams): boolean {
    if (params.trackingMode === "both_ends") return true;
    return params.trackingMode === "left_end" ? end === "A" : end === "B";
  }
}
