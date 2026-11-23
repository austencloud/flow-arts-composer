import type { Sparkles2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { setParticleTransform } from "./particle-transform";
import { emitterId } from "./emitter-tip";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  /** Final per-particle color (base tint + jitter already applied at spawn). */
  color: string;
  /** Quantized sprite-cache key for `color` — computed once at spawn. */
  spriteKey: string;
  scale: number;
  /** Initial radians; drifts via spinSpeed so the star shape turns as it falls. */
  rotation: number;
  spinSpeed: number;
  /** Phase offset (radians) for the per-particle alpha twinkle. */
  twinklePhase: number;
  /** Per-particle twinkle rate (rad/s). Varied so the field scintillates
   *  incoherently instead of every glint pulsing on the same beat. */
  twinkleFreq: number;
  /** Emitter this particle was thrown from. Drives the parked-tip ceiling. */
  tip: string;
}

/** Hard ceiling on particle count for perf safety. The live cap is rate-scaled. */
const MAX_PARTICLES = 1500;
/** Spawns per second per tip per unit rate. */
const SPAWN_DENSITY = 18;
/** Floor for rate-scaled cap so rate near 0 still shows something visible. */
const MIN_LIVE_PARTICLES = 40;
/** Burst mode: minimum tip displacement (px) per frame to trigger a spawn burst (at scale=1). */
const BURST_MOTION_THRESHOLD = 0.3;

/**
 * Always-on proportional size variety (±30%), applied per particle on top of
 * the dial-derived `params.sizeScaleBase`. The old mapping folded variance INTO
 * the dial (rand × size), so size=0 made every sparkle identical and high size
 * made them wildly uneven. Splitting it out gives natural glint-to-glint variety
 * at every size; the dial→scale curve + its ceiling now live in resolveSparkles2D.
 */
const SCALE_JITTER_MIN = 0.7;
const SCALE_JITTER_SPAN = 0.6;

/** Edge length of the cached glow sprite, in device px. */
const SPRITE_PX = 64;
/** Sprite-cache ceiling. Colors are quantized, so this is generous in practice. */
const SPRITE_CACHE_MAX = 48;
/** On-screen diameter of the glow bed, as a multiple of the star's arm length. */
const GLOW_DIAMETER_FACTOR = 3.4;

/**
 * Fraction of the emitting tip's own velocity each particle carries away.
 * Sparks come off a swung prop tangentially — they keep going the way the tip
 * was going. Emitting into a uniformly random direction (which is what shipped)
 * throws that away and reads as jitter rather than spray.
 */
const VELOCITY_INHERIT = 0.55;
/** Tip speed (px/s at reference scale) at which the scatter cone is tightest. */
const REF_TIP_SPEED = 600;
/** Half-angle of the ejection cone: wide at rest, narrow at speed. */
const CONE_AT_REST = Math.PI;
const CONE_AT_SPEED = Math.PI * 0.28;

/**
 * Air drag, as an exponential velocity decay rate (1/s). Without it velocity is
 * conserved forever, so every spark walks to the edge of the frame and the
 * field flattens into a uniform starfield — density stops falling off from the
 * tip and the throw becomes unreadable. Decay caps a particle's travel at
 * roughly v0 / DRAG_PER_SEC px, which is what makes the spray read as a plume
 * anchored to the prop.
 */
const DRAG_PER_SEC = 2.6;
/**
 * px/s² per unit of the gravity dial. Higher than the old 200 because drag now
 * caps fall speed at gravity/DRAG rather than letting it accumulate — this
 * keeps the heavy presets (Starfall, Confetti) falling at their previous rate.
 */
const GRAVITY_PX_PER_UNIT = 420;

/**
 * Tip speed (px/s at reference scale) at or below which an emitter counts as
 * parked, and the speed at which it earns the full pool share. Between the two
 * the allowance ramps, so a slow prop doesn't pop between densities.
 */
