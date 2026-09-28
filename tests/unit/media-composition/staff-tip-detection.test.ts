import { describe, expect, it } from "vitest";
import {
  computeBackgroundMedian,
  createDetectionScratch,
  detectBlobsInFrame,
} from "$lib/shared/media-composition/services/staff-tip-detection";

const WIDTH = 48;
const HEIGHT = 48;
/** A dim, uniform "empty room" plate — nothing here should ever look "moving". */
const BACKGROUND_LEVEL = 50;

function flatBackground(): Int16Array {
  const bg = new Int16Array(WIDTH * HEIGHT * 3);
  bg.fill(BACKGROUND_LEVEL);
  return bg;
}

function blankFrame(): Uint8Array {
  const frame = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let i = 0; i < frame.length; i += 3) {
    frame[i] = BACKGROUND_LEVEL;
    frame[i + 1] = BACKGROUND_LEVEL;
    frame[i + 2] = BACKGROUND_LEVEL;
  }
  return frame;
}

function setPixel(frame: Uint8Array, x: number, y: number, r: number, g: number, b: number): void {
  const idx = (y * WIDTH + x) * 3;
  frame[idx] = r;
  frame[idx + 1] = g;
  frame[idx + 2] = b;
}

/** Paints a `size`x`size` square of one colour centred on (cx, cy). */
function paintSquare(
  frame: Uint8Array,
  cx: number,
  cy: number,
  size: number,
  colour: readonly [number, number, number],
): void {
  const half = Math.floor(size / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      setPixel(frame, cx + dx, cy + dy, colour[0], colour[1], colour[2]);
    }
  }
}

describe("detectBlobsInFrame", () => {
  it("finds a white-core blob with a red halo, colours it red, and centres it on the blob", () => {
    const background = flatBackground();
    const frame = blankFrame();
    const cx = 24;
    const cy = 24;
    // A 9x9 red halo (dominant red, but not clipped white) with a 3x3 near-white
    // core in the middle — a staff end lit red, seen face-on.
    paintSquare(frame, cx, cy, 9, [230, 90, 90]);
    paintSquare(frame, cx, cy, 3, [250, 250, 250]);

    const scratch = createDetectionScratch(WIDTH, HEIGHT);
    const blobs = detectBlobsInFrame(frame, background, WIDTH, HEIGHT, scratch);

    expect(blobs).toHaveLength(1);
    const blob = blobs[0]!;
    expect(blob.colour).toBe("red");
    expect(blob.hot).toBeGreaterThan(0);
    expect(blob.area).toBeGreaterThanOrEqual(81);
    expect(blob.x).toBeCloseTo(cx, 0);
    expect(blob.y).toBeCloseTo(cy, 0);
  });

  it("finds a white-core blob with a blue halo and colours it blue", () => {
    const background = flatBackground();
    const frame = blankFrame();
    const cx = 20;
    const cy = 30;
    paintSquare(frame, cx, cy, 9, [90, 90, 230]);
    paintSquare(frame, cx, cy, 3, [250, 250, 250]);

    const scratch = createDetectionScratch(WIDTH, HEIGHT);
    const blobs = detectBlobsInFrame(frame, background, WIDTH, HEIGHT, scratch);

    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.colour).toBe("blue");
    expect(blobs[0]!.x).toBeCloseTo(cx, 0);
    expect(blobs[0]!.y).toBeCloseTo(cy, 0);
  });

  it("gives a blob with both a red and a blue halo a mix above the crossing threshold", () => {
    const background = flatBackground();
    const frame = blankFrame();
    const cx = 24;
    const cy = 24;
    // Left half of the halo reads red, right half reads blue — two staff ends
    // that have merged into one blob at a crossing.
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx < 0) setPixel(frame, cx + dx, cy + dy, 230, 90, 90);
        else if (dx > 0) setPixel(frame, cx + dx, cy + dy, 90, 90, 230);
      }
    }
    paintSquare(frame, cx, cy, 3, [250, 250, 250]);

    const scratch = createDetectionScratch(WIDTH, HEIGHT);
    const blobs = detectBlobsInFrame(frame, background, WIDTH, HEIGHT, scratch);

    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.mix).toBeGreaterThanOrEqual(0.08);
  });

  it("drops blobs smaller than the minimum blob area", () => {
    const background = flatBackground();
    const frame = blankFrame();
    // A single clipped-white pixel: hot, but only 1px — well under the area-10 floor.
    setPixel(frame, 10, 10, 255, 255, 255);

    const scratch = createDetectionScratch(WIDTH, HEIGHT);
    const blobs = detectBlobsInFrame(frame, background, WIDTH, HEIGHT, scratch);

    expect(blobs).toHaveLength(0);
  });

  it("ignores a bright patch that exactly matches the background (not 'moving')", () => {
    const background = flatBackground();
    background.fill(240); // the background itself is already bright everywhere
    const frame = blankFrame();
    frame.fill(240); // frame matches the background exactly: diff = 0, never "moving"

    const scratch = createDetectionScratch(WIDTH, HEIGHT);
    const blobs = detectBlobsInFrame(frame, background, WIDTH, HEIGHT, scratch);

    expect(blobs).toHaveLength(0);
  });
});

describe("computeBackgroundMedian", () => {
  it("takes the per-pixel-per-channel median across the sampled frames", () => {
    const w = 2;
    const h = 2;
    const frames: Uint8Array[] = [];
    // 5 samples per pixel-channel: median of [10,20,30,40,50] is 30.
    for (const v of [10, 20, 30, 40, 50]) {
      const f = new Uint8Array(w * h * 3);
      f.fill(v);
      frames.push(f);
    }
    const bg = computeBackgroundMedian(frames, w, h);
    for (let i = 0; i < bg.length; i++) expect(bg[i]).toBe(30);
  });

  it("averages the two middle values for an even sample count, like numpy.median", () => {
    const w = 1;
    const h = 1;
    const frames: Uint8Array[] = [10, 20].map((v) => {
      const f = new Uint8Array(3);
      f.fill(v);
      return f;
    });
    const bg = computeBackgroundMedian(frames, w, h);
    expect(bg[0]).toBe(15);
  });
});
