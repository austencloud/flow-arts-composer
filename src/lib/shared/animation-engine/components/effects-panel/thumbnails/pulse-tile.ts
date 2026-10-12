/**
 * Pulse portrait: a staff turning half a turn per beat sweeps in from the
 * lower left while both ends ring, as the default both-ends tracking does.
 * The renderer's ring state machine (pulse-rhythm.ts) runs over that motion
 * and freezes shortly after the newest primary ring, so each look shows the
 * moment its trigger makes: beat looks ring with the charge gathering for the
 * next beat, velocity fires at a swing peak and throws its ring forward,
 * continuous streams small rings behind each tip between its beat rings.
 *
 * Port of the approved reference page (`reference/pulse-draw.js`). The rings,
 * flashes and charges are painted by the renderer's own exported painters;
 * only the staging lives here. Tile-only: rings live LIFE_BOOST times longer
 * so two beats of history stay on the frame, widths use a fatter line unit,
 * an intensity floor keeps the quiet looks visible, and a freeze offset per
 * trigger picks the frame. Color is always the palette's (solid mode), since
 * the picker shows the look, not the current prop colors.
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import type { Pulse2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { resolvePulse2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
import {
  PulseTipMotion,
  pulseAccentThreshold,
  pulseCharge,
  pulseOvertoneGap,
  pulseRingLife,
} from "#lib/shared/effects/domain/pulse-rhythm.js";
import {
  mixRgb,
  parseCssRgb,
  WHITE,
  type Rgb,
} from "#lib/shared/effects/renderers/css-rgb.js";
import {
  drawPulseCharge,
  drawPulseRing,
  rotateHue,
  type PulseRing,
  type PulseUnits,
} from "#lib/shared/effects/renderers/pulse-2d-renderer.js";
import { TILE_H, TILE_W, blob, ground, hexToRgb, lcg } from "./tile-paint";

export type PulseIntent = EffectConfigMap["pulse"];
export const PULSE_TILE_SEED = 0x9b3a;

const TAU = Math.PI * 2;
/** Stage unit to tile px: radii and drift keep the renderer's geometry. */
const UNIT = 0.8;
/** Strokes, bands and fringes: fatter so a thin front still reads at 304x114. */
const LINE = UNIT * 2.4;
const UNITS: PulseUnits = {
  unit: UNIT,
  line: LINE,
  flash: LINE * 0.6,
  core: LINE * 0.7,
};
/** Seconds per beat (1.0 speed = 60 BPM). */
const BEAT = 1.0;
const DT = 1 / 60;
/** Rings live this much longer than the renderer's; shape and color still follow the intent. */
const LIFE_BOOST = 2.2;
/**
 * Seconds after the newest primary ring to freeze, per trigger: beat looks
 * wait for the charge to build toward the next beat, velocity catches the
 * flash, continuous shows the stream behind the beat ring.
 */
const FREEZE_AFTER: Record<PulseIntent["trigger"], number> = {
  beat: 0.72,
  velocity: 0.2,
  continuous: 0.32,
};
/** Ripple (0.3) and Heartbeat (0.42) would vanish at tile size. */
const INTENSITY_FLOOR = 0.55;

/**
 * The staff: its centre sweeps in from the lower left while it turns half a
 * turn per beat, so each end's speed swells and dips once per beat.
 */
const STAFF_HALF = 68;
const SWEEP = {
  x0: 140,
  y0: 200,
  cx: 340,
  cy: 175,
  x1: 560,
  y1: 100,
  seconds: 3.0,
};
const OMEGA = Math.PI / BEAT;

interface Tip {
  x: number;
  y: number;
  end: 0 | 1;
}

interface RingColors {
  ring: Rgb;
  wake: Rgb;
  hot: Rgb;
  warm: Rgb;
  cool: Rgb;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function centreAt(t: number): { x: number; y: number } {
  const u = Math.max(0, Math.min(1, t / SWEEP.seconds));
  const v = 1 - u;
  return {
    x: v * v * SWEEP.x0 + 2 * v * u * SWEEP.cx + u * u * SWEEP.x1,
    y: v * v * SWEEP.y0 + 2 * v * u * SWEEP.cy + u * u * SWEEP.y1,
  };
}

function tipsAt(t: number, phase0: number): [Tip, Tip] {
  const c = centreAt(t);
  const a = phase0 + OMEGA * t;
  return [
    {
      x: c.x + Math.cos(a) * STAFF_HALF,
      y: c.y + Math.sin(a) * STAFF_HALF,
      end: 0,
    },
    {
      x: c.x - Math.cos(a) * STAFF_HALF,
      y: c.y - Math.sin(a) * STAFF_HALF,
      end: 1,
    },
  ];
}

/** The renderer's ring state machine, run over the staged motion. */
class Sim {
  readonly params: Pulse2DParams;
  readonly colors: RingColors;
  rings: PulseRing[] = [];
  /** Starts before the first beat so the tips have measured motion by then. */
  clock = -0.35;
  readonly primaryBirths: number[] = [];
  private readonly motion: [PulseTipMotion, PulseTipMotion] = [
    new PulseTipMotion(),
    new PulseTipMotion(),
  ];
  private readonly last: [Tip | null, Tip | null] = [null, null];
  private ringBeat = -1;

  constructor(
    intent: PulseIntent,
    readonly phase0: number
  ) {
    this.params = resolvePulse2D({
      ...intent,
      colorMode: "solid",
      intensity: Math.max(intent.intensity, INTENSITY_FLOOR),
    });
    const ring = parseCssRgb(this.params.resolvedPalette.ring);
    this.colors = {
      ring,
      wake: parseCssRgb(this.params.resolvedPalette.fade),
      hot: mixRgb(ring, WHITE, 0.72),
      warm: rotateHue(ring, 38),
      cool: rotateHue(ring, -38),
    };
  }