const IDLE_TIP_SPEED = 8;
const MOVING_TIP_SPEED = 150;
/**
 * Live particles a parked emitter may hold. Sparks come off a prop that is
 * being swung; a motionless tip must not keep filling the shared pool. Without
 * this ceiling the stationary pre-roll before playback starts (~1s in the
 * sequence viewer) saturates the pool with particles born at the start pose,
 * and they hang there as one clump for a full lifetime after the props swing
 * away — starving the real spray at the tips until the clump finally dies.
 * A parked tip keeps a small shimmer, so a paused prop still shows the effect.
 */
const IDLE_TIP_PARTICLES = 12;
/**
 * Ceiling on inferred tip speed (px/s at reference scale). Mirrors
 * FireTipTracker's MAX_SPEED: past this the displacement is a teleport — a
 * canvas resize, a sequence swap, a dropped-frame catch-up — not a swing, and
 * inheriting it would launch the frame's whole spawn off the prop as one clump.
 */
const MAX_TIP_SPEED = 5000;

/** Rainbow mode: degrees of hue drift per second. */
const RAINBOW_DRIFT_DEG_PER_SEC = 45;
/** Rainbow mode: width of the simultaneous hue band, in degrees. */
const RAINBOW_BAND_DEG = 100;
/** Solid mode: per-particle hue/lightness jitter so a single tint isn't flat. */
const SOLID_HUE_JITTER_DEG = 9;
const SOLID_LIGHT_JITTER_PCT = 11;

