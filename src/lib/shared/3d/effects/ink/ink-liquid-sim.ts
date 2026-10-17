/**
 * Ink as a thin liquid, shared by the 3D renderer and the 2D overlay.
 *
 * A moving tip sheds ink. Each parcel leaves with the tip's own velocity, so
 * a spinning prop throws a ligament that unwinds outward in a spiral, the way
 * a garden sprinkler does, then falls under gravity and air drag. Parcels are
 * linked into strands; a strand keeps its volume, so it thins as it stretches.
 * It breaks where it gets too thin or once capillary instability has had time
 * to act, and every broken end pulls back at a steady speed (Taylor-Culick
 * retraction) until it balls up into a drop. Drops wobble as they settle,
 * stretch with speed, and splat on the floor into stains that spread, soak in
 * and dry; a fast impact throws a crown of smaller drops. A tip at rest grows
 * a hanging drop that falls when it gets too heavy to hold.
 *
 * Units are metres and seconds with y up. The 2D overlay feeds screen tips
 * scaled to metres and passes no floor.
 */

export interface InkLiquidSettings {
  /** Radius of a fresh ligament as it leaves the tip, in metres. */
  flowRadius: number;
  /** 0 to 1: how much ink a moving tip sheds. */
  motion: number;
  /** 0 to 1: how fast a resting tip grows its hanging drop. */
  ambient: number;
  /** Seconds a ligament of flowRadius lasts before it beads into drops. */
  breakupSeconds: number;
  /** 0 to 1: spray thrown off sharp turns and crowns thrown off impacts. */
  splatter: number;
  /** Seconds a floor stain takes to dry away. */
  stainSeconds: number;
}

export interface InkLiquidIntent {
  intensity: number;
  motionEmission: number;
  viscosity: number;
  splatterIntensity: number;
}

export interface InkLiquidTip {
  /** Stable identity for this tip across frames. */
  key: string | number;
  x: number;
  y: number;
  z: number;
  /** The tip jumped (a sequence seam); cut its strand instead of drawing across. */
  jumped?: boolean;
}

export interface InkLiquidSource {
  key: string | number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Newest parcel of the strand still tied to this tip, or -1. */
  head: number;
  /** Volume of the drop hanging from the tip, in cubic metres. */
  drip: number;
  travel: number;
  /** The tip has a velocity from a previous frame, so it can say how it turns. */
  travelled: boolean;
  /** Length of the last frame, and the velocity its ink left with at the end. */
  lastDt: number;
  endVx: number;
  endVy: number;
  endVz: number;
  accel: number;
  spray: number;
  frame: number;
}

const GRAVITY = -9.8;
/** Quadratic air drag per metre of speed, scaled by 1 / radius. */
const DRAG = 0.0025;
/** Tip travel between parcels, in metres. */
const SPACING = 0.024;
/**
 * Ink leaves a prop when the tip turns harder than the film's grip can follow
 * (gravity alone it holds), so shedding follows the tip's acceleration in
 * m/s^2, not its speed: a tip sliding straight carries its ink along.
 */
const SHED_START = 10;
const SHED_FULL = 34;
/** A ligament thinner than this tears, in metres. */
const RUPTURE_RADIUS = 0.0011;
/** Steady pull-back speed of a free end, in m/s. */
const RETRACT_SPEED = 0.85;
/** How fast a kink in a thread pulls straight, and its speeds even out, per second. */
const TENSION_RATE = 9;
const VISCOUS_RATE = 14;
/** Relative sideways speed two ends leave a pinch-off with, in m/s. */
const PINCH_KICK = 0.35;
/** Depth of ink pooled on a sealed stage, in metres: it beads up rather than soaking in. */
const FILM = 0.006;
/** A stain takes in new drops while younger than this share of its life. */
const POOL_WET = 0.3;
/** A pool this wide stops taking drops; past it the stage is already soaked. */
const POOL_MAX_RADIUS = 0.07;
/** Radius a hanging drop reaches before it falls, in metres. */
const DRIP_RADIUS = 0.0105;
/** Hanging-drop growth at full ambient, in cubic metres per second. */
const DRIP_RATE = 9e-6;
/** Impact speed (m/s) that starts a crown splash. */
const CROWN_SPEED = 1.3;
const MAX_AGE = 9;
const CULL_DISTANCE = 40;
const MAX_SPAWN_PER_FRAME = 14;

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export const sphereVolume = (radius: number) => (4 / 3) * Math.PI * radius ** 3;
export const sphereRadius = (volume: number) =>
  Math.cbrt((3 * Math.max(0, volume)) / (4 * Math.PI));

