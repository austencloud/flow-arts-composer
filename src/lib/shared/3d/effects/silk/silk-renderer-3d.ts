import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Mesh,
  type Object3D,
} from "three";
import {
  isTrackedTip,
  type SilkTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import type { Silk3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import { createStudioMap } from "../studio-map-3d";
import {
  SILK_CLOTH_COLUMNS,
  SILK_CLOTH_ROWS,
  SILK_CLOTH_VERTICES,
  SilkCloth3D,
  type SilkClothSettings,
} from "./silk-cloth-3d";
import {
  createSilkClothMaterial3D,
  resolveSilkFabricProfile3D,
} from "./silk-cloth-material-3d";

const STREAMERS = 16;
const QUADS = (SILK_CLOTH_ROWS - 1) * (SILK_CLOTH_COLUMNS - 1);
const INDICES_PER_STREAMER = QUADS * 6;
/** A tip that jumps further than this in one frame starts a fresh streamer. */
const TELEPORT_DISTANCE = 0.5;
/** Seconds a let-go streamer takes to fall and fade out. */
const RELEASE_SECONDS = 1.2;

interface SilkState {
  cloth: SilkCloth3D;
  params: Silk3DParams;
  propColor: string | undefined;
  floorY: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  seenEpoch: number;
  /** 0 while held, rising to 1 as a let-go streamer fades. */
  released: number;
  /** 0 to 1 as a new streamer fades in. */
  grown: number;
}

export function resolveSilkSourceEnergyScale(sourceCount: number): number {
  return Math.min(1, Math.pow(2 / Math.max(1, sourceCount), 0.72));
}

/** Cloth vertices each streamer gets when `sourceCount` share the buffers. */
export function resolveSilkSourceSampleBudget(sourceCount: number): number {
  return Math.max(2, Math.floor((STREAMERS * SILK_CLOTH_VERTICES) / Math.max(1, sourceCount)));
}

/** Streamer shape from the user's settings. */
export function resolveSilkClothSettings(params: Silk3DParams): SilkClothSettings {
  return {
    length: 0.6 + 1.4 * clamp01(params.duration),
    width: params.baseHalfWidthWorld * 0.8,
    flutter: clamp01(params.flutter),
    tautness: clamp01(params.tautness),
  };
}

export class SilkRenderer3D {
  private readonly geometry = new BufferGeometry();
  private readonly position = dynamic(3);
  private readonly normal = dynamic(3);
  private readonly color = dynamic(3);
  private readonly sheen = dynamic(3);
  private readonly fabric = dynamic(4);
  private readonly look = dynamic(2);
  private readonly studioMap = createStudioMap();
  private readonly material = createSilkClothMaterial3D(this.studioMap);
  private readonly mesh = new Mesh(this.geometry, this.material);
  private readonly states = new Map<number, SilkState>();
  private readonly body = new Color();
  private readonly bodyAlt = new Color();
  private readonly edge = new Color();
  private readonly edgeAlt = new Color();
  private readonly prop = new Color();
  private readonly mixed = new Color();
  private parent: Object3D | null = null;
  private epoch = 0;
  private nextSeed = 1;

  constructor() {
    const uv = new Float32Array(STREAMERS * SILK_CLOTH_VERTICES * 2);
    const index = new Uint32Array(STREAMERS * INDICES_PER_STREAMER);
    let cursor = 0;
    for (let slot = 0; slot < STREAMERS; slot++) {
      const base = slot * SILK_CLOTH_VERTICES;
      for (let row = 0; row < SILK_CLOTH_ROWS; row++) {
        for (let column = 0; column < SILK_CLOTH_COLUMNS; column++) {
          const i = (base + row * SILK_CLOTH_COLUMNS + column) * 2;
          uv[i] = column / (SILK_CLOTH_COLUMNS - 1);
          uv[i + 1] = row / (SILK_CLOTH_ROWS - 1);
        }
      }
      for (let row = 0; row < SILK_CLOTH_ROWS - 1; row++) {
        for (let column = 0; column < SILK_CLOTH_COLUMNS - 1; column++) {
          const a = base + row * SILK_CLOTH_COLUMNS + column;
          const b = a + 1;
          const c = a + SILK_CLOTH_COLUMNS;
          const d = c + 1;
          index[cursor++] = a;
          index[cursor++] = c;
          index[cursor++] = b;
          index[cursor++] = b;
          index[cursor++] = c;
          index[cursor++] = d;
        }
      }
    }
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.setAttribute("position", this.position);
    this.geometry.setAttribute("normal", this.normal);
    this.geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    this.geometry.setAttribute("color", this.color);
    this.geometry.setAttribute("aSheen", this.sheen);
    this.geometry.setAttribute("aFabric", this.fabric);
    this.geometry.setAttribute("aLook", this.look);
    this.geometry.setDrawRange(0, 0);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 108;
    this.mesh.visible = false;
  }

  initialize(parent: Object3D): void {
    if (this.parent === parent) return;
    this.parent?.remove(this.mesh);
    this.parent = parent;
    parent.add(this.mesh);
  }

  update(sources: readonly SilkTipSource3D[], delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 15);
    this.epoch++;
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      const settings = resolveSilkClothSettings(source.params);
      const pin = source.position;
      let state = this.states.get(source.sourceId);
      if (!state) {
        if (this.states.size >= STREAMERS) continue;
        state = {
          cloth: new SilkCloth3D(this.nextSeed++),
          params: source.params,
          propColor: source.propColor,
          floorY: source.collisionFloorY,
          lastX: pin.x,
          lastY: pin.y,
          lastZ: pin.z,
          seenEpoch: this.epoch,
          released: 0,
          grown: 0,
        };
        this.states.set(source.sourceId, state);
      }
      const jump = Math.hypot(pin.x - state.lastX, pin.y - state.lastY, pin.z - state.lastZ);
      state.params = source.params;
      state.propColor = source.propColor;
      state.floorY = Number.isFinite(source.collisionFloorY) ? source.collisionFloorY : -1e6;
      state.seenEpoch = this.epoch;
      state.released = 0;
      if (!state.cloth.isStarted || jump > TELEPORT_DISTANCE) {
        const v = source.velocity;
        state.cloth.reset(pin, { x: -v.x, y: -v.y, z: -v.z }, settings);
        state.grown = 0;
      } else {
        state.cloth.step(pin, dt, settings, state.floorY);
      }
      state.grown = Math.min(1, state.grown + dt / 0.25);
      state.lastX = pin.x;
      state.lastY = pin.y;
      state.lastZ = pin.z;
    }

    for (const [sourceId, state] of this.states) {
      if (state.seenEpoch === this.epoch) continue;
      state.released += dt / RELEASE_SECONDS;
      if (state.released >= 1) {
        this.states.delete(sourceId);
        continue;
      }
      state.cloth.step(null, dt, resolveSilkClothSettings(state.params), state.floorY);
    }

    const energy = resolveSilkSourceEnergyScale(this.states.size);
    let slot = 0;
    for (const state of this.states.values()) {
      this.write(slot++, state, energy);
    }
    for (const attribute of [
      this.position,
      this.normal,
      this.color,
      this.sheen,
      this.fabric,
      this.look,
    ]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, slot * SILK_CLOTH_VERTICES * attribute.itemSize);
      attribute.needsUpdate = slot > 0;
    }
    this.geometry.setDrawRange(0, slot * INDICES_PER_STREAMER);
    this.mesh.visible = slot > 0;
  }

  private write(slot: number, state: SilkState, energy: number): void {
    const { cloth, params } = state;
    const palette = params.resolvedPalette;
    const profile = resolveSilkFabricProfile3D(palette.id);
    this.body.set(palette.body);
    this.bodyAlt.set(palette.hueShift ? (palette.bodyAlt ?? palette.body) : palette.body);
    this.edge.set(palette.edge);
    this.edgeAlt.set(palette.hueShift ? (palette.edgeAlt ?? palette.edge) : palette.edge);
    this.prop.set(state.propColor ?? palette.body);
    this.body.lerp(this.prop, profile.identityMix);
    this.bodyAlt.lerp(this.prop, profile.identityMix);
    const edgeMix = Math.min(0.42, profile.identityMix + 0.08);
    this.edge.lerp(this.prop, edgeMix);
    this.edgeAlt.lerp(this.prop, edgeMix);
    const opacity =
      Math.min(0.97, 0.25 + 1.1 * clamp01(params.intensity)) *
      (0.85 + 0.15 * energy) *
      smooth(state.grown) *
      (1 - smooth(state.released));
    const glow = palette.emissive ? 0.2 + 0.35 * clamp01(params.intensity) : 0;
    const p = cloth.positions;
    const n = cloth.normals;
    const base = slot * SILK_CLOTH_VERTICES;
    const position = this.position.array as Float32Array;
    const normal = this.normal.array as Float32Array;
    const color = this.color.array as Float32Array;
    const sheen = this.sheen.array as Float32Array;
    const fabric = this.fabric.array as Float32Array;
    const look = this.look.array as Float32Array;
    position.set(p, base * 3);
    normal.set(n, base * 3);
    for (let row = 0; row < SILK_CLOTH_ROWS; row++) {
      const along = row / (SILK_CLOTH_ROWS - 1);
      // Burning silk runs from flame yellow at the tip to deep orange in the tail.
      if (palette.emissive) this.mixed.copy(this.edge).lerp(this.body, Math.sqrt(along));
      else this.mixed.copy(this.body).lerp(this.bodyAlt, along);
      const r = this.mixed.r;
      const g = this.mixed.g;
      const b = this.mixed.b;
      this.mixed.copy(this.edge).lerp(this.edgeAlt, along);
      // The tail thins and dissolves; the head stays solid where it is tied.
      const tail = 1 - 0.9 * smooth((along - 0.7) / 0.3);
      for (let column = 0; column < SILK_CLOTH_COLUMNS; column++) {
        const v = base + row * SILK_CLOTH_COLUMNS + column;
        color[v * 3] = r;
        color[v * 3 + 1] = g;
        color[v * 3 + 2] = b;
        sheen[v * 3] = this.mixed.r;
        sheen[v * 3 + 1] = this.mixed.g;
        sheen[v * 3 + 2] = this.mixed.b;
        fabric[v * 4] = profile.roughness;
        fabric[v * 4 + 1] = profile.sheen;
        fabric[v * 4 + 2] = profile.translucency;
        fabric[v * 4 + 3] = profile.metalness;
        look[v * 2] = opacity * tail;
        look[v * 2 + 1] = glow * tail;
      }
    }
  }

  clear(): void {
    this.states.clear();
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.mesh);
    this.parent = null;
    this.geometry.dispose();
    this.material.dispose();
    this.studioMap.dispose();
  }
}

function dynamic(itemSize: number): BufferAttribute {
  const attribute = new BufferAttribute(
    new Float32Array(STREAMERS * SILK_CLOTH_VERTICES * itemSize),
    itemSize
  );
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
