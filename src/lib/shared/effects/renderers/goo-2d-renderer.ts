import type { GooParams } from "../translators/canvas2d-types";
import type { WaterPalette } from "../domain/water-palettes";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";
import { curl2D } from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";

/**
 * Gooey-liquid renderer for the Canvas2D backend — the "Goo" look.
 *
 * A fundamentally different ATOM from the SSFR droplet spray: instead of
 * hundreds of discrete photoreal droplets (which read as rain/specks against a
 * black void), beads of liquid are laid CONTINUOUSLY along the tip path, then
 * merged into connected luminous blobs with the metaball recipe — sum bright
 * blobs additively, then `blur(...)·contrast(...)`: blur bridges neighbours,
 * contrast snaps the soft overlap to a hard gooey edge. The result reads as
 * substance with surface tension, and it's emissive so it survives the dark
 * pictograph canvas.
 *
 * Ported from the /test/water-rethink "gooey liquid" atom prototype. Public
 * Stamps blobs through the goo overlay each frame; the overlay owns the canvas
 * and lifecycle (see GooOverlayRenderer).
 */

const TAU = Math.PI * 2;
const PX_PER_WORLD = 60;

/** Metaball look constants. */
const BLUR_PX = 10;
const CONTRAST = 14;
const GLOW_ALPHA = 0.16;
const GRAVITY_PX = 26;
/** Ceiling on beads submitted to the density pass in one frame. */
const MAX_BEADS = 1400;
/** Ceiling on simulated drips. */
const MAX_DROPS = 90;
/** Bead spacing as a fraction of bead radius. Must stay under ~1 or the blur
 *  cannot bridge neighbours and the stream reads as separate beads. */
const BEAD_SPACING = 0.55;
/** Seconds of tip path the body spans, head to pinched-off tail. */
const BODY_LIFE = 1.4;
/** Fraction of tip velocity a drip carries as it leaves the stream. */
const VELOCITY_INHERIT = 0.22;
/**
 * Pre-contrast brightness for the eroded pass. Dimming the field before the
 * threshold shrinks the region that survives it, so (outer − eroded) is a band
 * hugging the surface — the rim light that makes goo read as a wet substance.
 */
const ERODE = 0.8;
/** Second, deeper threshold — the innermost of the three nested regions. */
const ERODE_DEEP = 0.62;

/** One recorded position of a tip, with the speed it was moving at the time. */
interface PathPoint {
  x: number;
  y: number;
  /** Renderer clock when this point was laid. Age drives the taper. */
  t: number;
  speed: number;
}

/**
 * A bead that has LEFT the stream. Drops are the only simulated particles left —
 * everything still attached to the prop is sampled from the path instead. That
 * is what makes a drip mean something: it is the exception, not the rule.
 */
interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  r: number;
}

/** Transient per-frame bead handed to the density pass. Not persistent state. */
interface Bead {
  x: number;
  y: number;
  r: number;
  alpha: number;
  glint: boolean;
}

interface TipSample {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

export class Goo2DRenderer {
  private paths = new Map<string, PathPoint[]>();
  private drops: Drop[] = [];
  private dripCredit = 0;
  private beads: Bead[] = [];
  private lastTipPos = new Map<string, { x: number; y: number }>();
  private smoothedVelocity = new Map<string, { vx: number; vy: number }>();
  private off: HTMLCanvasElement | OffscreenCanvas | null = null;
  private offCtx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;
  private work: HTMLCanvasElement | OffscreenCanvas | null = null;
  private workCtx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;
  private offW = 0;
  private offH = 0;
  private clock = 0;