type Offscreen = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createOffscreen(w: number, h: number): Offscreen | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  } catch {
    /* fall through to DOM canvas */
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

/**
 * Particle-pool sparkle renderer for the Canvas2D backend.
 *
 * Holds particle state across frames. Caller passes tips per frame; renderer
 * manages spawn, physics, decay, and draw using ctx.globalCompositeOperation
 * = "lighter" for additive bloom. Mode controls when spawns happen: stream
 * every frame, burst only when the tip is moving, trail along the path between
 * last and current tip position.
 *
 * DRAW: a cached radial glow bed is blitted under each particle, then the
 * four-point star is stroked live on top. The star must be stroked rather than
 * sprited: its crispness comes from the `Math.max(1, …)` line-width floors, so
 * arms stay a hairline wide no matter how small the glint gets. A pre-rendered
 * star mushes into an amorphous dot at small on-screen sizes. Only the glow —
 * which is soft by definition and has nothing to lose to resampling — is
 * cached, keyed by quantized HSL so per-particle jitter doesn't thrash it.
 *
 * EJECTION: particles leave along the tip's own travel direction, inside a cone
 * that tightens as the tip speeds up, and inherit a fraction of its velocity.
 * A swung prop throws sparks tangentially; picking a uniformly random direction
 * (which is what shipped) reads as jitter around the tip rather than spray off
 * it. At rest the cone opens to a full circle, recovering the isotropic puff.
 *
 * DETERMINISM: color animation runs off an internal frame clock accumulated
 * from `dt`, never `Date.now()`. Wall-clock color made QR/video export
 * non-reproducible and made every simultaneously-spawned particle share one
 * hue, so "rainbow" rendered as a slowly-drifting monochrome.
 */
export class Sparkles2DRenderer {
  private particles: Particle[] = [];
  private lastTipPos = new Map<string, { x: number; y: number }>();
  private spriteCache = new Map<string, Offscreen>();
  /** Live particle count per emitter, rebuilt each frame during the cull pass
   *  and read by the next frame's spawn to enforce the parked-tip ceiling. */
  private liveByTip = new Map<string, number>();
  private spritesUnavailable = false;
  /** Frame-accumulated seconds. Drives rainbow drift; never wall-clock. */
  private clock = 0;

  render(
    ctx: CanvasRenderingContext2D,
    params: Sparkles2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
  ): void {
    this.clock += dt;

    // 1. Spawn from each emitter per current mode. Covers base props and every
    //    tunnel kaleidoscope layer (propIndex >= 2).
    //    Live cap scales with params.rate so the slider actually controls
    //    on-screen density (not just the spawn rate, which was being masked
    //    by a static cap once rate crossed ~0.08).
    //    Per-emitter allocation prevents the first emitter in iteration order
    //    from consuming the whole budget - without it, sparkles appear to come
    //    from only one tip.
    const effectiveMax = Math.max(
      MIN_LIVE_PARTICLES,
      Math.min(MAX_PARTICLES, Math.floor(MAX_PARTICLES * params.rate)),
    );
    const slotsLeft = Math.max(0, effectiveMax - this.particles.length);
    const perTipCap = emitters.length > 0
      ? Math.max(0, Math.floor(slotsLeft / emitters.length))
      : 0;

    const seen = new Set<string>();
    for (const e of emitters) {
      const id = emitterId(e.propIndex, e.tipIndex);
      seen.add(id);
      const last = this.lastTipPos.get(id);
      this.spawnFromTip(params, id, e, last, dt, perTipCap, scale);
      if (last) { last.x = e.x; last.y = e.y; } else { this.lastTipPos.set(id, { x: e.x, y: e.y }); }
    }
    // Prune per-tip state for emitters absent this frame (a layer toggled off
    // or a tip disabled upstream) so the Map doesn't grow unbounded.
    for (const id of this.lastTipPos.keys()) if (!seen.has(id)) this.lastTipPos.delete(id);

    // 2. Step physics + cull dead particles (in-place compaction - zero allocation).
    const gravityPx = params.gravity * GRAVITY_PX_PER_UNIT * scale;
    // Exponential decay, evaluated once per frame rather than per particle.
    const damp = Math.exp(-DRAG_PER_SEC * dt);
    this.liveByTip.clear();
    let writeIdx = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      // Drag first, then gravity: fall speed settles at gravityPx / DRAG_PER_SEC
      // instead of accelerating without limit.
      p.vx *= damp;
      p.vy = p.vy * damp + gravityPx * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spinSpeed * dt;
      if (i !== writeIdx) this.particles[writeIdx] = p;
      writeIdx++;
      this.liveByTip.set(p.tip, (this.liveByTip.get(p.tip) ?? 0) + 1);
    }
    this.particles.length = writeIdx;

    // 3. Draw: a soft cached glow bed, then the crisp stroked star on top.
    //    The star is stroked rather than blitted because stroke widths carry a
    //    1px floor, so the four-point shape stays legible at the smallest sizes.
    //    A pre-rendered star sprite blurs into an undifferentiated dot down
    //    there, which is what made the field read as flat specks.
    if (this.particles.length === 0) return;
    const prevComposite = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    const prevFill = ctx.fillStyle;
    const prevStroke = ctx.strokeStyle;
    const prevLineWidth = ctx.lineWidth;
    const prevLineCap = ctx.lineCap;
    const savedTransform = ctx.getTransform();
    try {
      ctx.globalCompositeOperation = params.blendMode ?? "lighter";
      ctx.lineCap = "round";
      const baseR = params.baseRadius * scale;
      for (const p of this.particles) {
        const fade = Math.max(0, 1 - p.life / p.maxLife);
        const twinkle = 0.55 + 0.45 * Math.sin(p.life * p.twinkleFreq + p.twinklePhase);
        const alpha = fade * twinkle;
        if (alpha <= 0.004) continue;

        // Twinkle breathes the size a little too - a glint that only changes
        // opacity reads as a dimmer, not a scintillation.
        const breath = 0.94 + 0.12 * twinkle;
        const armLen = baseR * p.scale * 2.4 * breath;
        const diagLen = armLen * 0.55;

        const cos = Math.cos(p.rotation);
        const sin = Math.sin(p.rotation);
        setParticleTransform(ctx, savedTransform, cos, sin, -sin, cos, p.x, p.y);

        // Glow bed. Optional: if the platform can't author sprites the star
        // still draws, just without the halo underneath it.
        const glow = this.getGlowSprite(p.spriteKey, p.color);
        if (glow) {
          const d = armLen * GLOW_DIAMETER_FACTOR;
          ctx.globalAlpha = alpha * 0.5;
          ctx.drawImage(glow as CanvasImageSource, -d / 2, -d / 2, d, d);
        }

        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(1, baseR * p.scale * 0.45);
        ctx.beginPath();
        ctx.moveTo(-armLen, 0);
        ctx.lineTo(armLen, 0);
        ctx.moveTo(0, -armLen);
        ctx.lineTo(0, armLen);
        ctx.stroke();

        ctx.lineWidth = Math.max(0.6, baseR * p.scale * 0.25);
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(-diagLen, -diagLen);
        ctx.lineTo(diagLen, diagLen);
        ctx.moveTo(-diagLen, diagLen);
        ctx.lineTo(diagLen, -diagLen);
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.5, baseR * p.scale * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
    } finally {
      ctx.setTransform(savedTransform);
      ctx.globalCompositeOperation = prevComposite;
      ctx.globalAlpha = prevAlpha;
      ctx.fillStyle = prevFill;
      ctx.strokeStyle = prevStroke;
      ctx.lineWidth = prevLineWidth;
      ctx.lineCap = prevLineCap;
    }
  }


  /**
   * Soft radial halo in the particle's color, authored once per quantized color
   * and blitted under the stroked star. This is a glow BED only — the star's
   * shape is stroked live so it stays sharp at small sizes. Baking the whole
   * star into the sprite looks better in isolation and worse in practice: the
   * spikes blur out at the sizes the effect actually runs at.
   */
  private getGlowSprite(key: string, color: string): Offscreen | null {
    if (this.spritesUnavailable) return null;
    const hit = this.spriteCache.get(key);
    if (hit) return hit;

    const canvas = createOffscreen(SPRITE_PX, SPRITE_PX);
    const g = (canvas?.getContext("2d") ?? null) as Ctx2D | null;
    // A mocked or partial 2D context (SSR shims, unit-test doubles) can't author
    // gradients; skip the bed rather than throwing once per particle.
    if (!canvas || !g || typeof g.createRadialGradient !== "function") {
      this.spritesUnavailable = true;
      return null;
    }

    const C = SPRITE_PX / 2;
    g.clearRect(0, 0, SPRITE_PX, SPRITE_PX);
    const halo = g.createRadialGradient(C, C, 0, C, C, C);
    halo.addColorStop(0, withAlpha(color, 0.5));
    halo.addColorStop(0.28, withAlpha(color, 0.16));
    halo.addColorStop(0.62, withAlpha(color, 0.04));
    halo.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);

    // Colors are quantized, so overflow means an unusual palette churn rather
    // than steady-state growth. Drop the whole cache instead of tracking LRU.
    if (this.spriteCache.size >= SPRITE_CACHE_MAX) this.spriteCache.clear();
    this.spriteCache.set(key, canvas);
    return canvas;
  }


  private spawnFromTip(
    params: Sparkles2DParams,
    id: string,
    tip: { x: number; y: number },
    last: { x: number; y: number } | undefined,
    dt: number,
    perTipCap: number,
    scale: number,
  ): void {
    // Tip kinematics for this frame. One measurement, three consumers: the
    // parked-tip ceiling below, the ejection cone, and inherited momentum.
    // Speed past MAX_TIP_SPEED is a teleport, not a swing — clamp it rather
    // than throwing the frame's whole spawn off the prop.
    let vxTip = 0;
    let vyTip = 0;
    let tipSpeed = 0;
    if (last && dt > 0) {
      vxTip = (tip.x - last.x) / dt;
      vyTip = (tip.y - last.y) / dt;
      tipSpeed = Math.sqrt(vxTip * vxTip + vyTip * vyTip);
      const maxSpeed = MAX_TIP_SPEED * scale;
      if (tipSpeed > maxSpeed) {
        const k = maxSpeed / tipSpeed;
        vxTip *= k;
        vyTip *= k;
        tipSpeed = maxSpeed;
      }
    }

    // Base count: rate × SPAWN_DENSITY spawns/s, normalized via dt × 60 so a 60fps
    // tick spawns at the documented rate regardless of actual frame timing.
    const baseCount = Math.floor(params.rate * SPAWN_DENSITY * dt * 60);
    let spawnCount = 0;
    let usePathSpawn = false;

    if (params.mode === "stream") {
      spawnCount = Math.max(1, baseCount);
    } else if (params.mode === "burst") {
      if (!last) return;
      const dx = tip.x - last.x;
      const dy = tip.y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Motion threshold is px/frame at reference size; scale with canvas.
      if (dist < BURST_MOTION_THRESHOLD * scale) return;
      // `dist / 10` keeps ratio invariant - distance already scales with canvas
      // (tips are in canvas px), so the divisor scales too.
      spawnCount = Math.max(1, Math.floor(baseCount * (1 + dist / (10 * scale))));
    } else {
      spawnCount = Math.max(1, baseCount);
      usePathSpawn = !!last;
    }

    // Clamp to this tip's fair share of the pool so other tips can spawn too.
    spawnCount = Math.max(0, Math.min(spawnCount, perTipCap));

    // Parked-tip ceiling: how many live particles this emitter is allowed to
    // hold at its current speed. A moving tip is limited only by its pool
    // share; a motionless one keeps a shimmer and nothing more. See
    // IDLE_TIP_PARTICLES for why the pool must not fill from a parked tip.
    const refSpeed = scale > 0 ? tipSpeed / scale : tipSpeed;
    const motion = Math.max(
      0,
      Math.min(
        1,
        (refSpeed - IDLE_TIP_SPEED) / (MOVING_TIP_SPEED - IDLE_TIP_SPEED),
      ),
    );
    const ceiling =
      IDLE_TIP_PARTICLES + (MAX_PARTICLES - IDLE_TIP_PARTICLES) * motion;
    const liveHere = this.liveByTip.get(id) ?? 0;
    spawnCount = Math.min(spawnCount, Math.floor(ceiling) - liveHere);
    if (spawnCount <= 0) return;

    // Ejection frame. Sparks leave a swung prop tangentially - they keep going
    // the way the tip was going, in a cone that tightens as the tip speeds up.
    // Emitting into a uniformly random direction (the shipped behaviour) reads
    // as jitter around the tip instead of spray off it. At rest the cone opens
    // to a full circle, which reproduces the old isotropic burst exactly.
    let travelAngle = 0;
    let cone = CONE_AT_REST;
    let inheritX = 0;
    let inheritY = 0;
    if (tipSpeed > 1e-3) {
      travelAngle = Math.atan2(vyTip, vxTip);
      const t = Math.min(1, tipSpeed / (REF_TIP_SPEED * scale));
      cone = CONE_AT_REST + (CONE_AT_SPEED - CONE_AT_REST) * t;
      inheritX = vxTip * VELOCITY_INHERIT;
      inheritY = vyTip * VELOCITY_INHERIT;
    }

    for (let i = 0; i < spawnCount; i++) {
      // Origin: AT the tip (no scatter) so all particles emerge from the same
      // point and burst outward - that's what reads as "bursting from the tip"
      // rather than "appearing in a fuzzy area".
      let originX = tip.x;
      let originY = tip.y;
      if (usePathSpawn && last) {
        const t = i / spawnCount;
        originX = last.x + (tip.x - last.x) * t;
        originY = last.y + (tip.y - last.y) * t;
      }

      // Scatter inside the ejection cone, then add the tip's own momentum.
      const angle = travelAngle + (Math.random() - 0.5) * 2 * cone;
      // Burst speed is px/s at reference size; scales with canvas.
      const burstSpeed = (params.spread * 4 + Math.random() * params.spread * 8) * scale;
      const vx = Math.cos(angle) * burstSpeed + inheritX;
      // Upward bias is px/s at reference size; scales with canvas.
      const vy = Math.sin(angle) * burstSpeed + inheritY - 15 * scale;

      // Stagger lifetime ±40% so particles die at different times. Without this
      // the whole batch dies together and the canvas pulses dark every lifetime.
      const lifeJitter = 0.6 + Math.random() * 0.8;

      // sizeScaleBase (dial-derived, ceiling already applied in the translator)
      // sets the band center; jitter spreads each particle ±30% around it.
      const scaleJitter = SCALE_JITTER_MIN + Math.random() * SCALE_JITTER_SPAN;

      const color = this.pickColor(params);
      this.particles.push({
        x: originX,
        y: originY,
        vx,
        vy,
        life: 0,
        maxLife: params.lifetime * lifeJitter,
        color,
        spriteKey: quantizeKey(color),
        scale: params.sizeScaleBase * scaleJitter,
        rotation: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 1.6,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleFreq: 14 + Math.random() * 14,
        tip: id,
      });
    }
  }

  /**
   * Per-particle color. Every mode resolves to a concrete value at spawn, so a
   * particle's color never changes mid-life and the sprite key stays stable.
   */
  private pickColor(params: Sparkles2DParams): string {
    if (params.colorMode === "rainbow") {
      // A drifting BAND, not a single global hue: particles alive at the same
      // instant differ from each other, which is what makes it read as a
      // rainbow rather than a tinted monochrome that changes its mind.
      const center = (this.clock * RAINBOW_DRIFT_DEG_PER_SEC) % 360;
      const hue = (center + (Math.random() - 0.5) * RAINBOW_BAND_DEG + 360) % 360;
      return `hsl(${hue.toFixed(0)}, 85%, 65%)`;
    }
    if (params.colorMode === "palette" && params.palette.length > 0) {
      const idx = Math.floor(Math.random() * params.palette.length);
      return params.palette[idx]!;
    }
    // Solid: jitter hue + lightness slightly so a field of one tint still has
    // depth. A perfectly uniform color is what made the old field look flat.
    return jitterColor(params.color, SOLID_HUE_JITTER_DEG, SOLID_LIGHT_JITTER_PCT);
  }

  dispose(): void {
    this.particles = [];
    this.lastTipPos.clear();
    this.liveByTip.clear();
    this.spriteCache.clear();
    this.spritesUnavailable = false;
    this.clock = 0;
  }
}

