import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  type ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { setLinearRgbFromHex, type MutableRgb } from "../instancing/particle-color";
import {
  isTrackedTip,
  type InkTipSource3D,
} from "../scene-effects/scene-effect-source-3d";
import type { Ink3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import {
  InkLiquidSim,
  inkDropShape,
  resolveInkLiquidSettings,
  sphereRadius,
  type InkLiquidTip,
} from "./ink-liquid-sim";
import {
  createInkLiquidMaterial3D,
  createInkStainMaterial3D,
} from "./ink-liquid-material-3d";

const PARCELS = 2400;
const STAINS = 900;
/** Sides around a strand. */
const SIDES = 8;
/** Drawn rings per simulated segment: the strand is smoothed between parcels. */
const SUB = 2;
const MAX_RINGS = 7000;
const MAX_VERTICES = MAX_RINGS * SIDES;
const DROPS = PARCELS + 64;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);
/** Stains sit this far above the stage so the floor never shows through. */
const STAIN_LIFT = 0.0015;
/** Strand nodes closer than this merge into one, in metres. */
const MIN_NODE_GAP = 0.008;

const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

interface Colors {
  pigment: MutableRgb;
  edge: MutableRgb;
  spray: MutableRgb;
}

/**
 * 3D Ink: liquid thrown off the prop tips (see ink-liquid-sim). Strands draw
 * as smoothed tubes as thick as the ink in them, loose drops as beads that
 * stretch with speed and ring after they form, and the stage keeps the
 * splats as stains that spread, then dry and fade.
 */
export class InkRenderer3D {
  private readonly sim = new InkLiquidSim(PARCELS, STAINS);
  private readonly tips: InkLiquidTip[] = [];
  private readonly materials = [createInkLiquidMaterial3D(), createInkLiquidMaterial3D(true)];
  private readonly stainMaterials = [createInkStainMaterial3D(), createInkStainMaterial3D(true)];

  private readonly strandGeometry = new BufferGeometry();
  private readonly strandPositions = new Float32Array(MAX_VERTICES * 3);
  private readonly strandNormals = new Float32Array(MAX_VERTICES * 3);
  private readonly strandPigments = new Float32Array(MAX_VERTICES * 3);
  private readonly strandEdges = new Float32Array(MAX_VERTICES * 3);
  private readonly strandAlphas = new Float32Array(MAX_VERTICES);
  private readonly strandWetness = new Float32Array(MAX_VERTICES).fill(1);
  private readonly strandIndices = new Uint32Array(MAX_RINGS * SIDES * 6);
  private readonly strandMesh: Mesh;

  private readonly dropGeometry = new SphereGeometry(1, 12, 9);
  private readonly dropMesh: InstancedMesh;
  private readonly stainGeometry = new CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  private readonly stainMesh: InstancedMesh;

  // One strand's centerline and its smoothed rings, reused.
  private readonly nodeX = new Float32Array(PARCELS + 2);
  private readonly nodeY = new Float32Array(PARCELS + 2);
  private readonly nodeZ = new Float32Array(PARCELS + 2);
  private readonly nodeR = new Float32Array(PARCELS + 2);
  private readonly ringX = new Float32Array(MAX_RINGS);
  private readonly ringY = new Float32Array(MAX_RINGS);
  private readonly ringZ = new Float32Array(MAX_RINGS);
  private readonly ringR = new Float32Array(MAX_RINGS);

  private readonly colors: Colors = {
    pigment: { right: 0, green: 0, left: 0 },
    edge: { right: 0, green: 0, left: 0 },
    spray: { right: 0, green: 0, left: 0 },
  };
  private readonly matrix = new Matrix4();
  private readonly orientation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly position = new Vector3();
  private readonly tangent = new Vector3();
  private readonly side = new Vector3();
  private readonly binormal = new Vector3();
  private readonly scratch = new Vector3();
  private paletteKey = "";
  private parent: Object3D | null = null;

