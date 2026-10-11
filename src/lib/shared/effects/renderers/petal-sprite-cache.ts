/**
 * Pre-painted petal sprites for the Canvas2D petals.
 *
 * Each silhouette and tint is painted once per face (front, and a paler back)
 * in two lights: lit, as it looks turned toward the stage light, and shaded, a
 * deeper and more saturated colour, as a thin petal looks with the light
 * behind it. The renderer blends the two by how the petal faces the light, so
 * a turning petal brightens, darkens and flashes instead of only getting
 * thinner. Painting once also spares the per-frame gradient and path work.
 *
 * Returns null where no 2D canvas exists (tests); the renderer then draws the
 * silhouette directly.
 */

import {
  drawPetalEmberRim,
  drawPetalSilhouette,
  hexToRgbTuple,
  type PetalSpriteShape,
} from "../domain/petal-palettes";

type SpriteSurface = HTMLCanvasElement | OffscreenCanvas;
type SpriteContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface PetalSpriteSet {
  frontShade: SpriteSurface;
  frontLit: SpriteSurface;
  backShade: SpriteSurface;
  backLit: SpriteSurface;
}

/** Half-size the sprites are painted at; drawn sizes scale from this. */
export const PETAL_SPRITE_HALF = 32;
/** Room around the silhouette for the flower's glow and the ember's blur. */
export const PETAL_SPRITE_SIDE = 2 * Math.ceil(PETAL_SPRITE_HALF * 1.55) + 4;
/** A custom colour dragged through a picker makes a new tint every frame. */
const MAX_SETS = 160;

export class PetalSpriteCache {
  private readonly sets = new Map<string, PetalSpriteSet | null>();
  private readonly embers = new Map<string, SpriteSurface | null>();
  private available: boolean | null = null;

  get(shape: PetalSpriteShape, tint: string): PetalSpriteSet | null {
    const key = `${shape}|${tint}`;
    const hit = this.sets.get(key);
    if (hit !== undefined) return hit;
    if (this.sets.size >= MAX_SETS) this.sets.clear();
    const set = this.paintSet(shape, tint);
    this.sets.set(key, set);
    return set;
  }

  ember(shape: PetalSpriteShape, color: string): SpriteSurface | null {
    const key = `${shape}|${color}`;
    const hit = this.embers.get(key);
    if (hit !== undefined) return hit;
    const surface = this.paint((ctx) =>
      drawPetalEmberRim(ctx, shape, PETAL_SPRITE_HALF, color, 1)
    );
    this.embers.set(key, surface);
    return surface;
  }

  clear(): void {
    this.sets.clear();
    this.embers.clear();
  }

  private paintSet(
    shape: PetalSpriteShape,
    tint: string
  ): PetalSpriteSet | null {
    const { r, g, b } = hexToRgbTuple(tint);
    // Light through a petal deepens its colour: the tint filtered by itself.
    const shade = `rgba(${(r * r) / 255},${(g * g) / 255},${(b * b) / 255},0.62)`;
    const lit = `rgba(${mix(r, 255, 0.4)},${mix(g, 250, 0.4)},${mix(b, 244, 0.4)},0.4)`;
    const paint = (wash: string | null, glaze: string) =>
      this.paint((ctx) => {
        drawPetalSilhouette(ctx, shape, PETAL_SPRITE_HALF, tint);
        ctx.globalCompositeOperation = "source-atop";
        const side = PETAL_SPRITE_SIDE;
        if (wash) {
          ctx.fillStyle = wash;
          ctx.fillRect(-side, -side, side * 2, side * 2);
        }
        ctx.fillStyle = glaze;
        ctx.fillRect(-side, -side, side * 2, side * 2);
      });
    // The underside of a petal is paler and less saturated.
    const underside = "rgba(255,246,250,0.3)";
    const frontShade = paint(null, shade);
    if (!frontShade) return null;
    return {
      frontShade,
      frontLit: paint(null, lit)!,
      backShade: paint(underside, shade)!,
      backLit: paint(underside, lit)!,
    };
  }

  private paint(draw: (ctx: SpriteContext) => void): SpriteSurface | null {
    if (this.available === false) return null;
    const surface = createSurface(PETAL_SPRITE_SIDE);
    const ctx = surface?.getContext("2d") as SpriteContext | null | undefined;
    if (!surface || !ctx) {
      this.available = false;
      return null;
    }
    try {
      ctx.translate(PETAL_SPRITE_SIDE / 2, PETAL_SPRITE_SIDE / 2);
      draw(ctx);
    } catch {
      // A context that cannot paint (a test stub) falls back to direct drawing.
      this.available = false;
      return null;
    }
    this.available = true;
    return surface;
  }
}

function createSurface(side: number): SpriteSurface | null {
  try {
    if (typeof OffscreenCanvas !== "undefined")
      return new OffscreenCanvas(side, side);
  } catch {
    /* fall through */
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    return canvas;
  }
  return null;
}

function mix(from: number, to: number, amount: number): number {
  return Math.round(from + (to - from) * amount);
}
