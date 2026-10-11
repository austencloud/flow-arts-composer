/**
 * Goo strand physics for the Canvas2D backend, after the 3D goo's model.
 *
 * Every tracked tip carries one strand: the tip itself, a light middle node
 * and a weighted bulb, joined by zero-length springs with an internal damper.
 * Gravity makes the bulb hang; a moving prop drags it out behind the tip and
 * a spinning one flings it outward. The bulb fills with liquid while it hangs.
 * When the strand is pulled past its pinch length the bulb lets go as a drop
 * and a fresh bead starts at the tip, so a still tip drips slowly and a fast
 * one throws beads.
 *
 * Viscosity (`surfaceTension`) is the one material knob: watery goo is soft,
 * pinches short and drips often; thick goo is stiff, stretches long and
 * clings. Units are canvas pixels authored at the reference canvas and scaled
 * by the caller's effect scale.
 */

/** Integration step. The springs are stiff enough that 1/60 s would explode. */
const SUBSTEP = 1 / 240;
const MAX_SUBSTEPS = 16;
/** Longest frame the sim will integrate; anything longer is a stall. */
const MAX_FRAME = 1 / 15;
export const GOO_MAX_DROPS = 90;
/** Downward acceleration at the reference canvas, px/s². */
const GRAVITY_PX = 900;
const MID_MASS = 0.3;
const HEAD_MASS = 0.35;
const AIR_DRAG = 0.6;
const DROP_DRAG = 0.4;
/** A tip that moves further than this share of the pane in one frame jumped. */
const TELEPORT_FRACTION = 0.25;
/** A stretched strand that may not let go yet stops lengthening here. */
const MAX_STRETCH = 1.5;

export interface GooNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GooStrand {
  id: string;
  /** The tip, as measured this frame. */
  tail: GooNode;
  mid: GooNode;
  head: GooNode;
  /** How full the bulb is, 0..1. Drives its size and weight. */
  fill: number;
  /** Seconds since the strand last let go of a drop. */
  sincePinch: number;
}

export interface GooDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
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
  /** 0..1: how fast the bulb fills while the tip is still. */
  ambient: number;
  /** 0..1. */
  intensity: number;
  /** Gravity multiplier from the intent. */
  gravity: number;
  /** Effect scale for the pane (pane min side / reference size). */
  scale: number;
  /** Tip speed in px/s that counts as full motion. */
  referenceSpeed: number;
}

export interface GooShape {
  stiffness: number;
  damping: number;
  pinchLength: number;
  /** A bulb this empty stretches instead of letting go. */
  pinchFill: number;
  bulbMaxRadius: number;
}

export function resolveGooShape(material: GooMaterial): GooShape {
  const visc = clamp01(material.viscosity);
  const s = material.scale;
  // Thick goo is the softer spring here, not the stiffer one: it hangs longer
  // before it lets go, and its extra damping is what makes it slow to move.
  return {
    stiffness: 32 - 12 * visc,
    damping: 2.5 + 6 * visc,
    pinchLength: (38 + 70 * visc) * s,
    pinchFill: 0.15 + 0.3 * visc,
    bulbMaxRadius:
      (11 + 6 * clamp01(material.intensity)) *
      (0.75 + 0.5 * clamp01(material.amount)) *
      s,
  };
}

/** Bulb radius for a fill level: never smaller than a bead. */
export function gooBulbRadius(shape: GooShape, fill: number): number {
  return shape.bulbMaxRadius * (0.35 + 0.65 * Math.sqrt(clamp01(fill)));
}

export class GooStrandSim {
  readonly strands = new Map<string, GooStrand>();
  readonly drops: GooDrop[] = [];
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
    const dt = Math.min(Math.max(frameDt, 0), MAX_FRAME);
    const shape = resolveGooShape(material);
    const gravity = GRAVITY_PX * material.scale * material.gravity;
    const jump = TELEPORT_FRACTION * Math.max(bounds.width, bounds.height);
    const live = new Set<string>();

