import {
  Color,
  DataUtils,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  NoBlending,
  RGBAFormat,
  type Texture,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type IUniform,
  type WebGLRenderer,
} from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import {
  SMOKE_FLUID_ADVECT,
  SMOKE_FLUID_CURL,
  SMOKE_FLUID_DIVERGENCE,
  SMOKE_FLUID_FORCES,
  SMOKE_FLUID_GRADIENT,
  SMOKE_FLUID_JACOBI,
  SMOKE_FLUID_LIGHT,
  SMOKE_FLUID_MACCORMACK,
  SMOKE_FLUID_SHIFT,
  SMOKE_FLUID_SPLAT,
  SMOKE_FLUID_VERTEX,
} from "./smoke-fluid-shaders-3d";

export const SMOKE_FLUID_MAX_SOURCES = 16;
/** How fast the side and top walls drain smoke, per second at the wall. */
const SPONGE_RATE = 18;

export interface SmokeFluidGrid3D {
  /** Cells along x, y (up) and z. */
  size: readonly [number, number, number];
  /** Cell edge, metres. */
  cell: number;
  /** Pressure solve iterations per step. */
  iterations: number;
}

/** Atlas layout: z slices as NX x NY tiles in rows of `columns`. */
export function smokeFluidAtlas(size: readonly [number, number, number]): {
  columns: number;
  width: number;
  height: number;
} {
  const [nx, ny, nz] = size;
  // Closest to square without going past what WebGL guarantees.
  let columns = Math.max(1, Math.round(Math.sqrt((nz * ny) / nx)));
  columns = Math.min(columns, nz);
  const rows = Math.ceil(nz / columns);
  return { columns, width: columns * nx, height: rows * ny };
}

/** One step's emission from a prop head, in grid cells. */
export interface SmokeFluidSplat3D {
  start: Vector3;
  end: Vector3;
  radius: number;
  /** Smoke and heat added at the capsule's core. */
  smoke: number;
  heat: number;
  /** Head velocity, m/s, and how strongly it drags the air at the core. */
  velocity: Vector3;
  drag: number;
}

export interface SmokeFluidStep3D {
  dt: number;
  /** Fraction of smoke and heat left after one second. */
  smokeKeep: number;
  heatKeep: number;
  /** Fraction of air speed left after one second. */
  airKeep: number;
  confinement: number;
  lift: number;
  weight: number;
}

export interface SmokeFluidReadback3D {
  /** Sum of smoke over all cells. */
  total: number;
  max: number;
  /** Smoke-weighted mean cell, or null when empty. */
  centroid: Vector3 | null;
  /** Cells holding visible smoke. */
  occupied: number;
  /** Smoke-weighted mean of |v|, m/s. */
  speed: number;
}

interface Field {
  read: WebGLRenderTarget;
  write: WebGLRenderTarget;
}

type Uniforms = Record<string, IUniform>;

/**
 * One smoke volume simulated on the GPU: velocity, smoke and heat on a
 * regular grid, advected, pushed by buoyancy and vortex confinement, and made
 * incompressible each step.
 */
export class SmokeFluidDomain3D {
  readonly grid: SmokeFluidGrid3D;
  readonly columns: number;
  readonly atlas: Vector2;
  /** World position of the grid's minimum corner. */
  readonly origin = new Vector3();
  private readonly renderer: WebGLRenderer;
  private readonly quad = new FullScreenQuad();
  private readonly velocity: Field;
  private readonly scalars: Field;
  private readonly pressure: Field;
  private readonly divergence: WebGLRenderTarget;
  private readonly curl: WebGLRenderTarget;
  private readonly forward: WebGLRenderTarget;
  private readonly backward: WebGLRenderTarget;
  readonly light: WebGLRenderTarget;
  private readonly splatMaterial: ShaderMaterial;
  private readonly advectMaterial: ShaderMaterial;
  private readonly maccormackMaterial: ShaderMaterial;
  private readonly curlMaterial: ShaderMaterial;
  private readonly forcesMaterial: ShaderMaterial;
  private readonly divergenceMaterial: ShaderMaterial;
  private readonly jacobiMaterial: ShaderMaterial;
  private readonly gradientMaterial: ShaderMaterial;
  private readonly lightMaterial: ShaderMaterial;
  private readonly shiftMaterial: ShaderMaterial;
  private readonly starts = Array.from({ length: SMOKE_FLUID_MAX_SOURCES }, () => new Vector3());
  private readonly ends = Array.from({ length: SMOKE_FLUID_MAX_SOURCES }, () => new Vector3());
  private readonly radii = new Array<number>(SMOKE_FLUID_MAX_SOURCES).fill(1);
  private readonly values = Array.from({ length: SMOKE_FLUID_MAX_SOURCES }, () => new Vector4());
  private readonly savedClear = new Color();