/**
 * The look's intent as liquid: intensity sets how thick the ink runs,
 * viscosity how soon a ligament beads (0 never does, 1 shatters at once).
 */
export function resolveInkLiquidSettings(
  intent: InkLiquidIntent,
  options: { ambient: number; stainSeconds?: number; thickness?: number }
): InkLiquidSettings {
  const viscosity = clamp01(intent.viscosity);
  const hold = 1 - viscosity;
  return {
    flowRadius: (0.0055 + 0.0095 * clamp01(intent.intensity)) * (options.thickness ?? 1),
    motion: clamp01(intent.motionEmission),
    ambient: clamp01(options.ambient),
    breakupSeconds: viscosity <= 0.01 ? Infinity : 0.035 + 1.1 * hold * hold,
    splatter: clamp01(intent.splatterIntensity),
    stainSeconds: options.stainSeconds ?? 4.5,
  };
}

/**
 * How a drop of this radius looks right now: its length along its motion and
 * its width across, at equal volume. Speed draws it out; a fresh drop still
 * rings from the merge or tear that made it.
 */
export function inkDropShape(
  radius: number,
  speed: number,
  shapeAge: number
): { along: number; across: number } {
  const hertz = Math.min(16, Math.max(3, 3.6 * Math.pow(0.01 / Math.max(radius, 1e-4), 1.5)));
  const ring = 0.3 * Math.exp(-shapeAge / 0.16) * Math.cos(Math.PI * 2 * hertz * shapeAge);
  const stretch = Math.max(0.6, 1 + Math.min(0.7, speed * 0.075) + ring);
  return { along: radius * stretch, across: radius / Math.sqrt(stretch) };
}

export class InkLiquidSim {
  readonly capacity: number;
  readonly stainCapacity: number;
  readonly alive: Uint8Array;
  readonly landed: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly volume: Float32Array;
  /** Neighbor toward the tip (newer ink), or -1. */
  readonly newer: Int32Array;
  /** Neighbor away from the tip (older ink), or -1. */
  readonly older: Int32Array;
  /** Seconds the link to `older` has existed. */
  readonly linkAge: Float32Array;
  /** Per-parcel spread on breakup time, so a strand beads unevenly. */
  readonly hold: Float32Array;
  readonly age: Float32Array;
  /** Seconds since this parcel last merged or tore; drives the wobble. */
  readonly shapeAge: Float32Array;
  readonly owner: Int32Array;

  readonly stainAlive: Uint8Array;
  readonly stainX: Float32Array;
  readonly stainY: Float32Array;
  readonly stainZ: Float32Array;
  readonly stainRadius: Float32Array;
  readonly stainAspect: Float32Array;
  readonly stainAngle: Float32Array;
  readonly stainAge: Float32Array;
  /** Ink each stain holds, so a drop landing on a wet one makes it grow. */
  readonly stainVolume: Float32Array;

  readonly sources: InkLiquidSource[] = [];
  private readonly free: Int32Array;
  private freeCount: number;
  private stainCursor = 0;
  private frame = 0;
  private seed: number;
  private stainSeconds = 4.5;

