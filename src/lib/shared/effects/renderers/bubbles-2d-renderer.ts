import type { Bubbles2DParams } from "../translators/canvas2d-types";
import {
  BUBBLE_MAX_DEFORMATION,
  BUBBLE_MIN_REBOUND_DEFORMATION,
  BUBBLE_POP_SECONDS,
  BUBBLE_PX_PER_WORLD,
  type BubbleFilmLook,
  resolveBubbleDeformationTarget,
  resolveBubbleFilmLook,
  resolveBubbleRuptureOrigin,
  resolveBubbleRuptureRadius,
  resolveInheritedVelocity,
} from "./bubble-film";
import {
  BUBBLE_DRAIN_START,
  BUBBLE_FILM_SEEDS,
  BUBBLE_FILM_STAGE_LIVES,
  BUBBLE_SPRITE_RADIUS,
  BUBBLE_SPRITE_SIDE,
  BubbleFilmSpriteCache,
} from "./bubble-film-sprites";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";

/** One soap bubble. Position is integrated; sway is added at draw time. */
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Terminal rise speed (px/s, positive = up the screen). */
  rise: number;
  age: number;
  maxAge: number;
  baseR: number;
  sizeMul: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  /** 0-1: which eddy layout its film has and where its burst starts. */
  seed: number;
  seedIndex: number;
  /** Film drift direction and rate (rad/s). */
  filmSpin: number;
  /** Stretch along `dirX, dirY` (0 = round). */
  deform: number;
  deformVel: number;
  dirX: number;
  dirY: number;
  ruptureX: number;
  ruptureY: number;
  popping: 0 | 1;
  popAge: number;
  popR: number;
  /** Droplets owed to the running rim, carried between frames. */
  sprayAcc: number;
}

/** A droplet shed by the retracting rim of a burst. */
interface Fleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
  color: string;
}

type Rand = () => number;

const MAX_BUBBLES = 1024;
const MAX_FLECKS = 512;
const TAU = Math.PI * 2;
/** Longest step simulated at once; a stalled tab resumes calmly. */
const MAX_STEP = 1 / 15;
/** A tip that moves further than this in one frame jumped (loop seam, new sequence). */
const JUMP_PX = 220;
/** Swell over a life: a film bubble holds its volume. */
const LIFETIME_SWELL = 0.08;
const SIZE_FLOOR = 0.34;
const SIZE_BIAS = 2;
/** Overall opacity. Bubbles are chrome around the props, never the subject. */
const OPACITY = 0.92;
/** Air drag on sideways drift, and how fast inherited vertical speed hands over to buoyancy (3D values). */
const HORIZONTAL_DRAG = 0.48;
const VERTICAL_INHERITANCE_DRAG = 0.16;
const DEFORMATION_STIFFNESS = 58;
const DEFORMATION_DAMPING = 12;
const DEFORMATION_DIRECTION_RESPONSE = 7;
const FLECK_GRAVITY = 90;
/** Droplets the running rim sheds over one burst, and the puncture's own. */
const SPRAY_PER_POP = 14;
const PUNCTURE_DROPLETS = 3;
/** The torn lip is uneven: this many arcs, each its own brightness. */
const RIM_SEGMENTS = 9;
const SPRITE_HALF = BUBBLE_SPRITE_SIDE / 2 / BUBBLE_SPRITE_RADIUS;
const SPRITE_UNIT = BUBBLE_SPRITE_SIDE / BUBBLE_SPRITE_RADIUS;
const DRAIN_STAGES = BUBBLE_FILM_STAGE_LIVES.length - 1;
/** Film sprites painted per frame (~3.5 ms each on desktop), so a new look fills in without a hitch. */
const FILM_PAINTS_PER_FRAME = 2;
/** Shared by every renderer, so toggling the effect does not repaint the film. */
const SHARED_SPRITES = new BubbleFilmSpriteCache();