  constructor() {
    const g = this.strandGeometry;
    g.setAttribute("position", this.dynamic(this.strandPositions, 3));
    g.setAttribute("normal", this.dynamic(this.strandNormals, 3));
    g.setAttribute("pigment", this.dynamic(this.strandPigments, 3));
    g.setAttribute("edge", this.dynamic(this.strandEdges, 3));
    g.setAttribute("alpha", this.dynamic(this.strandAlphas, 1));
    g.setAttribute("wetness", this.dynamic(this.strandWetness, 1));
    g.setIndex(new BufferAttribute(this.strandIndices, 1).setUsage(DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.strandMesh = new Mesh(g, this.materials[0]);
    this.strandMesh.frustumCulled = false;
    this.strandMesh.renderOrder = 104;
    this.strandMesh.visible = false;

    this.dropMesh = this.instanced(this.dropGeometry, DROPS, this.materials[0]!, 106);
    this.stainMesh = this.instanced(this.stainGeometry, STAINS, this.stainMaterials[0]!, 103);
  }

  initialize(parent: Object3D): void {
    if (this.parent === parent) return;
    this.parent?.remove(this.strandMesh, this.dropMesh, this.stainMesh);
    this.parent = parent;
    parent.add(this.stainMesh, this.strandMesh, this.dropMesh);
  }

  /** Live parcels, loose drops and stains, for tests and diagnostics. */
  debugCounts(): { parcels: number; drops: number; stains: number } {
    return {
      parcels: this.sim.liveCount,
      drops: this.dropMesh.count,
      stains: this.stainMesh.count,
    };
  }

  update(sources: readonly InkTipSource3D[], delta: number): void {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 1 / 15) : 0;
    let params: Ink3DParams | null = null;
    let floorY = Infinity;
    this.tips.length = 0;
    for (const source of sources) {
      if (!isTrackedTip(source.params.trackingMode, source.tipIndex)) continue;
      params = source.params;
      if (Number.isFinite(source.collisionFloorY)) {
        floorY = Math.min(floorY, source.collisionFloorY);
      }
      this.tips.push({
        key: source.sourceId,
        x: source.position.x,
        y: source.position.y,
        z: source.position.z,
      });
    }
    params ??= sources[0]?.params ?? null;
    if (!params) {
      if (this.sim.liveCount > 0) this.sim.clear();
      this.hide();
      return;
    }
    if (!Number.isFinite(floorY)) floorY = -Infinity;
    const palette = params.resolvedPalette;
    const settings = resolveInkLiquidSettings(params, {
      ambient: params.effectiveAmbient,
      stainSeconds: params.lifetimeSeconds,
      thickness: palette.watercolor ? 1.15 : palette.id === "sumi" ? 1.3 : 1,
    });
    this.sim.update(dt, this.tips, settings, floorY, floorY - 2);
    this.readPalette(params);
    const additive = params.emissiveMaterial ? 1 : 0;
    this.strandMesh.material = this.materials[additive]!;
    this.dropMesh.material = this.materials[additive]!;
    this.stainMesh.material = this.stainMaterials[additive]!;
    this.writeStrands(params.opacityMax);
    this.writeDrops(params.opacityMax, settings.flowRadius);
    this.writeStains(params.opacityMax);
  }

  clear(): void {
    this.sim.clear();
    this.hide();
  }

  dispose(): void {
    this.clear();
    this.parent?.remove(this.strandMesh, this.dropMesh, this.stainMesh);
    this.parent = null;
    this.strandGeometry.dispose();
    this.dropGeometry.dispose();
    this.stainGeometry.dispose();
    this.dropMesh.dispose();
    this.stainMesh.dispose();
    for (const material of [...this.materials, ...this.stainMaterials]) material.dispose();
  }

  private hide(): void {
    this.strandGeometry.setDrawRange(0, 0);
    this.strandMesh.visible = false;
    this.dropMesh.count = 0;
    this.dropMesh.visible = false;
    this.stainMesh.count = 0;
    this.stainMesh.visible = false;
  }

  private dynamic(array: Float32Array, size: number): BufferAttribute {
    return new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
  }

  private instanced(
    geometry: BufferGeometry,
    capacity: number,
    material: ShaderMaterial,
    renderOrder: number
  ): InstancedMesh {
    const attribute = (size: number, fill = 0) =>
      new InstancedBufferAttribute(new Float32Array(capacity * size).fill(fill), size).setUsage(
        DynamicDrawUsage
      );
    geometry.setAttribute("pigment", attribute(3));
    geometry.setAttribute("edge", attribute(3));
    geometry.setAttribute("alpha", attribute(1));
    geometry.setAttribute("wetness", attribute(1, 1));
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.count = 0;
    mesh.visible = false;
    return mesh;
  }

  private readPalette(params: Ink3DParams): void {
    const palette = params.resolvedPalette;
    const key = `${palette.pigment}|${palette.edge}|${palette.splatterTint}`;
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    setLinearRgbFromHex(this.colors.pigment, palette.pigment);
    setLinearRgbFromHex(this.colors.edge, palette.edge);
    setLinearRgbFromHex(this.colors.spray, palette.splatterTint);
  }

  private writeStrands(opacity: number): void {
    const sim = this.sim;
    let rings = 0;
    let indexCount = 0;
    for (let i = 0; i < sim.capacity; i++) {
      if (!sim.alive[i] || sim.newer[i]! >= 0) continue;
      const head = sim.isHead(i);
      if (!head && sim.older[i]! < 0) continue;

      // Centerline from the newest end (the tip, while tied) to the oldest.
      let nodes = 0;
      if (head) {
        const source = sim.sources[sim.owner[i]!]!;
        this.nodeX[nodes] = source.x;
        this.nodeY[nodes] = source.y;
        this.nodeZ[nodes] = source.z;
        this.nodeR[nodes] = sim.nodeRadius(i) * 0.7;
        nodes++;
      }
      for (let p = i; p >= 0; p = sim.older[p]!) {
        const r = sim.nodeRadius(p);
        // Ink that just left the tip still bunches within its own thickness;
        // those parcels add no shape, only kinks, so the tube skips them.
        if (nodes > 0 && sim.older[p]! >= 0) {
          const gap = Math.hypot(
            sim.x[p]! - this.nodeX[nodes - 1]!,
            sim.y[p]! - this.nodeY[nodes - 1]!,
            sim.z[p]! - this.nodeZ[nodes - 1]!
          );
          if (gap < Math.max(MIN_NODE_GAP, 1.2 * Math.max(r, this.nodeR[nodes - 1]!))) continue;
        }
        this.nodeX[nodes] = sim.x[p]!;
        this.nodeY[nodes] = sim.y[p]!;
        this.nodeZ[nodes] = sim.z[p]!;
        this.nodeR[nodes] = r;
        nodes++;
      }
      if (nodes < 2) continue;
      if (rings + (nodes - 1) * SUB + 7 > MAX_RINGS) break;
      const count = this.buildRings(nodes, !head);
      const first = rings;
      rings = this.writeRings(count, rings, opacity);
      indexCount = this.writeIndices(first, rings, indexCount);
    }
    const g = this.strandGeometry;
    g.setDrawRange(0, indexCount);
    this.strandMesh.visible = indexCount > 0;
    if (indexCount === 0) return;
    for (const name of ["position", "normal", "pigment", "edge", "alpha"]) {
      const attribute = g.getAttribute(name) as BufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, rings * SIDES * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    const index = g.getIndex()!;
    index.clearUpdateRanges();
    index.addUpdateRange(0, indexCount);
    index.needsUpdate = true;
  }

  /** Smooth the centerline (Catmull-Rom) and round off the free ends. */
  private buildRings(nodes: number, freeStart: boolean): number {
    const nx = this.nodeX;
    const ny = this.nodeY;
    const nz = this.nodeZ;
    const nr = this.nodeR;
    let count = 0;
    const push = (x: number, y: number, z: number, r: number) => {
      this.ringX[count] = x;
      this.ringY[count] = y;
      this.ringZ[count] = z;
      this.ringR[count] = r;
      count++;
    };
    const cap = (at: number, toward: number) => {
      const dx = nx[at]! - nx[toward]!;
      const dy = ny[at]! - ny[toward]!;
      const dz = nz[at]! - nz[toward]!;
      const length = Math.hypot(dx, dy, dz) || 1;
      const r = nr[at]!;
      for (const [reach, size] of CAP_RINGS) {
        push(
          nx[at]! + (dx / length) * r * reach,
          ny[at]! + (dy / length) * r * reach,
          nz[at]! + (dz / length) * r * reach,
          r * size
        );
      }
    };
    if (freeStart) {
      cap(0, 1);
      // The cap was laid outward from the end; run it inward instead.
      this.reverseRings(0, count);
    }
    for (let s = 0; s < nodes - 1; s++) {
      const a = Math.max(0, s - 1);
      const d = Math.min(nodes - 1, s + 2);
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB;
        push(
          catmullRom(nx[a]!, nx[s]!, nx[s + 1]!, nx[d]!, t),
          catmullRom(ny[a]!, ny[s]!, ny[s + 1]!, ny[d]!, t),
          catmullRom(nz[a]!, nz[s]!, nz[s + 1]!, nz[d]!, t),
          nr[s]! + (nr[s + 1]! - nr[s]!) * t
        );
      }
    }
    push(nx[nodes - 1]!, ny[nodes - 1]!, nz[nodes - 1]!, nr[nodes - 1]!);
    cap(nodes - 1, nodes - 2);
    return count;
  }

  private reverseRings(from: number, to: number): void {
    for (let a = from, b = to - 1; a < b; a++, b--) {
      for (const ring of [this.ringX, this.ringY, this.ringZ, this.ringR]) {
        const value = ring[a]!;
        ring[a] = ring[b]!;
        ring[b] = value;
      }
    }
  }

  private writeRings(count: number, start: number, opacity: number): number {
    const { pigment, edge } = this.colors;
    const t = this.tangent;
    const side = this.side;
    const binormal = this.binormal;
    for (let k = 0; k < count; k++) {
      const a = Math.max(0, k - 1);
      const b = Math.min(count - 1, k + 1);
      t.set(
        this.ringX[b]! - this.ringX[a]!,
        this.ringY[b]! - this.ringY[a]!,
        this.ringZ[b]! - this.ringZ[a]!
      );
      if (t.lengthSq() < 1e-14) t.set(0, 1, 0);
      t.normalize();
      if (k === 0) {
        side.crossVectors(t, Math.abs(t.y) < 0.9 ? UP : RIGHT).normalize();
      } else {
        // Parallel transport: keep the last side, squared to the new tangent.
        side.addScaledVector(t, -side.dot(t));
        if (side.lengthSq() < 1e-10) side.crossVectors(t, Math.abs(t.y) < 0.9 ? UP : RIGHT);
        side.normalize();
      }
      binormal.crossVectors(t, side);
      const ring = start + k;
      const r = Math.max(0.0004, this.ringR[k]!);
      for (let j = 0; j < SIDES; j++) {
        const angle = (j / SIDES) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const nx = side.x * c + binormal.x * s;
        const ny = side.y * c + binormal.y * s;
        const nz = side.z * c + binormal.z * s;
        const v = ring * SIDES + j;
        const v3 = v * 3;
        this.strandPositions[v3] = this.ringX[k]! + nx * r;
        this.strandPositions[v3 + 1] = this.ringY[k]! + ny * r;
        this.strandPositions[v3 + 2] = this.ringZ[k]! + nz * r;
        this.strandNormals[v3] = nx;
        this.strandNormals[v3 + 1] = ny;
        this.strandNormals[v3 + 2] = nz;
        this.strandPigments[v3] = pigment.right;
        this.strandPigments[v3 + 1] = pigment.green;
        this.strandPigments[v3 + 2] = pigment.left;
        this.strandEdges[v3] = edge.right;
        this.strandEdges[v3 + 1] = edge.green;
        this.strandEdges[v3 + 2] = edge.left;
        this.strandAlphas[v] = opacity;
      }
    }
    return start + count;
  }

  private writeIndices(first: number, end: number, cursor: number): number {
    const indices = this.strandIndices;
    for (let ring = first; ring < end - 1; ring++) {
      for (let j = 0; j < SIDES; j++) {
        const a = ring * SIDES + j;
        const b = ring * SIDES + ((j + 1) % SIDES);
        const c = a + SIDES;
        const d = b + SIDES;
        indices[cursor++] = a;
        indices[cursor++] = c;
        indices[cursor++] = b;
        indices[cursor++] = b;
        indices[cursor++] = c;
        indices[cursor++] = d;
      }
    }
    return cursor;
  }

  private writeDrops(opacity: number, flowRadius: number): void {
    const sim = this.sim;
    const mesh = this.dropMesh;
    const pigments = mesh.geometry.getAttribute("pigment") as InstancedBufferAttribute;
    const edges = mesh.geometry.getAttribute("edge") as InstancedBufferAttribute;
    const alphas = mesh.geometry.getAttribute("alpha") as InstancedBufferAttribute;
    const { pigment, edge, spray } = this.colors;
    let count = 0;
    const write = (radius: number, along: number, across: number) => {
      // Fine spray reads in the palette's splatter color.
      const fine = 1 - smooth(0.35, 0.8, radius / Math.max(1e-4, flowRadius));
      pigments.setXYZ(
        count,
        pigment.right + (spray.right - pigment.right) * fine,
        pigment.green + (spray.green - pigment.green) * fine,
        pigment.left + (spray.left - pigment.left) * fine
      );
      edges.setXYZ(count, edge.right, edge.green, edge.left);
      alphas.setX(count, opacity);
      this.scale.set(across, along, across);
      this.matrix.compose(this.position, this.orientation, this.scale);
      mesh.setMatrixAt(count, this.matrix);
      count++;
    };

    for (let i = 0; i < sim.capacity && count < DROPS; i++) {
      if (!sim.alive[i] || sim.newer[i]! >= 0 || sim.older[i]! >= 0 || sim.isHead(i)) continue;
      const radius = sphereRadius(sim.volume[i]!);
      this.scratch.set(sim.vx[i]!, sim.vy[i]!, sim.vz[i]!);
      const speed = this.scratch.length();
      if (speed > 1e-4) this.orientation.setFromUnitVectors(UP, this.scratch.multiplyScalar(1 / speed));
      else this.orientation.identity();
      const shape = inkDropShape(radius, speed, sim.shapeAge[i]!);
      this.position.set(sim.x[i]!, sim.y[i]!, sim.z[i]!);
      write(radius, shape.along, shape.across);
    }
    // Drops still hanging from a resting tip, drawn long by their weight.
    for (const source of sim.sources) {
      if (count >= DROPS) break;
      const radius = sphereRadius(source.drip);
      if (radius < 0.0015) continue;
      const sag = 1 + 0.35 * smooth(0.002, 0.0105, radius);
      this.orientation.identity();
      this.position.set(source.x, source.y - radius * sag * 0.85, source.z);
      write(radius, radius * sag, radius / Math.sqrt(sag));
    }

    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    for (const attribute of [pigments, edges, alphas]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  private writeStains(opacity: number): void {
    const sim = this.sim;
    const mesh = this.stainMesh;
    const pigments = mesh.geometry.getAttribute("pigment") as InstancedBufferAttribute;
    const edges = mesh.geometry.getAttribute("edge") as InstancedBufferAttribute;
    const alphas = mesh.geometry.getAttribute("alpha") as InstancedBufferAttribute;
    const wetness = mesh.geometry.getAttribute("wetness") as InstancedBufferAttribute;
    const { pigment, edge } = this.colors;
    let count = 0;
    for (let i = 0; i < sim.stainCapacity; i++) {
      if (!sim.stainAlive[i]) continue;
      const life = sim.stainLife(i);
      const age = sim.stainAge[i]!;
      // Spreads in a blink, stays wet a while, then dries and fades.
      const spread = 0.62 + 0.38 * smooth(0, 0.07, age);
      const wet = 1 - smooth(0.04, 0.45, life);
      const fade = 1 - smooth(0.55, 1, life);
      // Ink soaks into the stage: a stain reads deeper than the airborne
      // ink, and only its wet skin catches the grazing light.
      const darken = 0.5 + 0.22 * wet;
      const sheen = 0.25 + 0.35 * wet;
      pigments.setXYZ(count, pigment.right * darken, pigment.green * darken, pigment.left * darken);
      edges.setXYZ(
        count,
        pigment.right * darken + (edge.right - pigment.right * darken) * sheen,
        pigment.green * darken + (edge.green - pigment.green * darken) * sheen,
        pigment.left * darken + (edge.left - pigment.left * darken) * sheen
      );
      alphas.setX(count, opacity * 0.82 * fade);
      wetness.setX(count, wet);
      const radius = sim.stainRadius[i]! * spread;
      this.orientation.setFromAxisAngle(UP, -sim.stainAngle[i]!);
      this.scale.set(radius * sim.stainAspect[i]!, 1, radius);
      // Later stains sit a hair higher, so overlaps layer instead of flicker.
      this.position.set(sim.stainX[i]!, sim.stainY[i]! + STAIN_LIFT + count * 1e-6, sim.stainZ[i]!);
      this.matrix.compose(this.position, this.orientation, this.scale);
      mesh.setMatrixAt(count, this.matrix);
      count++;
    }
    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    for (const attribute of [pigments, edges, alphas, wetness]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}

/** Rounded end: how far past the last parcel each ring sits, and its size. */
const CAP_RINGS = [
  [0.55, 0.84],
  [0.86, 0.5],
  [1, 0.04],
] as const;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
