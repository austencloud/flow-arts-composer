import { resolveGooLook2D, type GooLook2D } from "./goo-look-2d";

/**
 * Goo rope physics for the Canvas2D backend, after the 3D goo's model.
 *
 * Every tracked tip carries a rope of liquid: a chain of nodes pinned to the
 * tip, each segment holding a volume of liquid, with a bulb at the end.
 * Liquid wells out of the tip into the top segment and runs down the rope into
 * the bulb, leaving a thin coat behind. The links are soft, so the bulb's
 * weight or a spin stretches them, and stretched liquid flows into new length
 * instead of springing back. A segment that has run thin and been pulled long
 * necks; once enough liquid hangs below the neck, it pinches there and
 * everything below falls as one drop, trailing the torn neck.
 *
 * Viscosity (`surfaceTension`) is the one material knob: watery goo drains
 * fast and pinches short and often; thick goo holds its liquid in the rope,
 * stretches slowly and hangs long before it lets go. Units are canvas pixels
 * authored at the reference canvas and scaled by the caller's effect scale.
 *
 * Drops that are flying toward the viewer hit the glass in front of the scene
 * (see `GooGlassSim`); they leave this sim through `impacts`.
 */

export const GOO_NODES = 12;
const SEGMENTS = GOO_NODES - 1;
/** Integration step; the rope is soft but a long step still overshoots. */
const SUBSTEP = 1 / 480;
const MAX_SUBSTEPS = 24;
/** Longest frame the sim will integrate; anything longer is a stall. */
const MAX_FRAME = 1 / 15;
export const GOO_MAX_DROPS = 160;
/** Downward acceleration at the reference canvas, px/s². */
const GRAVITY_PX = 900;
const AIR_DRAG = 0.9;
const DROP_DRAG = 0.35;
/** A tip that moves further than this share of the pane in one frame jumped. */
const TELEPORT_FRACTION = 0.25;
/** Rest length of a fresh or recoiled segment, px at the reference canvas. */
const SEED_LENGTH = 0.5;
/** A segment run this much thinner than the coat has necked. */
const NECK = 0.55;
/** Slack thread pulls back to its length this fast, per second. */
const RETRACT = 3;
/** A link stretches at most this far past its rest length within a frame. */
const MAX_STRETCH = 1.5;

export interface GooStrand {
  id: string;
  x: Float32Array;
  y: Float32Array;
  /** Last substep's positions; velocity is (x - px) / step. */
  px: Float32Array;
  py: Float32Array;
  rest: Float32Array;
  vol: Float32Array;
  bulb: number;
  /** Length of the last substep, for reading node velocities. */
  step: number;
  /** Seconds since the strand last let go of a drop. */
  sincePinch: number;
  /** Whole jet drops owed by the steady flow (Fountain). */
  jet: number;
}

export interface GooDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
  /** Age at which it reaches the glass; Infinity for one that falls away. */
  glassAt: number;
  /** Length of torn neck it trails just after a pinch. */
  tail: number;
}

/** A drop arriving on the glass this frame. */
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

export interface GooMaterial {
  /** 0 watery .. 1 thick (the Viscosity slider). */
  viscosity: number;
  /** 0..1, the Amount slider: bulb size and how fast motion fills it. */
  amount: number;
  /** 0..1: how fast liquid wells out while the tip is still. */
  ambient: number;
  /** 0..1. */
  intensity: number;
  /** Gravity multiplier from the intent. */
  gravity: number;
  /** Effect scale for the pane (pane min side / reference size). */
  scale: number;
  /** Tip speed in px/s that counts as full motion. */
  referenceSpeed: number;
  /** Palette behavior; classic when left out. */
  look?: GooLook2D;
}

export interface GooShape {
  /** Radius of a full bulb. */
  bulbMaxRadius: number;
  /** Radius of the coat a drained rope keeps. */
  thread: number;
  /** Per second: how fast stretch turns into length. */
  creep: number;
  /** Per second: how fast liquid runs down the rope. */
  flow: number;
  /** Softness of the links. */
  compliance: number;
  /** Share of a full bulb that must hang below a neck before it lets go. */
  pinchFill: number;
  /** Longest a rope may grow before it must let go or stop stretching. */
  maxLength: number;
}

