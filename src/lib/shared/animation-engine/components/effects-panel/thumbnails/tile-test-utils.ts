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
import { TILE_H, TILE_W } from "./tile-paint";

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

export function makeTileCanvas(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  return canvas.getContext("2d")!;
}

export function tilePixels(ctx: CanvasRenderingContext2D): Uint8ClampedArray {
  return ctx.getImageData(0, 0, TILE_W, TILE_H).data;
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
  paint: (ctx: CanvasRenderingContext2D, intent: I) => void,
  intents: readonly I[]
): void {
  expect(intents.length).toBeGreaterThan(0);
  for (const intent of intents) {
    const a = makeTileCanvas();
    const b = makeTileCanvas();
    expect(() => paint(a, intent)).not.toThrow();
    paint(b, intent);
    const pa = tilePixels(a);
    const pb = tilePixels(b);
    expect(countLit(pa)).toBeGreaterThan(200);
    expect(samePixels(pa, pb)).toBe(true);
  }
}
