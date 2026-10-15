import { resolveGooLook2D, type GooLook2D } from "./goo-look-2d";

/**
 * Goo rope physics for the Canvas2D backend: the 3D goo's model, laid flat.
 *
 * Every tracked tip grows a rope of liquid point by point. Each segment holds
 * a volume, so its thickness follows from how far it has been stretched.
 * Links are XPBD constraints whose softness grows with length over cross
 * section, so a thin neck gives more than a thick one and keeps thinning.
 * Stretch under load flows into new length, slack draws back in, liquid runs
 * downhill into the bulb, and surface tension squeezes thin spots into fat
 * ones so a stretched rope beads and necks. A neck below its breaking radius
 * lets go, and everything below it falls as a free rope that balls up into a
 * wobbling drop. Liquid the prop gives off on its own wells up in a small
 * fountain.
 *
 * The sim runs in meters with the 3D goo's own tuning (y down, so gravity is
 * positive). Tips come in as canvas pixels and are mapped through
 * `pxPerMeter`. Drops flying toward the viewer hit the glass in front of the
 * scene; they leave through `impacts`, in pixels, for `GooGlassSim`.
 */

export const GOO_NODES = 20;
export const GOO_MAX_STRANDS = 48;
export const GOO_MAX_DROPS = 512;
/** Rest length a new rope point is laid at, m. */
const SEGMENT = 0.035;
const MIN_REST = 0.0015;
const SUBSTEP = 1 / 120;
const ITERATIONS = 5;
/** Longest frame the sim integrates; anything longer is a stall. */
const MAX_FRAME = 1 / 15;
/** A tip that moves further than this in one frame jumped, m. */
const TELEPORT_DISTANCE = 0.75;
/** Ropes and drops below this equivalent radius are spent, m. */
const SPENT_RADIUS = 0.0018;
/** Longest a drop may fly before it is dropped, s. */
const DROP_LIFE = 6;

export type GooSpew = "splash" | "flow" | "mist";

export interface GooMaterial {
  /** 0..1: resistance to stretching (the 3D Viscosity control). */
  viscosity: number;
  /** 0..1: cohesion; beading, necking and how far a rope draws in. */
  tension: number;
  /** 0..1. */
  intensity: number;
  /** 0..1: the steady flow while the tip is still. */
  ambient: number;
  /** 0..1: extra flow with tip speed. */
  motion: number;
  ambientSpawnRate: number;
  motionSpawnRate: number;
  /** Tip speed counted as full motion, m/s. */
  referenceSpeed: number;
  /** Size of the liquid, m. */
  baseRadius: number;
  /** Downward gravity in Earth multiples. */
  gravity: number;
  spew: GooSpew;
  /** Canvas pixels per meter for this pane. */
  pxPerMeter: number;
  /** Palette behavior; classic when left out. */
  look?: GooLook2D;
}

export interface GooStrand {
  attached: boolean;
  tip: string | null;
  age: number;
  count: number;
  maxNodes: number;
  /** Longest rope the tip can hold before its lower part lets go, m. */
  maxLength: number;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  rest: Float32Array;
  vol: Float32Array;
  lambda: Float32Array;
  bulb: number;
  nozzle: number;
  /** Neck radius at which the liquid breaks. */
  pinch: number;
  /** Largest bulb radius the neck can carry. */
  maxBulb: number;
  /** Rate liquid drains toward the bulb, 1/s. */
  flow: number;
  /** Rate a pulled segment yields and lengthens, 1/s. */
  yieldRate: number;
  stiffness: number;
  /** Rate surface tension draws the rope back together, 1/s. */
  shrink: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  step: number;
}

export interface GooDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  /** How hard it still rings between long and flat after tearing free. */
  wobble: number;
  /** Direction it points when it is too slow to have a heading. */
  ax: number;
  ay: number;
  /** Age at which it reaches the glass; Infinity for one that falls away. */
  glassAt: number;
}

