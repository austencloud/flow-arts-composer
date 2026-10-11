import { Mesh, type Object3D } from "three";
import { BoundedSourcePath3D } from "../scene-effects/bounded-source-path-3d";
import {
  isTrackedTip,
  type SilkTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import type { Silk3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import {
  SilkRibbonGeometry3D,
  type SilkRibbonFrame3D,
} from "./silk-ribbon-geometry-3d";
import { createSilkRibbonMaterial3D } from "./silk-ribbon-material-3d";

const SAMPLE_CAPACITY = 6144;
const PATH_CAPACITY = 320;

interface SilkState extends SilkRibbonFrame3D {
  path: BoundedSourcePath3D;
  params: Silk3DParams;
  lastSeen: number;
  seenEpoch: number;
}

export function resolveSilkSourceEnergyScale(sourceCount: number): number {
  return Math.min(1, Math.pow(2 / Math.max(1, sourceCount), 0.72));
}

export function resolveSilkSourceSampleBudget(sourceCount: number): number {
  return Math.max(2, Math.floor(SAMPLE_CAPACITY / Math.max(1, sourceCount)));
}

export class SilkRenderer3D {
  private readonly ribbon = new SilkRibbonGeometry3D(SAMPLE_CAPACITY);
  private readonly fabricMaterial = createSilkRibbonMaterial3D();
  private readonly fabricMesh = new Mesh(
    this.ribbon.geometry,
    this.fabricMaterial
  );
  private readonly states = new Map<number, SilkState>();
  private parent: Object3D | null = null;
  private clock = 0;
  private epoch = 0;

  constructor() {
    this.fabricMesh.frustumCulled = false;
    this.fabricMesh.renderOrder = 108;
  }

  initialize(parent: Object3D): void {
    if (this.parent === parent) return;
    if (this.parent) {
      this.parent.remove(this.fabricMesh);
    }
    this.parent = parent;
    parent.add(this.fabricMesh);
  }

  update(sources: readonly SilkTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.clock += dt;
    this.epoch++;
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      let state = this.states.get(source.sourceId);
      if (!state) {
        state = {
          path: new BoundedSourcePath3D(PATH_CAPACITY),
          params: source.params,
          lastSeen: this.clock,
          seenEpoch: this.epoch,
          headSideX: 1,
          headSideY: 0,
          headSideZ: 0,
          hasHeadSide: false,
          propColor: source.propColor,
          dynamicPositions: new Float32Array(PATH_CAPACITY * 3),
          dynamicVelocities: new Float32Array(PATH_CAPACITY * 3),
          dynamicCount: 0,
          pathExtended: false,
        };
        this.states.set(source.sourceId, state);
      }
      state.params = source.params;
      state.propColor = source.propColor;
      state.lastSeen = this.clock;
      state.seenEpoch = this.epoch;
      const pathExtended = state.path.push(
        source.position,
        this.clock,
        source.speed,
        0.025
      );
      state.pathExtended ||= pathExtended;
    }

    const activeStates: SilkState[] = [];
    for (const [sourceId, state] of this.states) {
      state.path.trimBefore(this.clock - state.params.lifetimeSeconds);
      if (state.path.count >= 2) activeStates.push(state);
      if (
        state.seenEpoch !== this.epoch &&
        state.path.count === 0 &&
        this.clock - state.lastSeen > state.params.lifetimeSeconds
      ) {
        this.states.delete(sourceId);
      }
    }

    const energyScale = resolveSilkSourceEnergyScale(activeStates.length);
    const sampleBudget = resolveSilkSourceSampleBudget(activeStates.length);
    this.ribbon.beginFrame();
    for (const state of activeStates) {
      this.ribbon.writeRibbon(
        state.path,
        state.params,
        this.clock,
        state,
        energyScale,
        sampleBudget,
        dt
      );
    }
    this.ribbon.commit();
    // The ribbon mesh lives in the scene for the lifetime of the effects
    // manager, and frustumCulled is off, so an empty ribbon would still be
    // walked, bound, and issued as a zero-count draw every frame. Hiding it
    // when nothing was written takes it out of the render list entirely and
    // changes nothing on screen - the draw range is zero either way.
    this.fabricMesh.visible = this.ribbon.drawCount > 0;
  }

  clear(): void {
    this.states.clear();
    this.ribbon.clear();
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.fabricMesh);
    this.parent = null;
    this.ribbon.dispose();
    this.fabricMaterial.dispose();
  }
}
