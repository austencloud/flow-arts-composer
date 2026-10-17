/**
 * StripPattern -> the image bytes an Ignis HD poi stores, reproducing
 * `C_IMAGE::CnvToTlvFmt` (0x140027a60) for SK9822 models.
 *
 * Each frame becomes one column: 4 zero bytes, then per LED
 * `[0xE0 | ledBright, B, G, R]`, then 4 zero bytes. The Utility rotates the
 * picture 90 degrees clockwise first, so LED 0 is the bottom row of the
 * picture; our patterns store row 0 at the top, so LEDs are read bottom-up.
 */

import type { StripPattern } from "#lib/shared/poi/domain/strip-pattern.js";
import { imageDataToStripPattern } from "#lib/shared/poi/domain/strip-pattern-image.js";
import { crc32 } from "./ignis-codec";
import type { ImageHeader } from "./ignis-messages";

/** Bytes per upload chunk; the image is zero-padded to a multiple of it. */
export const CHUNK_SIZE = 0x800;
/** Zero bytes before and after each column on SK9822 HD models. */
const COLUMN_PAD = 4;
const BYTES_PER_LED = 4;
/** Fixed-point unit of the header's scale field. */
const SCALE_ONE = 4194304;

/**
 * Brightness limits from the Utility's bright.json (served from Ignis'
 * config server; these are its current values and the built-in defaults).
 * They cap the SK9822 5-bit global brightness so the strip and battery are
 * never overdriven.
 */
export const IGNIS_BRIGHT = { maxBright: 21, groupSize: 8, maxPower: 0.226 } as const;

/** Image slots on HD firmware 3.x (0x14001d8c0). */
export const IGNIS_IMAGE_SLOTS = 80;

/** Widest image an HD slot holds: 3 x 256 KB blocks less 512 bytes (0x14001db00). */
export function maxImageColumns(ledCount: number): number {
  return Math.floor((3 * 0x40000 - 0x200) / columnSize(ledCount));
}

export function columnSize(ledCount: number): number {
  return ledCount * BYTES_PER_LED + 2 * COLUMN_PAD;
}

/**
 * The Utility's colour map for SK9822: 8-bit -> 12-bit -> 0..1 -> x255,
 * truncated. A linear curve, except full 255 lands on 254.
 */
export function mapChannel(c: number): number {
  const v = Math.min(1, ((c << 4) & 0xffff) / 4095);
  return Math.trunc(v * 255);
}

/**
 * The Utility's power estimate ("Mode::getAvgBright"): average each LED's
 * brightness over the whole image, then take the brightest run of
 * `groupSize` neighbouring LEDs.
 */
export function averageBrightness(pattern: StripPattern, groupSize: number = IGNIS_BRIGHT.groupSize): number {
  const { ledCount, frameCount, frames } = pattern;
  const rowAvg = new Float64Array(ledCount);
  for (let led = 0; led < ledCount; led++) {
    let sum = 0;
    for (let f = 0; f < frameCount; f++) {
      const c = frames[f]!.colors;
      const o = led * 3;
      sum += (mapChannel(c[o]!) / 255 + mapChannel(c[o + 1]!) / 255 + mapChannel(c[o + 2]!) / 255) / 3;
    }
    rowAvg[led] = sum / frameCount;
  }
  let best = 0.001;
  // The Utility's window loop stops one short of the last window; kept as is.
  for (let start = 0; start < ledCount - groupSize; start++) {
    let sum = 0;
    for (let i = 0; i < groupSize; i++) sum += rowAvg[start + i]!;
    best = Math.max(best, sum / groupSize);
  }
  return best;
}

/**
 * Global 5-bit brightness for the whole image. Bright images get dimmed so
 * the current stays under `maxPower`. (The Utility truncates this to a byte
 * before clamping, which can wrongly dim very dark images; we clamp first.)
 */