/** A drop arriving on the glass this frame, in canvas pixels. */
export interface GooImpact {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface GooTipInput {
  id: string;
  x: number;
  y: number;
}

interface TipState {
  x: number;
  y: number;
  strand: GooStrand | null;
  /** Fountain drops owed, carried between frames. */
  jet: number;
  /** Mist owed, carried between frames. */
  mist: number;
}

export const sphereVolume = (radius: number) => (4 / 3) * Math.PI * radius ** 3;
export const sphereRadius = (volume: number) =>
  Math.cbrt((3 * Math.max(0, volume)) / (4 * Math.PI));

/** Repeatable 0-1 scatter, so a replay sprays the same way. */
function scatter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Distance between two rope points, m. */
export function nodeDistance(strand: GooStrand, a: number, b: number): number {
  return Math.hypot(strand.x[b]! - strand.x[a]!, strand.y[b]! - strand.y[a]!);
}

/** A segment's radius: its volume spread over its length. */
export function segmentRadius(strand: GooStrand, segment: number): number {
  const length = Math.max(
    strand.rest[segment]!,
    nodeDistance(strand, segment, segment + 1),
    1e-4
  );
  return Math.min(
    strand.nozzle * 1.35,
    Math.sqrt(Math.max(0, strand.vol[segment]!) / (Math.PI * length))
  );
}

export function nodeRadius(strand: GooStrand, node: number): number {
  if (node === strand.count - 1) {
    return Math.max(
      sphereRadius(strand.bulb),
      node > 0 ? segmentRadius(strand, node - 1) : 0
    );
  }
  const below = segmentRadius(strand, node);
  return node > 0 ? (below + segmentRadius(strand, node - 1)) / 2 : below;
}

/** Rest length of the whole rope, m. */
export function ropeLength(strand: GooStrand): number {
  let length = 0;
  for (let segment = 0; segment < strand.count - 1; segment++) {
    length += strand.rest[segment]!;
  }
  return length;
}

export function totalVolume(strand: GooStrand): number {
  let volume = strand.bulb;
  for (let segment = 0; segment < strand.count - 1; segment++) {
    volume += strand.vol[segment]!;
  }
  return volume;
}

/** A drop flying at the viewer looms larger as it nears the glass. */
export function approach(drop: GooDrop): number {
  if (!Number.isFinite(drop.glassAt)) return 1;
  const t = Math.min(1, drop.age / drop.glassAt);
  return 1 + 0.35 * t * t;
}

function makeStrand(): GooStrand {
  return {
    attached: false,
    tip: null,
    age: 0,
    count: 0,
    maxNodes: GOO_NODES,
    maxLength: 0.5,
    x: new Float32Array(GOO_NODES),
    y: new Float32Array(GOO_NODES),
    px: new Float32Array(GOO_NODES),
    py: new Float32Array(GOO_NODES),
    rest: new Float32Array(GOO_NODES),
    vol: new Float32Array(GOO_NODES),
    lambda: new Float32Array(GOO_NODES),
    bulb: 0,
    nozzle: 0.02,
    pinch: 0.005,
    maxBulb: 0.04,
    flow: 4,
    yieldRate: 10,
    stiffness: 10,
    shrink: 1,
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 0,
    step: SUBSTEP,
  };
}

export class GooStrandSim {
  /** Live ropes, attached and falling, positions in meters. */
  readonly strands: GooStrand[] = [];
  /** Live drops, in meters. */
  readonly drops: GooDrop[] = [];
  /** Drops that reached the glass during the last step. */
  readonly impacts: GooImpact[] = [];
  private tips = new Map<string, TipState>();
  private spare: GooStrand[] = [];
  private jets = 0;
  private random: () => number;
  private material!: GooMaterial;
  private look!: GooLook2D;
  /** Gravity for this frame, m/s². */
  private gravity = 9.8;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  step(
    tips: readonly GooTipInput[],
    frameDt: number,
    material: GooMaterial,
    bounds: { width: number; height: number }
  ): void {
    this.impacts.length = 0;
    const dt = Number.isFinite(frameDt) ? Math.min(Math.max(frameDt, 0), MAX_FRAME) : 0;
    this.material = material;
    this.look = material.look ?? resolveGooLook2D("classic");
    this.gravity = 9.8 * Math.max(0, material.gravity) * this.look.gravity;
    const k = material.pxPerMeter;
    const live = new Set<string>();

    for (const tip of tips) {
      live.add(tip.id);
      const x = tip.x / k;
      const y = tip.y / k;
      let state = this.tips.get(tip.id);
      if (!state) {
        state = { x, y, strand: null, jet: 0, mist: 0 };
        this.tips.set(tip.id, state);
      }
      this.advanceTip(state, tip.id, x, y, dt);
      state.x = x;
      state.y = y;
    }
    for (const [id, state] of this.tips) {
      if (live.has(id)) continue;
      // A rope whose tip vanished keeps falling on its own.
      if (state.strand) this.detach(state.strand);
      this.tips.delete(id);
    }
    if (dt > 0) {
      this.advanceStrands(dt);
      this.advanceDrops(dt, bounds);
    }
  }

