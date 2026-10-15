import type { GooLook2D } from "./goo-look-2d";
import type { GooImpact } from "./goo-strand-sim";

/**
 * Goo on the glass in front of the 2D scene.
 *
 * A drop thrown at the viewer lands here flattened, ragged at first and
 * pulling round as surface tension takes over, with a ring of specks thrown
 * off by the hit. A small splat holds to the glass and slowly dries. One that
 * is heavy enough runs down in a wandering line, shedding liquid into a wet
 * streak and leaving beads behind, picking up any splat it touches and getting
 * faster for it, until it has given away too much and stops, or runs off the
 * bottom. Streaks dry from their oldest end.
 *
 * Mercury does not wet glass: its beads roll without a streak. Ritual clings
 * and leaves long dark runs. Spirit is gone almost as it lands.
 */

/** Splats on the glass at once. */
export const GOO_MAX_SPLATS = 240;
/** Points a streak keeps before it starts a new one. */
const STREAK_POINTS = 48;
export const GOO_MAX_STREAKS = 48;
/** How flat a drop spreads on the glass, as a share of its round radius. */
const SPREAD = 1.6;
/** Spacing of streak points, px at the reference canvas. */
const STREAK_STEP = 3;
/** Seconds an evicted splat or streak takes to dry away instead of popping. */
const FADE_OUT = 0.5;

export interface GooSplat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Liquid held, as the cube of the radius it had as a round drop. */
  vol: number;
  age: number;
  /** Phase for its ragged outline and wandering run. */
  seed: number;
  /** 0..1: how ragged it still is from landing. */
  splash: number;
  /** Direction it was flying when it landed; a fresh splat smears that way. */
  heading: number;
  /** Seconds it takes to dry while still; shortened when crowded off. */
  dry: number;
  /** The streak it is laying down while it runs. */
  streak: GooStreak | null;
  /** Distance run since it last left a bead. */
  sinceBead: number;
}

export interface GooStreak {
  x: Float32Array;
  y: Float32Array;
  /** Half-width when laid down. */
  w: Float32Array;
  /** Glass time each point was laid down. */
  t: Float32Array;
  n: number;
  /** Seconds a point takes to dry. */
  dry: number;
  /** Still being laid by a running splat. */
  open: boolean;
}

export interface GooGlassParams {
  scale: number;
  gravity: number;
  viscosity: number;
  look: GooLook2D;
}

/** Radius a splat covers on the glass. */
export function splatRadius(splat: GooSplat): number {
  return SPREAD * Math.cbrt(Math.max(0, splat.vol));
}

/** Width left on a streak point at glass time `now`. */
export function streakWidth(streak: GooStreak, i: number, now: number): number {
  const left = 1 - (now - streak.t[i]!) / streak.dry;
  return left <= 0 ? 0 : streak.w[i]! * Math.sqrt(left);
}

export class GooGlassSim {
  readonly splats: GooSplat[] = [];
  readonly streaks: GooStreak[] = [];
  /** Seconds the glass has run; streak points are stamped with it. */
  now = 0;
  private random: () => number;
  private order: number[] = [];

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  clear(): void {
    this.splats.length = 0;
    this.streaks.length = 0;
    this.now = 0;
  }

  land(impacts: readonly GooImpact[], params: GooGlassParams): void {
    for (const impact of impacts) this.landOne(impact, params);
  }