  constructor(renderer: WebGLRenderer, grid: SmokeFluidGrid3D) {
    this.renderer = renderer;
    this.grid = grid;
    const layout = smokeFluidAtlas(grid.size);
    this.columns = layout.columns;
    this.atlas = new Vector2(layout.width, layout.height);
    const target = () => {
      const t = new WebGLRenderTarget(layout.width, layout.height, {
        type: HalfFloatType,
        format: RGBAFormat,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      t.texture.name = "SmokeFluid3D";
      return t;
    };
    const field = (): Field => ({ read: target(), write: target() });
    this.velocity = field();
    this.scalars = field();
    this.pressure = field();
    this.divergence = target();
    this.curl = target();
    this.forward = target();
    this.backward = target();
    this.light = target();

    const common = (): Uniforms => ({
      uGrid: { value: new Vector3(...grid.size) },
      uColumns: { value: layout.columns },
      uAtlas: { value: this.atlas },
    });
    const pass = (fragmentShader: string, uniforms: Uniforms) =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: SMOKE_FLUID_VERTEX,
        fragmentShader,
        uniforms: { ...common(), ...uniforms },
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
      });
    this.splatMaterial = pass(SMOKE_FLUID_SPLAT, {
      uField: { value: null },
      uCount: { value: 0 },
      uStart: { value: this.starts },
      uEnd: { value: this.ends },
      uRadius: { value: this.radii },
      uValue: { value: this.values },
      uBlend: { value: 0 },
    });
    this.advectMaterial = pass(SMOKE_FLUID_ADVECT, {
      uVelocity: { value: null },
      uSource: { value: null },
      uDtOverH: { value: 0 },
      uKeep: { value: [1, 1, 1, 1] },
    });
    this.maccormackMaterial = pass(SMOKE_FLUID_MACCORMACK, {
      uVelocity: { value: null },
      uSource: { value: null },
      uForward: { value: null },
      uBackward: { value: null },
      uDtOverH: { value: 0 },
      uKeep: { value: [1, 1, 1, 1] },
      uSponge: { value: 0 },
      uSideBand: { value: 4 },
      uTopBand: { value: 8 },
    });
    this.curlMaterial = pass(SMOKE_FLUID_CURL, { uVelocity: { value: null } });
    this.forcesMaterial = pass(SMOKE_FLUID_FORCES, {
      uVelocity: { value: null },
      uCurl: { value: null },
      uScalars: { value: null },
      uDt: { value: 0 },
      uConfinement: { value: 0 },
      uLift: { value: 0 },
      uWeight: { value: 0 },
      uKeep: { value: 1 },
    });
    this.divergenceMaterial = pass(SMOKE_FLUID_DIVERGENCE, { uVelocity: { value: null } });
    this.jacobiMaterial = pass(SMOKE_FLUID_JACOBI, {
      uPressure: { value: null },
      uDivergence: { value: null },
    });
    this.gradientMaterial = pass(SMOKE_FLUID_GRADIENT, {
      uPressure: { value: null },
      uVelocity: { value: null },
    });
    this.lightMaterial = pass(SMOKE_FLUID_LIGHT, {
      uScalars: { value: null },
      uLightStep: { value: new Vector3(0, 1.5, 0) },
      uExtinctionPerStep: { value: 0.1 },
    });
    this.shiftMaterial = pass(SMOKE_FLUID_SHIFT, {
      uSource: { value: null },
      uOffset: { value: new Vector3() },
    });
    this.clear();
  }

  /** Smoke and heat (r, g) for the ray march. */
  get smokeTexture() {
    return this.scalars.read.texture;
  }

  get lightTexture() {
    return this.light.texture;
  }

  /** World size of the box, metres. */
  extent(out: Vector3): Vector3 {
    const [nx, ny, nz] = this.grid.size;
    return out.set(nx, ny, nz).multiplyScalar(this.grid.cell);
  }

