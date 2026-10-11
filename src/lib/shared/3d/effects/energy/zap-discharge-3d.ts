/**
 * Zap in 3D: the same lightning model as the 2D renderer, drawn as glowing
 * camera-facing ribbons.
 *
 * The previous arc drew `THREE.Line`s, and WebGL ignores line width, so every
 * bolt was a one-pixel white thread that vanished against a lit scene. Here
 * each channel is a ribbon whose vertex shader turns it toward the camera and
 * whose fragment shader paints a white-hot core inside a colored halo, all in
 * one additive draw. The buffers are allocated once and rewritten in place.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Mesh,
  ShaderMaterial,
} from "three";
import type { Zap3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
import {
  clamp01,
  DischargeChannel,
  PLASMA_POINTS,
  strikeLight,
  writePlasmaFilament,
  type ChannelShape,
  type Strike,
} from "#lib/shared/effects/renderers/zap-lightning.js";
import {
  mulberry32,
  SeededNoise,
} from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";

export interface ZapEndpoint3D {
  /** Rig-local position in metres. */
  position: { x: number; y: number; z: number };
  /** 0 = blue prop, 1 = red prop. */
  prop: 0 | 1;
  /** Which end of the prop; bolts join matching ends. */
  end: 0 | 1;
  /** The prop's color, used when the color mode is "prop". */
  color: string;
}

/** A strike bright enough to light the scene, in rig-local space. */
export interface ZapFlash3D {
  key: string;
  x: number;
  y: number;
  z: number;
  color: string;
  /** 0-1 flash strength. */
  strength: number;
}

/** Ribbon points shared by every bolt, filament and crackle in one frame. */
const MAX_POINTS = 4096;
/** Metres per second treated as a full-energy swing. */
const REF_SPEED = 6;
const ENERGY_LAG = 0.12;
const CRACKLE_PERIOD = 1 / 20;
const DEPTH_WIDTH = [1, 0.6, 0.38] as const;
const DEPTH_ALPHA = [1, 0.8, 0.6] as const;

const VERTEX = /* glsl */ `
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aWidth;
  attribute vec3 aColor;
  attribute vec3 aLight;
  varying float vSide;
  varying vec3 vColor;
  varying vec3 vLight;
  void main() {
    vec4 here = modelViewMatrix * vec4(position, 1.0);
    vec3 prev = (modelViewMatrix * vec4(aPrev, 1.0)).xyz;
    vec3 next = (modelViewMatrix * vec4(aNext, 1.0)).xyz;
    vec3 tangent = next - prev;
    if (dot(tangent, tangent) < 1e-12) tangent = vec3(1.0, 0.0, 0.0);
    vec3 toEye = normalize(-here.xyz);
    vec3 across = cross(normalize(tangent), toEye);
    if (dot(across, across) < 1e-8) across = vec3(0.0, 1.0, 0.0);
    here.xyz += normalize(across) * aSide * aWidth;
    vSide = aSide;
    vColor = aColor;
    vLight = aLight;
    gl_Position = projectionMatrix * here;
  }
`;

const FRAGMENT = /* glsl */ `
  varying float vSide;
  varying vec3 vColor;
  varying vec3 vLight;
  void main() {
    float d = abs(vSide);
    float halo = pow(1.0 - d, 2.4);
    float core = 1.0 - smoothstep(vLight.z * 0.55, vLight.z, d);
    vec3 color = vColor * halo * vLight.x + vec3(1.0) * core * vLight.y;
    gl_FragColor = vec4(color, 1.0);
  }
`;

interface TipMotion {
  x: number;
  y: number;
  z: number;
  energy: number;
}

interface PlasmaFilament {
  seed: number;
  flash: number;
}

interface PlasmaPair {
  filaments: PlasmaFilament[];
  untilSnap: number;
}

interface Node {
  key: string;
  prop: 0 | 1;
  end: 0 | 1;
  x: number;
  y: number;
  z: number;
  color: Color;
  hex: string;
}

/** Endpoint basis: axis a→b plus two perpendiculars of the same length. */
interface Basis {
  ax: number;
  ay: number;
  az: number;
  ex: number;
  ey: number;
  ez: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

export class ZapDischarge3D {
  readonly object = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly mesh: Mesh;
  private readonly positions = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly prevs = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly nexts = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly sides = new Float32Array(MAX_POINTS * 2);
  private readonly widths = new Float32Array(MAX_POINTS * 2);
  private readonly colors = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly lights = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly indices = new Uint32Array((MAX_POINTS - 1) * 6);
  private readonly attributes: BufferAttribute[];
  private readonly indexAttribute: BufferAttribute;
  private pointCount = 0;
  private indexCount = 0;

