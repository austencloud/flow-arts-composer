import { describe, it, expect } from "vitest";
import { Pulse2DRenderer, type PulseTipInput } from "./pulse-2d-renderer";
import { resolvePulse2D } from "../translators/canvas2d-translator";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";
import type { PulseIntent } from "../domain/effects-config";
import type { Pulse2DParams } from "../translators/canvas2d-types";

interface Arc {
  x: number;
  y: number;
  r: number;
  full: boolean;
}

/** Minimal CanvasRenderingContext2D stub that records the calls the renderer makes. */
class FakeCtx {
  arcs: Arc[] = [];
  strokeColors: string[] = [];
  radialGradientCount = 0;
  shadowBlurSet = false;

  globalCompositeOperation = "source-over";
  globalAlpha = 1;
  lineWidth = 1;
  lineCap = "butt";
  strokeStyle: unknown = "#000";
  fillStyle: unknown = "#000";

  set shadowBlur(_v: number) {
    this.shadowBlurSet = true;
  }

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.arcs.push({ x, y, r, full: end - start >= Math.PI * 2 - 1e-6 });
  }
  closePath(): void {}
  stroke(): void {
    if (typeof this.strokeStyle === "string") this.strokeColors.push(this.strokeStyle);
  }
  fill(): void {}
  createRadialGradient() {
    this.radialGradientCount++;
    return { addColorStop() {} };
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  reset(): void {
    this.arcs = [];
    this.strokeColors = [];
    this.radialGradientCount = 0;
  }
}

const FRAME = 1 / 60;
const ctxOf = (c: FakeCtx) => c as unknown as CanvasRenderingContext2D;

function params(overrides: Partial<PulseIntent> = {}): Pulse2DParams {
  return resolvePulse2D({ ...DEFAULT_EFFECTS_CONFIG.pulse, ...overrides });
}

function tip(x: number, y: number, end = 0, color = "#3399ff"): PulseTipInput {
  return { x, y, propIndex: 0, tipIndex: end, end, color };
}