  step(
    dt: number,
    params: GooGlassParams,
    bounds: { width: number; height: number }
  ): void {
    if (!(dt > 0)) return;
    this.now += dt;
    const { look, scale } = params;
    const gravity = Math.max(0, params.gravity);
    // A splat wider than this has the weight to run.
    const hold =
      gravity > 0 ? ((5 + 7 * look.grip) * scale) / Math.sqrt(gravity) : Infinity;
    const top =
      (40 + 240 * (1 - 0.75 * clamp01(params.viscosity))) *
      scale *
      Math.sqrt(gravity);
    const settle = Math.exp(-dt * 2.4 * (1 - 0.6 * clamp01(params.viscosity)));
    const evaporate = look.evaporate > 0 ? Math.exp(-look.evaporate * dt) : 1;
    const step = STREAK_STEP * scale;

    let write = 0;
    for (const splat of this.splats) {
      splat.age += dt;
      splat.splash *= settle;
      const r = splatRadius(splat);
      const weight = r / hold;
      const target = weight > 1 ? top * Math.min(1, (weight - 1) * 1.5) : 0;
      const pull = 1 - Math.exp(-dt * (target > splat.vy ? 3 : 9));
      splat.vy += (target - splat.vy) * pull;
      const running = splat.vy > 2 * scale;
      // A run wanders a little as it finds its way down the glass.
      splat.vx = running
        ? splat.vy * 0.08 * Math.sin(splat.seed * 6.3 + splat.y / (30 * scale))
        : 0;
      const moved = Math.hypot(splat.vx, splat.vy) * dt;
      splat.x += splat.vx * dt;
      splat.y += splat.vy * dt;

      if (running) {
        this.shed(splat, moved, step, params);
      } else {
        if (splat.streak) splat.streak.open = false;
        splat.streak = null;
        splat.vol *= Math.exp((-3 * dt) / splat.dry);
      }
      splat.vol *= evaporate;
      const after = splatRadius(splat);
      const gone =
        after < 0.45 * scale ||
        splat.y - after > bounds.height ||
        splat.x + after < 0 ||
        splat.x - after > bounds.width;
      if (gone) {
        if (splat.streak) splat.streak.open = false;
        continue;
      }
      this.splats[write++] = splat;
    }
    this.splats.length = write;

    this.merge();
    if (this.splats.length > GOO_MAX_SPLATS - 16) this.crowd();

    let kept = 0;
    for (const streak of this.streaks) {
      const newest = streak.t[streak.n - 1] ?? -Infinity;
      if (streak.open || this.now - newest < streak.dry) {
        this.streaks[kept++] = streak;
      }
    }
    this.streaks.length = kept;
    if (this.streaks.length > GOO_MAX_STREAKS) {
      // Dry the oldest finished streaks off quickly to make room.
      for (const streak of this.streaks) {
        if (this.streaks.length <= GOO_MAX_STREAKS) break;
        if (streak.open) continue;
        streak.dry = Math.min(streak.dry, this.now - streak.t[0]! + FADE_OUT);
      }
    }
  }

  private landOne(impact: GooImpact, params: GooGlassParams): void {
    const { look, scale } = params;
    let vol = impact.r * impact.r * impact.r;
    if (!(vol > 0)) return;
    const speed = Math.hypot(impact.vx, impact.vy);
    const heading = Math.atan2(impact.vy, impact.vx);
    const radius = SPREAD * impact.r;
    // The hit throws specks off, mostly the way the drop was going.
    const count = Math.round(
      (0.5 + 4 * clamp01(speed / (900 * scale))) * look.splash
    );
    for (let i = 0; i < count; i++) {
      const angle = heading + (this.random() * 2 - 1) * 1.4;
      const reach = radius * (1.15 + 1.6 * this.random());
      const r = impact.r * (0.1 + 0.16 * this.random());
      const share = Math.min(vol * 0.08, r * r * r);
      vol -= share;
      this.add(
        impact.x + Math.cos(angle) * reach,
        impact.y + Math.sin(angle) * reach,
        share,
        look.splash * 0.5,
        params,
        angle
      );
    }
    this.add(impact.x, impact.y, vol, look.splash, params, heading);
  }

  private add(
    x: number,
    y: number,
    vol: number,
    splash: number,
    params: GooGlassParams,
    heading = Math.PI / 2
  ): void {
    if (this.splats.length >= GOO_MAX_SPLATS) this.crowd(true);
    this.splats.push({
      x,
      y,
      vx: 0,
      vy: 0,
      vol,
      age: 0,
      seed: this.random() * 1000,
      splash,
      heading,
      dry: params.look.dryTime * (0.8 + 0.4 * this.random()),
      streak: null,
      sinceBead: 0,
    });
  }