export function resolveGooShape(material: GooMaterial): GooShape {
  const visc = clamp01(material.viscosity);
  const s = material.scale;
  const bulbMaxRadius =
    (7 + 4 * clamp01(material.intensity)) *
    (0.75 + 0.5 * clamp01(material.amount)) *
    s;
  return {
    bulbMaxRadius,
    thread: (0.2 + 0.08 * visc) * bulbMaxRadius,
    creep: 5 - 3.8 * visc,
    flow: 9 - 7.8 * visc,
    compliance: 0.0011,
    pinchFill: 0.16 + 0.34 * visc,
    maxLength: (40 + 150 * visc) * (material.look?.string ?? 1) * s,
  };
}

/** Radius of a sphere holding `volume`. */
export function sphereRadius(volume: number): number {
  return Math.cbrt((3 * Math.max(0, volume)) / (4 * Math.PI));
}

function sphereVolume(radius: number): number {
  return (4 / 3) * Math.PI * radius * radius * radius;
}

/**
 * Radius of a rope segment: its liquid spread over its length. A segment
 * squeezed shorter than its rest length (the bunched stub after a pinch)
 * still counts its rest length, or it would read as a ball of liquid.
 */
export function segmentRadius(strand: GooStrand, segment: number): number {
  const length = Math.max(
    1e-3,
    strand.rest[segment]!,
    Math.hypot(
      strand.x[segment + 1]! - strand.x[segment]!,
      strand.y[segment + 1]! - strand.y[segment]!
    )
  );
  return Math.sqrt(Math.max(0, strand.vol[segment]!) / (Math.PI * length));
}

export function ropeLength(strand: GooStrand): number {
  let length = 0;
  for (let i = 0; i < SEGMENTS; i++) {
    length += Math.hypot(
      strand.x[i + 1]! - strand.x[i]!,
      strand.y[i + 1]! - strand.y[i]!
    );
  }
  return length;
}

export class GooStrandSim {
  readonly strands = new Map<string, GooStrand>();
  readonly drops: GooDrop[] = [];
  /** Drops that reached the glass during the last step. */
  readonly impacts: GooImpact[] = [];
  private previous = new Map<string, { x: number; y: number }>();
  private random: () => number;

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
    const dt = Math.min(Math.max(frameDt, 0), MAX_FRAME);
    const shape = resolveGooShape(material);
    const look = material.look ?? resolveGooLook2D("classic");
    const gravity = GRAVITY_PX * material.scale * material.gravity;
    const jump = TELEPORT_FRACTION * Math.max(bounds.width, bounds.height);
    const live = new Set<string>();