  clear(): void {
    this.spare.push(...this.strands);
    this.strands.length = 0;
    this.drops.length = 0;
    this.impacts.length = 0;
    this.tips.clear();
  }

  // ---------------------------------------------------------------- tips

  private advanceTip(
    state: TipState,
    id: string,
    x: number,
    y: number,
    dt: number
  ): void {
    const m = this.material;
    const jumped = Math.hypot(x - state.x, y - state.y) > TELEPORT_DISTANCE;
    const vx = dt > 0 && !jumped ? (x - state.x) / dt : 0;
    const vy = dt > 0 && !jumped ? (y - state.y) / dt : 0;
    const speed =
      m.referenceSpeed > 0 ? Math.min(1, Math.hypot(vx, vy) / m.referenceSpeed) : 0;
    const rate = Math.max(
      0,
      m.ambient * m.ambientSpawnRate + m.motion * speed * m.motionSpawnRate
    );

    if (m.spew === "mist") {
      if (state.strand) this.detach(state.strand);
      state.strand = null;
      if (rate === 0) {
        state.mist = 0;
        return;
      }
      state.mist = Math.min(1, state.mist + dt * rate * 0.3);
      if (state.mist >= 1) {
        state.mist = 0;
        this.spawnDrop(x, y, vx, vy, m.baseRadius * 0.28, 0, 0.35);
      }
      return;
    }

    this.welling(state, x, y, vx, vy, dt);

    let strand = state.strand;
    if (strand && (!strand.attached || strand.tip !== id)) strand = null;
    if (strand && jumped) {
      this.detach(strand);
      strand = null;
    }
    if (!strand && rate > 0) {
      strand = this.spawnStrand(id, x, y, vx, vy);
      if (strand) {
        state.x = x;
        state.y = y;
      }
    }
    state.strand = strand;
    if (!strand) return;

    this.tune(strand);
    strand.fromX = state.x;
    strand.fromY = state.y;
    strand.toX = x;
    strand.toY = y;
    // Liquid leaves the tip at the emission rate, measured in drips. It eases
    // toward its ceiling, so a hard spin still pours more than a gentle one.
    const drips =
      6 * (1 - Math.exp((-rate * (m.spew === "splash" ? 0.45 : 0.32)) / 6));
    const added = drips * sphereVolume(strand.nozzle * 1.45) * dt;
    if (strand.count >= 2) strand.vol[0] = strand.vol[0]! + added;
    else strand.bulb += added;
  }

  /**
   * Liquid the prop gives off on its own wells up out of the tip in a small
   * fountain, while liquid thrown by motion stays in the rope: Fountain
   * sprays, Classic spits now and then, Whip only flings.
   */
  private welling(
    state: TipState,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dt: number
  ): void {
    const m = this.material;
    const ambient = clamp01(m.ambient);
    const rate = Math.min(
      32,
      ambient ** 3 * m.ambientSpawnRate * 4 * (1 - 0.7 * clamp01(m.viscosity))
    );
    if (!(rate > 0) || this.gravity <= 0) {
      state.jet = 0;
      return;
    }
    state.jet = Math.min(4, state.jet + dt * rate);
    while (state.jet >= 1) {
      state.jet -= 1;
      const n = ++this.jets;
      // A strong source throws a tall, tight column of fat drops; a weak one
      // spits low and wide.
      const angle = scatter(n) * Math.PI * 2;
      const spread = (0.08 + 0.3 * scatter(n + 0.31)) * (1.6 - ambient);
      const lift =
        (1.2 + 2.2 * ambient * ambient) *
        (0.85 + 0.3 * scatter(n + 0.57)) *
        Math.sqrt(this.gravity / 9.8);
      this.spawnDrop(
        x,
        y,
        vx * 0.4 + Math.cos(angle) * spread,
        vy * 0.4 - lift,
        m.baseRadius * (0.2 + 0.3 * ambient) * (0.8 + 0.4 * scatter(n + 0.83)),
        0,
        // Only the drops sprayed toward the viewer can reach the glass.
        Math.max(0, Math.sin(angle))
      );
    }
  }