  render(
    ctx: CanvasRenderingContext2D,
    params: GooParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
  ): void {
    this.clock += dt;
    const sc = scale;
    const refSpeed = params.motionReferenceSpeed * PX_PER_WORLD * sc;
    const baseBlob = 15 * (0.85 + 0.6 * params.intensity) * sc;

    // The three sliders, each owning something you can SEE. Emission used to be
    // a bead COUNT, which the continuity floor then overrode — so the knobs
    // moved a number that could not change the picture. Count is now geometry
    // (see resampleStream), and the sliders own mass, drip rate, and opacity.
    const widthMul = 0.5 + params.motionEmission * 1.1; // Amount → stream mass
    const opacity = 0.45 + params.intensity * 0.55; // Intensity → how solid

    // Viscosity is the knob the effect always wanted: how much this stuff
    // CONGEALS. 0 is watery — it necks off early, sheds drips constantly and
    // barely holds together. 1 is thick — it bridges hard, hangs on to its full
    // width, and almost never drips. Everything downstream reads from it, so one
    // slider moves the whole material rather than one number in it.
    const visc = params.surfaceTension;
    const dripRate = (1 - visc) * (1 - visc) * 8; // watery sheds, thick clings
    const bodyLife = BODY_LIFE * (0.72 + visc * 0.55);
    const taperAt = 0.28 + visc * 0.34; // thick stays fat further down its length

    // 1. Record where each tip has been. The stream is a PATH, not a cloud of
    //    particles that happen to be near each other: beads get sampled along it
    //    below, so the body cannot fragment no matter how fast the prop moves.
    const live = new Set<string>();
    for (const s of this.sampleTips(emitters, params, dt)) {
      live.add(s.id);
      let path = this.paths.get(s.id);
      if (!path) {
        path = [];
        this.paths.set(s.id, path);
      }
      // Always append. An earlier version skipped the append and moved the head
      // point when the tip had barely travelled, which meant a SLOW tip never
      // accumulated any history at all — its path stayed one point long forever
      // and it rendered nothing. The trim below bounds the cost anyway.
      path.unshift({ x: s.x, y: s.y, t: this.clock, speed: s.speed });
      // Trim everything older than the body's life — that IS the tail.
      let cut = path.length;
      for (let i = 0; i < path.length; i++) {
        if (this.clock - path[i]!.t > bodyLife) {
          cut = i + 1;
          break;
        }
      }
      if (cut < path.length) path.length = cut;

      // 2. Shed drips off the stream. A drop is a bead that LEFT the path, so it
      //    is the one thing here worth simulating — and the one thing the eye
      //    reads as liquid behaving on its own.
      this.dripCredit += dripRate * dt;
      while (this.dripCredit >= 1 && this.drops.length < MAX_DROPS) {
        this.dripCredit -= 1;
        const src = path[Math.floor(Math.random() * Math.min(path.length, 12))];
        if (!src) break;
        const r = baseBlob * widthMul * (0.4 + Math.random() * 0.4);
        this.drops.push({
          x: src.x,
          y: src.y,
          vx: s.vx * VELOCITY_INHERIT * Math.random(),
          vy: s.vy * VELOCITY_INHERIT * Math.random(),
          age: 0,
          maxAge: 0.7 + Math.random() * 0.8,
          r,
        });
      }
    }
    for (const id of [...this.paths.keys()]) if (!live.has(id)) this.paths.delete(id);

    // 3. Integrate the drops. Gravity owns them; curl only wobbles.
    let w = 0;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      d.age += dt;
      if (d.age >= d.maxAge) continue;
      d.vy += GRAVITY_PX * sc * dt;
      const c = curl2D(d.x * (0.005 / sc), d.y * (0.005 / sc), this.clock);
      d.vx += (c.vx * 22 * sc - d.vx) * 0.5 * dt;
      d.vy += (c.vy * 22 * sc - d.vy) * 0.35 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (i !== w) this.drops[w] = d;
      w++;
    }
    this.drops.length = w;

    // 4. Rebuild this frame's beads: the stream resampled along every path, plus
    //    the drops. Nothing here persists between frames.
    this.beads.length = 0;
    for (const path of this.paths.values()) {
      this.resampleStream(path, baseBlob, widthMul, opacity, refSpeed, sc, bodyLife, taperAt, visc);
    }
    for (const d of this.drops) {
      const fade = beadFade(d.age / d.maxAge);
      if (fade <= 0.02) continue;
      this.beads.push({ x: d.x, y: d.y, r: d.r, alpha: fade * opacity, glint: d.r > baseBlob * 0.5 });
    }
    if (!this.beads.length) return;

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const off = this.ensureOff(W, H);
    if (!off) return;
    const p: WaterPalette = params.resolvedPalette;

    const work = this.ensureWork(W, H);
    if (!work) return;

