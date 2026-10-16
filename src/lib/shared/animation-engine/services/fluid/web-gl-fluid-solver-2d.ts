import {
  ADVECTION_FRAG,
  BUOYANCY_FRAG,
  CURL_FRAG,
  CURL_NOISE_FRAG,
  DIVERGENCE_FRAG,
  GRADIENT_SUBTRACT_FRAG,
  JACOBI_FRAG,
  MACCORMACK_CORRECTION_FRAG,
  SPLAT_BATCH_FRAG,
  VORTICITY_FRAG,
} from "./fluid-shader-sources";

const MAX_SPLATS_PER_BATCH = 32;
const REFERENCE_STEP_SECONDS = 1 / 60;

export interface FluidAttachment {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
}

export interface FluidField {
  read: FluidAttachment;
  write: FluidAttachment;
}

export interface FluidProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

export type FluidProgramKey =
  | "splatBatch"
  | "advection"
  | "macCormack"
  | "curl"
  | "vorticity"
  | "buoyancy"
  | "curlNoise"
  | "divergence"
  | "jacobi"
  | "gradientSubtract";

export type FluidPrograms = Record<FluidProgramKey, FluidProgram>;

export interface FluidProgramDefinition {
  key: FluidProgramKey;
  fragment: string;
  uniforms: string[];
}

export const FLUID_PROGRAM_DEFINITIONS: readonly FluidProgramDefinition[] = [
  {
    key: "splatBatch",
    fragment: SPLAT_BATCH_FRAG,
    uniforms: [
      "u_target",
      "u_points[0]",
      "u_values[0]",
      "u_radii[0]",
      "u_count",
    ],
  },
  {
    key: "advection",
    fragment: ADVECTION_FRAG,
    uniforms: [
      "u_velocity",
      "u_source",
      "u_texelSize",
      "u_dt",
      "u_dissipation",
    ],
  },
  {
    key: "macCormack",
    fragment: MACCORMACK_CORRECTION_FRAG,
    uniforms: [
      "u_velocity",
      "u_source",
      "u_forward",
      "u_reverse",
      "u_texelSize",
      "u_dt",
      "u_dissipation",
    ],
  },
  {
    key: "curl",
    fragment: CURL_FRAG,
    uniforms: ["u_velocity", "u_texelSize"],
  },
  {
    key: "vorticity",
    fragment: VORTICITY_FRAG,
    uniforms: [
      "u_velocity",
      "u_curl",
      "u_texelSize",
      "u_dt",
      "u_strength",
      "u_time",
      "u_minGradient",
    ],
  },
  {
    key: "buoyancy",
    fragment: BUOYANCY_FRAG,
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
  },
  {
    key: "curlNoise",
    fragment: CURL_NOISE_FRAG,
    uniforms: [
      "u_velocity",
      "u_temperature",
      "u_texelSize",
      "u_dt",
      "u_time",
      "u_strength",
    ],
  },
  {
    key: "divergence",
    fragment: DIVERGENCE_FRAG,
    uniforms: ["u_velocity", "u_texelSize"],
  },
  {
    key: "jacobi",
    fragment: JACOBI_FRAG,
    uniforms: ["u_pressure", "u_divergence", "u_texelSize"],
  },
  {
    key: "gradientSubtract",
    fragment: GRADIENT_SUBTRACT_FRAG,
    uniforms: ["u_velocity", "u_pressure", "u_texelSize"],
  },
] as const;

export interface FluidSplat {
  x: number;
  y: number;
  radius: number;
  value: readonly [number, number, number];
}

export interface FluidBuoyancyOptions {
  temperature: FluidAttachment;
  density?: FluidAttachment;
  dt: number;
  buoyancy: number;
  densityWeight?: number;
  ambientTemperature?: number;
  terminalVelocity?: number;
  gravity?: number;
}

export function computeFluidStepDissipation(base: number, dt: number): number {
  return Math.pow(
    Math.min(1, Math.max(0, base)),
    Math.max(0, Math.abs(dt)) / REFERENCE_STEP_SECONDS
  );
}

