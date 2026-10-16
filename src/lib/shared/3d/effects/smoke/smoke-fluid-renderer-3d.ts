import {
  BoxGeometry,
  type Camera,
  Mesh,
  type Object3D,
  Vector3,
  Vector4,
  type WebGLRenderer,
} from "three";
import type { Smoke3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import {
  getSceneColorSnapshot3D,
  requestSceneColorSnapshot3D,
} from "../post-processing/scene-color-snapshot-3d";
import {
  isTrackedTip,
  type SmokeTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import { QualityTier } from "../types";
import {
  SMOKE_FLUID_MAX_SOURCES,
  SmokeFluidDomain3D,
  type SmokeFluidGrid3D,
  type SmokeFluidReadback3D,
  type SmokeFluidSplat3D,
  type SmokeFluidStep3D,
} from "./smoke-fluid-domain-3d";
import {
  SMOKE_FLUID_LIGHT_DIRECTION,
  createSmokeFluidMaterial3D,
  type SmokeFluidMaterial3D,
} from "./smoke-fluid-material-3d";

/**
 * A performer's smoke box, about 3.6 m across and 3.4 m tall: a spinning staff
 * reaches 1.3 m from the hands whichever way the performer faces.
 */
export const SMOKE_FLUID_GRIDS: Record<
  QualityTier.HIGH | QualityTier.MEDIUM,
  SmokeFluidGrid3D
> = {
  [QualityTier.HIGH]: { size: [112, 104, 108], cell: 0.033, iterations: 24 },
  [QualityTier.MEDIUM]: { size: [76, 70, 74], cell: 0.048, iterations: 18 },
};
export const SMOKE_FLUID_MAX_DOMAINS = 4;
export const SMOKE_FLUID_STEP = 1 / 45;
const MAX_STEPS_PER_FRAME = 3;
/** The box follows its performer once they drift this far from its middle. */
const RECENTRE_DISTANCE = 0.3;
/** Dense smoke a still prop head gives off, m^3 per second. */
const AMBIENT_OUTPUT = 0.0035;
/** Extra a head moving at the reference speed gives off, m^3 per second. */
const MOTION_OUTPUT = 0.006;
/** Widest smoke a head gives off, metres of radius. */
const MAX_NOZZLE = 0.11;
/** How strongly a head drags the air at its core, per step. */
const HEAD_DRAG = 0.12;

export interface SmokeFluidDiagnostic3D extends SmokeFluidReadback3D {
  domains: number;
  /** Smoke centroid in world space. */
  centroidWorld: Vector3 | null;
  steps: number;
}

interface Tip {
  previous: Vector3;
  current: Vector3;
  velocity: Vector3;
}

interface Rig {
  id: number;
  domain: SmokeFluidDomain3D;
  mesh: Mesh;
  material: SmokeFluidMaterial3D;
  tips: Map<string, Tip>;
  params: Smoke3DParams | null;
  /** Seconds since the rig last had a source. */
  idle: number;
  pending: number;
}

function rigIdForSource(sourceId: number): number {
  return Math.floor(Math.max(0, sourceId - 1) / 4);
}

/**
 * Physical settings for one step, from the palette and the user's sliders.
 * Exported so the numbers can be tested without a GPU.
 */
export function resolveSmokeFluidStep3D(
  params: Smoke3DParams,
  dt: number
): SmokeFluidStep3D {
  const profile = params.volumeProfile;
  return {
    dt,
    smokeKeep: Math.max(0.05, 1 - profile.dissipation),
    heatKeep: 0.45,
    airKeep: 0.6,
    // Past about 1.5 the eddies break into grid-sized grain.
    confinement: Math.min(1.5, (0.7 + 2 * params.resolvedCurlStrength) * profile.vorticity),
    // A puff at full heat climbs at about the rise setting.
    lift: 5 + 22 * params.resolvedRiseSpeed,
    // Cool smoke (fog) is heavier than the air around it and settles.
    weight: 30 * Math.max(0, 0.35 - params.resolvedPalette.warmth),
  };
}

/** Smoke given off per second by one head, dense-smoke m^3. */
export function resolveSmokeFluidOutput3D(
  params: Smoke3DParams,
  speed: number
): number {
  const motion = Math.min(1, speed / Math.max(0.1, params.motionReferenceSpeed));
  return (
    params.volumeProfile.density *
    (0.4 + 0.6 * params.intensity) *
    (params.ambientEmission * AMBIENT_OUTPUT + params.motionEmission * motion * MOTION_OUTPUT)
  );
}

/**
 * Smoke as a fluid: each performer gets a box of air simulated on the GPU,
 * their prop heads give off smoke and heat and drag the air as they move, and
 * the box is ray marched in the scene.
 */
export class SmokeFluidRenderer3D {
  private static readonly diagnosticListeners = new Set<
    (snapshot: SmokeFluidDiagnostic3D) => void
  >();

  /**
   * Review pages listen here. Reading the grid back stalls the GPU, so it
   * only happens while someone listens, a few times a second.
   */
  static observeDiagnostics(listener: (snapshot: SmokeFluidDiagnostic3D) => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  private readonly renderer: WebGLRenderer;
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly rigs = new Map<number, Rig>();
  private readonly spare: SmokeFluidDomain3D[] = [];
  private readonly overflow: SmokeTipSource3D[] = [];
  private readonly viewport = new Vector4();
  private readonly scratch = new Vector3();
  private readonly mean = new Vector3();
  private readonly splats: SmokeFluidSplat3D[] = Array.from(
    { length: SMOKE_FLUID_MAX_SOURCES },
    () => ({
      start: new Vector3(),
      end: new Vector3(),
      radius: 1,
      smoke: 0,
      heat: 0,
      velocity: new Vector3(),
      drag: 0,
    })
  );
  private parent: Object3D | null = null;
  private clock = 0;
  private steps = 0;
  private lastDiagnostic = 0;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
  }

  initialize(parent: Object3D): void {
    if (this.parent === parent) return;
    for (const rig of this.rigs.values()) {
      this.parent?.remove(rig.mesh);
      parent.add(rig.mesh);
    }
    this.parent = parent;
  }

  /**
   * Simulates the tracked tips; returns the sources of performers past the
   * domain budget so the caller can draw them another way.
   */
  update(sources: readonly SmokeTipSource3D[], delta: number): readonly SmokeTipSource3D[] {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    this.clock += dt;
    this.overflow.length = 0;
    const seen = new Set<number>();
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      const id = rigIdForSource(source.sourceId);
      const rig = this.rigs.get(id) ?? this.addRig(id, source);
      if (!rig) {
        this.overflow.push(source);
        continue;
      }
      if (!seen.has(id)) {
        seen.add(id);
        rig.idle = 0;
        rig.params = source.params;
        for (const tip of rig.tips.values()) tip.previous.copy(tip.current);
      }
      const key = `${source.sourceId}`;
      let tip = rig.tips.get(key);
      const p = source.position;
      if (!tip) {
        tip = {
          previous: new Vector3(p.x, p.y, p.z),
          current: new Vector3(p.x, p.y, p.z),
          velocity: new Vector3(),
        };
        rig.tips.set(key, tip);
      }
      tip.current.set(p.x, p.y, p.z);
      tip.velocity.set(source.velocity.x, source.velocity.y, source.velocity.z);
    }

    for (const rig of [...this.rigs.values()]) {
      if (!seen.has(rig.id)) {
        rig.idle += dt;
        rig.tips.clear();
        const lifetime = rig.params?.lifetimeSeconds ?? 4;
        if (rig.idle > lifetime * 2 + 2) {
          this.removeRig(rig);
          continue;
        }
      } else {
        this.follow(rig);
      }
      this.simulate(rig, dt);
    }
    const listeners = SmokeFluidRenderer3D.diagnosticListeners;
    if (listeners.size > 0 && this.clock - this.lastDiagnostic > 0.25) {
      this.lastDiagnostic = this.clock;
      const snapshot = this.getDebugSnapshot();
      if (snapshot) for (const listener of listeners) listener(snapshot);
    }
    return this.overflow;
  }

  getDebugSnapshot(): SmokeFluidDiagnostic3D | null {
    const rig = this.rigs.values().next().value as Rig | undefined;
    if (!rig) return null;
    const read = rig.domain.read();
    const centroidWorld = read.centroid
      ? read.centroid.clone().multiplyScalar(rig.domain.grid.cell).add(rig.domain.origin)
      : null;
    return { ...read, domains: this.rigs.size, centroidWorld, steps: this.steps };
  }

  clear(): void {
    for (const rig of [...this.rigs.values()]) this.removeRig(rig);
  }

  dispose(): void {
    this.clear();
    for (const domain of this.spare) domain.dispose();
    this.spare.length = 0;
    this.geometry.dispose();
    this.parent = null;
  }

  private addRig(id: number, source: SmokeTipSource3D): Rig | null {
    if (this.rigs.size >= SMOKE_FLUID_MAX_DOMAINS) return null;
    const grid =
      SMOKE_FLUID_GRIDS[source.qualityTier === QualityTier.HIGH ? QualityTier.HIGH : QualityTier.MEDIUM];
    const reuse = this.spare.findIndex((domain) => domain.grid === grid);
    const domain =
      reuse >= 0 ? this.spare.splice(reuse, 1)[0]! : new SmokeFluidDomain3D(this.renderer, grid);
    domain.clear();
    const extent = domain.extent(this.scratch);
    // Floor to the top of the box, centred on the performer.
    domain.origin.set(
      source.position.x - extent.x / 2,
      source.collisionFloorY ?? 0,
      source.position.z - extent.z / 2
    );
    this.snapOrigin(domain);
    const material = createSmokeFluidMaterial3D();
    const mesh = new Mesh(this.geometry, material);
    mesh.name = "smoke-fluid-3d";
    mesh.frustumCulled = false;
    mesh.renderOrder = 101;
    mesh.onBeforeRender = (renderer, _scene, camera) => this.bindScene(renderer, camera, material);
    const rig: Rig = { id, domain, mesh, material, tips: new Map(), params: null, idle: 0, pending: 0 };
    this.place(rig);
    this.parent?.add(mesh);
    this.rigs.set(id, rig);
    return rig;
  }

  private removeRig(rig: Rig): void {
    this.parent?.remove(rig.mesh);
    rig.material.dispose();
    this.spare.push(rig.domain);
    this.rigs.delete(rig.id);
  }

  /** Keeps the origin on whole cells so recentring never resamples. */
  private snapOrigin(domain: SmokeFluidDomain3D): void {
    const h = domain.grid.cell;
    domain.origin.x = Math.round(domain.origin.x / h) * h;
    domain.origin.z = Math.round(domain.origin.z / h) * h;
  }

  private follow(rig: Rig): void {
    if (rig.tips.size === 0) return;
    this.mean.set(0, 0, 0);
    for (const tip of rig.tips.values()) this.mean.add(tip.current);
    this.mean.divideScalar(rig.tips.size);
    const domain = rig.domain;
    const extent = domain.extent(this.scratch);
    const h = domain.grid.cell;
    const dx = this.mean.x - (domain.origin.x + extent.x / 2);
    const dz = this.mean.z - (domain.origin.z + extent.z / 2);
    if (Math.abs(dx) < RECENTRE_DISTANCE && Math.abs(dz) < RECENTRE_DISTANCE) return;
    domain.shift(new Vector3(Math.round(dx / h), 0, Math.round(dz / h)));
    this.place(rig);
  }

  private place(rig: Rig): void {
    const extent = rig.domain.extent(this.scratch);
    rig.mesh.scale.copy(extent);
    rig.mesh.position.copy(rig.domain.origin).addScaledVector(extent, 0.5);
    const u = rig.material.uniforms;
    u.uMin.value.copy(rig.domain.origin);
    u.uGrid.value.set(...rig.domain.grid.size);
    u.uColumns.value = rig.domain.columns;
    u.uAtlas.value.copy(rig.domain.atlas);
    u.uCell.value = rig.domain.grid.cell;
  }

  private simulate(rig: Rig, dt: number): void {
    const params = rig.params;
    if (!params) return;
    rig.pending = Math.min(rig.pending + dt, SMOKE_FLUID_STEP * MAX_STEPS_PER_FRAME);
    const count = Math.floor(rig.pending / SMOKE_FLUID_STEP + 1e-6);
    if (count > 0) {
      const settings = resolveSmokeFluidStep3D(params, SMOKE_FLUID_STEP);
      for (let n = 0; n < count; n++) {
        this.emit(rig, params, n / count, (n + 1) / count);
        rig.domain.step(this.splats.slice(0, rig.tips.size), settings);
        this.steps++;
      }
      rig.pending -= count * SMOKE_FLUID_STEP;
      const profile = params.volumeProfile;
      rig.domain.updateLight(SMOKE_FLUID_LIGHT_DIRECTION, this.extinction(params) * 0.75);
      const u = rig.material.uniforms;
      u.uSmoke.value = rig.domain.smokeTexture;
      u.uLight.value = rig.domain.lightTexture;
      u.uExtinction.value = this.extinction(params);
      u.uAlbedo.value = 0.45 + 0.55 * profile.scattering;
      u.uCore.value.set(params.resolvedPalette.core);
      u.uEdge.value.set(params.resolvedPalette.edge);
      u.uHueShift.value = profile.hueShift;
    }
    rig.material.uniforms.uTime.value = this.clock;
    rig.mesh.visible = true;
  }

  /** Light lost per metre through smoke of density 1. */
  private extinction(params: Smoke3DParams): number {
    return params.volumeProfile.extinction * 5;
  }

  /** This step's capsule from each head, from `from` to `to` of the frame. */
  private emit(rig: Rig, params: Smoke3DParams, from: number, to: number): void {
    const domain = rig.domain;
    const h = domain.grid.cell;
    const origin = domain.origin;
    // A wide nozzle reads as one soft ball in a fluid; fog gets its spread
    // from sinking and rolling out along the floor instead.
    const nozzle = Math.min(params.volumeProfile.injectionRadiusWorld, MAX_NOZZLE);
    const radius = Math.max(1, (nozzle * (0.7 + 0.6 * params.intensity)) / h);
    let i = 0;
    for (const tip of rig.tips.values()) {
      if (i >= SMOKE_FLUID_MAX_SOURCES) break;
      const s = this.splats[i++]!;
      s.start.lerpVectors(tip.previous, tip.current, from).sub(origin).divideScalar(h);
      s.end.lerpVectors(tip.previous, tip.current, to).sub(origin).divideScalar(h);
      s.radius = radius;
      // Spread this step's smoke over the capsule it sweeps, so a fast head
      // leaves a thinner trail rather than more smoke.
      const length = s.start.distanceTo(s.end);
      const volumeCells = Math.PI * radius * radius * length + Math.PI ** 1.5 * radius ** 3;
      const output = resolveSmokeFluidOutput3D(params, tip.velocity.length());
      s.smoke = (output * SMOKE_FLUID_STEP) / (volumeCells * h * h * h);
      s.heat = s.smoke * params.resolvedPalette.warmth * 1.6;
      s.velocity.copy(tip.velocity);
      s.drag = HEAD_DRAG;
    }
  }

  private bindScene(renderer: WebGLRenderer, camera: Camera, material: SmokeFluidMaterial3D): void {
    requestSceneColorSnapshot3D(renderer);
    renderer.getCurrentViewport(this.viewport);
    const u = material.uniforms;
    u.uViewport.value.copy(this.viewport);
    const snapshot = getSceneColorSnapshot3D(renderer);
    u.uSceneDepth.value = snapshot?.depthTexture ?? null;
    u.uSceneDepthReady.value = snapshot?.depthTexture == null ? 0 : 1;
    const depthCamera = camera as Camera & { near?: number; far?: number };
    u.uCameraNear.value = depthCamera.near ?? 0.1;
    u.uCameraFar.value = depthCamera.far ?? 1000;
  }
}
