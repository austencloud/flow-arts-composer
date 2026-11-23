/**
 * The surroundings' surface pictures, drawn once on canvases.
 *
 * Nothing is fetched: a dormant winter lawn with fallen leaves, red-brown
 * mulch with tan leaves, poured concrete slabs and sidewalks, brick at its true
 * course height, coursed stone, lap siding, shingles, and the soft pool a lamp
 * throws on the ground. Each tiles, carries mipmaps, and is built the first time
 * it is asked for and kept for the page's life, like `site-walk-textures.ts`,
 * whose canvas helpers it uses. All of them are colour pictures only; the
 * materials give the roughness.
 */

import type { CanvasTexture } from "three";
import type { WallKind } from "./site-walk-around";
import { canvasOf, fractal, seeded, textureOf, wrapDot } from "./site-walk-textures";

/** Metres one repeat of each ground picture covers. */
export const AROUND_TILE = {
  grass: 4,
  mulch: 3,
  /** A poured slab: a joint every 8 ft. */
  slab: 8 * 0.3048,
  /** A sidewalk square: a joint across every 5 ft. */
  walk: 5 * 0.3048,
  shingle: 1.524,
} as const;

type Colour = readonly [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (c: Colour, shift = 0) => `rgb(${clamp(c[0] + shift)},${clamp(c[1] + shift)},${clamp(c[2] + shift)})`;

const cache = new Map<string, CanvasTexture>();
const once = (key: string, make: () => CanvasTexture): CanvasTexture => {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
};

interface Grain {
  seed: number;
  /** The colour where the broad noise is low, and where it is high. */
  low: Colour;
  high: Colour;
  fine: number;
}

/** A canvas filled from broad two-colour patches plus fine grain; tiles. */
function grainCanvas(size: number, g: Grain) {
  const random = seeded(g.seed);
  const broad = fractal(size, random, 3, 4);
  const fine = fractal(size, random, 64, 2);
  const { canvas, ctx } = canvasOf(size);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const t = Math.max(0, Math.min(1, (broad[i]! - 0.3) / 0.4));
    const shift = (fine[i]! - 0.5) * g.fine;
    for (let c = 0; c < 3; c++) image.data[i * 4 + c] = clamp(g.low[c]! + (g.high[c]! - g.low[c]!) * t + shift);
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, ctx, random };
}

/** An ellipse drawn again across each edge it crosses, so it tiles. */
function wrapLeaf(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, length: number, width: number, angle: number): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + length < 0 || px - length > size || py + length < 0 || py - length > size) continue;
      ctx.beginPath();
      ctx.ellipse(px, py, length, width, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A dormant winter lawn: muted green-tan with a scatter of fallen leaves. Tiles every `AROUND_TILE.grass`. */
export function grassTexture(): CanvasTexture {
  return once("grass", () => {
    const size = 512;
    const { canvas, ctx, random } = grainCanvas(size, {
      seed: 8801,
      low: [138, 126, 88],
      high: [104, 114, 72],
      fine: 34,
    });
    const leaves: Colour[] = [
      [170, 142, 94],
      [142, 106, 66],
      [114, 86, 54],
      [158, 134, 84],
    ];
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rgb(leaves[Math.floor(random() * leaves.length)]!, (random() - 0.5) * 20);
      wrapLeaf(ctx, size, random() * size, random() * size, 3.5 + random() * 3.5, 1.4 + random() * 1.4, random() * Math.PI);
    }
    // Dark flecks, the shaded ground between tufts.
    ctx.fillStyle = "rgba(60,62,40,0.5)";
    for (let i = 0; i < 900; i++) wrapDot(ctx, size, random() * size, random() * size, 0.6 + random() * 0.9);
    return textureOf(canvas, true);
  });
}

/** Red-brown wood-chip mulch with tan leaves. Tiles every `AROUND_TILE.mulch`. */
export function mulchTexture(): CanvasTexture {
  return once("mulch", () => {
    const size = 512;
    const { canvas, ctx, random } = grainCanvas(size, {
      seed: 8802,
      low: [118, 64, 44],
      high: [156, 90, 62],
      fine: 26,
    });
    for (let i = 0; i < 1900; i++) {
      const tone = (random() - 0.5) * 46;
      ctx.fillStyle = rgb([150 + tone, 84 + tone * 0.6, 56 + tone * 0.4]);
      wrapLeaf(ctx, size, random() * size, random() * size, 4 + random() * 6, 1.6 + random() * 1.8, random() * Math.PI);
    }
    const leaves: Colour[] = [
      [178, 148, 100],
      [152, 122, 80],
    ];
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = rgb(leaves[i % 2]!, (random() - 0.5) * 16);
      wrapLeaf(ctx, size, random() * size, random() * size, 11 + random() * 8, 4 + random() * 3, random() * Math.PI);
    }
    return textureOf(canvas, true);
  });
}

