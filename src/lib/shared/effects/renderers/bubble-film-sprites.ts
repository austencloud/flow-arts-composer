/**
 * Pre-painted soap-film sprites for the Canvas2D bubbles.
 *
 * Each film is computed per pixel once (`sampleBubbleFilm`) for a handful
 * of eddy seeds and a few late-life drainage stages, and the highlights are
 * painted once per palette on their own sprite so the film can turn under
 * a fixed light. A bubble is then one or two film blits plus one gloss
 * blit, however rich the film. Painted lazily, so a palette costs only the
 * sprites its bubbles reach.
 *
 * Returns null where no 2D canvas exists (tests); the renderer then draws a
 * plain vector bubble.
 */

import {
  type BubbleFilmLook,
  sampleBubbleFilm,
  sampleBubbleGloss,
  thinFilmSpectrum,
} from "./bubble-film";

type SpriteSurface = HTMLCanvasElement | OffscreenCanvas;
type SpriteContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Painted radius (px). Drawn sizes scale from this. */
export const BUBBLE_SPRITE_RADIUS = 40;
/** One pixel of air round the disc so its edge antialiases. */
export const BUBBLE_SPRITE_SIDE = BUBBLE_SPRITE_RADIUS * 2 + 4;
/** Eddy layouts. Each bubble keeps one for life. */
export const BUBBLE_FILM_SEEDS = 6;
/**
 * Lives the film is painted at. Until 0.72 the film only drifts, which the
 * renderer gives by turning it; past that the top drains clear, so the late
 * stages are painted and crossfaded.
 */
export const BUBBLE_FILM_STAGE_LIVES = [0.4, 0.82, 0.91, 1] as const;
/** Life at which drainage starts to show (the 3D shader's pre-rupture). */
export const BUBBLE_DRAIN_START = 0.72;
/** A custom colour dragged through a picker makes a new look every frame. ~0.7 MB a look. */
const MAX_LOOKS = 6;
const FLECK_THICKNESSES_NM = [230, 300, 370, 440, 520, 610];

interface LookSprites {
  film: (SpriteSurface | null | undefined)[];
  gloss: SpriteSurface | null | undefined;
  flecks: string[] | undefined;
}

export class BubbleFilmSpriteCache {
  private readonly looks = new Map<string, LookSprites>();
  private available: boolean | null = null;
  /** Film sprites this frame may still paint; unlimited until a renderer sets it. */
  private paintBudget = Number.POSITIVE_INFINITY;

  /**
   * Cap how many film sprites the coming frame may paint. Past the cap a
   * missing film borrows a painted neighbour until a later frame paints it.
   */
  beginFrame(paints: number): void {
    this.paintBudget = paints;
  }

  /** Film sprite for a seed (0..SEEDS-1) and stage (0..STAGES-1). */
  film(
    look: BubbleFilmLook,
    seedIndex: number,
    stageIndex: number
  ): SpriteSurface | null {
    const sprites = this.lookSprites(look);
    const slot = seedIndex * BUBBLE_FILM_STAGE_LIVES.length + stageIndex;
    const hit = sprites.film[slot];
    if (hit !== undefined) return hit;
    if (this.paintBudget <= 0) return borrowFilm(sprites.film, stageIndex);
    this.paintBudget--;
    const seed = (seedIndex + 0.5) / BUBBLE_FILM_SEEDS;
    const life = BUBBLE_FILM_STAGE_LIVES[stageIndex] ?? 0.4;
    const px: [number, number, number, number] = [0, 0, 0, 0];
    const surface = this.paint((x, y) =>
      sampleBubbleFilm(x, y, seed, life, look, px)
    );
    sprites.film[slot] = surface;
    return surface;
  }

  gloss(look: BubbleFilmLook): SpriteSurface | null {
    const sprites = this.lookSprites(look);
    if (sprites.gloss !== undefined) return sprites.gloss;
    const [r, g, b] = look.highlight;
    const px: [number, number, number, number] = [r, g, b, 0];
    sprites.gloss = this.paint((x, y) => {
      px[3] = sampleBubbleGloss(x, y);
      return px;
    });
    return sprites.gloss;
  }

  /** Film colours for burst flecks, from a spread of thicknesses. */
  flecks(look: BubbleFilmLook): string[] {
    const sprites = this.lookSprites(look);
    if (sprites.flecks) return sprites.flecks;
    const k = 0.48 + look.filmStrength * 0.42;
    const out: [number, number, number] = [0, 0, 0];
    sprites.flecks = FLECK_THICKNESSES_NM.map((d) => {
      thinFilmSpectrum(d, 0.7, out);
      const ch = (i: number) => {
        const film = look.tint[i]! + (out[i]! - look.tint[i]!) * k;
        // Lifted toward white: a torn sliver catches the light edge-on.
        const lit = Math.min(1, film * 1.16 * look.dye[i]!);
        return Math.round((lit * 0.6 + 0.4 * look.dye[i]!) * 255);
      };
      return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
    });
    return sprites.flecks;
  }

  clear(): void {
    this.looks.clear();
  }

  private lookSprites(look: BubbleFilmLook): LookSprites {
    let sprites = this.looks.get(look.key);
    if (!sprites) {
      if (this.looks.size >= MAX_LOOKS) this.looks.clear();
      sprites = { film: [], gloss: undefined, flecks: undefined };
      this.looks.set(look.key, sprites);
    }
    return sprites;
  }

  private paint(
    sample: (x: number, y: number) => readonly [number, number, number, number]
  ): SpriteSurface | null {
    if (this.available === false) return null;
    const side = BUBBLE_SPRITE_SIDE;
    const surface = createSurface(side);
    const ctx = surface?.getContext("2d") as SpriteContext | null | undefined;
    if (!surface || !ctx) {
      this.available = false;
      return null;
    }
    try {
      const image = ctx.createImageData(side, side);
      const data = image.data;
      const centre = side / 2;
      const R = BUBBLE_SPRITE_RADIUS;
      for (let py = 0; py < side; py++) {
        for (let px = 0; px < side; px++) {
          const ux = (px + 0.5 - centre) / R;
          const uy = (py + 0.5 - centre) / R;
          const dist = Math.hypot(ux, uy);
          // Pixel coverage of the disc edge, so the rim antialiases.
          const coverage = Math.max(0, Math.min(1, (1 - dist) * R + 0.5));
          if (coverage <= 0) continue;
          const inside = dist < 0.999 ? 1 : 0.999 / dist;
          const c = sample(ux * inside, uy * inside);
          const i = (py * side + px) * 4;
          data[i] = Math.round(c[0] * 255);
          data[i + 1] = Math.round(c[1] * 255);
          data[i + 2] = Math.round(c[2] * 255);
          data[i + 3] = Math.round(c[3] * coverage * 255);
        }
      }
      ctx.putImageData(image, 0, 0);
    } catch {
      // A context that cannot paint (a test stub) falls back to vectors.
      this.available = false;
      return null;
    }
    this.available = true;
    return surface;
  }
}

/** A painted film of the same stage if there is one, else any painted film. */
function borrowFilm(
  films: readonly (SpriteSurface | null | undefined)[],
  stageIndex: number
): SpriteSurface | null {
  const stages = BUBBLE_FILM_STAGE_LIVES.length;
  let any: SpriteSurface | null = null;
  for (let i = 0; i < films.length; i++) {
    const f = films[i];
    if (!f) continue;
    if (i % stages === stageIndex) return f;
    any ??= f;
  }
  return any;
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
