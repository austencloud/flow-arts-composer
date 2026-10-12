import { afterEach, describe, expect, it, vi } from "vitest";
import { BUBBLE_PALETTES } from "../domain/bubble-palettes";
import {
  BUBBLE_MAX_DEFORMATION,
  BUBBLE_POP_SECONDS,
  BUBBLE_PX_PER_WORLD,
  resolveBubbleDeformationTarget,
  resolveBubbleFilmLook,
  resolveBubbleRuptureOrigin,
  resolveBubbleRuptureRadius,
  resolveInheritedVelocity,
  sampleBubbleFilm,
  sampleBubbleGloss,
  thinFilmSpectrum,
} from "./bubble-film";
import {
  BUBBLE_FILM_SEEDS,
  BUBBLE_FILM_STAGE_LIVES,
  BubbleFilmSpriteCache,
} from "./bubble-film-sprites";

const SOAP = resolveBubbleFilmLook(BUBBLE_PALETTES.soap);

describe("thin-film colour", () => {
  it("changes hue with film thickness", () => {
    const thin = thinFilmSpectrum(250, 1, [0, 0, 0]);
    const thick = thinFilmSpectrum(560, 1, [0, 0, 0]);
    const dominant = (c: number[]) => c.indexOf(Math.max(...c));
    expect(dominant(thin)).not.toBe(dominant(thick));
    for (const v of [...thin, ...thick]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("sampleBubbleFilm", () => {
  it("is nearly clear face-on and strongest toward the rim", () => {
    const centre = sampleBubbleFilm(0, 0.1, 0.3, 0.2, SOAP)[3];
    const rim = sampleBubbleFilm(0.97, 0, 0.3, 0.2, SOAP)[3];
    expect(centre).toBeLessThan(0.15);
    expect(rim).toBeGreaterThan(centre * 3);
    expect(sampleBubbleFilm(1.01, 0, 0.3, 0.2, SOAP)[3]).toBe(0);
  });

  it("drains clear across the top just before it bursts", () => {
    const young = sampleBubbleFilm(0.15, -0.7, 0.3, 0.2, SOAP)[3];
    const old = sampleBubbleFilm(0.15, -0.7, 0.3, 0.99, SOAP)[3];
    expect(old).toBeLessThan(young);
  });
});

describe("sampleBubbleGloss", () => {
  it("puts the key highlight up and to the left", () => {
    let best = { x: 0, y: 0, v: -1 };
    for (let y = -0.95; y <= 0.95; y += 0.05) {
      for (let x = -0.95; x <= 0.95; x += 0.05) {
        const v = sampleBubbleGloss(x, y);
        if (v > best.v) best = { x, y, v };
      }
    }
    expect(best.x).toBeLessThan(0);
    expect(best.y).toBeLessThan(0);
    expect(sampleBubbleGloss(1.2, 0)).toBe(0);
  });
});

describe("burst geometry", () => {
  it("starts in the top half of the bubble", () => {
    for (let i = 0; i < 12; i++) {
      const o = resolveBubbleRuptureOrigin(i / 12);
      expect(o.y).toBeLessThan(-0.3);
      expect(Math.hypot(o.x, o.y)).toBeLessThan(1);
    }
  });

  it("tears a hole that grows to clear the whole film", () => {
    let last = 0;
    for (let i = 0; i <= 10; i++) {
      const r = resolveBubbleRuptureRadius((i / 10) * BUBBLE_POP_SECONDS);
      expect(r).toBeGreaterThan(last);
      last = r;
    }
    // From the farthest origin the far rim is under 1.7 radii away.
    expect(last).toBeGreaterThan(1.7);
  });
});

describe("motion", () => {
  it("passes a slow tip's swing on at a fifth and caps a fast one", () => {
    const slow = resolveInheritedVelocity(100, 0, 1);
    expect(slow.vx).toBeCloseTo(22, 5);
    const fast = resolveInheritedVelocity(3000, 4000, 2);
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(
      0.8 * BUBBLE_PX_PER_WORLD * 2,
      5
    );
    expect(resolveInheritedVelocity(0, 0, 1)).toEqual({ vx: 0, vy: 0 });
  });

  it("stretches a fast bubble, never past the cap", () => {
    expect(resolveBubbleDeformationTarget(0, 1, 1)).toBe(0);
    const brisk = resolveBubbleDeformationTarget(60, 1, 1);
    expect(brisk).toBeGreaterThan(0);
    expect(resolveBubbleDeformationTarget(1e6, 3, 1)).toBe(
      BUBBLE_MAX_DEFORMATION
    );
  });
});

describe("resolveBubbleFilmLook", () => {
  it("dyes the film with a strong palette and leaves oil undyed", () => {
    const acid = resolveBubbleFilmLook(BUBBLE_PALETTES.acid);
    const oil = resolveBubbleFilmLook(BUBBLE_PALETTES.oil);
    expect(acid.dye[2]).toBeLessThan(SOAP.dye[2]);
    expect(acid.dye[1]).toBe(1);
    expect(oil.dye).toEqual([1, 1, 1]);
    expect(oil.filmStrength).toBe(1);
  });

  it("shows less face on a faint palette than a dense one", () => {
    const spirit = resolveBubbleFilmLook(BUBBLE_PALETTES.spirit);
    const champagne = resolveBubbleFilmLook(BUBBLE_PALETTES.champagne);
    expect(spirit.face).toBeLessThan(champagne.face);
  });
});

describe("BubbleFilmSpriteCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCanvas() {
    const painted = vi.fn();
    class FakeOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number
      ) {}
      getContext() {
        return {
          createImageData: (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
          }),
          putImageData: painted,
        };
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    return painted;
  }

  it("paints each film once and reuses it", () => {
    const painted = stubCanvas();
    const cache = new BubbleFilmSpriteCache();
    const a = cache.film(SOAP, 2, 0);
    const b = cache.film(SOAP, 2, 0);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(painted).toHaveBeenCalledTimes(1);
  });

  it("borrows a painted film once the frame's paint budget is spent", () => {
    const painted = stubCanvas();
    const cache = new BubbleFilmSpriteCache();
    cache.beginFrame(0);
    expect(cache.film(SOAP, 0, 1)).toBeNull();

    cache.beginFrame(1);
    const first = cache.film(SOAP, 0, 1);
    const borrowed = cache.film(SOAP, 3, 1);
    expect(borrowed).toBe(first);
    expect(painted).toHaveBeenCalledTimes(1);

    cache.beginFrame(BUBBLE_FILM_SEEDS * BUBBLE_FILM_STAGE_LIVES.length);
    expect(cache.film(SOAP, 3, 1)).not.toBe(first);
  });

  it("gives burst droplets film colours", () => {
    stubCanvas();
    const colours = new BubbleFilmSpriteCache().flecks(SOAP);
    expect(colours.length).toBeGreaterThan(3);
    expect(new Set(colours).size).toBeGreaterThan(3);
    for (const c of colours) expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("returns no sprite where no canvas can paint", () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", undefined);
    expect(new BubbleFilmSpriteCache().gloss(SOAP)).toBeNull();
  });
});