/** Poured concrete. `joints` "both" is a big slab, "across" a sidewalk square. */
function concrete(key: string, seed: number, joints: "both" | "across"): CanvasTexture {
  return once(key, () => {
    const size = 512;
    const { canvas, ctx, random } = grainCanvas(size, {
      seed,
      low: [160, 158, 152],
      high: [180, 178, 170],
      fine: 30,
    });
    ctx.fillStyle = "rgba(120,118,112,0.35)";
    for (let i = 0; i < 700; i++) wrapDot(ctx, size, random() * size, random() * size, 0.5 + random() * 1.1);
    // The tooled joint: a dark groove with a pale lip, on the tile's own edge so it meets itself.
    const groove = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = "rgb(88,86,82)";
      ctx.fillRect(x, y, w, h);
    };
    groove(0, 0, 3, size);
    groove(size - 2, 0, 2, size);
    ctx.fillStyle = "rgba(210,208,200,0.5)";
    ctx.fillRect(3, 0, 2, size);
    if (joints === "both") {
      groove(0, 0, size, 3);
      groove(0, size - 2, size, 2);
      ctx.fillStyle = "rgba(210,208,200,0.5)";
      ctx.fillRect(0, 3, size, 2);
    }
    return textureOf(canvas, true);
  });
}
export const slabTexture = (): CanvasTexture => concrete("slab", 8803, "both");
export const walkTexture = (): CanvasTexture => concrete("walk", 8804, "across");

/** Shingles: grey rows with their tab joints, tinted by each roof's vertex colour. Tiles every `AROUND_TILE.shingle`. */
export function shingleTexture(): CanvasTexture {
  return once("shingle", () => {
    const size = 600;
    const rows = 12;
    const tabs = 5;
    const { canvas, ctx, random } = grainCanvas(size, {
      seed: 8805,
      low: [186, 186, 186],
      high: [214, 214, 214],
      fine: 30,
    });
    const rowH = size / rows;
    const tabW = size / tabs;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      // Each row's own tone, then a shadow under its lower edge where it overlaps the next.
      ctx.fillStyle = `rgba(0,0,0,${0.04 + random() * 0.08})`;
      ctx.fillRect(0, y, size, rowH);
      const shade = ctx.createLinearGradient(0, y + rowH * 0.7, 0, y + rowH);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, y + rowH * 0.7, size, rowH * 0.3);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      const stagger = (r % 3) * (tabW / 3);
      for (let k = 0; k < tabs; k++) ctx.fillRect(((k * tabW + stagger) % size) - 1, y, 2, rowH * 0.7);
    }
    return textureOf(canvas, true);
  });
}

// ------------------------------------------------------------------ walls

interface Mortar {
  colour: Colour;
}

function brick(key: string, seed: number, base: Colour, spread: number): CanvasTexture {
  return once(key, () => {
    const size = 640;
    const courses = 16;
    const perCourse = 5;
    const random = seeded(seed);
    const { canvas, ctx } = canvasOf(size);
    const mortar: Mortar = { colour: [178, 172, 160] };
    ctx.fillStyle = rgb(mortar.colour);
    ctx.fillRect(0, 0, size, size);
    const h = size / courses;
    const w = size / perCourse;
    const joint = 4;
    for (let r = 0; r < courses; r++) {
      const offset = r % 2 === 0 ? 0 : w / 2;
      for (let k = -1; k < perCourse; k++) {
        const x = k * w + offset;
        const tone = (random() - 0.5) * spread + (random() < 0.06 ? -spread * 0.6 : 0);
        ctx.fillStyle = rgb(base, tone);
        // Drawn again across the edge it wraps over, so the tile has no seam.
        for (const dx of [0, size]) ctx.fillRect(x + joint / 2 - dx * 0, r * h + joint / 2, w - joint, h - joint);
        if (x < 0) ctx.fillRect(x + size + joint / 2, r * h + joint / 2, w - joint, h - joint);
      }
    }
    // Fine grain over the lot, so no brick is a flat colour.
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) {
      const n = (random() - 0.5) * 18;
      image.data[i * 4] = clamp(image.data[i * 4]! + n);
      image.data[i * 4 + 1] = clamp(image.data[i * 4 + 1]! + n);
      image.data[i * 4 + 2] = clamp(image.data[i * 4 + 2]! + n);
    }
    ctx.putImageData(image, 0, 0);
    return textureOf(canvas, true);
  });
}