  step(splats: readonly SmokeFluidSplat3D[], settings: SmokeFluidStep3D): void {
    const { dt } = settings;
    this.withTargets(() => {
      this.splat(splats);

      // Air carries itself plainly: error-corrected air grows grid-sized
      // grain. Smoke then rides that air with MacCormack so it keeps its edges.
      const a = this.advectMaterial.uniforms;
      a.uVelocity!.value = this.velocity.read.texture;
      a.uSource!.value = this.velocity.read.texture;
      a.uKeep!.value = [1, 1, 1, 1];
      a.uDtOverH!.value = dt / this.grid.cell;
      this.draw(this.advectMaterial, this.velocity.write);
      this.swap(this.velocity);
      this.maccormack(
        this.velocity.read.texture,
        this.scalars,
        dt,
        [settings.smokeKeep ** dt, settings.heatKeep ** dt, 1, 1],
        SPONGE_RATE * dt
      );

      this.curlMaterial.uniforms.uVelocity!.value = this.velocity.read.texture;
      this.draw(this.curlMaterial, this.curl);
      const f = this.forcesMaterial.uniforms;
      f.uVelocity!.value = this.velocity.read.texture;
      f.uCurl!.value = this.curl.texture;
      f.uScalars!.value = this.scalars.read.texture;
      f.uDt!.value = dt;
      // The curl is in m/s per cell, which already carries the cell size.
      f.uConfinement!.value = settings.confinement;
      f.uLift!.value = settings.lift;
      f.uWeight!.value = settings.weight;
      f.uKeep!.value = settings.airKeep ** dt;
      this.draw(this.forcesMaterial, this.velocity.write);
      this.swap(this.velocity);

      this.project();
    });
  }

  /** Moves `field` along `velocity` for one step, with error correction. */
  private maccormack(
    velocity: Texture,
    field: Field,
    dt: number,
    keep: number[],
    sponge: number
  ): void {
    const h = this.grid.cell;
    const a = this.advectMaterial.uniforms;
    a.uVelocity!.value = velocity;
    a.uKeep!.value = [1, 1, 1, 1];
    a.uDtOverH!.value = dt / h;
    a.uSource!.value = field.read.texture;
    this.draw(this.advectMaterial, this.forward);
    a.uDtOverH!.value = -dt / h;
    a.uSource!.value = this.forward.texture;
    this.draw(this.advectMaterial, this.backward);
    const m = this.maccormackMaterial.uniforms;
    m.uVelocity!.value = velocity;
    m.uSource!.value = field.read.texture;
    m.uForward!.value = this.forward.texture;
    m.uBackward!.value = this.backward.texture;
    m.uDtOverH!.value = dt / h;
    m.uKeep!.value = keep;
    m.uSponge!.value = sponge;
    m.uSideBand!.value = Math.max(3, Math.min(this.grid.size[0], this.grid.size[2]) * 0.15);
    m.uTopBand!.value = Math.max(4, this.grid.size[1] * 0.2);
    this.draw(this.maccormackMaterial, field.write);
    this.swap(field);
  }

  /** Light reaching each cell along `direction` (world, toward the light). */
  updateLight(direction: Vector3, extinctionPerMetre: number): void {
    const u = this.lightMaterial.uniforms;
    const stepCells = 1.5;
    (u.uLightStep!.value as Vector3).copy(direction).normalize().multiplyScalar(stepCells);
    u.uExtinctionPerStep!.value = extinctionPerMetre * stepCells * this.grid.cell;
    u.uScalars!.value = this.scalars.read.texture;
    this.withTargets(() => this.draw(this.lightMaterial, this.light));
  }

  /** Slides everything by whole cells; positive moves the box that way. */
  shift(cells: Vector3): void {
    if (cells.lengthSq() === 0) return;
    (this.shiftMaterial.uniforms.uOffset!.value as Vector3).copy(cells);
    this.withTargets(() => {
      for (const field of [this.velocity, this.scalars, this.pressure]) {
        this.shiftMaterial.uniforms.uSource!.value = field.read.texture;
        this.draw(this.shiftMaterial, field.write);
        this.swap(field);
      }
    });
    this.origin.addScaledVector(cells, this.grid.cell);
  }