  /** Map the liquid controls onto the rope's physics. */
  private tune(strand: GooStrand): void {
    const m = this.material;
    const viscosity = clamp01(m.viscosity);
    const tension = clamp01(m.tension);
    const splash = m.spew === "splash";
    const string = this.look.string;
    strand.nozzle =
      m.baseRadius * (0.45 + 0.35 * clamp01(m.intensity)) * (splash ? 0.7 : 0.82);
    strand.maxNodes = splash ? 8 : GOO_NODES;
    strand.maxLength =
      (splash ? 0.16 : 0.32) * (1 + 0.8 * viscosity + 0.4 * tension) * string;
    strand.pinch = strand.nozzle * ((splash ? 0.5 : 0.42) - 0.17 * tension);
    strand.maxBulb =
      strand.nozzle * ((splash ? 1.45 : 1.75) + 0.9 * tension + 0.8 * viscosity);
    strand.flow = (1.4 + 5 * (1 - viscosity)) * (splash ? 1.6 : 1);
    strand.yieldRate = (3 + 12 * (1 - viscosity)) * (splash ? 1.4 : 1);
    strand.stiffness =
      (1.2 + 8 * viscosity ** 1.5 + 2.5 * tension) * (splash ? 0.7 : 1);
    // Surface tension draws a rope in at a speed set by tension over viscosity.
    strand.shrink = (0.25 + 1.1 * tension) * (1 - 0.8 * viscosity);
  }

  private spawnStrand(
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number
  ): GooStrand | null {
    const strand = this.takeStrand();
    if (!strand) return null;
    strand.attached = true;
    strand.tip = id;
    strand.age = 0;
    this.tune(strand);
    strand.count = 2;
    strand.x[0] = x;
    strand.y[0] = y;
    strand.x[1] = x;
    strand.y[1] = y + 0.004;
    strand.px[0] = x - vx * SUBSTEP;
    strand.py[0] = y - vy * SUBSTEP;
    strand.px[1] = x - vx * SUBSTEP;
    strand.py[1] = y + 0.004 - vy * SUBSTEP;
    strand.rest[0] = 0.004;
    strand.vol[0] = Math.PI * strand.nozzle ** 2 * 0.004;
    strand.bulb = sphereVolume(strand.nozzle * 0.7);
    strand.fromX = strand.toX = x;
    strand.fromY = strand.toY = y;
    strand.step = SUBSTEP;
    return strand;
  }

  private detach(strand: GooStrand): void {
    strand.attached = false;
    strand.tip = null;
    strand.age = 0;
    strand.shrink = 3 + 7 * clamp01(this.material.tension);
  }

  // ---------------------------------------------------------------- ropes

