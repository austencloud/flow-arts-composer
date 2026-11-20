// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BLOOM_PRESETS } from "../presets/bloom-presets";
import { paintBloomSmall } from "./bloom-small";
import {
  countLit,
  makeTileCanvas,
  samePixels,
  tilePixels,
} from "./tile-test-utils";

function paint(patch: object, format: "tile" | "chip" = "tile") {
  const ctx = makeTileCanvas(format);
  paintBloomSmall(ctx, patch as never, format);
  return ctx;
}

/** Share of the picture whose three channels are all over 235. */
function whiteShare(ctx: CanvasRenderingContext2D): number {
  const d = tilePixels(ctx);
  let white = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i]! > 235 && d[i + 1]! > 235 && d[i + 2]! > 235) white += 1;
  return white / (d.length / 4);
}

describe("bloom small pictures", () => {
  it("repeat themselves exactly and light the frame, in both formats", () => {
    for (const format of ["tile", "chip"] as const)
      for (const p of BLOOM_PRESETS) {
        const a = paint(p.patch ?? {}, format);
        const b = paint(p.patch ?? {}, format);
        expect(countLit(tilePixels(a))).toBeGreaterThan(20);
        expect(samePixels(tilePixels(a), tilePixels(b))).toBe(true);
      }
  });

  it("keeps white under 5% of the tile, so the stars stay stars", () => {
    for (const p of BLOOM_PRESETS)
      expect(whiteShare(paint(p.patch ?? {})), p.name).toBeLessThan(0.05);
  });

  it("keeps the corners dark, which the legibility check reads the ground from", () => {
    for (const p of BLOOM_PRESETS) {
      const ctx = paint(p.patch ?? {});
      const { width, height } = ctx.canvas;
      const d = tilePixels(ctx);
      for (const [x, y] of [
        [1, 1],
        [width - 2, 1],
        [1, height - 2],
        [width - 2, height - 2],
      ] as const) {
        const i = (y * width + x) * 4;
        expect(Math.max(d[i]!, d[i + 1]!, d[i + 2]!), p.name).toBeLessThan(60);
      }
    }
  });

  it("ends Supernova's horizontal streak inside the frame", () => {
    const supernova = BLOOM_PRESETS.find((p) => p.id === "bloom-supernova")!;
    const ctx = paint(supernova.patch ?? {});
    const { width, height } = ctx.canvas;
    const d = tilePixels(ctx);
    for (const x of [0, 1, 2, width - 3, width - 2, width - 1]) {
      for (let y = Math.floor(height / 2) - 2; y <= Math.floor(height / 2) + 2; y++) {
        const i = (y * width + x) * 4;
        expect(Math.max(d[i]!, d[i + 1]!, d[i + 2]!), `x ${x} y ${y}`).toBeLessThan(
          90
        );
      }
    }
  });

  it("makes Halo, Supernova and Comet three different pictures", () => {
    const pics = BLOOM_PRESETS.map((p) => tilePixels(paint(p.patch ?? {})));
    for (let i = 0; i < pics.length; i++)
      for (let j = i + 1; j < pics.length; j++) {
        let differing = 0;
        for (let k = 0; k < pics[i]!.length; k += 4) {
          const delta =
            Math.abs(pics[i]![k]! - pics[j]![k]!) +
            Math.abs(pics[i]![k + 1]! - pics[j]![k + 1]!) +
            Math.abs(pics[i]![k + 2]! - pics[j]![k + 2]!);
          if (delta > 90) differing += 1;
        }
        expect(differing / (pics[i]!.length / 4)).toBeGreaterThan(0.08);
      }
  });

  it("draws Comet's smear as a soft fade: no step along its length, gone before the frame's edge", () => {
    const comet = BLOOM_PRESETS.find((p) => p.id === "bloom-comet")!;
    for (const [format, w, h] of [
      ["tile", 240, 90],
      ["chip", 96, 64],
    ] as const) {
      const d = tilePixels(paint(comet.patch as object, format));
      const row = Math.round(h / 2);
      const at = (x: number) => {
        const i = (row * w + x) * 4;
        return Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
      };
      // Walk from just outside the head (the brightest column) to the left edge.
      let head = 0;
      for (let x = 0; x < w; x++) if (at(x) > at(head)) head = x;
      let biggestStep = 0;
      for (let x = head - Math.round(w * 0.06); x > 0; x--)
        biggestStep = Math.max(biggestStep, Math.abs(at(x) - at(x - 1)));
      expect(biggestStep, `${format} step`).toBeLessThan(18);
      expect(at(0), `${format} left edge`).toBeLessThan(60);
    }
  });
});