export function computeFluidJacobiIterations(instanceCount: number): number {
  if (instanceCount <= 1) return 12;
  if (instanceCount <= 4) return 8;
  return 6;
}

export function shouldUseFluidMacCormack(instanceCount: number): boolean {
  return instanceCount <= 4;
}

let activeFluidInstanceCount = 0;

export function getActiveFluidInstanceCount(): number {
  return activeFluidInstanceCount;
}

/**
 * Owns the reusable incompressible-flow fields and passes. Material renderers
 * allocate their transported scalar fields through this service and retain
 * ownership of emission, chemistry, and display.
 */
export class WebGLFluidSolver2D {
  readonly velocity: FluidField;
  readonly pressure: FluidField;
  readonly divergence: FluidAttachment;
  readonly curl: FluidAttachment;

  private programs: FluidPrograms | null = null;
  private readonly forward: FluidAttachment;
  private readonly reverse: FluidAttachment;
  private readonly splatPoints = new Float32Array(MAX_SPLATS_PER_BATCH * 2);
  private readonly splatValues = new Float32Array(MAX_SPLATS_PER_BATCH * 3);
  private readonly splatRadii = new Float32Array(MAX_SPLATS_PER_BATCH);
  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly width: number,
    readonly height: number
  ) {
    this.velocity = this.createField();
    this.pressure = this.createField();
    this.divergence = this.createAttachment(gl.NEAREST);
    this.curl = this.createAttachment(gl.NEAREST);
    this.forward = this.createAttachment(gl.LINEAR);
    this.reverse = this.createAttachment(gl.LINEAR);
    activeFluidInstanceCount++;
  }

  setPrograms(programs: FluidPrograms): void {
    this.programs = programs;
  }

  createField(filter = this.gl.LINEAR): FluidField {
    return {
      read: this.createAttachment(filter),
      write: this.createAttachment(filter),
    };
  }

  destroyField(field: FluidField | null): void {
    if (!field) return;
    this.destroyAttachment(field.read);
    this.destroyAttachment(field.write);
  }

  splat(target: FluidField, samples: readonly FluidSplat[]): void {
    this.splatMapped(target, samples, (sample) => sample.value);
  }

  splatMapped<T extends { x: number; y: number; radius: number }>(
    target: FluidField,
    samples: readonly T[],
    valueFor: (sample: T) => readonly [number, number, number]
  ): void {
    const program = this.requirePrograms().splatBatch;
    const gl = this.gl;
    gl.useProgram(program.program);

    for (
      let offset = 0;
      offset < samples.length;
      offset += MAX_SPLATS_PER_BATCH
    ) {
      const count = Math.min(MAX_SPLATS_PER_BATCH, samples.length - offset);
      for (let index = 0; index < count; index++) {
        const sample = samples[offset + index]!;
        this.splatPoints[index * 2] = sample.x;
        this.splatPoints[index * 2 + 1] = sample.y;
        this.splatRadii[index] = sample.radius;
        const value = valueFor(sample);
        this.splatValues[index * 3] = value[0];
        this.splatValues[index * 3 + 1] = value[1];
        this.splatValues[index * 3 + 2] = value[2];
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
      gl.uniform1i(program.uniforms.get("u_target")!, 0);
      gl.uniform2fv(program.uniforms.get("u_points[0]")!, this.splatPoints);
      gl.uniform3fv(program.uniforms.get("u_values[0]")!, this.splatValues);
      gl.uniform1fv(program.uniforms.get("u_radii[0]")!, this.splatRadii);
      gl.uniform1i(program.uniforms.get("u_count")!, count);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swap(target);
    }
  }

  advect(
    target: FluidField,
    source: FluidAttachment,
    dissipation: number,
    dt: number
  ): void {
    this.advectInto(target.write, source, dissipation, dt);
    this.swap(target);
  }

  advectMacCormack(
    target: FluidField,
    source: FluidAttachment,
    dissipation: number,
    dt: number
  ): void {
    this.advectInto(this.forward, source, 1, dt);
    this.advectInto(this.reverse, this.forward, 1, -dt);

    const gl = this.gl;
    const program = this.requirePrograms().macCormack;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    this.bindTexture(program, "u_source", source, 1);
    this.bindTexture(program, "u_forward", this.forward, 2);
    this.bindTexture(program, "u_reverse", this.reverse, 3);
    gl.uniform2f(
      program.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.uniform1f(program.uniforms.get("u_dt")!, dt);
    gl.uniform1f(
      program.uniforms.get("u_dissipation")!,
      computeFluidStepDissipation(dissipation, dt)
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(target);
  }

  applyVorticity(
    dt: number,
    strength: number,
    time: number,
    minGradient = 0
  ): void {
    const gl = this.gl;
    this.computeCurl();

    const program = this.requirePrograms().vorticity;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    this.bindTexture(program, "u_curl", this.curl, 1);
    gl.uniform2f(
      program.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.uniform1f(program.uniforms.get("u_dt")!, dt);
    gl.uniform1f(program.uniforms.get("u_strength")!, strength);
    gl.uniform1f(program.uniforms.get("u_time")!, time);
    gl.uniform1f(program.uniforms.get("u_minGradient")!, minGradient);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(this.velocity);
  }

  computeCurl(): void {
    const gl = this.gl;
    const program = this.requirePrograms().curl;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    gl.uniform2f(
      program.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.curl.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  confineVorticity(dt: number, strength: number, time: number): void {
    const gl = this.gl;
    const program = this.requirePrograms().vorticity;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    this.bindTexture(program, "u_curl", this.curl, 1);
    gl.uniform2f(
      program.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.uniform1f(program.uniforms.get("u_dt")!, dt);
    gl.uniform1f(program.uniforms.get("u_strength")!, strength);
    gl.uniform1f(program.uniforms.get("u_time")!, time);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(this.velocity);
  }

  applyBuoyancy(options: FluidBuoyancyOptions): void {
    const gl = this.gl;
    const program = this.requirePrograms().buoyancy;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    this.bindTexture(program, "u_temperature", options.temperature, 1);
    this.bindTexture(
      program,
      "u_density",
      options.density ?? options.temperature,
      2
    );
    gl.uniform1f(program.uniforms.get("u_dt")!, options.dt);
    gl.uniform1f(program.uniforms.get("u_buoyancy")!, options.buoyancy);
    gl.uniform1f(
      program.uniforms.get("u_densityWeight")!,
      options.densityWeight ?? 0
    );
    gl.uniform1f(
      program.uniforms.get("u_ambientTemp")!,
      options.ambientTemperature ?? 0
    );
    gl.uniform1f(
      program.uniforms.get("u_terminalVelocity")!,
      options.terminalVelocity ?? 6
    );
    gl.uniform1f(program.uniforms.get("u_gravity")!, options.gravity ?? 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(this.velocity);
  }

  applyCurlNoise(
    activity: FluidAttachment,
    dt: number,
    strength: number,
    time: number
  ): void {
    if (strength <= 0) return;
    const gl = this.gl;
    const program = this.requirePrograms().curlNoise;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    this.bindTexture(program, "u_temperature", activity, 1);
    gl.uniform2f(
      program.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.uniform1f(program.uniforms.get("u_dt")!, dt);
    gl.uniform1f(program.uniforms.get("u_time")!, time);
    gl.uniform1f(program.uniforms.get("u_strength")!, strength);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(this.velocity);
  }

  project(pressureDissipation: number, iterations: number): void {
    this.computeDivergence();
    this.dissipatePressure(pressureDissipation);
    for (let index = 0; index < iterations; index++) this.jacobiStep();
    this.subtractPressureGradient();
  }

  computeDivergence(): void {
    const gl = this.gl;
    const divergenceProgram = this.requirePrograms().divergence;
    gl.useProgram(divergenceProgram.program);
    this.bindTexture(divergenceProgram, "u_velocity", this.velocity.read, 0);
    gl.uniform2f(
      divergenceProgram.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergence.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dissipatePressure(pressureDissipation: number): void {
    // Pressure decay is a direct per-step relaxation. It intentionally does
    // not use the 60 Hz transport normalization because dt is zero for this
    // stationary pass.
    this.advectInto(
      this.pressure.write,
      this.pressure.read,
      pressureDissipation,
      0,
      false
    );
    this.swap(this.pressure);
  }

  jacobiStep(): void {
    const gl = this.gl;
    const jacobiProgram = this.requirePrograms().jacobi;
    gl.useProgram(jacobiProgram.program);
    this.bindTexture(jacobiProgram, "u_pressure", this.pressure.read, 0);
    this.bindTexture(jacobiProgram, "u_divergence", this.divergence, 1);
    gl.uniform2f(
      jacobiProgram.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressure.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(this.pressure);
  }

  subtractPressureGradient(): void {
    const gl = this.gl;
    const gradientProgram = this.requirePrograms().gradientSubtract;
    gl.useProgram(gradientProgram.program);
    this.bindTexture(gradientProgram, "u_velocity", this.velocity.read, 0);
    this.bindTexture(gradientProgram, "u_pressure", this.pressure.read, 1);
    gl.uniform2f(
      gradientProgram.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.write.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swap(this.velocity);
  }

  clear(fields: readonly (FluidField | FluidAttachment | null)[] = []): void {
    this.clearFields([
      this.velocity,
      this.pressure,
      this.divergence,
      this.curl,
      ...fields,
    ]);
  }

  clearFields(fields: readonly (FluidField | FluidAttachment | null)[]): void {
    const gl = this.gl;
    for (const field of fields) {
      if (!field) continue;
      const attachments = "read" in field ? [field.read, field.write] : [field];
      for (const attachment of attachments) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, attachment.fbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clearVelocity(): void {
    this.clearFields([
      this.velocity,
      this.pressure,
      this.divergence,
      this.curl,
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.destroyField(this.velocity);
    this.destroyField(this.pressure);
    this.destroyAttachment(this.divergence);
    this.destroyAttachment(this.curl);
    this.destroyAttachment(this.forward);
    this.destroyAttachment(this.reverse);
    activeFluidInstanceCount = Math.max(0, activeFluidInstanceCount - 1);
  }

  private advectInto(
    destination: FluidAttachment,
    source: FluidAttachment,
    dissipation: number,
    dt: number,
    normalizeDissipation = true
  ): void {
    const gl = this.gl;
    const program = this.requirePrograms().advection;
    gl.useProgram(program.program);
    this.bindTexture(program, "u_velocity", this.velocity.read, 0);
    this.bindTexture(program, "u_source", source, 1);
    gl.uniform2f(
      program.uniforms.get("u_texelSize")!,
      1 / this.width,
      1 / this.height
    );
    gl.uniform1f(program.uniforms.get("u_dt")!, dt);
    gl.uniform1f(
      program.uniforms.get("u_dissipation")!,
      normalizeDissipation
        ? computeFluidStepDissipation(dissipation, dt)
        : dissipation
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private bindTexture(
    program: FluidProgram,
    uniform: string,
    attachment: FluidAttachment,
    unit: number
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, attachment.texture);
    gl.uniform1i(program.uniforms.get(uniform)!, unit);
  }

  private createAttachment(filter: number): FluidAttachment {
    const gl = this.gl;
    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo)
      throw new Error("Unable to allocate fluid framebuffer");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(fbo);
      throw new Error(`Incomplete fluid framebuffer: ${status}`);
    }
    return { fbo, texture };
  }

  private destroyAttachment(attachment: FluidAttachment): void {
    this.gl.deleteTexture(attachment.texture);
    this.gl.deleteFramebuffer(attachment.fbo);
  }

  private swap(field: FluidField): void {
    const read = field.read;
    field.read = field.write;
    field.write = read;
  }

  private requirePrograms(): FluidPrograms {
    if (!this.programs) throw new Error("Fluid shader programs are not ready");
    return this.programs;
  }
}