  /** A running splat gives liquid to its streak and leaves beads. */
  private shed(
    splat: GooSplat,
    moved: number,
    step: number,
    params: GooGlassParams
  ): void {
    const { look, scale } = params;
    if (look.wetting <= 0 || moved <= 0) return;
    const r = splatRadius(splat);
    // Radius it gives up per pixel run.
    const loss = 0.035 * look.wetting * moved;
    const next = Math.max(0, r - loss);
    splat.vol = Math.pow(next / SPREAD, 3);

    let streak = splat.streak;
    const tailY = splat.y - r * 0.55;
    if (!streak || streak.n >= STREAK_POINTS) {
      const fresh = this.openStreak(params, streak);
      if (streak) streak.open = false;
      if (!streak) {
        fresh.x[0] = splat.x;
        fresh.y[0] = tailY;
        fresh.w[0] = r * 0.2 * Math.min(1.2, look.wetting);
        fresh.t[0] = this.now;
        fresh.n = 1;
      }
      streak = splat.streak = fresh;
    }
    const lx = streak.x[streak.n - 1]!;
    const ly = streak.y[streak.n - 1]!;
    if (Math.hypot(splat.x - lx, tailY - ly) >= step) {
      const i = streak.n++;
      streak.x[i] = splat.x;
      streak.y[i] = tailY;
      streak.w[i] = r * 0.2 * Math.min(1.2, look.wetting);
      streak.t[i] = this.now;
    }

    splat.sinceBead += moved;
    const gap = (26 + 40 * ((splat.seed * 7.13) % 1)) * scale;
    if (splat.sinceBead > gap && r > 4 * scale) {
      splat.sinceBead = 0;
      const bead = Math.pow((r * 0.28) / SPREAD, 3);
      splat.vol = Math.max(0, splat.vol - bead);
      this.add(splat.x, tailY - r * 0.2, bead, 0, params);
    }
  }

  private openStreak(
    params: GooGlassParams,
    from: GooStreak | null
  ): GooStreak {
    const streak: GooStreak = {
      x: new Float32Array(STREAK_POINTS),
      y: new Float32Array(STREAK_POINTS),
      w: new Float32Array(STREAK_POINTS),
      t: new Float32Array(STREAK_POINTS),
      n: 0,
      dry: params.look.dryTime * 0.6,
      open: true,
    };
    if (from && from.n > 0) {
      // Carry on from where the full streak stopped, without a gap.
      const last = from.n - 1;
      streak.x[0] = from.x[last]!;
      streak.y[0] = from.y[last]!;
      streak.w[0] = from.w[last]!;
      streak.t[0] = from.t[last]!;
      streak.n = 1;
    }
    this.streaks.push(streak);
    return streak;
  }

  /** Splats that touch become one, at their shared center of liquid. */
  private merge(): void {
    const splats = this.splats;
    const order = this.order;
    order.length = splats.length;
    for (let i = 0; i < splats.length; i++) order[i] = i;
    order.sort((a, b) => splats[a]!.x - splats[b]!.x);
    let widest = 0;
    for (const splat of splats) widest = Math.max(widest, splatRadius(splat));
    const dead = new Set<number>();
    for (let a = 0; a < order.length; a++) {
      const i = order[a]!;
      if (dead.has(i)) continue;
      const first = splats[i]!;
      for (let b = a + 1; b < order.length; b++) {
        const j = order[b]!;
        const second = splats[j]!;
        const ra = splatRadius(first);
        if (second.x - first.x > (ra + widest) * 0.8) break;
        if (dead.has(j)) continue;
        const rb = splatRadius(second);
        if (Math.hypot(second.x - first.x, second.y - first.y) > (ra + rb) * 0.8)
          continue;
        const total = first.vol + second.vol;
        const share = second.vol / total;
        first.x += (second.x - first.x) * share;
        first.y += (second.y - first.y) * share;
        first.vy = Math.max(first.vy, second.vy);
        first.splash = Math.max(first.splash, second.splash * share);
        first.age = Math.min(first.age, second.age);
        first.dry = Math.max(first.dry, second.dry);
        if (!first.streak && second.streak) first.streak = second.streak;
        else if (second.streak) second.streak.open = false;
        first.vol = total;
        dead.add(j);
      }
    }
    if (!dead.size) return;
    let write = 0;
    for (let i = 0; i < splats.length; i++) {
      if (!dead.has(i)) splats[write++] = splats[i]!;
    }
    splats.length = write;
  }

  /**
   * Too many splats: the smallest still ones dry off over half a second. With
   * `now`, the faintest is taken at once to make room for a new one.
   */
  private crowd(now = false): void {
    let victim = -1;
    let least = Infinity;
    for (let i = 0; i < this.splats.length; i++) {
      const splat = this.splats[i]!;
      if (splat.vy > 0) continue;
      const fading = splat.dry <= FADE_OUT;
      if (fading && !now) continue;
      const score = fading ? -1 : splat.vol;
      if (score < least) {
        least = score;
        victim = i;
      }
    }
    if (victim < 0) return;
    if (now) {
      this.splats.splice(victim, 1);
      return;
    }
    this.splats[victim]!.dry = Math.min(this.splats[victim]!.dry, FADE_OUT);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