  clear(): void {
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.savedClear);
    renderer.setClearColor(0x000000, 0);
    for (const t of [
      this.velocity.read,
      this.velocity.write,
      this.scalars.read,
      this.scalars.write,
      this.pressure.read,
      this.pressure.write,
      this.divergence,
      this.curl,
      this.forward,
      this.backward,
    ]) {
      renderer.setRenderTarget(t);
      renderer.clear(true, false, false);
    }
    renderer.setClearColor(0xffffff, 1);
    renderer.setRenderTarget(this.light);
    renderer.clear(true, false, false);
    renderer.setClearColor(this.savedClear, alpha);
    renderer.setRenderTarget(previous);
  }

  /** Reads the smoke back to the CPU. Slow: labs and tests only. */
  read(): SmokeFluidReadback3D {
    const { width, height } = this.scalars.read;
    const halves = new Uint16Array(width * height * 4);
    this.renderer.readRenderTargetPixels(this.scalars.read, 0, 0, width, height, halves);
    const speeds = new Uint16Array(width * height * 4);
    this.renderer.readRenderTargetPixels(this.velocity.read, 0, 0, width, height, speeds);
    const [nx, ny, nz] = this.grid.size;
    let total = 0;
    let max = 0;
    let occupied = 0;
    let speed = 0;
    const centroid = new Vector3();
    for (let k = 0; k < nz; k++) {
      const row = Math.floor(k / this.columns);
      const column = k - row * this.columns;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const at = ((row * ny + j) * width + column * nx + i) * 4;
          const d = DataUtils.fromHalfFloat(halves[at]!);
          if (d <= 0) continue;
          total += d;
          max = Math.max(max, d);
          if (d > 0.02) occupied++;
          centroid.x += d * (i + 0.5);
          centroid.y += d * (j + 0.5);
          centroid.z += d * (k + 0.5);
          speed +=
            d *
            Math.hypot(
              DataUtils.fromHalfFloat(speeds[at]!),
              DataUtils.fromHalfFloat(speeds[at + 1]!),
              DataUtils.fromHalfFloat(speeds[at + 2]!)
            );
        }
      }
    }
    return {
      total,
      max,
      occupied,
      centroid: total > 0 ? centroid.divideScalar(total) : null,
      speed: total > 0 ? speed / total : 0,
    };
  }

  dispose(): void {
    for (const t of [
      this.velocity.read,
      this.velocity.write,
      this.scalars.read,
      this.scalars.write,
      this.pressure.read,
      this.pressure.write,
      this.divergence,
      this.curl,
      this.forward,
      this.backward,
      this.light,
    ])
      t.dispose();
    for (const m of [
      this.splatMaterial,
      this.advectMaterial,
      this.maccormackMaterial,
      this.curlMaterial,
      this.forcesMaterial,
      this.divergenceMaterial,
      this.jacobiMaterial,
      this.gradientMaterial,
      this.lightMaterial,
      this.shiftMaterial,
    ])
      m.dispose();
    this.quad.dispose();
  }

  private splat(splats: readonly SmokeFluidSplat3D[]): void {
    const count = Math.min(splats.length, SMOKE_FLUID_MAX_SOURCES);
    if (count === 0) return;
    const u = this.splatMaterial.uniforms;
    u.uCount!.value = count;
    // Smoke and heat.
    for (let i = 0; i < count; i++) {
      const s = splats[i]!;
      this.starts[i]!.copy(s.start);
      this.ends[i]!.copy(s.end);
      this.radii[i] = s.radius;
      this.values[i]!.set(s.smoke, s.heat, 0, 0);
    }
    u.uBlend!.value = 0;
    u.uField!.value = this.scalars.read.texture;
    this.draw(this.splatMaterial, this.scalars.write);
    this.swap(this.scalars);
    // The air the heads push.
    for (let i = 0; i < count; i++) {
      const s = splats[i]!;
      this.radii[i] = s.radius * 1.4;
      this.values[i]!.set(s.velocity.x, s.velocity.y, s.velocity.z, s.drag);
    }
    u.uBlend!.value = 1;
    u.uField!.value = this.velocity.read.texture;
    this.draw(this.splatMaterial, this.velocity.write);
    this.swap(this.velocity);
  }

  private project(): void {
    this.divergenceMaterial.uniforms.uVelocity!.value = this.velocity.read.texture;
    this.draw(this.divergenceMaterial, this.divergence);
    const j = this.jacobiMaterial.uniforms;
    j.uDivergence!.value = this.divergence.texture;
    for (let i = 0; i < this.grid.iterations; i++) {
      j.uPressure!.value = this.pressure.read.texture;
      this.draw(this.jacobiMaterial, this.pressure.write);
      this.swap(this.pressure);
    }
    const g = this.gradientMaterial.uniforms;
    g.uPressure!.value = this.pressure.read.texture;
    g.uVelocity!.value = this.velocity.read.texture;
    this.draw(this.gradientMaterial, this.velocity.write);
    this.swap(this.velocity);
  }

  private draw(material: ShaderMaterial, target: WebGLRenderTarget): void {
    this.renderer.setRenderTarget(target);
    this.quad.material = material;
    this.quad.render(this.renderer);
  }

  private swap(field: Field): void {
    const read = field.read;
    field.read = field.write;
    field.write = read;
  }

  /** Runs passes without disturbing the frame being drawn. */
  private withTargets(run: () => void): void {
    const renderer = this.renderer;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const xr = renderer.xr.enabled;
    renderer.autoClear = false;
    renderer.xr.enabled = false;
    try {
      run();
    } finally {
      renderer.xr.enabled = xr;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }
}