/** "rgba(r, g, b, a)" → "r,g,b". */
const rgbOf = (style: string) => style.replace(/^rgba\((\d+), (\d+), (\d+),.*$/, "$1,$2,$3");

function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const QUIET = { asymmetry: 0, chromatic: 0, flash: 0, harmonics: 0, charge: 0 };

/** One beat fires on the first frame; hold the tip still so that ring ages. */
function fireAndAge(p: Pulse2DParams, tips: PulseTipInput[], seconds = 0.25): FakeCtx {
  const r = new Pulse2DRenderer();
  const ctx = new FakeCtx();
  r.render(ctxOf(ctx), p, tips, 0, FRAME, 1);
  for (let t = 0; t < seconds; t += FRAME) r.render(ctxOf(ctx), p, tips, 0, FRAME, 1);
  ctx.reset();
  r.render(ctxOf(ctx), p, tips, 0, FRAME, 1);
  return ctx;
}

describe("Pulse2DRenderer", () => {
  it("bursts a ring from the tip on the beat and grows it", () => {
    const ctx = fireAndAge(params({ ...QUIET, trigger: "beat" }), [tip(200, 150)]);
    const rings = ctx.arcs.filter((a) => a.full);
    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings) {
      expect(ring.x).toBeCloseTo(200);
      expect(ring.y).toBeCloseTo(150);
      expect(ring.r).toBeGreaterThan(10);
    }
  });

  it("never sets shadowBlur", () => {
    const r = new Pulse2DRenderer();
    const ctx = new FakeCtx();
    const p = params({ style: "glow", asymmetry: 1, chromatic: 1, flash: 1, harmonics: 1, charge: 1 });
    for (let i = 0; i < 120; i++) {
      r.render(ctxOf(ctx), p, [tip(200 + i * 4, 150)], Math.floor(i / 30), FRAME, 1);
    }
    expect(ctx.arcs.length).toBeGreaterThan(0);
    expect(ctx.shadowBlurSet).toBe(false);
  });

  it("paints solid mode in the chosen shade", () => {
    const shade = (palette: PulseIntent["palette"]) => {
      const p = params({ ...QUIET, style: "stroke", colorMode: "solid", palette });
      const ctx = fireAndAge(p, [tip(200, 150)]);
      return { colors: ctx.strokeColors.map(rgbOf), ring: hexRgb(p.resolvedPalette.ring) };
    };
    const ember = shade("ember");
    const sonar = shade("sonar");
    expect(ember.colors).toContain(ember.ring);
    expect(sonar.colors).toContain(sonar.ring);
    expect(ember.ring).not.toBe(sonar.ring);
  });

  it("colors each hand's rings like its prop in prop mode", () => {
    const p = params({ ...QUIET, style: "stroke", colorMode: "prop-matched" });
    const ctx = fireAndAge(p, [tip(200, 150, 0, "#ff4400")]);
    expect(ctx.strokeColors.map(rgbOf)).toContain("255,68,0");
  });

  it("fires the velocity trigger once per swing", () => {
    const r = new Pulse2DRenderer();
    const ctx = new FakeCtx();
    const p = params({ ...QUIET, trigger: "velocity", velocityThreshold: 0.3, lifetime: 6 });
    let t = 0;
    for (let i = 0; i < 180; i++) {
      t += FRAME;
      const x = 300 + 80 * Math.sin(2 * Math.PI * t);
      r.render(ctxOf(ctx), p, [tip(x, 150)], Math.floor(t), FRAME, 1);
    }
    const fired = (r as unknown as { ringCount: number }).ringCount;
    expect(fired).toBeGreaterThanOrEqual(5);
    expect(fired).toBeLessThanOrEqual(6);
  });

  it("builds a charge before the beat and lets it go when playback stops", () => {
    const r = new Pulse2DRenderer();
    const ctx = new FakeCtx();
    const p = params({ ...QUIET, style: "stroke", charge: 1 });
    const t0 = tip(200, 150);
    // Three beats at one second each so the clock knows the tempo.
    for (let t = 0; t < 3; t += FRAME) r.render(ctxOf(ctx), p, [t0], Math.floor(t), FRAME, 1);

    const coresAt = (seconds: number) => {
      for (let t = 0; t < seconds; t += FRAME) r.render(ctxOf(ctx), p, [t0], 3, FRAME, 1);
      ctx.reset();
      r.render(ctxOf(ctx), p, [t0], 3, FRAME, 1);
      return ctx.radialGradientCount;
    };
    expect(coresAt(0.2)).toBe(0);
    expect(coresAt(0.65)).toBeGreaterThan(0);
    expect(coresAt(1)).toBe(0);
  });

  it("tracks only the chosen end of the prop", () => {
    const p = params({ ...QUIET, trackingMode: "left_end" });
    const ctx = fireAndAge(p, [tip(100, 150, 0), tip(300, 150, 1)]);
    expect(ctx.arcs.length).toBeGreaterThan(0);
    expect(ctx.arcs.every((a) => a.x < 200)).toBe(true);
  });

  it("carries the tip's momentum into the ring when Momentum is up", () => {
    const centers = (asymmetry: number) => {
      const r = new Pulse2DRenderer();
      const ctx = new FakeCtx();
      const p = params({ ...QUIET, asymmetry, lifetime: 3 });
      let x = 100;
      // Steady travel at 300 units/s; the second beat's ring has real momentum.
      for (let i = 0; i < 80; i++) {
        x += 5;
        if (i === 79) ctx.reset();
        r.render(ctxOf(ctx), p, [tip(x, 150)], Math.floor(i / 60), FRAME, 1);
      }
      return ctx.arcs.map((a) => a.x);
    };
    const birth = 100 + 5 * 61;
    expect(Math.max(...centers(0))).toBeLessThanOrEqual(birth);
    expect(Math.max(...centers(1))).toBeGreaterThan(birth + 5);
  });

  it("trails overtones after the ring when harmonics are up", () => {
    const fullRings = (harmonics: number) =>
      fireAndAge(params({ ...QUIET, harmonics, style: "stroke" }), [tip(200, 150)], 0.4).arcs.length;
    expect(fullRings(1)).toBeGreaterThan(fullRings(0));
  });
});