  constructor(capacity = 2400, stainCapacity = 900, seed = 0x1c3a5) {
    this.capacity = capacity;
    this.stainCapacity = stainCapacity;
    this.alive = new Uint8Array(capacity);
    this.landed = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.volume = new Float32Array(capacity);
    this.newer = new Int32Array(capacity).fill(-1);
    this.older = new Int32Array(capacity).fill(-1);
    this.linkAge = new Float32Array(capacity);
    this.hold = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.shapeAge = new Float32Array(capacity);
    this.owner = new Int32Array(capacity).fill(-1);
    this.free = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
    this.freeCount = capacity;
    this.stainAlive = new Uint8Array(stainCapacity);
    this.stainX = new Float32Array(stainCapacity);
    this.stainY = new Float32Array(stainCapacity);
    this.stainZ = new Float32Array(stainCapacity);
    this.stainRadius = new Float32Array(stainCapacity);
    this.stainAspect = new Float32Array(stainCapacity);
    this.stainAngle = new Float32Array(stainCapacity);
    this.stainAge = new Float32Array(stainCapacity);
    this.stainVolume = new Float32Array(stainCapacity);
    this.seed = seed >>> 0 || 1;
  }

  get liveCount(): number {
    return this.capacity - this.freeCount;
  }

  /**
   * Advance the liquid by dt and shed from this frame's tips. `floorY` is the
   * surface drops splat on (-Infinity for none); parcels below `cullY` leave.
   */
  update(
    dt: number,
    tips: readonly InkLiquidTip[],
    settings: InkLiquidSettings,
    floorY = -Infinity,
    cullY = -Infinity
  ): void {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 1 / 15) : 0;
    this.frame++;
    this.stainSeconds = settings.stainSeconds;
    if (step > 0) {
      this.integrate(step, floorY, cullY, settings);
      this.tear(step, settings);
      this.tension(step);
      this.retract(step, floorY);
      this.ageStains(step);
    }
    const spacing = SPACING * Math.sqrt(Math.max(1, tips.length / 4));
    for (const tip of tips) this.feed(tip, step, settings, spacing);
    for (let s = this.sources.length - 1; s >= 0; s--) {
      const source = this.sources[s]!;
      if (source.frame === this.frame) continue;
      // The tip is gone: let go of its strand and its hanging drop.
      this.letGo(source);
      this.sources.splice(s, 1);
      for (let i = 0; i < this.capacity; i++) {
        if (this.owner[i] === s) this.owner[i] = -1;
        else if (this.owner[i]! > s) this.owner[i]!--;
      }
    }
  }

  clear(): void {
    this.alive.fill(0);
    this.landed.fill(0);
    this.newer.fill(-1);
    this.older.fill(-1);
    this.owner.fill(-1);
    for (let i = 0; i < this.capacity; i++) this.free[i] = this.capacity - 1 - i;
    this.freeCount = this.capacity;
    this.stainAlive.fill(0);
    this.sources.length = 0;
  }

  /** Radius of the ligament between two linked parcels, from their volume. */
  segmentRadius(a: number, b: number): number {
    const length = Math.max(
      1e-4,
      Math.hypot(this.x[a]! - this.x[b]!, this.y[a]! - this.y[b]!, this.z[a]! - this.z[b]!)
    );
    return Math.sqrt((0.5 * (this.volume[a]! + this.volume[b]!)) / (Math.PI * length));
  }

  /** Thickness of a strand at one parcel: its ligaments, capped by its own ball. */
  nodeRadius(i: number): number {
    const ball = sphereRadius(this.volume[i]!);
    const o = this.older[i]!;
    const n = this.newer[i]!;
    let sum = 0;
    let count = 0;
    if (o >= 0) {
      sum += this.segmentRadius(i, o);
      count++;
    }
    if (n >= 0) {
      sum += this.segmentRadius(i, n);
      count++;
    }
    if (count === 0) return ball;
    // A free end gathers into a bulb as it pulls back.
    const end = count === 1 && !this.isHead(i) ? 0.75 : 0;
    const tube = sum / count;
    return Math.min(ball, tube + (ball - tube) * end);
  }

  isHead(i: number): boolean {
    const owner = this.owner[i]!;
    return owner >= 0 && this.sources[owner]?.head === i;
  }

  stainLife(i: number): number {
    return clamp01(this.stainAge[i]! / Math.max(0.1, this.stainSeconds));
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x1_0000_0000;
  }

  private take(): number {
    if (this.freeCount === 0) return -1;
    const i = this.free[--this.freeCount]!;
    this.alive[i] = 1;
    this.landed[i] = 0;
    this.newer[i] = -1;
    this.older[i] = -1;
    this.owner[i] = -1;
    this.linkAge[i] = 0;
    this.age[i] = 0;
    this.shapeAge[i] = 0;
    this.hold[i] = 0.55 + 0.9 * this.random();
    return i;
  }

  private remove(i: number): void {
    if (!this.alive[i]) return;
    const n = this.newer[i]!;
    const o = this.older[i]!;
    if (n >= 0) this.older[n] = -1;
    if (o >= 0) this.newer[o] = -1;
    const owner = this.owner[i]!;
    if (owner >= 0 && this.sources[owner]?.head === i) this.sources[owner]!.head = -1;
    this.alive[i] = 0;
    this.newer[i] = -1;
    this.older[i] = -1;
    this.owner[i] = -1;
    this.free[this.freeCount++] = i;
  }

  private unlink(newerIndex: number): void {
    const o = this.older[newerIndex]!;
    if (o < 0) return;
    this.older[newerIndex] = -1;
    this.newer[o] = -1;
    this.shapeAge[newerIndex] = 0;
    this.shapeAge[o] = 0;
  }

  private sourceFor(tip: InkLiquidTip): InkLiquidSource {
    for (const source of this.sources) if (source.key === tip.key) return source;
    const source: InkLiquidSource = {
      key: tip.key,
      x: tip.x,
      y: tip.y,
      z: tip.z,
      vx: 0,
      vy: 0,
      vz: 0,
      head: -1,
      drip: 0,
      travel: 0,
      travelled: false,
      lastDt: 0,
      endVx: 0,
      endVy: 0,
      endVz: 0,
      accel: 0,
      spray: 0,
      frame: this.frame,
    };
    this.sources.push(source);
    return source;
  }

  private letGo(source: InkLiquidSource): void {
    source.head = -1;
    if (source.drip > 0) this.releaseDrip(source);
  }

  private releaseDrip(source: InkLiquidSource): void {
    const radius = sphereRadius(source.drip);
    const i = this.take();
    source.drip = 0;
    if (i < 0) return;
    this.x[i] = source.x;
    this.y[i] = source.y - radius;
    this.z[i] = source.z;
    this.vx[i] = source.vx;
    this.vy[i] = source.vy;
    this.vz[i] = source.vz;
    this.volume[i] = sphereVolume(radius);
  }

  private feed(
    tip: InkLiquidTip,
    dt: number,
    settings: InkLiquidSettings,
    spacing: number
  ): void {
    const source = this.sourceFor(tip);
    const owner = this.sources.indexOf(source);
    // A tip seen for the first time, or after a gap, has no velocity yet.
    const fresh = source.frame !== this.frame - 1;
    source.frame = this.frame;
    const dx = tip.x - source.x;
    const dy = tip.y - source.y;
    const dz = tip.z - source.z;
    const distance = Math.hypot(dx, dy, dz);
    if (tip.jumped || fresh || dt <= 0 || distance > 0.75) {
      this.letGo(source);
      source.x = tip.x;
      source.y = tip.y;
      source.z = tip.z;
      source.vx = source.vy = source.vz = 0;
      source.travel = 0;
      source.travelled = false;
      source.accel = 0;
      return;
    }

    const vx = dx / dt;
    const vy = dy / dt;
    const vz = dz / dt;
    const x0 = source.x;
    const y0 = source.y;
    const z0 = source.z;
    // A chord velocity holds at the middle of its frame; two of them say how
    // the tip was turning, and so where it was heading at this frame's end.
    const span = 0.5 * (source.lastDt + dt);
    const ax = source.travelled ? (vx - source.vx) / span : 0;
    const ay = source.travelled ? (vy - source.vy) / span : 0;
    const az = source.travelled ? (vz - source.vz) / span : 0;
    if (source.travelled) {
      source.accel += (Math.hypot(ax, ay, az) - source.accel) * 0.75;
    }
    // Ink leaving during this frame blends from the velocity the last
    // frame's ink left with to this frame's. Speed never jumps between one
    // frame's parcels and the next, and nothing extrapolates, so a sudden
    // change in the tip's motion cannot throw ink past where the tip went.
    const startVx = source.travelled ? source.endVx : vx;
    const startVy = source.travelled ? source.endVy : vy;
    const startVz = source.travelled ? source.endVz : vz;
    const endVx = vx;
    const endVy = vy;
    const endVz = vz;
    source.travelled = true;
    source.lastDt = dt;
    source.endVx = endVx;
    source.endVy = endVy;
    source.endVz = endVz;
    source.x = tip.x;
    source.y = tip.y;
    source.z = tip.z;
    source.vx = vx;
    source.vy = vy;
    source.vz = vz;
    const speed = distance / dt;

    // At rest a drop gathers on the tip until it is too heavy to hold; any
    // real motion flings it.
    source.drip += settings.ambient * DRIP_RATE * dt;
    if (source.drip > 0 && (source.drip >= sphereVolume(DRIP_RADIUS) || speed > 1.2)) {
      this.releaseDrip(source);
    }

    const shed = settings.motion * smoothstep(SHED_START, SHED_FULL, source.accel) * smoothstep(0.3, 0.9, speed);
    if (shed < 0.04) {
      source.head = -1;
      source.travel = 0;
    } else {
      const radius = settings.flowRadius * Math.sqrt(shed);
      source.travel += distance;
      let spawned = 0;
      while (source.travel >= spacing && spawned < MAX_SPAWN_PER_FRAME) {
        source.travel -= spacing;
        spawned++;
        const i = this.take();
        if (i < 0) break;
        // Where the tip passed this parcel's point, and how long ago.
        const back = distance > 0 ? source.travel / distance : 0;
        const since = back * dt;
        // Neighbors leave with the tip's own smooth velocity, no noise, so
        // the strand stays a clean curve until physics breaks it.
        const t = 1 - back;
        const pvx = startVx + (endVx - startVx) * t;
        const pvy = startVy + (endVy - startVy) * t;
        const pvz = startVz + (endVz - startVz) * t;
        this.x[i] = x0 + dx * t + pvx * since;
        this.y[i] = y0 + dy * t + pvy * since + 0.5 * GRAVITY * since * since;
        this.z[i] = z0 + dz * t + pvz * since;
        this.vx[i] = pvx;
        this.vy[i] = pvy + GRAVITY * since;
        this.vz[i] = pvz;
        this.volume[i] = Math.PI * radius * radius * spacing;
        this.owner[i] = owner;
        const head = source.head;
        if (head >= 0 && this.alive[head] && this.newer[head]! < 0) {
          this.older[i] = head;
          this.newer[head] = i;
        }
        source.head = i;
      }
      if (source.travel > spacing) source.travel = spacing;
    }

    // A hard turn tears fine spray off the tip ahead of the strand.
    source.spray += settings.splatter * settings.motion * smoothstep(9, 45, source.accel) * 70 * dt;
    while (source.spray >= 1) {
      source.spray -= 1;
      const i = this.take();
      if (i < 0) break;
      const t = this.random();
      const kick = 0.25 + 0.6 * this.random();
      this.x[i] = x0 + dx * t;
      this.y[i] = y0 + dy * t;
      this.z[i] = z0 + dz * t;
      this.vx[i] = vx * (1 + 0.12 * this.random()) + (this.random() - 0.5) * kick;
      this.vy[i] = vy * (1 + 0.12 * this.random()) + (this.random() - 0.5) * kick;
      this.vz[i] = vz * (1 + 0.12 * this.random()) + (this.random() - 0.5) * kick;
      this.volume[i] = sphereVolume(settings.flowRadius * (0.3 + 0.35 * this.random()));
    }
  }

  private integrate(
    dt: number,
    floorY: number,
    cullY: number,
    settings: InkLiquidSettings
  ): void {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      this.age[i]! += dt;
      this.shapeAge[i]! += dt;
      if (this.landed[i]) {
        // A parcel on the floor stays until the strand around it is down too.
        const n = this.newer[i]!;
        const o = this.older[i]!;
        const settled =
          (n < 0 || this.landed[n] === 1) && (o < 0 || this.landed[o] === 1);
        if (settled || this.age[i]! > MAX_AGE) this.remove(i);
        continue;
      }
      // Drag per unit mass goes as 1 / size; a parcel's mass sets its size.
      const radius = sphereRadius(this.volume[i]!);
      let vx = this.vx[i]!;
      let vy = this.vy[i]!;
      let vz = this.vz[i]!;
      const speed = Math.hypot(vx, vy, vz);
      const slow = 1 / (1 + (DRAG / radius) * speed * dt);
      vx *= slow;
      vy = vy * slow + GRAVITY * dt;
      vz *= slow;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.x[i]! += vx * dt;
      this.y[i]! += vy * dt;
      this.z[i]! += vz * dt;

      if (this.y[i]! - radius * 0.5 <= floorY) {
        this.land(i, floorY, settings);
        continue;
      }
      if (
        this.y[i]! < cullY ||
        this.age[i]! > MAX_AGE ||
        Math.abs(this.x[i]!) > CULL_DISTANCE ||
        Math.abs(this.z[i]!) > CULL_DISTANCE
      ) {
        this.remove(i);
      }
    }
  }

  private land(i: number, floorY: number, settings: InkLiquidSettings): void {
    const vx = this.vx[i]!;
    const vy = this.vy[i]!;
    const vz = this.vz[i]!;
    const across = Math.hypot(vx, vz);
    const down = Math.max(0, -vy);
    let volume = this.volume[i]!;

    // A fast drop throws a crown: smaller drops leave the rim outward and up.
    const crown = settings.splatter * smoothstep(CROWN_SPEED, CROWN_SPEED + 3, down);
    const count = Math.floor(crown * 7 + this.random() * crown * 2);
    for (let c = 0; c < count; c++) {
      const j = this.take();
      if (j < 0) break;
      const share = volume * (0.025 + 0.03 * this.random());
      volume -= share;
      const angle = this.random() * Math.PI * 2;
      const out = down * (0.18 + 0.22 * this.random());
      const radius = sphereRadius(share);
      this.x[j] = this.x[i]! + Math.cos(angle) * radius * 2;
      this.y[j] = floorY + radius;
      this.z[j] = this.z[i]! + Math.sin(angle) * radius * 2;
      this.vx[j] = Math.cos(angle) * out + vx * 0.35;
      this.vy[j] = down * (0.2 + 0.25 * this.random());
      this.vz[j] = Math.sin(angle) * out + vz * 0.35;
      this.volume[j] = share;
    }

    this.stain(this.x[i]!, floorY, this.z[i]!, volume, vx, vz, across);
    this.y[i] = floorY;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.volume[i] = volume;
    if (this.newer[i]! < 0 && this.older[i]! < 0 && !this.isHead(i)) {
      this.remove(i);
      return;
    }
    this.landed[i] = 1;
  }

  private stain(
    x: number,
    y: number,
    z: number,
    volume: number,
    vx: number,
    vz: number,
    across: number
  ): void {
    if (volume <= 0) return;
    // A drop that lands in a stain still wet joins it: the pool grows and
    // keeps its shape, instead of another disc stacking on top.
    for (let k = 0; k < this.stainCapacity; k++) {
      if (!this.stainAlive[k] || this.stainLife(k) > POOL_WET) continue;
      if (this.stainRadius[k]! >= POOL_MAX_RADIUS) continue;
      const reach = this.stainRadius[k]! * this.stainAspect[k]!;
      const ox = x - this.stainX[k]!;
      const oz = z - this.stainZ[k]!;
      if (ox * ox + oz * oz > reach * reach || Math.abs(y - this.stainY[k]!) > 0.01) continue;
      const total = this.stainVolume[k]! + volume;
      const grow = Math.sqrt(total / this.stainVolume[k]!);
      this.stainX[k] = this.stainX[k]! + (ox * volume) / total;
      this.stainZ[k] = this.stainZ[k]! + (oz * volume) / total;
      this.stainRadius[k] = this.stainRadius[k]! * grow;
      this.stainVolume[k] = total;
      return;
    }
    const i = this.stainCursor;
    this.stainCursor = (this.stainCursor + 1) % this.stainCapacity;
    // The drop spreads to a thin film, further the harder it skids in.
    const aspect = 1 + Math.min(1.8, across * 0.32);
    this.stainVolume[i] = volume;
    this.stainAlive[i] = 1;
    this.stainX[i] = x;
    this.stainY[i] = y;
    this.stainZ[i] = z;
    this.stainRadius[i] =
      Math.sqrt(volume / (Math.PI * FILM)) * (1 + 0.25 * Math.min(1, across / 4)) / Math.sqrt(aspect);
    this.stainAspect[i] = aspect;
    this.stainAngle[i] = Math.atan2(vz, vx);
    this.stainAge[i] = 0;
  }

  private ageStains(dt: number): void {
    for (let i = 0; i < this.stainCapacity; i++) {
      if (!this.stainAlive[i]) continue;
      this.stainAge[i]! += dt;
      if (this.stainAge[i]! >= this.stainSeconds) this.stainAlive[i] = 0;
    }
  }

  private tear(dt: number, settings: InkLiquidSettings): void {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const o = this.older[i]!;
      if (o < 0) continue;
      this.linkAge[i]! += dt;
      if (this.landed[i] && this.landed[o]) continue;
      const radius = this.segmentRadius(i, o);
      // Thicker ligaments take longer to bead (capillary time grows as r^1.5).
      const life =
        settings.breakupSeconds *
        this.hold[i]! *
        Math.pow(Math.max(0.2, radius / Math.max(1e-4, settings.flowRadius)), 1.5);
      if (radius < RUPTURE_RADIUS || this.linkAge[i]! > life) {
        this.unlink(i);
        this.recoil(i, o);
      }
    }
  }

  /**
   * Surface tension pulls a stretched thread straight between its neighbors,
   * and viscosity evens out their speeds, so a kink in a ligament relaxes
   * instead of opening up as it flies.
   */
  private tension(dt: number): void {
    const pull = Math.min(1, dt * TENSION_RATE);
    const even = Math.min(1, dt * VISCOUS_RATE);
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i] || this.landed[i] || this.isHead(i)) continue;
      const n = this.newer[i]!;
      const o = this.older[i]!;
      if (n < 0 || o < 0) continue;
      this.x[i]! += ((this.x[n]! + this.x[o]!) * 0.5 - this.x[i]!) * pull;
      this.y[i]! += ((this.y[n]! + this.y[o]!) * 0.5 - this.y[i]!) * pull;
      this.z[i]! += ((this.z[n]! + this.z[o]!) * 0.5 - this.z[i]!) * pull;
      this.vx[i]! += ((this.vx[n]! + this.vx[o]!) * 0.5 - this.vx[i]!) * even;
      this.vy[i]! += ((this.vy[n]! + this.vy[o]!) * 0.5 - this.vy[i]!) * even;
      this.vz[i]! += ((this.vz[n]! + this.vz[o]!) * 0.5 - this.vz[i]!) * even;
    }
  }

  /**
   * A pinch-off is never perfectly clean: the neck snaps back unevenly and
   * nudges the two new ends apart sideways. Equal and opposite, so momentum
   * holds, but it spreads ink thrown in one plane across the floor.
   */
  private recoil(a: number, b: number): void {
    const ma = this.volume[a]!;
    const mb = this.volume[b]!;
    const z = this.random() * 2 - 1;
    const angle = this.random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    const kick = PINCH_KICK * (0.4 + 0.6 * this.random());
    const kx = Math.cos(angle) * ring * kick;
    const ky = Math.sin(angle) * ring * kick;
    const kz = z * kick;
    const sa = mb / (ma + mb);
    const sb = ma / (ma + mb);
    this.vx[a]! += kx * sa;
    this.vy[a]! += ky * sa;
    this.vz[a]! += kz * sa;
    this.vx[b]! -= kx * sb;
    this.vy[b]! -= ky * sb;
    this.vz[b]! -= kz * sb;
  }

  private retract(dt: number, floorY: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i] || this.landed[i] || this.isHead(i)) continue;
      const n = this.newer[i]!;
      const o = this.older[i]!;
      if ((n >= 0) === (o >= 0)) continue;
      const j = n >= 0 ? n : o;
      const dx = this.x[j]! - this.x[i]!;
      const dy = this.y[j]! - this.y[i]!;
      const dz = this.z[j]! - this.z[i]!;
      const distance = Math.hypot(dx, dy, dz);
      const touch = 0.9 * (sphereRadius(this.volume[i]!) + sphereRadius(this.volume[j]!));
      if (distance <= touch + RETRACT_SPEED * dt) {
        this.merge(i, j, floorY);
        continue;
      }
      const pull = (RETRACT_SPEED * dt) / distance;
      const pinned = this.landed[j] === 1 || this.isHead(j);
      const mi = this.volume[i]!;
      const mj = this.volume[j]!;
      const shareI = pinned ? 1 : mj / (mi + mj);
      const shareJ = pinned ? 0 : mi / (mi + mj);
      this.x[i]! += dx * pull * shareI;
      this.y[i]! += dy * pull * shareI;
      this.z[i]! += dz * pull * shareI;
      this.x[j]! -= dx * pull * shareJ;
      this.y[j]! -= dy * pull * shareJ;
      this.z[j]! -= dz * pull * shareJ;
    }
  }

  /** Fold free end i into its neighbor j, keeping volume and momentum. */
  private merge(i: number, j: number, floorY: number): void {
    const mi = this.volume[i]!;
    const mj = this.volume[j]!;
    const total = mi + mj;
    if (this.landed[j]) {
      this.stain(this.x[j]!, floorY, this.z[j]!, mi, this.vx[i]!, this.vz[i]!, Math.hypot(this.vx[i]!, this.vz[i]!));
      this.remove(i);
      return;
    }
    if (!this.isHead(j)) {
      this.x[j] = (this.x[i]! * mi + this.x[j]! * mj) / total;
      this.y[j] = (this.y[i]! * mi + this.y[j]! * mj) / total;
      this.z[j] = (this.z[i]! * mi + this.z[j]! * mj) / total;
    }
    this.vx[j] = (this.vx[i]! * mi + this.vx[j]! * mj) / total;
    this.vy[j] = (this.vy[i]! * mi + this.vy[j]! * mj) / total;
    this.vz[j] = (this.vz[i]! * mi + this.vz[j]! * mj) / total;
    this.volume[j] = total;
    this.shapeAge[j] = 0;
    this.remove(i);
  }
}