    for (const tip of tips) {
      live.add(tip.id);
      const last = this.previous.get(tip.id);
      let strand = this.strands.get(tip.id);
      const jumped = !last || Math.hypot(tip.x - last.x, tip.y - last.y) > jump;
      if (!strand || jumped) {
        strand = makeStrand(tip);
        this.strands.set(tip.id, strand);
      }
      const from = jumped || !last ? tip : last;
      if (dt > 0) this.advance(strand, from, tip, dt, shape, gravity, material);
      this.previous.set(tip.id, { x: tip.x, y: tip.y });
    }
    for (const id of [...this.strands.keys()]) {
      if (live.has(id)) continue;
      this.strands.delete(id);
      this.previous.delete(id);
    }
    if (dt > 0) this.advanceDrops(dt, gravity, bounds);
  }

  clear(): void {
    this.strands.clear();
    this.drops.length = 0;
    this.previous.clear();
  }

  private advance(
    strand: GooStrand,
    from: { x: number; y: number },
    to: { x: number; y: number },
    dt: number,
    shape: GooShape,
    gravity: number,
    material: GooMaterial
  ): void {
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP)));
    const h = dt / steps;
    const tvx = (to.x - from.x) / dt;
    const tvy = (to.y - from.y) / dt;
    const tail = strand.tail;
    const motion =
      material.referenceSpeed > 0
        ? Math.min(1, Math.hypot(tvx, tvy) / material.referenceSpeed)
        : 0;
    strand.fill = Math.min(
      1,
      strand.fill +
        dt *
          (0.3 * clamp01(material.ambient) +
            0.9 * clamp01(material.amount) * motion)
    );
    strand.sincePinch += dt;
    const { mid, head } = strand;
    const k = shape.stiffness;
    const c = shape.damping;
    const headMass = HEAD_MASS + strand.fill;

    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      tail.x = from.x + (to.x - from.x) * f;
      tail.y = from.y + (to.y - from.y) * f;
      tail.vx = tvx;
      tail.vy = tvy;

      // Zero-length springs with a damper on the relative velocity of each
      // link: the liquid pulls itself together and resists shearing.
      const upX = k * (tail.x - mid.x) + c * MID_MASS * (tail.vx - mid.vx);
      const upY = k * (tail.y - mid.y) + c * MID_MASS * (tail.vy - mid.vy);
      const dnX = k * (head.x - mid.x) + c * MID_MASS * (head.vx - mid.vx);
      const dnY = k * (head.y - mid.y) + c * MID_MASS * (head.vy - mid.vy);
      mid.vx += ((upX + dnX) / MID_MASS - AIR_DRAG * mid.vx) * h;
      mid.vy += ((upY + dnY) / MID_MASS - AIR_DRAG * mid.vy + gravity) * h;
      head.vx += (-dnX / headMass - AIR_DRAG * head.vx) * h;
      head.vy += (-dnY / headMass - AIR_DRAG * head.vy + gravity) * h;
      mid.x += mid.vx * h;
      mid.y += mid.vy * h;
      head.x += head.vx * h;
      head.y += head.vy * h;

      const reach = Math.hypot(head.x - tail.x, head.y - tail.y);
      if (reach <= shape.pinchLength) continue;
      if (strand.fill >= shape.pinchFill) {
        this.pinch(strand, shape);
      } else if (reach > shape.pinchLength * MAX_STRETCH) {
        holdReach(tail, head, shape.pinchLength * MAX_STRETCH, reach);
      }
    }
  }

  private pinch(strand: GooStrand, shape: GooShape): void {
    const { tail, mid, head } = strand;
    if (this.drops.length < GOO_MAX_DROPS) {
      this.drops.push({
        x: head.x,
        y: head.y,
        vx: head.vx,
        vy: head.vy,
        r: gooBulbRadius(shape, strand.fill),
        age: 0,
        life: 1.5 + this.random() * 0.7,
      });
    }
    // A new bead starts at the tip; the snapped neck recoils into it.
    const nx = tail.x + (head.x - tail.x) * 0.18;
    const ny = tail.y + (head.y - tail.y) * 0.18;
    head.x = nx;
    head.y = ny;
    head.vx = tail.vx + (head.vx - tail.vx) * 0.3;
    head.vy = tail.vy + (head.vy - tail.vy) * 0.3;
    mid.x = (tail.x + nx) / 2;
    mid.y = (tail.y + ny) / 2;
    mid.vx = (tail.vx + head.vx) / 2;
    mid.vy = (tail.vy + head.vy) / 2;
    strand.fill = 0.04;
    strand.sincePinch = 0;
  }

  private advanceDrops(
    dt: number,
    gravity: number,
    bounds: { width: number; height: number }
  ): void {
    let write = 0;
    for (const drop of this.drops) {
      drop.age += dt;
      drop.vy += gravity * dt;
      drop.vx -= drop.vx * DROP_DRAG * dt;
      drop.vy -= drop.vy * DROP_DRAG * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      const margin = drop.r * 4;
      const gone =
        drop.age >= drop.life ||
        drop.y - margin > bounds.height ||
        drop.x + margin < 0 ||
        drop.x - margin > bounds.width;
      if (!gone) this.drops[write++] = drop;
    }
    this.drops.length = write;
  }
}

/**
 * Keep a thin strand from stretching further: pull the bulb back onto the
 * limit and drop the part of its velocity that was carrying it outward.
 */
function holdReach(
  tail: GooNode,
  head: GooNode,
  limit: number,
  reach: number
): void {
  const ux = (head.x - tail.x) / reach;
  const uy = (head.y - tail.y) / reach;
  head.x = tail.x + ux * limit;
  head.y = tail.y + uy * limit;
  const outward = (head.vx - tail.vx) * ux + (head.vy - tail.vy) * uy;
  if (outward > 0) {
    head.vx -= outward * ux;
    head.vy -= outward * uy;
  }
}

function makeStrand(tip: GooTipInput): GooStrand {
  const node = (): GooNode => ({ x: tip.x, y: tip.y, vx: 0, vy: 0 });
  return {
    id: tip.id,
    tail: node(),
    mid: node(),
    head: node(),
    fill: 0.04,
    sincePinch: 0,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