export function ledBrightFor(avg: number, maxBright: number = IGNIS_BRIGHT.maxBright): number {
  const cap = Math.max(1, Math.min(IGNIS_BRIGHT.maxBright, Math.round(maxBright)));
  const wanted = Math.trunc((IGNIS_BRIGHT.maxPower / avg) * IGNIS_BRIGHT.maxBright);
  return Math.max(1, Math.min(cap, wanted));
}

export interface EncodeOptions {
  /** LEDs on the target poi; the pattern is resampled to it if needed. */
  ledCount: number;
  /**
   * Brightness ceiling, 1..21. 21 matches the Utility; lower is dimmer.
   * Never raised past the Utility's limit.
   */
  maxBright?: number;
  /** Header scale (playback stretch), 1 = as drawn. */
  scale?: number;
}

export interface EncodedImage {
  header: ImageHeader;
  /** Column data, zero-padded to a multiple of CHUNK_SIZE. */
  data: Uint8Array;
  chunks: Uint8Array[];
  ledBright: number;
  /** True when the pattern was wider than a slot and got cut. */
  truncated: boolean;
}

function fitToLedCount(pattern: StripPattern, ledCount: number): StripPattern {
  if (pattern.ledCount === ledCount) return pattern;
  const { frameCount, frames } = pattern;
  const data = new Uint8ClampedArray(frameCount * pattern.ledCount * 4);
  for (let col = 0; col < frameCount; col++) {
    const colors = frames[col]!.colors;
    for (let row = 0; row < pattern.ledCount; row++) {
      const d = (row * frameCount + col) * 4;
      data[d] = colors[row * 3]!;
      data[d + 1] = colors[row * 3 + 1]!;
      data[d + 2] = colors[row * 3 + 2]!;
      data[d + 3] = 255;
    }
  }
  const image = { width: frameCount, height: pattern.ledCount, data, colorSpace: "srgb" } as ImageData;
  return imageDataToStripPattern(image, ledCount, frameCount, pattern.metadata.name);
}

export function encodeImage(source: StripPattern, options: EncodeOptions): EncodedImage {
  const { ledCount } = options;
  const fitted = fitToLedCount(source, ledCount);
  const maxColumns = maxImageColumns(ledCount);
  const width = Math.min(fitted.frameCount, maxColumns);
  const pattern: StripPattern =
    width === fitted.frameCount ? fitted : { ...fitted, frameCount: width, frames: fitted.frames.slice(0, width) };

  const ledBright = ledBrightFor(averageBrightness(pattern), options.maxBright);
  const colSize = columnSize(ledCount);
  const raw = new Uint8Array(width * colSize);
  for (let f = 0; f < width; f++) {
    const colors = pattern.frames[f]!.colors;
    const base = f * colSize + COLUMN_PAD;
    for (let led = 0; led < ledCount; led++) {
      const src = (ledCount - 1 - led) * 3;
      const o = base + led * BYTES_PER_LED;
      raw[o] = 0xe0 | ledBright;
      raw[o + 1] = mapChannel(colors[src + 2]!);
      raw[o + 2] = mapChannel(colors[src + 1]!);
      raw[o + 3] = mapChannel(colors[src]!);
    }
  }

  const scale = Math.min(1000, Math.max(0.001, options.scale ?? 1));
  const header: ImageHeader = {
    width,
    height: ledCount,
    colSize,
    drawStyle: 0,
    gapSize: 0,
    scale: Math.trunc(scale * SCALE_ONE) >>> 0,
    dataCrc: crc32(raw),
  };

  const padded = new Uint8Array(Math.ceil(raw.length / CHUNK_SIZE) * CHUNK_SIZE);
  padded.set(raw);
  const chunks: Uint8Array[] = [];
  for (let at = 0; at < padded.length; at += CHUNK_SIZE) chunks.push(padded.subarray(at, at + CHUNK_SIZE));

  return { header, data: padded, chunks, ledBright, truncated: width < fitted.frameCount };
}