  private readonly rng = mulberry32(0x7e11a);
  private readonly noise = new SeededNoise(0x3d5a);
  private readonly channels = new Map<string, DischargeChannel>();
  private readonly plasma = new Map<string, PlasmaPair>();
  private readonly motion = new Map<string, TipMotion>();
  private readonly crackles = new Map<string, Float32Array>();
  private readonly scratch = new Float32Array(64 * 3);
  private readonly world = new Float32Array(64 * 3);
  private readonly filament = new Float32Array(PLASMA_POINTS * 3);
  private readonly mix = new Color();
  private plasmaPhase = 0;
  private crackleClock = 0;
  /** Strikes bright enough to light the scene this frame. */
  readonly flashes: ZapFlash3D[] = [];

  constructor() {
    const attr = (array: Float32Array, size: number) => {
      const attribute = new BufferAttribute(array, size);
      attribute.setUsage(DynamicDrawUsage);
      return attribute;
    };
    const position = attr(this.positions, 3);
    this.attributes = [
      position,
      attr(this.prevs, 3),
      attr(this.nexts, 3),
      attr(this.sides, 1),
      attr(this.widths, 1),
      attr(this.colors, 3),
      attr(this.lights, 3),
    ];
    this.geometry.setAttribute("position", position);
    this.geometry.setAttribute("aPrev", this.attributes[1]!);
    this.geometry.setAttribute("aNext", this.attributes[2]!);
    this.geometry.setAttribute("aSide", this.attributes[3]!);
    this.geometry.setAttribute("aWidth", this.attributes[4]!);
    this.geometry.setAttribute("aColor", this.attributes[5]!);
    this.geometry.setAttribute("aLight", this.attributes[6]!);
    this.indexAttribute = new BufferAttribute(this.indices, 1);
    this.indexAttribute.setUsage(DynamicDrawUsage);
    this.geometry.setIndex(this.indexAttribute);
    this.geometry.setDrawRange(0, 0);

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.object.add(this.mesh);
  }

  /** Advance by `dt` seconds and rebuild the ribbons for these endpoints. */
  update(
    dt: number,
    params: Zap3DParams,
    endpoints: readonly ZapEndpoint3D[]
  ): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.pointCount = 0;
    this.indexCount = 0;
    this.flashes.length = 0;