  step(dt: number): void {
    this.clock += dt;
    const beat = Math.floor(this.clock / (BEAT * this.params.beatInterval));
    const ringBeat = beat !== this.ringBeat;
    this.ringBeat = beat;
    const tips = tipsAt(this.clock, this.phase0);
    for (const tip of tips) {
      const m = this.motion[tip.end];
      const last = this.last[tip.end];
      if (last) {
        m.feed(
          (tip.x - last.x) / UNIT / dt,
          (tip.y - last.y) / UNIT / dt,
          0,
          dt,
          BEAT
        );
      }
      this.last[tip.end] = tip;
      switch (this.params.trigger) {
        case "beat":
          if (ringBeat) this.fire(tip, m, m.energy);
          break;
        case "velocity":
          if (
            m.accent(
              pulseAccentThreshold(this.params.velocityThreshold),
              this.clock,
              BEAT
            )
          ) {
            this.fire(tip, m, m.peak);
          }
          break;
        case "continuous": {
          if (ringBeat) this.fire(tip, m, m.energy);
          const owed = m.continuous(dt, BEAT);
          for (let i = 0; i < owed; i++) {
            this.spawn(tip, m, m.energy, 0.3 + 0.3 * m.energy, false, 0);
          }
          break;
        }
      }
    }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
  }

  /** A triggered ring plus the overtones that follow it. */
  private fire(tip: Tip, m: PulseTipMotion, energy: number): void {
    this.spawn(tip, m, energy, 1, true, 0);
    this.primaryBirths.push(this.clock);
    const overtones = Math.round(this.params.harmonics * 3);
    const gap = pulseOvertoneGap(BEAT);
    for (let i = 1; i <= overtones; i++) {
      this.spawn(tip, m, energy, Math.max(0.2, 1 - i * 0.24), false, i * gap);
    }
  }

  private spawn(
    tip: Tip,
    m: PulseTipMotion,
    energy: number,
    amp: number,
    primary: boolean,
    delay: number
  ): void {
    const life = pulseRingLife(this.params.lifetime, BEAT, amp) * LIFE_BOOST;
    const carry = this.params.asymmetry * 0.85;
    this.rings.push({
      active: true,
      x: tip.x,
      y: tip.y,
      vx: m.vx * UNIT * carry,
      vy: m.vy * UNIT * carry,
      drag: 0.14 * life,
      age: -delay,
      life,
      energy: clamp01(energy),
      amp,
      primary,
      heading: Math.atan2(m.vy, m.vx),
      ...this.colors,
    });
  }

  /** Progress toward the next beat, as PulseBeatClock.phase reports it. */
  phase(): number {
    return this.clock / (BEAT * this.params.beatInterval) - this.ringBeat;
  }
}

/** Run the staged motion and freeze FREEZE_AFTER seconds past the newest primary ring. */
function simulate(intent: PulseIntent, phase0: number): Sim {
  const probe = new Sim(intent, phase0);
  const horizon = SWEEP.seconds;
  const after = FREEZE_AFTER[intent.trigger] ?? FREEZE_AFTER.beat;
  while (probe.clock < horizon) probe.step(DT);
  const births = probe.primaryBirths.filter((t) => t + after <= horizon);
  const freezeAt = births.length
    ? births[births.length - 1]! + after
    : horizon;
  const sim = new Sim(intent, phase0);
  while (sim.clock + DT <= freezeAt + 1e-9) sim.step(DT);
  return sim;
}

export function paintPulseTile(
  ctx: CanvasRenderingContext2D,
  intent: PulseIntent
): void {
  const rand = lcg(PULSE_TILE_SEED);
  const sim = simulate(intent, rand() * TAU);
  const pal = sim.params.resolvedPalette;
  const ring = hexToRgb(pal.ring);
  ground(ctx, [0.03, 0.03, 0.045]);
  blob(
    ctx,
    380,
    150,
    360,
    200,
    ring,
    pal.emissive ? 0.1 : 0.06 + 0.04 * intent.intensity
  );

  const layer = document.createElement("canvas");
  layer.width = TILE_W;
  layer.height = TILE_H;
  const c = layer.getContext("2d")!;
  c.lineCap = "round";
  c.globalCompositeOperation = "lighter";
  const rings = sim.rings
    .filter((r) => r.age > 0)
    .sort((a, b) => b.age - a.age);
  for (const r of rings) drawPulseRing(c, r, sim.params, UNITS);
  if (intent.trigger === "beat" && intent.charge > 0.01) {
    const charge = pulseCharge(sim.phase());
    if (charge.strength > 0.004) {
      const hot = mixRgb(sim.colors.ring, WHITE, 0.7);
      for (const tip of tipsAt(sim.clock, sim.phase0)) {
        drawPulseCharge(
          c,
          { x: tip.x, y: tip.y, ring: sim.colors.ring, hot },
          sim.params,
          charge,
          UNITS
        );
      }
    }
  }
  // The staff itself: a faint bar between the two ring sources.
  const tips = tipsAt(sim.clock, sim.phase0);
  c.globalCompositeOperation = "source-over";
  c.lineWidth = 2.5;
  c.strokeStyle = "rgba(255,255,255,0.16)";
  c.beginPath();
  c.moveTo(tips[0].x, tips[0].y);
  c.lineTo(tips[1].x, tips[1].y);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.6)";
  for (const t of tips) {
    c.beginPath();
    c.arc(t.x, t.y, 3.5, 0, TAU);
    c.fill();
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