/**
 * Canvas2D bubbles: soap film that matches the 3D bubbles.
 *
 * Each bubble is a pre-painted thin-film sprite (interference bands from
 * film thickness, brighter toward the rim, draining clear across the top
 * before it bursts) under a fixed key light. New bubbles carry a share of
 * the tip's swing, so they draw its path, then rise; moving fast pulls them
 * slightly out of round. A burst tears a hole from one point in the drained
 * top that sweeps across the film in under a fifth of a second; its uneven
 * lip sheds a spray of droplets as it runs.
 */
export class Bubbles2DRenderer {
  private bubbles: Bubble[] = [];
  private flecks: Fleck[] = [];
  private lastTipPos = new Map<string, { x: number; y: number }>();
  private smoothedVelocity = new Map<string, { vx: number; vy: number }>();
  private readonly sprites = SHARED_SPRITES;
  private look: BubbleFilmLook | null = null;
  private lookPalette: Bubbles2DParams["resolvedPalette"] | null = null;

  constructor(private readonly rand: Rand = Math.random) {}

  /** Live bubbles, including ones mid-burst. */
  get count(): number {
    return this.bubbles.length;
  }

  render(
    ctx: CanvasRenderingContext2D,
    params: Bubbles2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1
  ): void {
    const step = Math.max(0, Math.min(dt, MAX_STEP));
    const look = this.resolveLook(params);
    const baseR = params.baseRadius * scale * (0.7 + 0.9 * params.intensity);
    const poolCap = Math.min(MAX_BUBBLES, params.poolSize ?? MAX_BUBBLES);

    const seen = new Set<string>();
    for (const e of emitters) {
      if (!isEndEnabled(e.end, params)) continue;
      const id = emitterId(e.propIndex, e.tipIndex);
      seen.add(id);
      this.emit(id, e, params, step, scale, baseR, poolCap);
    }
    for (const id of this.lastTipPos.keys())
      if (!seen.has(id)) this.lastTipPos.delete(id);
    for (const id of this.smoothedVelocity.keys())
      if (!seen.has(id)) this.smoothedVelocity.delete(id);

    this.integrateBubbles(step, scale, look);
    this.integrateFlecks(step, scale);
    if (this.bubbles.length === 0 && this.flecks.length === 0) return;

    this.sprites.beginFrame(FILM_PAINTS_PER_FRAME);
    ctx.save();
    try {
      ctx.globalCompositeOperation = "source-over";
      for (const b of this.bubbles) this.drawBubble(ctx, b, look);
      this.drawFlecks(ctx);
    } finally {
      ctx.restore();
    }
  }

  dispose(): void {
    this.bubbles = [];
    this.flecks = [];
    this.lastTipPos.clear();
    this.smoothedVelocity.clear();
    this.look = null;
    this.lookPalette = null;
  }

  private resolveLook(params: Bubbles2DParams): BubbleFilmLook {
    if (!this.look || this.lookPalette !== params.resolvedPalette) {
      this.look = resolveBubbleFilmLook(params.resolvedPalette);
      this.lookPalette = params.resolvedPalette;
    }
    return this.look;
  }