    const nodes = endpoints.map((endpoint) => this.node(endpoint, params));
    this.trackMotion(nodes, step);
    const used = new Set<string>();
    const live = new Set<string>();
    if (params.style === "plasma") {
      this.plasmaPhase += step * (0.25 + params.wobbleRate * 4.5);
      for (const [a, b] of this.pairs(nodes))
        this.drawPlasma(a, b, params, step, used, live);
    } else if (params.style === "web") {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          this.drawStorm(nodes[i]!, nodes[j]!, params, step, used, live, true);
        }
      }
    } else {
      for (const [a, b] of this.pairs(nodes))
        this.drawStorm(a, b, params, step, used, live, false);
    }
    this.drawCrackle(nodes, params, step, used);
    for (const key of this.channels.keys())
      if (!live.has(key)) this.channels.delete(key);
    for (const key of this.plasma.keys())
      if (!live.has(key)) this.plasma.delete(key);
    this.commit();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.channels.clear();
    this.plasma.clear();
    this.motion.clear();
    this.crackles.clear();
  }

  // ── Plumbing ───────────────────────────────────────────────────────

  private node(endpoint: ZapEndpoint3D, params: Zap3DParams): Node {
    const custom = endpoint.prop === 0 ? params.leftColor : params.rightColor;
    const hex =
      params.colorMode === "custom" ? custom : endpoint.color || custom;
    return {
      key: `${endpoint.prop}:${endpoint.end}`,
      prop: endpoint.prop,
      end: endpoint.end,
      x: endpoint.position.x,
      y: endpoint.position.y,
      z: endpoint.position.z,
      color: new Color(hex),
      hex,
    };
  }

  private pairs(nodes: readonly Node[]): [Node, Node][] {
    const out: [Node, Node][] = [];
    for (const a of nodes) {
      if (a.prop !== 0) continue;
      const b = nodes.find((n) => n.prop === 1 && n.end === a.end);
      if (b) out.push([a, b]);
    }
    return out;
  }

  private trackMotion(nodes: readonly Node[], dt: number): void {
    const follow = dt > 0 ? 1 - Math.exp(-dt / ENERGY_LAG) : 0;
    for (const node of nodes) {
      const prev = this.motion.get(node.key);
      if (!prev) {
        this.motion.set(node.key, {
          x: node.x,
          y: node.y,
          z: node.z,
          energy: 0,
        });
        continue;
      }
      if (dt > 0) {
        const speed =
          Math.hypot(node.x - prev.x, node.y - prev.y, node.z - prev.z) / dt;
        prev.energy += (clamp01(speed / REF_SPEED) - prev.energy) * follow;
      }
      prev.x = node.x;
      prev.y = node.y;
      prev.z = node.z;
    }
  }

  private energy(a: Node, b: Node): number {
    return (
      ((this.motion.get(a.key)?.energy ?? 0) +
        (this.motion.get(b.key)?.energy ?? 0)) /
      2
    );
  }

  private basis(a: Node, b: Node): Basis | null {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ey, ez);
    if (len < 1e-4) return null;
    // Perpendiculars from world up, or world x when the bolt runs vertical.
    const vertical = Math.abs(ey / len) > 0.95;
    const rx = vertical ? 1 : 0;
    const ry = vertical ? 0 : 1;
    let vx = ey * 0 - ez * ry;
    let vy = ez * rx - ex * 0;
    let vz = ex * ry - ey * rx;
    const lv = Math.hypot(vx, vy, vz) || 1;
    vx = (vx / lv) * len;
    vy = (vy / lv) * len;
    vz = (vz / lv) * len;
    let wx = ey * vz - ez * vy;
    let wy = ez * vx - ex * vz;
    let wz = ex * vy - ey * vx;
    const lw = Math.hypot(wx, wy, wz) || 1;
    wx = (wx / lw) * len;
    wy = (wy / lw) * len;
    wz = (wz / lw) * len;
    return { ax: a.x, ay: a.y, az: a.z, ex, ey, ez, vx, vy, vz, wx, wy, wz };
  }

  /** Map normalised (u, v, w) points into `this.world`; returns the count. */
  private place(points: Float32Array, count: number, basis: Basis): number {
    const n = Math.min(count, this.world.length / 3);
    for (let i = 0; i < n; i++) {
      const u = points[i * 3]!;
      const v = points[i * 3 + 1]!;
      const w = points[i * 3 + 2]!;
      this.world[i * 3] = basis.ax + u * basis.ex + v * basis.vx + w * basis.wx;
      this.world[i * 3 + 1] =
        basis.ay + u * basis.ey + v * basis.vy + w * basis.wy;
      this.world[i * 3 + 2] =
        basis.az + u * basis.ez + v * basis.vz + w * basis.wz;
    }
    return n;
  }

  /**
   * Append one ribbon. `us` gives each point's place between the two
   * endpoint colors; width tapers from `rootWidth` to `tipWidth`.
   */
  private ribbon(
    count: number,
    us: Float32Array,
    rootWidth: number,
    tipWidth: number,
    a: Color,
    b: Color,
    halo: number,
    core: number,
    coreFraction: number
  ): void {
    if (count < 2 || this.pointCount + count > MAX_POINTS) return;
    const first = this.pointCount;
    for (let i = 0; i < count; i++) {
      const prev = Math.max(0, i - 1);
      const next = Math.min(count - 1, i + 1);
      const t = i / (count - 1);
      const width = rootWidth + (tipWidth - rootWidth) * t;
      const u = clamp01(us[i * 3]!);
      this.mix.copy(a).lerp(b, u);
      for (let side = 0; side < 2; side++) {
        const v = (this.pointCount * 2 + side) * 3;
        const s = this.pointCount * 2 + side;
        this.positions[v] = this.world[i * 3]!;
        this.positions[v + 1] = this.world[i * 3 + 1]!;
        this.positions[v + 2] = this.world[i * 3 + 2]!;
        this.prevs[v] = this.world[prev * 3]!;
        this.prevs[v + 1] = this.world[prev * 3 + 1]!;
        this.prevs[v + 2] = this.world[prev * 3 + 2]!;
        this.nexts[v] = this.world[next * 3]!;
        this.nexts[v + 1] = this.world[next * 3 + 1]!;
        this.nexts[v + 2] = this.world[next * 3 + 2]!;
        this.sides[s] = side === 0 ? -1 : 1;
        this.widths[s] = width;
        this.colors[v] = this.mix.r;
        this.colors[v + 1] = this.mix.g;
        this.colors[v + 2] = this.mix.b;
        this.lights[v] = halo;
        this.lights[v + 1] = core;
        this.lights[v + 2] = coreFraction;
      }
      this.pointCount++;
    }
    for (let i = 0; i < count - 1; i++) {
      const p = (first + i) * 2;
      this.indices[this.indexCount++] = p;
      this.indices[this.indexCount++] = p + 1;
      this.indices[this.indexCount++] = p + 2;
      this.indices[this.indexCount++] = p + 1;
      this.indices[this.indexCount++] = p + 3;
      this.indices[this.indexCount++] = p + 2;
    }
  }

  private commit(): void {
    for (const attribute of this.attributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.pointCount * 2 * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.indexAttribute.clearUpdateRanges();
    this.indexAttribute.addUpdateRange(0, this.indexCount);
    this.indexAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, this.indexCount);
    this.mesh.visible = this.indexCount > 0;
  }

  // ── Storm and Web ──────────────────────────────────────────────────

  private drawStorm(
    a: Node,
    b: Node,
    params: Zap3DParams,
    dt: number,
    used: Set<string>,
    live: Set<string>,
    web: boolean
  ): void {
    used.add(a.key);
    used.add(b.key);
    const key = `${web ? "web" : "storm"}|${a.key}|${b.key}`;
    live.add(key);
    let channel = this.channels.get(key);
    if (!channel) {
      channel = new DischargeChannel((this.rng() * 4294967296) >>> 0);
      this.channels.set(key, channel);
    }
    const energy = this.energy(a, b);
    const shape: ChannelShape = {
      jitter: params.jitter * (web ? 0.8 : 1),
      branching: params.branching * (web ? 0.5 : 1),
      energy: energy * (web ? 0.5 : 1),
      depthAxis: true,
    };
    const rate = params.frequency * (web ? 0.45 : 1) * (0.7 + energy * 0.9);
    channel.step(dt, rate, shape, params.intensity * (web ? 0.5 : 1));
    const basis = this.basis(a, b);
    if (!basis) return;
    const weight = web ? 0.85 : 1;
    let strongest = 0;
    for (const strike of channel.strikes) {
      strongest = Math.max(
        strongest,
        this.drawStrike(strike, basis, a, b, params, weight)
      );
    }
    if (strongest > 0.05) {
      this.flashes.push({
        key,
        x: basis.ax + basis.ex / 2,
        y: basis.ay + basis.ey / 2,
        z: basis.az + basis.ez / 2,
        color: a.hex,
        strength: strongest,
      });
    }
  }

  private drawStrike(
    strike: Strike,
    basis: Basis,
    a: Node,
    b: Node,
    params: Zap3DParams,
    weight: number
  ): number {
    const light = strikeLight(strike);
    const halo = light.halo * params.brightness * weight;
    const core = light.core * params.brightness * weight;
    if (halo < 0.01 && core < 0.01) return 0;
    for (const stroke of strike.strokes) {
      const count = this.place(stroke.points, stroke.points.length / 3, basis);
      const depth = stroke.depth;
      const width = params.haloWidth * DEPTH_WIDTH[depth]!;
      const fade = DEPTH_ALPHA[depth]!;
      this.ribbon(
        count,
        stroke.points,
        width,
        depth === 0 ? width : width * 0.35,
        a.color,
        b.color,
        halo * fade,
        core * fade,
        params.coreFraction
      );
    }
    return light.halo;
  }

  // ── Plasma ─────────────────────────────────────────────────────────

  private drawPlasma(
    a: Node,
    b: Node,
    params: Zap3DParams,
    dt: number,
    used: Set<string>,
    live: Set<string>
  ): void {
    used.add(a.key);
    used.add(b.key);
    const key = `plasma|${a.key}|${b.key}`;
    live.add(key);
    let pair = this.plasma.get(key);
    if (!pair) {
      pair = { filaments: [], untilSnap: 0 };
      this.plasma.set(key, pair);
    }
    const energy = this.energy(a, b);
    const want = Math.max(
      2,
      Math.min(6, Math.round(2 + params.intensity * 2 + energy * 2))
    );
    while (pair.filaments.length < want)
      pair.filaments.push({ seed: this.rng() * 100, flash: 0.6 });
    pair.filaments.length = want;
    pair.untilSnap -= dt;
    let guard = 0;
    while (pair.untilSnap <= 0 && guard++ < 3) {
      const filament = pair.filaments[Math.floor(this.rng() * want)]!;
      filament.seed = this.rng() * 100;
      filament.flash = 1;
      pair.untilSnap +=
        (0.45 + this.rng() * 1.1) /
        Math.max(0.5, params.frequency * (0.6 + energy));
    }
    const basis = this.basis(a, b);
    if (!basis) return;
    let strongest = 0;
    for (const filament of pair.filaments) {
      if (dt > 0) filament.flash *= Math.exp(-dt / 0.09);
      writePlasmaFilament(
        this.filament,
        this.noise,
        filament.seed,
        this.plasmaPhase,
        {
          sway: params.wobbleAmount,
          crawl: params.jitter,
          depthAxis: true,
        }
      );
      const shimmer =
        0.5 +
        0.3 * this.noise.noise3D(filament.seed, this.plasmaPhase * 1.7, 3.3);
      const light = clamp01(shimmer + filament.flash * 0.7);
      strongest = Math.max(strongest, filament.flash);
      const count = this.place(this.filament, PLASMA_POINTS, basis);
      const width = params.haloWidth * 0.7;
      this.ribbon(
        count,
        this.filament,
        width,
        width,
        a.color,
        b.color,
        light * params.brightness * 0.8,
        (0.25 + filament.flash * 0.75) * light * params.brightness,
        params.coreFraction
      );
    }
    if (strongest > 0.05) {
      this.flashes.push({
        key,
        x: basis.ax + basis.ex / 2,
        y: basis.ay + basis.ey / 2,
        z: basis.az + basis.ez / 2,
        color: a.hex,
        strength: strongest * 0.7,
      });
    }
  }

  // ── Tip crackle ────────────────────────────────────────────────────

  /** Every zapped tip crackles; a tip with no partner crackles harder. */
  private drawCrackle(
    nodes: readonly Node[],
    params: Zap3DParams,
    dt: number,
    used: Set<string>
  ): void {
    this.crackleClock += dt;
    const recut = this.crackleClock >= CRACKLE_PERIOD;
    if (recut) this.crackleClock %= CRACKLE_PERIOD;
    for (const node of nodes) {
      const lone = !used.has(node.key);
      let arcs = this.crackles.get(node.key);
      if (!arcs || recut) {
        arcs = this.cutCrackle(params, lone);
        this.crackles.set(node.key, arcs);
      }
      const arcCount = arcs.length / 12;
      for (let k = 0; k < arcCount; k++) {
        for (let i = 0; i < 4; i++) {
          this.world[i * 3] = node.x + arcs[k * 12 + i * 3]!;
          this.world[i * 3 + 1] = node.y + arcs[k * 12 + i * 3 + 1]!;
          this.world[i * 3 + 2] = node.z + arcs[k * 12 + i * 3 + 2]!;
          this.scratch[i * 3] = 0;
        }
        this.ribbon(
          4,
          this.scratch,
          params.haloWidth * 0.4,
          params.haloWidth * 0.15,
          node.color,
          node.color,
          (lone ? 0.6 : 0.4) * params.brightness,
          (lone ? 0.85 : 0.6) * params.brightness,
          params.coreFraction
        );
      }
    }
    for (const key of this.crackles.keys()) {
      if (!nodes.some((node) => node.key === key)) this.crackles.delete(key);
    }
  }

  /** Short jagged arcs off a tip, as 4-point (12-number) offset runs. */
  private cutCrackle(params: Zap3DParams, lone: boolean): Float32Array {
    const count = lone ? 3 : 2;
    const reach = (lone ? 0.11 : 0.06) * (0.6 + params.intensity * 0.6);
    const out = new Float32Array(count * 12);
    for (let k = 0; k < count; k++) {
      // Random direction on the sphere.
      const z = this.rng() * 2 - 1;
      const t = this.rng() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      const dx = r * Math.cos(t);
      const dy = r * Math.sin(t);
      const length = reach * (0.5 + this.rng() * 0.7);
      for (let s = 0; s < 4; s++) {
        const along = (length * s) / 3;
        const wobble = s === 0 ? 0 : length * 0.25;
        out[k * 12 + s * 3] = dx * along + (this.rng() * 2 - 1) * wobble;
        out[k * 12 + s * 3 + 1] = dy * along + (this.rng() * 2 - 1) * wobble;
        out[k * 12 + s * 3 + 2] = z * along + (this.rng() * 2 - 1) * wobble;
      }
    }
    return out;
  }
}