// ── Color helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function parseHsl(color: string): { h: number; s: number; l: number } | null {
  const m = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(color);
  if (!m) return null;
  return { h: parseFloat(m[1]!), s: parseFloat(m[2]!), l: parseFloat(m[3]!) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function toHsl(color: string): { h: number; s: number; l: number } {
  const direct = parseHsl(color);
  if (direct) return direct;
  const { r, g, b } = hexToRgb(color);
  return rgbToHsl(r, g, b);
}

/** Nudge hue/lightness so a single configured tint still produces varied glints. */
function jitterColor(color: string, hueDeg: number, lightPct: number): string {
  const { h, s, l } = toHsl(color);
  const nh = (h + (Math.random() - 0.5) * 2 * hueDeg + 360) % 360;
  const nl = Math.max(20, Math.min(92, l + (Math.random() - 0.5) * 2 * lightPct));
  return `hsl(${nh.toFixed(0)}, ${s.toFixed(0)}%, ${nl.toFixed(0)}%)`;
}

/**
 * Sprite-cache key. Buckets hue to 12°, saturation/lightness to 12% so the
 * per-particle jitter above shares sprites instead of authoring a new canvas
 * for every particle.
 */
function quantizeKey(color: string): string {
  const { h, s, l } = toHsl(color);
  return `${Math.round(h / 12)}|${Math.round(s / 12)}|${Math.round(l / 12)}`;
}

function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("#")) {
    const { r, g, b } = hexToRgb(color);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (color.startsWith("hsl(")) return `hsla${color.slice(3, -1)}, ${a})`;
  if (color.startsWith("hsla(")) return color;
  if (color.startsWith("rgb(")) return `rgba${color.slice(3, -1)}, ${a})`;
  return color;
}
