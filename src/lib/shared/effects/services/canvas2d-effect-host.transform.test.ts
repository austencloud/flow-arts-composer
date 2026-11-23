// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "canvas";
import "#lib/shared/animation-engine/components/effects-panel/thumbnails/tile-test-utils";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";
import type { EmitterTip } from "../renderers/emitter-tip";
import {
  CANVAS2D_HOSTED_EFFECTS,
  createCanvas2DEffectHost,
} from "./canvas2d-effect-host";

/**
 * An effect draws inside the transform it is handed. The Shape Engine's
 * Ratios stage runs its canvas at the screen's pixel ratio with tips in CSS
 * pixels, so a renderer that sets an absolute per-particle transform lands
 * its particles at 1/dpr of the right place and size. Every hosted effect is
 * drawn at 1x and under a 2x caller transform: the painted centroid must be
 * the same place in the caller's units, and the painting twice the size.
 */

const CSS = 400;
const FRAMES = 45;

function seeded(): () => number {
  let s = 12345;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function tipsAt(frame: number): EmitterTip[] {
  const a = frame * 0.12;
  return [0, 1].map((i) => ({
    x: 280 + Math.cos(a + i * Math.PI) * 40,
    y: 280 + Math.sin(a + i * Math.PI) * 40,
    propIndex: i,
    tipIndex: i,
    end: i === 0 ? ("A" as const) : ("B" as const),
    color: i === 0 ? "#3a7fd9" : "#d94f4f",
  }));
}

function paint(effect: string, dpr: number) {
  vi.spyOn(Math, "random").mockImplementation(seeded());
  const canvas = createCanvas(CSS * dpr, CSS * dpr);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const host = createCanvas2DEffectHost();
  for (let f = 0; f < FRAMES; f++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CSS * dpr, CSS * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    host.render(
      ctx,
      effect as never,
      DEFAULT_EFFECTS_CONFIG,
      tipsAt(f),
      1 / 60,
      CSS,
      CSS,
      f / 30
    );
  }
  const { data, width, height } = ctx.getImageData(0, 0, CSS * dpr, CSS * dpr);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 24) {
        n++;
        sx += x;
        sy += y;
      }
    }
  }
  return { n, cx: n ? sx / n / dpr : NaN, cy: n ? sy / n / dpr : NaN };
}

describe("hosted effects draw inside the caller's transform", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const effect of CANVAS2D_HOSTED_EFFECTS) {
    it(`${effect}: same place at 2x, twice the size`, () => {
      const one = paint(effect, 1);
      const two = paint(effect, 2);
      expect(one.n).toBeGreaterThan(0);
      expect(two.n).toBeGreaterThan(0);
      expect(Math.abs(two.cx - one.cx)).toBeLessThan(12);
      expect(Math.abs(two.cy - one.cy)).toBeLessThan(12);
      // Twice the size in each direction: more than twice the area, and
      // not wildly more (a quarter-size painting would be 0.25).
      expect(two.n / one.n).toBeGreaterThan(2);
      expect(two.n / one.n).toBeLessThan(8);
    });
  }
});
