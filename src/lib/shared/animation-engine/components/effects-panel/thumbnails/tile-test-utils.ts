/**
 * Test support for tile painters. The project's jsdom setup replaces
 * `document.createElement("canvas")` with a stub whose 2D context has no
 * gradients, paths or compositing, so tile tests paint on node-canvas
 * instead: importing this module routes canvas creation (the tile's own and
 * any offscreen layer a painter builds) to real node-canvas surfaces with
 * working `getImageData`.
 */
import { createCanvas } from "canvas";
import { expect, type vi } from "vitest";
import { TILE_FORMAT_SIZE, type TileFormat } from "./tile-format";

type CreateElement = typeof document.createElement;

function installNodeCanvas(): void {
  const current = document.createElement as unknown as {
    getMockImplementation?: () => CreateElement | undefined;
  };
  const previous = current.getMockImplementation?.();
  const impl: CreateElement = ((
    tagName: string,
    options?: ElementCreationOptions
  ) => {
    if (tagName.toLowerCase() === "canvas") {
      return createCanvas(0, 0) as unknown as HTMLCanvasElement;
    }
    return previous
      ? previous.call(document, tagName, options)
      : Object.getPrototypeOf(document).createElement.call(
          document,
          tagName,
          options
        );
  }) as CreateElement;
  if (
    typeof (
      document.createElement as unknown as { mockImplementation?: unknown }
    ).mockImplementation === "function"
  ) {
    (
      document.createElement as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(impl as never);
  } else {
    Object.defineProperty(document, "createElement", {
      writable: true,
      value: impl,
    });
  }
}

installNodeCanvas();

export function makeTileCanvas(
  format: TileFormat = "card"
): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_FORMAT_SIZE[format].w;
  canvas.height = TILE_FORMAT_SIZE[format].h;
  return canvas.getContext("2d")!;
}

export function tilePixels(ctx: CanvasRenderingContext2D): Uint8ClampedArray {
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
}

/** Bounding box (in canvas px) of everything brighter than `threshold`, and the brightest channel sum seen. */
export function litBox(
  ctx: CanvasRenderingContext2D,
  threshold = 150
): { x0: number; y0: number; x1: number; y1: number; peak: number } {
  const { width, height } = ctx.canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let peak = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const v = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
      if (v > peak) peak = v;
      if (d[i]! + d[i + 1]! + d[i + 2]! > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, peak };
}

/** A look painted on a light ground (Ghost Snake): brightness tests do not apply. */
export function hasLightGround(ctx: CanvasRenderingContext2D): boolean {
  const { width, height } = ctx.canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!;
  // Most of the frame is bright: the ground itself is light.
  return sum / (width * height) > 300;
}

/**
 * The small-format contract for one painted picture: the subject covers at
 * least `cover` (about 60%) of the limiting dimension, its bright part is not
 * cut by an edge, and its brightest channel clears a floor (about the
 * brightness of label text). `spansWidth` and `spansHeight` allow touching
 * the edges where the design means it (a bolt, a rising plume, a ribbon).
 */
export function expectSmallFormatReads(
  ctx: CanvasRenderingContext2D,
  opts: {
    cover?: number;
    spansWidth?: boolean;
    spansHeight?: boolean;
    floor?: number;
  } = {}
): void {
  if (hasLightGround(ctx)) return;
  const { width, height } = ctx.canvas;
  const box = litBox(ctx);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  // Limiting dimension: the one the subject fills a larger share of.
  expect(Math.max(bw / width, bh / height)).toBeGreaterThanOrEqual(
    opts.cover ?? 0.58
  );
  const bright = litBox(ctx, 300);
  if (!opts.spansHeight) {
    expect(bright.y0).toBeGreaterThan(0);
    expect(bright.y1).toBeLessThan(height - 1);
  }
  if (!opts.spansWidth) {
    expect(bright.x0).toBeGreaterThan(0);
    expect(bright.x1).toBeLessThan(width - 1);
  }
  expect(box.peak).toBeGreaterThanOrEqual(opts.floor ?? 140);
}

export function countLit(pixels: Uint8ClampedArray, threshold = 120): number {
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > threshold) lit += 1;
  }
  return lit;
}

export function samePixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray
): boolean {
  return Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) === 0;
}

/**
 * Every tile painter must (1) paint each preset without throwing, (2) leave
 * light on the frame, and (3) repeat itself exactly for the same inputs.
 */
export function paintsDeterministically<I>(
  paint: (ctx: CanvasRenderingContext2D, intent: I, format?: TileFormat) => void,
  intents: readonly I[],
  format: TileFormat = "card"
): void {
  expect(intents.length).toBeGreaterThan(0);
  for (const intent of intents) {
    const a = makeTileCanvas(format);
    const b = makeTileCanvas(format);
    expect(() => paint(a, intent, format)).not.toThrow();
    paint(b, intent, format);
    const pa = tilePixels(a);
    const pb = tilePixels(b);
    expect(countLit(pa)).toBeGreaterThan(format === "card" ? 200 : 20);
    expect(samePixels(pa, pb)).toBe(true);
  }
}