    for (const tip of tips) {
      live.add(tip.id);
      const last = this.previous.get(tip.id);
      let strand = this.strands.get(tip.id);
      const jumped = !last || Math.hypot(tip.x - last.x, tip.y - last.y) > jump;
      if (!strand || jumped) {
        strand = makeStrand(tip, shape, material.scale);
        this.strands.set(tip.id, strand);
      }
      const from = jumped || !last ? tip : last;
      if (dt > 0) {
        this.advance(strand, from, tip, dt, shape, gravity, material, look);
      }
      this.previous.set(tip.id, { x: tip.x, y: tip.y });
    }
    for (const id of [...this.strands.keys()]) {
      if (live.has(id)) continue;
      this.strands.delete(id);
      this.previous.delete(id);
    }
    if (dt > 0) this.advanceDrops(dt, gravity, bounds, look);
  }

  clear(): void {
    this.strands.clear();
    this.drops.length = 0;
    this.impacts.length = 0;
    this.previous.clear();
  }

  private advance(
    strand: GooStrand,
    from: { x: number; y: number },
    to: { x: number; y: number },
    dt: number,
    shape: GooShape,
    gravity: number,
    material: GooMaterial,
    look: GooLook2D
  ): void {
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP)));
    const h = dt / steps;
    const tvx = (to.x - from.x) / dt;
    const tvy = (to.y - from.y) / dt;
    const full = sphereVolume(shape.bulbMaxRadius);
    const motion =
      material.referenceSpeed > 0
        ? Math.min(1, Math.hypot(tvx, tvy) / material.referenceSpeed)
        : 0;
    strand.vol[0]! +=
      full *
      dt *
      (0.3 * clamp01(material.ambient) +
        0.9 * clamp01(material.amount) * motion);
    strand.sincePinch += dt;
    this.drain(strand, shape, dt);

    const { x, y, px, py, rest } = strand;
    const damp = Math.exp(-AIR_DRAG * h);
    const softness = shape.compliance / (h * h);
    const weight = new Float32Array(GOO_NODES);
    for (let i = 1; i < GOO_NODES; i++) {
      const mass =
        (0.5 * (strand.vol[i - 1]! + (i < SEGMENTS ? strand.vol[i]! : 0)) +
          (i === SEGMENTS ? strand.bulb : 0)) /
          full +
        0.02;
      weight[i] = 1 / mass;
    }

    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      x[0] = from.x + (to.x - from.x) * f;
      y[0] = from.y + (to.y - from.y) * f;
      px[0] = x[0]! - tvx * h;
      py[0] = y[0]! - tvy * h;
      for (let i = 1; i < GOO_NODES; i++) {
        const nx = x[i]! + (x[i]! - px[i]!) * damp;
        const ny = y[i]! + (y[i]! - py[i]!) * damp + gravity * h * h;
        px[i] = x[i]!;
        py[i] = y[i]!;
        x[i] = nx;
        y[i] = ny;
      }
      // Soft links that only pull: liquid thread does not push back.
      for (let i = 0; i < SEGMENTS; i++) {
        const dx = x[i + 1]! - x[i]!;
        const dy = y[i + 1]! - y[i]!;
        const length = Math.hypot(dx, dy);
        const stretch = length - rest[i]!;
        if (stretch <= 0 || length < 1e-6) continue;
        const wa = i === 0 ? 0 : weight[i]!;
        const wb = weight[i + 1]!;
        const lambda = stretch / (wa + wb + softness);
        const ux = dx / length;
        const uy = dy / length;
        // Past its stretch limit the thread stops giving: a fast spin
        // would otherwise pull it out into a long wire.
        const over = length - wa * lambda - wb * lambda - MAX_STRETCH * rest[i]!;
        const pull = over > 0 ? lambda + over / (wa + wb) : lambda;
        x[i] = x[i]! + wa * pull * ux;
        y[i] = y[i]! + wa * pull * uy;
        x[i + 1] = x[i + 1]! - wb * pull * ux;
        y[i + 1] = y[i + 1]! - wb * pull * uy;
      }
    }
    strand.step = h;

    // Stretch flows into length; slack pulls back in.
    const grow = 1 - Math.exp(-shape.creep * dt);
    const shrink = 1 - Math.exp(-RETRACT * dt);
    const longest = ropeLength(strand) >= shape.maxLength;
    for (let i = 0; i < SEGMENTS; i++) {
      const length = Math.hypot(x[i + 1]! - x[i]!, y[i + 1]! - y[i]!);
      const gap = length - rest[i]!;
      if (gap > 0 && !longest) rest[i] = rest[i]! + gap * grow;
      else if (gap < 0) rest[i] = rest[i]! + gap * shrink;
    }

    this.welling(strand, shape, material, look, dt);
    this.tryPinch(strand, shape, material, longest, look);
  }

  /** Liquid runs down the rope into the bulb, leaving a coat behind. */
  private drain(strand: GooStrand, shape: GooShape, dt: number): void {
    const share = 1 - Math.exp(-shape.flow * dt);
    const coat = Math.PI * shape.thread * shape.thread;
    for (let i = 0; i < SEGMENTS; i++) {
      const length = Math.hypot(
        strand.x[i + 1]! - strand.x[i]!,
        strand.y[i + 1]! - strand.y[i]!
      );
      const extra = strand.vol[i]! - coat * Math.max(length, strand.rest[i]!);
      if (extra <= 0) continue;
      const moved = extra * share;
      strand.vol[i] = strand.vol[i]! - moved;
      if (i + 1 < SEGMENTS) strand.vol[i + 1] = strand.vol[i + 1]! + moved;
      else strand.bulb += moved;
    }
  }

  /**
   * Find the thinnest neck. It lets go when enough liquid hangs below it, or
   * when the rope has grown as long as it may and anything at all is there.
   */
  private tryPinch(
    strand: GooStrand,
    shape: GooShape,
    material: GooMaterial,
    longest: boolean,
    look: GooLook2D
  ): void {
    let neck = -1;
    let thinnest = Infinity;
    for (let i = 1; i < SEGMENTS; i++) {
      const r = segmentRadius(strand, i);
      if (r < thinnest) {
        thinnest = r;
        neck = i;
      }
    }
    if (neck < 0) return;
    let below = strand.bulb + 0.5 * strand.vol[neck]!;
    for (let i = neck + 1; i < SEGMENTS; i++) below += strand.vol[i]!;
    const full = sphereVolume(shape.bulbMaxRadius);
    const necked = thinnest < NECK * shape.thread;
    // Thick goo that does not bead holds on until a real gob hangs there.
    const visc = clamp01(material.viscosity);
    const least = 0.004 + 0.3 * visc * visc * (1 - look.beading);
    // A thread pulled to a hair, or a rope at full length, breaks whatever
    // hangs below it: a thin coat cannot hold a long rope together.
    const snapped =
      (thinnest < 0.3 * shape.thread || longest) && strand.sincePinch > 0.12;
    if (
      (necked && below >= shape.pinchFill * full) ||
      (snapped && below >= least * full)
    ) {
      this.pinch(strand, neck, shape, material.scale, look);
    }
  }

  private pinch(
    strand: GooStrand,
    neck: number,
    shape: GooShape,
    scale: number,
    look: GooLook2D
  ): void {
    const { x, y, px, py } = strand;
    const h = strand.step || SUBSTEP;
    const end = SEGMENTS;
    let volume = strand.bulb + 0.3 * strand.vol[neck]!;
    for (let i = neck + 1; i < SEGMENTS; i++) volume += strand.vol[i]!;
    const vx = (x[end]! - px[end]!) / h;
    const vy = (y[end]! - py[end]!) / h;
    const tail = Math.min(
      sphereRadius(volume) * 3,
      Math.hypot(x[end]! - x[neck]!, y[end]! - y[neck]!)
    );
    this.spawn(x[end]!, y[end]!, vx, vy, sphereRadius(volume), tail, scale);

    // The torn neck beads up: a little of it flies as satellites.
    const neckVolume = 0.4 * strand.vol[neck]!;
    const beads = look.beading > 0.5 ? 2 : 1;
    for (let b = 0; b < beads; b++) {
      const t = (b + 1) / (beads + 1);
      const nx = x[neck]! + (x[neck + 1]! - x[neck]!) * t;
      const ny = y[neck]! + (y[neck + 1]! - y[neck]!) * t;
      const nvx = ((x[neck]! - px[neck]!) / h) * (1 - t) + vx * t;
      const nvy = ((y[neck]! - py[neck]!) / h) * (1 - t) + vy * t;
      const r = sphereRadius(neckVolume / beads);
      if (r > 0.5 * scale) this.spawn(nx, ny, nvx, nvy, r, 0, scale);
    }

    // What stays recoils toward the tip as a short stub.
    const coat = Math.PI * shape.thread * shape.thread * SEED_LENGTH * scale;
    strand.vol[neck] = strand.vol[neck]! * 0.3;
    const sx = x[neck]!;
    const sy = y[neck]!;
    const rvx = ((sx - px[neck]!) / h) * 0.5 + (x[0]! - sx) * 2;
    const rvy = ((sy - py[neck]!) / h) * 0.5 + (y[0]! - sy) * 2;
    for (let i = neck + 1; i < GOO_NODES; i++) {
      x[i] = sx;
      y[i] = sy;
      px[i] = sx - rvx * h;
      py[i] = sy - rvy * h;
    }
    for (let i = neck; i < SEGMENTS; i++) {
      strand.rest[i] = SEED_LENGTH * scale;
      if (i > neck) strand.vol[i] = coat;
    }
    strand.bulb = 0.02 * sphereVolume(shape.bulbMaxRadius);
    strand.sincePinch = 0;
  }

  /**
   * Liquid the prop gives off on its own wells up out of the tip in a small
   * fountain: Fountain throws a tall column, Classic spits now and then, Whip
   * only flings.
   */
  private welling(
    strand: GooStrand,
    shape: GooShape,
    material: GooMaterial,
    look: GooLook2D,
    dt: number
  ): void {
    const ambient = clamp01(material.ambient);
    const rate = Math.min(
      32,
      ambient ** 3 * 32 * (1 - 0.7 * clamp01(material.viscosity))
    );
    if (!(rate > 0) || material.gravity <= 0) {
      strand.jet = 0;
      return;
    }
    strand.jet = Math.min(4, strand.jet + dt * rate);
    const s = material.scale;
    const h = strand.step || SUBSTEP;
    const tvx = (strand.x[0]! - strand.px[0]!) / h;
    const tvy = (strand.y[0]! - strand.py[0]!) / h;
    while (strand.jet >= 1) {
      strand.jet -= 1;
      const lift =
        (190 + 300 * ambient * ambient) *
        (0.85 + 0.3 * this.random()) *
        s *
        Math.sqrt(material.gravity);
      const spread = (20 + 90 * this.random()) * (1.6 - ambient) * s;
      const r =
        shape.bulbMaxRadius *
        (0.12 + 0.16 * ambient) *
        (0.8 + 0.4 * this.random());
      this.spawn(
        strand.x[0]!,
        strand.y[0]!,
        tvx * 0.4 + (this.random() * 2 - 1) * spread,
        tvy * 0.4 - lift,
        look.evaporate > 0 ? r * 0.8 : r,
        0,
        s
      );
    }
  }

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    tail: number,
    scale: number
  ): void {
    if (this.drops.length >= GOO_MAX_DROPS) return;
    // Thrown drops are as likely to fly at the viewer as away; a slow drip
    // mostly falls straight down past the glass.
    const speed = Math.hypot(vx, vy);
    const toward = 0.15 + 0.5 * Math.min(1, speed / (700 * scale));
    const glassAt =
      this.random() < toward ? 0.12 + 0.38 * this.random() : Infinity;
    this.drops.push({
      x,
      y,
      vx,
      vy,
      r,
      age: 0,
      life: 4 + this.random(),
      glassAt,
      tail,
    });
  }

  private advanceDrops(
    dt: number,
    gravity: number,
    bounds: { width: number; height: number },
    look: GooLook2D
  ): void {
    const evaporate = Math.exp(-look.evaporate * dt);
    let write = 0;
    for (const drop of this.drops) {
      drop.age += dt;
      drop.vy += gravity * dt;
      drop.vx -= drop.vx * DROP_DRAG * dt;
      drop.vy -= drop.vy * DROP_DRAG * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.r *= evaporate;
      if (drop.age >= drop.glassAt) {
        this.impacts.push({
          x: drop.x,
          y: drop.y,
          vx: drop.vx,
          vy: drop.vy,
          r: drop.r * approach(drop),
        });
        continue;
      }
      const margin = drop.r * 4;
      const gone =
        drop.r < 0.3 ||
        drop.age >= drop.life ||
        drop.y - margin > bounds.height ||
        drop.x + margin < 0 ||
        drop.x - margin > bounds.width;
      if (!gone) this.drops[write++] = drop;
    }
    this.drops.length = write;
  }
}

/** A drop flying at the viewer looms larger as it nears the glass. */
export function approach(drop: GooDrop): number {
  if (!Number.isFinite(drop.glassAt)) return 1;
  const t = Math.min(1, drop.age / drop.glassAt);
  return 1 + 0.6 * t * t;
}

function makeStrand(
  tip: GooTipInput,
  shape: GooShape,
  scale: number
): GooStrand {
  const filled = (value: number) => {
    const array = new Float32Array(GOO_NODES);
    array.fill(value);
    return array;
  };
  const rest = new Float32Array(SEGMENTS).fill(SEED_LENGTH * scale);
  const vol = new Float32Array(SEGMENTS).fill(
    Math.PI * shape.thread * shape.thread * SEED_LENGTH * scale
  );
  return {
    id: tip.id,
    x: filled(tip.x),
    y: filled(tip.y),
    px: filled(tip.x),
    py: filled(tip.y),
    rest,
    vol,
    bulb: 0.04 * sphereVolume(shape.bulbMaxRadius),
    step: SUBSTEP,
    sincePinch: 0,
    jet: 0,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