  private emit(
    id: string,
    tip: EmitterTip,
    params: Bubbles2DParams,
    dt: number,
    scale: number,
    baseR: number,
    poolCap: number
  ): void {
    const last = this.lastTipPos.get(id);
    let vx = 0;
    let vy = 0;
    let jumped = false;
    if (last && dt > 0) {
      const dx = tip.x - last.x;
      const dy = tip.y - last.y;
      if (Math.hypot(dx, dy) > JUMP_PX * scale) jumped = true;
      else {
        vx = dx / dt;
        vy = dy / dt;
      }
    }
    let smooth = this.smoothedVelocity.get(id);
    if (!smooth || jumped) {
      smooth = { vx, vy };
      this.smoothedVelocity.set(id, smooth);
    } else {
      const alpha = 1 - Math.pow(0.6, dt * 60);
      smooth.vx += (vx - smooth.vx) * alpha;
      smooth.vy += (vy - smooth.vy) * alpha;
    }
    if (last) {
      last.x = tip.x;
      last.y = tip.y;
    } else {
      this.lastTipPos.set(id, { x: tip.x, y: tip.y });
    }

    if (this.bubbles.length >= poolCap || dt <= 0) return;
    const refSpeed = params.motionReferenceSpeed * BUBBLE_PX_PER_WORLD * scale;
    const speed = Math.hypot(smooth.vx, smooth.vy);
    const speedScalar = refSpeed > 0 ? Math.min(1, speed / refSpeed) : 0;
    const expected =
      (params.ambientEmission * params.ambientSpawnRate +
        params.motionEmission * speedScalar * params.motionSpawnRate) *
      dt;
    let n = Math.floor(expected);
    if (this.rand() < expected - n) n++;
    n = Math.min(n, poolCap - this.bubbles.length);
    if (n <= 0) return;

    const paletteId = params.resolvedPalette.id;
    const lifeMult =
      paletteId === "champagne" || paletteId === "acid" ? 0.55 : 1;
    const lifeBase = (1 + params.intensity * 2) * lifeMult;
    const spread = 0.42 + params.sizeJitter * 1.55;
    const inherited = resolveInheritedVelocity(smooth.vx, smooth.vy, scale);
    const moveDir = speed > 0.0001 ? Math.atan2(smooth.vy, smooth.vx) : 0;

    for (let k = 0; k < n; k++) {
      // Mostly small bubbles with the odd large one.
      const sizeMul = SIZE_FLOOR + Math.pow(this.rand(), SIZE_BIAS) * spread;
      const r0 = baseR * sizeMul;
      // Spread this frame's births back along the tip's path so a fast
      // swing leaves a line of bubbles, not a clump at its end.
      const lag = dt * (1 - (k + 1) / (n + 1));
      const jitter = (0.5 + r0 * 0.25) * scale;
      const seed = this.rand();
      const rupture = resolveBubbleRuptureOrigin(seed);
      // Rise grows with size, so big bubbles lead and small ones hang back.
      const rise =
        (16 + params.buoyancy * 92) * scale * (0.55 + sizeMul * 0.75);
      const calm = seed * TAU;
      this.insertBySize({
        x: tip.x - smooth.vx * lag + (this.rand() - 0.5) * jitter * 2,
        y: tip.y - smooth.vy * lag + (this.rand() - 0.5) * jitter * 2,
        vx: inherited.vx + (this.rand() - 0.5) * 3.6 * scale,
        vy: inherited.vy - rise,
        rise,
        age: 0,
        maxAge: lifeBase * (0.7 + this.rand() * 0.6),
        baseR: r0,
        sizeMul,
        wobbleAmp: (1.6 + this.rand() * 2.6) * scale * (1.3 - sizeMul * 0.5),
        wobbleFreq: 1.4 + this.rand() * 1.9,
        wobblePhase: this.rand() * TAU,
        seed,
        seedIndex: Math.min(
          BUBBLE_FILM_SEEDS - 1,
          Math.floor(seed * BUBBLE_FILM_SEEDS)
        ),
        filmSpin: (this.rand() < 0.5 ? -1 : 1) * (0.1 + this.rand() * 0.16),
        deform: 0,
        deformVel: 0,
        dirX: speed > 0.0001 ? Math.cos(moveDir) : Math.cos(calm),
        dirY: speed > 0.0001 ? Math.sin(moveDir) : Math.sin(calm),
        ruptureX: rupture.x,
        ruptureY: rupture.y,
        popping: 0,
        popAge: 0,
        popR: r0,
        sprayAcc: 0,
      });
    }
  }