    // 3. Sum the blobs as a GRAYSCALE density field on an opaque black
    //    offscreen. Grayscale is the whole point: thresholding a colored field
    //    binarizes each channel independently, so any overlap saturates to pure
    //    white with a fringe wherever one channel crosses first. That is what
    //    made the goo read as plasma. Threshold the density, colorize after.
    off.globalCompositeOperation = "source-over";
    off.fillStyle = "#000";
    off.fillRect(0, 0, W, H);
    off.globalCompositeOperation = "lighter";
    for (const b of this.beads) {
      const g = off.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * b.alpha})`);
      g.addColorStop(0.5, `rgba(255,255,255,${0.6 * b.alpha})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      off.fillStyle = g;
      off.beginPath();
      off.arc(b.x, b.y, b.r, 0, TAU);
      off.fill();
    }

    const field = this.off as CanvasImageSource;
    const workCanvas = this.work as CanvasImageSource;
    const blurPx = Math.max(3, Math.round(BLUR_PX * sc * (0.72 + visc * 0.62)));
    const prevFilter = ctx.filter;
    const prevComposite = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    try {
      // 4. Threshold the density into connected liquid (the metaball recipe:
      //    blur bridges neighbours, contrast snaps the overlap to a hard gooey
      //    edge and crushes stray glow to black), then multiply the white
      //    silhouette by the palette body colour. Black stays black, so the
      //    tinted plate composites additively without a backing rectangle.
      work.globalCompositeOperation = "source-over";
      work.filter = `blur(${blurPx}px) contrast(${CONTRAST})`;
      work.drawImage(field, 0, 0);
      work.filter = "none";
      work.globalCompositeOperation = "multiply";
      // The deep tint carries the body. Everything here adds, so a light body
      // leaves the rim and the specular nowhere brighter to go — the interior
      // has to sit low for the surface to read.
      work.fillStyle = p.puddleTint;
      work.fillRect(0, 0, W, H);

      // Soft bloom halo under the liquid — luminous depth so the void reads lit.
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = GLOW_ALPHA;
      ctx.filter = `blur(${Math.round(26 * sc)}px)`;
      ctx.drawImage(workCanvas, 0, 0);

      // The body itself.
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.drawImage(workCanvas, 0, 0);

      // 5. Depth grading. Thresholding the same field at three levels nests
      //    three regions — outer ⊃ shallow ⊃ deep — and the rings between them
      //    are the liquid's cross-section. Painting the outermost ring brightest
      //    and leaving the innermost as bare body colour reads as thickness:
      //    light gets through the thin edges and is absorbed by the mass.
      //    Everything composites additively, so depth has to be built by adding
      //    LESS toward the middle, never by painting the middle darker.
      //
      //    The rim ring is cut with the shallow mask pushed AWAY from the light,
      //    which widens the band on the lit side and closes it on the far side.
      //    A rim of even width all the way round is lit from everywhere, which
      //    is to say from nowhere; a crescent is what reads as wet.
      const lightPush = Math.max(1, Math.round(blurPx * 0.5));
      this.drawBand(work, field, W, H, blurPx, 1, ERODE, lightPush, p.edge);
      ctx.globalAlpha = 0.62;
      ctx.drawImage(workCanvas, 0, 0);

      this.drawBand(work, field, W, H, blurPx, ERODE, ERODE_DEEP, 0, p.core);
      ctx.globalAlpha = 0.4;
      ctx.drawImage(workCanvas, 0, 0);
      ctx.globalAlpha = 1;

      // 6. Wet specular glints. Every highlight sits at the SAME offset from its
      //    bead — up and to the left — so they agree on where the light is.
      //    Scattered at random depths they read as lint suspended in the gel;
      //    agreeing on a light direction is what makes a surface.
      //    They also stay OFF the dense middle. Piling glints where the mass is
      //    thickest puts a white core back in the interior — the exact blowout
      //    the grayscale threshold exists to prevent, just drawn by hand.
      const hi = hexToRgb(p.highlight);
      for (const b of this.beads) {
        if (!b.glint || b.alpha < 0.5) continue;
        const r = b.r * 0.2;
        const gx = b.x - b.r * 0.34;
        const gy = b.y - b.r * 0.38;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, `rgba(${hi.r},${hi.g},${hi.b},${0.42 * b.alpha})`);
        g.addColorStop(1, `rgba(${hi.r},${hi.g},${hi.b},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, TAU);
        ctx.fill();
      }
    } finally {
      ctx.filter = prevFilter;
      ctx.globalCompositeOperation = prevComposite;
      ctx.globalAlpha = prevAlpha;
    }
  }

  /**
   * Walk a recorded tip path from the head and drop a bead every `spacing` px of
   * arc length. Spacing is a fixed fraction of bead radius, so the stream is
   * continuous by construction at any prop speed — the failure this replaces was
   * beads being emitted on a clock and drifting apart between frames.
   *
   * Thickness comes from two places. Age tapers it toward the tail, which is the
   * pinch-off. Speed thins it, because liquid pulled fast stretches: the ribbon
   * narrows through the quick arcs and swells where the prop turns around, which
   * is also where the eye expects mass to gather.
   */
  private resampleStream(
    path: PathPoint[],
    baseBlob: number,
    widthMul: number,
    opacity: number,
    refSpeed: number,
    sc: number,
    bodyLife: number,
    taperAt: number,
    visc: number,
  ): void {
    if (path.length < 2) return;
    const spacing = baseBlob * widthMul * BEAD_SPACING;

    // Cap the head. Density falls off at both ends of the stream because the
    // last bead only has neighbours on one side, so the threshold eats the tip —
    // which is why the goo looked detached from the prop and trailing behind it.
    // An oversized bead pushed slightly PAST the newest point keeps the stream
    // welded to the tip that is producing it.
    {
      const h = path[0]!;
      const n = path[1]!;
      let dx = h.x - n.x;
      let dy = h.y - n.y;
      const dl = Math.hypot(dx, dy);
      const stretch = refSpeed > 0 ? 1 / (1 + Math.min(1.6, h.speed / refSpeed) * 0.38) : 1;
      const rHead = baseBlob * widthMul * stretch;
      if (dl > 0.0001) {
        dx /= dl;
        dy /= dl;
      } else {
        dx = 0;
        dy = 0;
      }
      this.beads.push({
        x: h.x + dx * rHead * 0.35,
        y: h.y + dy * rHead * 0.35,
        r: rHead * 1.18,
        alpha: opacity,
        glint: false,
      });

      // A slow tip lays no arc length, so there is nothing to resample and the
      // cap bead would sit there alone — the goo looked like it vanished
      // whenever the prop paused. Real liquid does the opposite: it POOLS at a
      // stationary tip and hangs. Grow a pendant below the head as speed falls,
      // scaled by viscosity so thick goo hangs in a long teardrop and watery goo
      // beads up small and lets go.
      const slow = refSpeed > 0 ? 1 - Math.min(1, h.speed / (refSpeed * 0.45)) : 1;
      if (slow > 0.05) {
        const hang = rHead * (0.5 + visc * 1.5) * slow;
        const lobes = 3;
        for (let i = 1; i <= lobes; i++) {
          const f = i / lobes;
          this.beads.push({
            x: h.x + Math.sin(this.clock * 1.7 + i) * rHead * 0.06 * slow,
            y: h.y + hang * f,
            r: rHead * (1.05 - f * 0.45) * slow,
            alpha: opacity,
            glint: i === 1,
          });
        }
      }
    }
    // Track arc length from the head and place a bead every time the running
    // total passes the next multiple of `spacing`. Path points arrive far closer
    // together than beads sit, so per-segment leftovers must ACCUMULATE — the
    // first version reset them per segment and placed almost nothing.
    let total = 0;
    let nextAt = 0;
    let index = 0;

    for (let i = 0; i < path.length - 1 && this.beads.length < MAX_BEADS; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 0.0001) continue;

      for (; nextAt <= total + segLen && this.beads.length < MAX_BEADS; nextAt += spacing, index++) {
        const f = (nextAt - total) / segLen;
        const age = this.clock - (a.t + (b.t - a.t) * f);
        const u = Math.min(1, age / bodyLife);
        const speed = a.speed + (b.speed - a.speed) * f;
        const stretch = refSpeed > 0 ? 1 / (1 + Math.min(1.6, speed / refSpeed) * 0.38) : 1;
        const r = baseBlob * widthMul * streamWidth(u, taperAt) * stretch;
        if (r < 1.2 * sc) continue;
        this.beads.push({
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          r,
          alpha: streamFade(u) * opacity,
          // Every fourth sample, so highlights are sparse points on the surface.
          glint: index % 4 === 0 && u < 0.5,
        });
      }
      total += segLen;
    }
  }

  /**
   * Leave `work` holding one tinted ring: the density field thresholded at
   * `outerLevel` minus the same field thresholded at `innerLevel`, with the
   * inner mask displaced by `push` px down-right. Both masks are white-on-black,
   * so `difference` gives the ring and `multiply` colours it — black elsewhere,
   * which composites additively without needing a backing plate.
   */
  private drawBand(
    work: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    field: CanvasImageSource,
    w: number,
    h: number,
    blurPx: number,
    outerLevel: number,
    innerLevel: number,
    push: number,
    tint: string,
  ): void {
    work.globalCompositeOperation = "source-over";
    work.filter = `blur(${blurPx}px) brightness(${outerLevel}) contrast(${CONTRAST})`;
    work.drawImage(field, 0, 0);
    work.globalCompositeOperation = "difference";
    work.filter = `blur(${blurPx}px) brightness(${innerLevel}) contrast(${CONTRAST})`;
    work.drawImage(field, push, push);
    work.filter = "none";
    work.globalCompositeOperation = "multiply";
    work.fillStyle = tint;
    work.fillRect(0, 0, w, h);
  }

  /** Per-emitter EMA velocity smoothing, honoring trackingMode. */
  private sampleTips(
    emitters: EmitterTip[],
    params: GooParams,
    dt: number,
  ): TipSample[] {
    const out: TipSample[] = [];
    const seen = new Set<string>();
    for (const e of emitters) {
      if (!this.isEndEnabled(e.end, params)) continue;
      const id = emitterId(e.propIndex, e.tipIndex);
      seen.add(id);
      const last = this.lastTipPos.get(id);
      let vx = 0;
      let vy = 0;
      if (last && dt > 0) {
        vx = (e.x - last.x) / dt;
        vy = (e.y - last.y) / dt;
      }
      const prev = this.smoothedVelocity.get(id);
      const a = 1 - Math.pow(0.6, dt * 60);
      const svx = prev ? prev.vx + (vx - prev.vx) * a : vx;
      const svy = prev ? prev.vy + (vy - prev.vy) * a : vy;
      if (prev) { prev.vx = svx; prev.vy = svy; } else { this.smoothedVelocity.set(id, { vx: svx, vy: svy }); }
      out.push({ id, x: e.x, y: e.y, vx: svx, vy: svy, speed: Math.hypot(svx, svy) });
      if (last) { last.x = e.x; last.y = e.y; } else { this.lastTipPos.set(id, { x: e.x, y: e.y }); }
    }
    for (const id of this.lastTipPos.keys()) if (!seen.has(id)) this.lastTipPos.delete(id);
    for (const id of this.smoothedVelocity.keys()) if (!seen.has(id)) this.smoothedVelocity.delete(id);
    return out;
  }

  private isEndEnabled(end: "A" | "B", params: GooParams): boolean {
    if (params.trackingMode === "both_ends") return true;
    return params.trackingMode === "left_end" ? end === "A" : end === "B";
  }

  private ensureOff(
    w: number,
    h: number,
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    if (this.off && this.offW === w && this.offH === h && this.offCtx) return this.offCtx;
    const c = createOffscreen(w, h);
    if (!c) return null;
    const ctx = c.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;
    this.off = c;
    this.offCtx = ctx;
    this.offW = w;
    this.offH = h;
    this.work = null;
    this.workCtx = null;
    return ctx;
  }

  /** Scratch plate for the threshold + tint passes. Sized with the field. */
  private ensureWork(
    w: number,
    h: number,
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    if (this.work && this.workCtx && this.offW === w && this.offH === h) return this.workCtx;
    const c = createOffscreen(w, h);
    if (!c) return null;
    const ctx = c.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;
    this.work = c;
    this.workCtx = ctx;
    return ctx;
  }

  dispose(): void {
    this.paths.clear();
    this.drops = [];
    this.beads = [];
    this.dripCredit = 0;
    this.lastTipPos.clear();
    this.smoothedVelocity.clear();
    this.off = null;
    this.offCtx = null;
    this.work = null;
    this.workCtx = null;
    this.offW = 0;
    this.offH = 0;
    this.clock = 0;
  }
}

/**
 * Bead opacity over its life. The plateau runs long because the TAPER is now
 * carried by the shrinking radius — fading alpha at the same time would erase
 * the tail before it had a chance to neck down.
 */
function beadFade(t: number): number {
  if (t < 0.12) return t / 0.12;
  if (t > 0.8) return Math.max(0, (1 - t) / 0.2);
  return 1;
}

/**
 * Bead opacity along the STREAM. Unlike a drop, a stream bead is not born in
 * mid-air — u = 0 is the prop tip itself, and the goo there is at its most
 * solid. Fading it in (as `beadFade` does) put a low-density gap right behind
 * the tip; the contrast threshold ate that gap and the mass read as detached,
 * trailing the prop. Full strength from the head, tail-only falloff.
 */
function streamFade(u: number): number {
  if (u > 0.8) return Math.max(0, (1 - u) / 0.2);
  return 1;
}

/**
 * Stream thickness along its length. u = 0 at the prop, 1 at the tail. Full
 * width for the first third, then a curve that goes to zero with a vertical
 * tangent — that shape is the pinch-off, and it is why the tail breaks into
 * beads instead of ending in a cap.
 */
function streamWidth(u: number, taperAt: number): number {
  if (u < taperAt) return 1;
  const t = (u - taperAt) / (1 - taperAt);
  return Math.sqrt(Math.max(0, 1 - t * t));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const s = hex.trim().replace(/^#/, "");
  const norm = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.slice(0, 6);
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
  };
}

function createOffscreen(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  } catch {
    /* fall through */
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}