  private advanceStrands(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-6));
    const h = dt / steps;
    const evaporate = this.look.evaporate;
    // Ropes split off this frame start moving next frame.
    const live = this.strands.length;
    for (let index = 0; index < live; index++) {
      const strand = this.strands[index]!;
      strand.age += dt;
      strand.step = h;
      for (let step = 0; step < steps; step++) {
        if (strand.attached) {
          const from = step / steps;
          const to = (step + 1) / steps;
          strand.px[0] = strand.fromX + (strand.toX - strand.fromX) * from;
          strand.py[0] = strand.fromY + (strand.toY - strand.fromY) * from;
          strand.x[0] = strand.fromX + (strand.toX - strand.fromX) * to;
          strand.y[0] = strand.fromY + (strand.toY - strand.fromY) * to;
        }
        this.integrate(strand, h);
        strand.lambda.fill(0);
        for (let iteration = 0; iteration < ITERATIONS; iteration++) {
          this.solve(strand, h);
        }
        this.yieldSegments(strand, h);
      }
      if (!strand.attached && evaporate > 0) {
        // A fading rope thins everywhere at once: volume goes as size cubed.
        const keep = Math.exp(-3 * evaporate * dt);
        strand.bulb *= keep;
        for (let segment = 0; segment < strand.count - 1; segment++) {
          strand.vol[segment] = strand.vol[segment]! * keep;
        }
      }
      this.drain(strand, dt);
      this.resample(strand);
      this.breakNeck(strand);
      if (strand.count > 0 && !strand.attached) this.ballUp(strand);
      if (strand.count > 0 && totalVolume(strand) < sphereVolume(SPENT_RADIUS)) {
        strand.count = 0;
      }
    }
    // Retire spent ropes; ropes split off this frame were appended and kept.
    let write = 0;
    for (const strand of this.strands) {
      if (strand.count > 0) this.strands[write++] = strand;
      else this.retire(strand);
    }
    this.strands.length = write;
  }

  private integrate(strand: GooStrand, h: number): void {
    const gravity = this.gravity * h * h;
    const drag = Math.exp(-0.35 * h);
    const { x, y, px, py } = strand;
    for (let node = strand.attached ? 1 : 0; node < strand.count; node++) {
      const cx = x[node]!;
      const cy = y[node]!;
      x[node] = cx + (cx - px[node]!) * drag;
      y[node] = cy + (cy - py[node]!) * drag + gravity;
      px[node] = cx;
      py[node] = cy;
    }
  }

  /**
   * Liquid under load stays stretched (the constraint is soft), and that
   * stretch flows into new length, so a heavy bulb or a fast spin draws the
   * rope out. Slack liquid draws together.
   */
  private yieldSegments(strand: GooStrand, h: number): void {
    const give = 1 - Math.exp(-strand.yieldRate * h);
    const gather = 1 - Math.exp(-8 * h);
    const shrink = Math.exp(-strand.shrink * h);
    for (let segment = 0; segment < strand.count - 1; segment++) {
      const length = nodeDistance(strand, segment, segment + 1);
      let rest = strand.rest[segment]!;
      rest += (length - rest) * (length > rest ? give : gather);
      strand.rest[segment] = Math.max(MIN_REST, rest * shrink);
    }
  }

  private mass(strand: GooStrand, node: number): number {
    let mass = 1e-9;
    if (node > 0) mass += 0.5 * strand.vol[node - 1]!;
    if (node < strand.count - 1) mass += 0.5 * strand.vol[node]!;
    else mass += strand.bulb;
    return mass;
  }

  /**
   * XPBD distance constraints. Compliance grows with length over cross
   * section, so a thin neck gives more than a thick one and keeps thinning.
   */
  private solve(strand: GooStrand, h: number): void {
    const { x, y } = strand;
    for (let segment = 0; segment < strand.count - 1; segment++) {
      const a = segment;
      const b = segment + 1;
      const wa = segment === 0 && strand.attached ? 0 : 1 / this.mass(strand, a);
      const wb = 1 / this.mass(strand, b);
      const dx = x[b]! - x[a]!;
      const dy = y[b]! - y[a]!;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;
      const rest = strand.rest[segment]!;
      const area = Math.max(Math.PI * segmentRadius(strand, segment) ** 2, 1e-7);
      const compliance = rest / (strand.stiffness * area) / (h * h);
      const lambda = strand.lambda[segment]!;
      const delta = (length - rest + compliance * lambda) / (wa + wb + compliance);
      strand.lambda[segment] = lambda - delta;
      const correction = delta / length;
      x[a] = x[a]! + dx * correction * wa;
      y[a] = y[a]! + dy * correction * wa;
      x[b] = x[b]! - dx * correction * wb;
      y[b] = y[b]! - dy * correction * wb;
    }
  }

  /** Liquid runs down the rope into its bulb, fastest where the rope hangs. */
  private drain(strand: GooStrand, dt: number): void {
    const viscosity = clamp01(this.material.viscosity);
    const tension = clamp01(this.material.tension);
    const column = Math.PI * (strand.nozzle * 1.35) ** 2;
    for (let segment = 0; segment < strand.count - 1; segment++) {
      // A short segment cannot hold more than a fat column; the rest runs on.
      const length = Math.max(
        strand.rest[segment]!,
        nodeDistance(strand, segment, segment + 1)
      );
      let spill = strand.vol[segment]! - column * length;
      if (spill <= 0) continue;
      if (segment === 0 && strand.attached) {
        // Thick liquid leaving the tip extrudes as a column instead of running on.
        const extrude = spill * viscosity;
        strand.rest[0] = strand.rest[0]! + extrude / column;
        spill -= extrude;
      }
      strand.vol[segment] = strand.vol[segment]! - spill;
      if (segment === strand.count - 2) strand.bulb += spill;
      else strand.vol[segment + 1] = strand.vol[segment + 1]! + spill;
    }
    // Surface tension squeezes a thread's thin spots into its fat ones, so a
    // stretched rope beads up and necks before it breaks.
    const bead = (0.6 + 4 * tension) * (1 - 0.7 * viscosity) * dt;
    for (let segment = 0; segment < strand.count - 2; segment++) {
      const thick = segmentRadius(strand, segment);
      const next = segmentRadius(strand, segment + 1);
      if (thick <= 0 || next <= 0) continue;
      const contrast = Math.abs(thick - next) / Math.max(thick, next);
      const from = thick < next ? segment : segment + 1;
      const to = thick < next ? segment + 1 : segment;
      const moved = strand.vol[from]! * Math.min(0.5, bead * contrast * 3);
      strand.vol[from] = strand.vol[from]! - moved;
      strand.vol[to] = strand.vol[to]! + moved;
    }
    for (let segment = strand.count - 2; segment >= 0; segment--) {
      const length = Math.max(1e-6, nodeDistance(strand, segment, segment + 1));
      // Canvas y points down, so downhill is a growing y.
      const downhill = (strand.y[segment + 1]! - strand.y[segment]!) / length;
      const rate = strand.flow * (0.3 + 0.7 * Math.max(0, downhill));
      const moved = strand.vol[segment]! * (1 - Math.exp(-rate * dt));
      strand.vol[segment] = strand.vol[segment]! - moved;
      if (segment === strand.count - 2) strand.bulb += moved;
      else strand.vol[segment + 1] = strand.vol[segment + 1]! + moved;
    }
  }

  /** Lay new points at the tip as the rope lengthens and merge crowded ones. */
  private resample(strand: GooStrand): void {
    if (strand.attached) {
      while (strand.rest[0]! > SEGMENT * 1.5 && strand.count < strand.maxNodes) {
        this.insertNode(strand, 0);
      }
    }
    for (let segment = 0; segment < strand.count - 1; segment++) {
      if (strand.count >= strand.maxNodes) break;
      if (strand.rest[segment]! > SEGMENT * 2.4) this.insertNode(strand, segment);
    }
    for (let node = strand.count - 2; node >= 1; node--) {
      if (strand.count <= 2) break;
      if (strand.rest[node - 1]! + strand.rest[node]! < SEGMENT * 0.85) {
        this.removeNode(strand, node);
      }
    }
  }

  /** The thinnest neck below its breaking radius lets go. */
  private breakNeck(strand: GooStrand): void {
    if (strand.count < 2) return;
    let thinnest = -1;
    let thinnestRadius = Infinity;
    for (let segment = 0; segment < strand.count - 1; segment++) {
      const radius = segmentRadius(strand, segment);
      if (radius < thinnestRadius) {
        thinnestRadius = radius;
        thinnest = segment;
      }
    }
    const crowded =
      strand.attached &&
      strand.count > 3 &&
      (ropeLength(strand) > strand.maxLength ||
        (strand.count >= strand.maxNodes && strand.rest[0]! > SEGMENT * 1.5));
    if (crowded) {
      // A rope at its point budget sheds its lower part at its thinnest neck.
      let neck = Math.floor(strand.count / 3);
      for (let segment = neck; segment < strand.count - 1; segment++) {
        if (segmentRadius(strand, segment) < segmentRadius(strand, neck)) neck = segment;
      }
      this.split(strand, neck);
      return;
    }
    if (sphereRadius(strand.bulb) > strand.maxBulb) {
      this.split(strand, strand.count - 2);
      return;
    }
    const settled = strand.attached ? strand.age > 0.06 : true;
    if (settled && thinnestRadius < strand.pinch) this.split(strand, thinnest);
  }

  /** Break segment `at`: everything below it falls on its own. */
  private split(strand: GooStrand, at: number): void {
    const half = strand.vol[at]! * 0.5;
    const lowerCount = strand.count - at - 1;
    const lower = lowerCount >= 2 ? this.takeStrand() : null;
    if (lower) {
      lower.attached = false;
      lower.tip = null;
      lower.age = 0;
      lower.count = lowerCount;
      lower.maxNodes = strand.maxNodes;
      lower.maxLength = strand.maxLength;
      lower.x.set(strand.x.subarray(at + 1, strand.count));
      lower.y.set(strand.y.subarray(at + 1, strand.count));
      lower.px.set(strand.px.subarray(at + 1, strand.count));
      lower.py.set(strand.py.subarray(at + 1, strand.count));
      lower.rest.set(strand.rest.subarray(at + 1, strand.count - 1));
      lower.vol.set(strand.vol.subarray(at + 1, strand.count - 1));
      lower.vol[0] = lower.vol[0]! + half;
      lower.bulb = strand.bulb;
      lower.nozzle = strand.nozzle;
      lower.pinch = strand.pinch;
      lower.maxBulb = strand.maxBulb * 1.4;
      lower.flow = strand.flow;
      lower.yieldRate = strand.yieldRate;
      lower.stiffness = strand.stiffness;
      lower.shrink = 3 + 7 * clamp01(this.material.tension);
      lower.step = strand.step;
    } else {
      this.dropFromNodes(strand, at + 1, strand.count, half);
    }
    strand.count = at + 1;
    strand.bulb = half;
    strand.vol[at] = 0;
    if (strand.count < 2) {
      if (strand.attached) this.regrow(strand);
      else this.ballUp(strand, true);
    }
  }

  /** An attached stub keeps a second point so it can hang and grow again. */
  private regrow(strand: GooStrand): void {
    const volume = strand.bulb + (strand.count > 1 ? strand.vol[0]! : 0);
    strand.count = 2;
    strand.x[1] = strand.x[0]!;
    strand.y[1] = strand.y[0]! + 0.003;
    strand.px[1] = strand.px[0]!;
    strand.py[1] = strand.py[0]! + 0.003;
    strand.rest[0] = 0.003;
    strand.vol[0] = volume * 0.4;
    strand.bulb = volume * 0.6;
  }

  /** A free rope that has drawn itself short becomes one wobbling drop. */
  private ballUp(strand: GooStrand, force = false): void {
    const radius = sphereRadius(totalVolume(strand));
    const length = ropeLength(strand);
    if (!force && strand.count > 1 && length > radius * 2.4 && strand.age < 1.2) {
      return;
    }
    this.dropFromNodes(strand, 0, strand.count, 0, length / Math.max(radius * 2, 1e-4));
    strand.count = 0;
  }

  /** Turn nodes [from, to) into one drop at their center of mass. */
  private dropFromNodes(
    strand: GooStrand,
    from: number,
    to: number,
    extra: number,
    elongation = 1.3
  ): void {
    let volume = extra;
    let cx = 0;
    let cy = 0;
    let vx = 0;
    let vy = 0;
    for (let node = from; node < to; node++) {
      const share =
        (node === to - 1 ? strand.bulb : 0) +
        (node < strand.count - 1 && node < to - 1 ? strand.vol[node]! : 0) +
        1e-12;
      cx += strand.x[node]! * share;
      cy += strand.y[node]! * share;
      vx += ((strand.x[node]! - strand.px[node]!) / strand.step) * share;
      vy += ((strand.y[node]! - strand.py[node]!) / strand.step) * share;
      volume += share;
    }
    const weight = volume - extra;
    if (weight <= 0) return;
    const radius = sphereRadius(volume);
    if (radius < SPENT_RADIUS) return;
    this.spawnDrop(
      cx / weight,
      cy / weight,
      vx / weight,
      vy / weight,
      radius,
      Math.min(0.45, 0.12 + 0.18 * (elongation - 1)),
      -1
    );
  }

  private insertNode(strand: GooStrand, segment: number): void {
    const at = segment + 1;
    const { x, y, px, py, rest, vol } = strand;
    for (let node = strand.count; node > at; node--) {
      x[node] = x[node - 1]!;
      y[node] = y[node - 1]!;
      px[node] = px[node - 1]!;
      py[node] = py[node - 1]!;
    }
    for (let index = strand.count - 1; index > segment; index--) {
      rest[index] = rest[index - 1]!;
      vol[index] = vol[index - 1]!;
    }
    x[at] = (x[segment]! + x[segment + 2]!) / 2;
    y[at] = (y[segment]! + y[segment + 2]!) / 2;
    px[at] = (px[segment]! + px[segment + 2]!) / 2;
    py[at] = (py[segment]! + py[segment + 2]!) / 2;
    rest[segment] = rest[segment]! / 2;
    rest[segment + 1] = rest[segment]!;
    vol[segment] = vol[segment]! / 2;
    vol[segment + 1] = vol[segment]!;
    strand.count++;
  }

  private removeNode(strand: GooStrand, node: number): void {
    const { x, y, px, py, rest, vol } = strand;
    rest[node - 1] = rest[node - 1]! + rest[node]!;
    vol[node - 1] = vol[node - 1]! + vol[node]!;
    x.copyWithin(node, node + 1, strand.count);
    y.copyWithin(node, node + 1, strand.count);
    px.copyWithin(node, node + 1, strand.count);
    py.copyWithin(node, node + 1, strand.count);
    rest.copyWithin(node, node + 1, strand.count - 1);
    vol.copyWithin(node, node + 1, strand.count - 1);
    strand.count--;
  }

  // ---------------------------------------------------------------- drops

  /**
   * `toward` is how much of the drop's flight heads at the viewer: 0 never
   * reaches the glass, a negative value lets its speed decide.
   */
  private spawnDrop(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    wobble: number,
    toward: number
  ): void {
    if (this.drops.length >= GOO_MAX_DROPS || r < SPENT_RADIUS) return;
    const speed = Math.hypot(vx, vy);
    // Most drops fly past the glass; a hard fling sends more of them at it,
    // and a slow drip almost always falls straight down.
    const chance = toward < 0 ? 0.02 + 0.1 * Math.min(1, speed / 6) : toward * 0.12;
    const glassAt =
      this.random() < chance ? 0.12 + 0.38 * this.random() : Infinity;
    this.drops.push({
      x,
      y,
      vx,
      vy,
      r,
      age: 0,
      wobble,
      ax: speed > 1e-3 ? vx / speed : 0,
      ay: speed > 1e-3 ? vy / speed : 1,
      glassAt,
    });
  }

  private advanceDrops(dt: number, bounds: { width: number; height: number }): void {
    const k = this.material.pxPerMeter;
    const evaporate = this.look.evaporate;
    const keep = evaporate > 0 ? Math.exp(-evaporate * dt) : 1;
    let write = 0;
    for (const drop of this.drops) {
      drop.age += dt;
      drop.r *= keep;
      drop.vy += this.gravity * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (drop.age >= drop.glassAt) {
        this.impacts.push({
          x: drop.x * k,
          y: drop.y * k,
          vx: drop.vx * k,
          vy: drop.vy * k,
          r: drop.r * k * approach(drop),
        });
        continue;
      }
      const margin = drop.r * 4;
      const gone =
        drop.r < SPENT_RADIUS ||
        drop.age >= DROP_LIFE ||
        (drop.y - margin) * k > bounds.height ||
        (drop.x + margin) * k < 0 ||
        (drop.x - margin) * k > bounds.width;
      if (!gone) this.drops[write++] = drop;
    }
    this.drops.length = write;
  }

  // ---------------------------------------------------------------- pool

  private takeStrand(): GooStrand | null {
    if (this.strands.length >= GOO_MAX_STRANDS) return null;
    const strand = this.spare.pop() ?? makeStrand();
    strand.count = 0;
    strand.bulb = 0;
    strand.rest.fill(0);
    strand.vol.fill(0);
    this.strands.push(strand);
    return strand;
  }

  private retire(strand: GooStrand): void {
    for (const state of this.tips.values()) {
      if (state.strand === strand) state.strand = null;
    }
    strand.attached = false;
    strand.tip = null;
    this.spare.push(strand);
  }
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