  /** Small bubbles first, so the big ones draw in front. */
  private insertBySize(b: Bubble): void {
    const list = this.bubbles;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]!.baseR <= b.baseR) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, b);
  }

  private integrateBubbles(
    dt: number,
    scale: number,
    look: BubbleFilmLook
  ): void {
    const hDrag = Math.pow(HORIZONTAL_DRAG, dt);
    const vDrag = Math.pow(VERTICAL_INHERITANCE_DRAG, dt);
    const dirBlend = 1 - Math.exp(-DEFORMATION_DIRECTION_RESPONSE * dt);
    let w = 0;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i]!;
      if (b.popping === 1) {
        b.popAge += dt;
        if (b.popAge >= BUBBLE_POP_SECONDS) continue;
        this.shedSpray(b, dt, scale, look);
      } else {
        b.age += dt;
      }
      b.vx *= hDrag;
      b.vy = -b.rise + (b.vy + b.rise) * vDrag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.popping === 0) {
        // Airflow past the shell stretches it along the flight.
        const relX = b.vx;
        const relY = b.vy + b.rise;
        const rel = Math.hypot(relX, relY);
        if (rel > 0.3 * scale) {
          let dx = b.dirX + (relX / rel - b.dirX) * dirBlend;
          let dy = b.dirY + (relY / rel - b.dirY) * dirBlend;
          const len = Math.hypot(dx, dy);
          if (len > 0.0001) {
            dx /= len;
            dy /= len;
            b.dirX = dx;
            b.dirY = dy;
          }
        }
        const life = Math.min(1, b.age / b.maxAge);
        const tension =
          Math.sin(b.age * b.wobbleFreq * 1.35 + b.seed * TAU) *
          0.009 *
          (1 - life * 0.45);
        const target =
          resolveBubbleDeformationTarget(rel, b.sizeMul, scale) + tension;
        b.deformVel +=
          ((target - b.deform) * DEFORMATION_STIFFNESS -
            b.deformVel * DEFORMATION_DAMPING) *
          dt;
        b.deform += b.deformVel * dt;
        if (b.deform > BUBBLE_MAX_DEFORMATION) {
          b.deform = BUBBLE_MAX_DEFORMATION;
          b.deformVel = Math.min(0, b.deformVel);
        } else if (b.deform < BUBBLE_MIN_REBOUND_DEFORMATION) {
          b.deform = BUBBLE_MIN_REBOUND_DEFORMATION;
          b.deformVel = Math.max(0, b.deformVel);
        }

        if (b.age >= b.maxAge) {
          b.popping = 1;
          b.popAge = 0;
          b.popR = currentRadius(b);
          this.spawnFlecks(b, scale, look);
        }
      }
      this.bubbles[w++] = b;
    }
    this.bubbles.length = w;
  }

  /** The puncture itself throws a few droplets out through the break. */
  private spawnFlecks(b: Bubble, scale: number, look: BubbleFilmLook): void {
    const colors = this.sprites.flecks(look);
    const r = b.popR;
    const ox = b.x + wobbleX(b) + b.ruptureX * r;
    const oy = b.y + b.ruptureY * r;
    const out = Math.atan2(b.ruptureY, b.ruptureX);
    for (let k = 0; k < PUNCTURE_DROPLETS; k++) {
      const angle = out + (this.rand() - 0.5) * 1.5;
      const speed =
        (0.12 + this.rand() * 0.28) * BUBBLE_PX_PER_WORLD * scale * 1.6;
      this.pushFleck(
        ox,
        oy,
        b.vx + Math.cos(angle) * speed,
        b.vy * 0.18 + Math.sin(angle) * speed,
        r,
        scale,
        colors
      );
    }
  }

  /**
   * The rim gathers film as it runs and throws it off as droplets, so the
   * spray follows the edge across the bubble instead of leaving one point.
   */
  private shedSpray(
    b: Bubble,
    dt: number,
    scale: number,
    look: BubbleFilmLook
  ): void {
    b.sprayAcc += (SPRAY_PER_POP * dt) / BUBBLE_POP_SECONDS;
    if (b.sprayAcc < 1) return;
    const colors = this.sprites.flecks(look);
    const r = b.popR;
    const holeR = resolveBubbleRuptureRadius(b.popAge);
    const rimSpeed =
      (resolveBubbleRuptureRadius(
        Math.min(BUBBLE_POP_SECONDS, b.popAge + 0.01)
      ) -
        holeR) /
      0.01;
    const cx = b.x + wobbleX(b);
    while (b.sprayAcc >= 1) {
      b.sprayAcc -= 1;
      // A point on the rim that is still on the film.
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = this.rand() * TAU;
        const ux = b.ruptureX + Math.cos(a) * holeR;
        const uy = b.ruptureY + Math.sin(a) * holeR;
        if (ux * ux + uy * uy >= 0.96) continue;
        const speed = rimSpeed * r * (0.3 + this.rand() * 0.35);
        this.pushFleck(
          cx + ux * r,
          b.y + uy * r,
          b.vx + Math.cos(a) * speed,
          b.vy * 0.18 + Math.sin(a) * speed,
          r,
          scale,
          colors
        );
        break;
      }
    }
  }

  private pushFleck(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    scale: number,
    colors: readonly string[]
  ): void {
    if (this.flecks.length >= MAX_FLECKS) this.flecks.shift();
    this.flecks.push({
      x,
      y,
      vx,
      vy,
      age: 0,
      maxAge: 0.16 + this.rand() * 0.2,
      size: Math.max(0.55 * scale, r * (0.028 + this.rand() * 0.03)),
      color: colors[Math.floor(this.rand() * colors.length)] ?? "#ffffff",
    });
  }

  private integrateFlecks(dt: number, scale: number): void {
    const drag = Math.pow(0.3, dt);
    let w = 0;
    for (let i = 0; i < this.flecks.length; i++) {
      const p = this.flecks[i]!;
      p.age += dt;
      if (p.age >= p.maxAge) continue;
      p.vx *= drag;
      p.vy = p.vy * drag + FLECK_GRAVITY * scale * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.flecks[w++] = p;
    }
    this.flecks.length = w;
  }

  private drawBubble(
    ctx: CanvasRenderingContext2D,
    b: Bubble,
    look: BubbleFilmLook
  ): void {
    const popping = b.popping === 1;
    const life = popping ? 1 : Math.min(1, b.age / b.maxAge);
    const r = popping ? b.popR : currentRadius(b);
    if (r < 0.5) return;
    // Fade in at birth; a film bursts at full strength, it does not fade.
    let alpha = OPACITY * (life < 0.12 ? life / 0.12 : 1);
    if (popping) {
      alpha *= Math.pow(1 - b.popAge / BUBBLE_POP_SECONDS, 0.72);
    }
    if (alpha <= 0.01) return;

    const x = b.x + wobbleX(b);
    const y = b.y;
    const gloss = this.sprites.gloss(look);

    ctx.save();
    ctx.translate(x, y);
    if (!popping) {
      const major = 1 + b.deform;
      const minor = 1 / Math.sqrt(major);
      if (Math.abs(b.deform) > 0.002) {
        const a = Math.atan2(b.dirY, b.dirX);
        ctx.rotate(a);
        ctx.scale(major, minor);
        ctx.rotate(-a);
      }
      const tension = Math.sin(b.age * 2.4 + b.seed * TAU) * 0.035;
      ctx.scale(r * (1 + tension), r * (1 - tension * 0.72));
    } else {
      ctx.scale(r, r);
    }

    if (!gloss) {
      this.drawVectorBubble(ctx, look, alpha, r);
      ctx.restore();
      return;
    }

    let holeR = 0;
    if (popping) {
      holeR = resolveBubbleRuptureRadius(b.popAge);
      ctx.beginPath();
      ctx.arc(0, 0, 1.02, 0, TAU);
      ctx.closePath();
      ctx.moveTo(b.ruptureX + holeR, b.ruptureY);
      ctx.arc(b.ruptureX, b.ruptureY, holeR, 0, TAU);
      ctx.clip("evenodd");
    }

    // Film, turning slowly under the fixed light: the eddies drift.
    ctx.save();
    ctx.rotate(
      b.age * b.filmSpin + Math.sin(b.age * 0.8 + b.wobblePhase) * 0.18
    );
    const drain = (life - BUBBLE_DRAIN_START) / (1 - BUBBLE_DRAIN_START);
    if (drain <= 0) {
      this.blitFilm(ctx, look, b.seedIndex, 0, alpha);
    } else {
      const s = Math.min(DRAIN_STAGES, drain * DRAIN_STAGES);
      const i0 = Math.min(DRAIN_STAGES - 1, Math.floor(s));
      const f = s - i0;
      this.blitFilm(ctx, look, b.seedIndex, i0, alpha * (1 - f));
      this.blitFilm(ctx, look, b.seedIndex, i0 + 1, alpha * f);
    }
    ctx.restore();

    ctx.globalAlpha = alpha;
    ctx.drawImage(gloss, -SPRITE_HALF, -SPRITE_HALF, SPRITE_UNIT, SPRITE_UNIT);
    ctx.restore();

    if (popping) this.drawRuptureRim(ctx, b, x, y, r, holeR, alpha, look);
  }

  private blitFilm(
    ctx: CanvasRenderingContext2D,
    look: BubbleFilmLook,
    seedIndex: number,
    stage: number,
    alpha: number
  ): void {
    if (alpha <= 0.004) return;
    const film = this.sprites.film(look, seedIndex, stage);
    if (!film) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(film, -SPRITE_HALF, -SPRITE_HALF, SPRITE_UNIT, SPRITE_UNIT);
  }

  /**
   * The torn edge: film gathered into a lip as the hole runs. Uneven along
   * its length, so it reads as a tear rather than a drawn ring.
   */
  private drawRuptureRim(
    ctx: CanvasRenderingContext2D,
    b: Bubble,
    x: number,
    y: number,
    r: number,
    holeR: number,
    alpha: number,
    look: BubbleFilmLook
  ): void {
    const colors = this.sprites.flecks(look);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r, r);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = colors[b.seedIndex % colors.length] ?? "#ffffff";
    const span = TAU / RIM_SEGMENTS;
    const turn = b.seed * TAU;
    for (let k = 0; k < RIM_SEGMENTS; k++) {
      const lit = 0.25 + 0.75 * hash01(b.seed * 97.3 + k * 13.7);
      const a0 = turn + k * span;
      ctx.beginPath();
      ctx.arc(b.ruptureX, b.ruptureY, holeR, a0, a0 + span * 1.04);
      // Soft halo, then the lip itself.
      ctx.globalAlpha = alpha * lit * 0.16;
      ctx.lineWidth = Math.max(0.09, 3.4 / r);
      ctx.stroke();
      ctx.globalAlpha = alpha * lit * 0.62;
      ctx.lineWidth = Math.max(0.035, 0.9 / r);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Where no sprite surface exists: a plain rim and highlight. */
  private drawVectorBubble(
    ctx: CanvasRenderingContext2D,
    look: BubbleFilmLook,
    alpha: number,
    r: number
  ): void {
    const [tr, tg, tb] = look.tint;
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = Math.max(0.05, 1 / r);
    ctx.strokeStyle = `rgb(${Math.round(tr * 255)},${Math.round(tg * 255)},${Math.round(tb * 255)})`;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-0.3, -0.38, 0.14, 0, TAU);
    ctx.fill();
  }

  private drawFlecks(ctx: CanvasRenderingContext2D): void {
    for (const p of this.flecks) {
      const a = Math.pow(1 - p.age / p.maxAge, 1.2);
      if (a <= 0.02) continue;
      // Drawn as a short streak along its flight, like a lit droplet.
      const speed = Math.hypot(p.vx, p.vy);
      const streak = p.size * (1 + Math.min(2.2, speed * 0.008));
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, streak, p.size, Math.atan2(p.vy, p.vx), 0, TAU);
      ctx.fill();
    }
  }
}

function currentRadius(b: Bubble): number {
  const life = Math.min(1, b.age / b.maxAge);
  return b.baseR * (1 + LIFETIME_SWELL * life * life);
}

function wobbleX(b: Bubble): number {
  return Math.sin(b.age * b.wobbleFreq + b.wobblePhase) * b.wobbleAmp;
}

function isEndEnabled(end: "A" | "B", params: Bubbles2DParams): boolean {
  if (params.trackingMode === "both_ends") return true;
  return params.trackingMode === "left_end" ? end === "A" : end === "B";
}

/** Stable 0-1 hash, so a bubble's torn lip keeps its pattern frame to frame. */
function hash01(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}