/** Coursed ashlar: eight courses a foot high, blocks of different lengths, pink-buff. */
function stone(): CanvasTexture {
  return once("stone", () => {
    const size = 640;
    const courses = 8;
    const random = seeded(8811);
    const { canvas, ctx } = canvasOf(size);
    ctx.fillStyle = "rgb(168,158,144)";
    ctx.fillRect(0, 0, size, size);
    const h = size / courses;
    const base: Colour = [214, 180, 146];
    for (let r = 0; r < courses; r++) {
      let x = -random() * 120;
      while (x < size) {
        const w = 130 + random() * 190;
        const end = Math.min(x + w, size + 1);
        // The last block of a course takes whatever is left, so the course closes on itself across the tile edge.
        const tone = (random() - 0.5) * 40;
        ctx.fillStyle = rgb(base, tone);
        ctx.fillRect(Math.max(0, x) + 2, r * h + 2, end - Math.max(0, x) - 4, h - 4);
        x += w;
      }
    }
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) {
      const n = (random() - 0.5) * 22;
      for (let c = 0; c < 3; c++) image.data[i * 4 + c] = clamp(image.data[i * 4 + c]! + n);
    }
    ctx.putImageData(image, 0, 0);
    return textureOf(canvas, true);
  });
}

/** White lap siding: eight laps to a repeat, each with a shadow line under its lower edge. */
function siding(): CanvasTexture {
  return once("siding", () => {
    const size = 640;
    const laps = 8;
    const random = seeded(8812);
    const { canvas, ctx } = canvasOf(size);
    const h = size / laps;
    for (let r = 0; r < laps; r++) {
      const y = r * h;
      ctx.fillStyle = rgb([232, 232, 228], (random() - 0.5) * 6);
      ctx.fillRect(0, y, size, h);
      const shade = ctx.createLinearGradient(0, y + h * 0.78, 0, y + h);
      shade.addColorStop(0, "rgba(120,124,130,0)");
      shade.addColorStop(1, "rgba(120,124,130,0.85)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, y + h * 0.78, size, h * 0.22);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(0, y, size, 2);
    }
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) {
      const n = (random() - 0.5) * 8;
      for (let c = 0; c < 3; c++) image.data[i * 4 + c] = clamp(image.data[i * 4 + c]! + n);
    }
    ctx.putImageData(image, 0, 0);
    return textureOf(canvas, true);
  });
}

/** Board-formed concrete: grey, with a faint line every foot where the forms met. */
function concreteWall(): CanvasTexture {
  return once("concrete-wall", () => {
    const size = 640;
    const { canvas, ctx } = grainCanvas(size, {
      seed: 8813,
      low: [140, 138, 132],
      high: [162, 160, 154],
      fine: 26,
    });
    ctx.fillStyle = "rgba(70,68,64,0.35)";
    for (let r = 0; r < 8; r++) ctx.fillRect(0, (r * size) / 8, size, 2);
    return textureOf(canvas, true);
  });
}

export function wallTexture(kind: WallKind): CanvasTexture {
  switch (kind) {
    case "brick-buff":
      return brick("brick-buff", 8821, [214, 188, 142], 30);
    case "brick-red":
      return brick("brick-red", 8822, [158, 78, 58], 34);
    case "brick-brown":
      return brick("brick-brown", 8823, [110, 78, 62], 32);
    case "stone":
      return stone();
    case "siding-white":
      return siding();
    case "concrete":
      return concreteWall();
  }
}

/** A soft round pool of light: bright in the middle, gone at the edge. For an additive ground disc. */
export function poolTexture(): CanvasTexture {
  return once("pool", () => {
    const size = 256;
    const { canvas, ctx } = canvasOf(size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = Math.pow(Math.cos((t * Math.PI) / 2), 2.2);
      g.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return textureOf(canvas, true);
  });
}
