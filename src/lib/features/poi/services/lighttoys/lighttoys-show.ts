/**
 * Lighttoys show files (`Data.ftv`), built the way Lighttoys Composer 4.5's
 * "iVPOI" compiler builds them. See docs/reference/lighttoys-protocol.md.
 *
 * Pixels are stored as OpenCV-style HSV, columns are run-length encoded, and
 * the file ends with per-image tables and a 128-byte trailer. All numbers are
 * little-endian.
 */

/** One image on the show timeline. */
export interface LighttoysImage {
  /** LEDs per column (85 on a Lumi Staff). */
  ledCount: number;
  /** Distinct columns, each `ledCount * 3` bytes of R, G, B. */
  columns: Uint8Array[];
  /** Columns actually written; cycles through `columns`. Defaults to all. */
  columnCount?: number;
  /** Column time in microseconds × 256 (the script's `*p`; `*P n` is n << 8). */
  columnTime: number;
  /** Displayed length in columns (`*Z n`); defaults to the column count. */
  displayLength?: number;
}

export interface LighttoysShowOptions {
  /** Show UID; see `makeShowUid`. */
  uid: number;
  /** Creation time, Unix seconds. */
  createdAt: number;
}

const TABLE_ENTRY_BYTES = 32;
const TRAILER_BYTES = 128;
const MAX_IMAGES = 128;
const IMAGE_CLOSED = 0xa9;
const TRAILER_MARK = 0x8008;
const TRAILER_MAGIC = 0x504f4973; // "sIOP"

/** Composer's colour conversion (pixel-add routine at 0x140250050). */
export function rgbToLighttoysHsv(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (max === 0 || d === 0) return [0, 0, max];
  const q = (x: number) => Math.floor((30 * x + (d >> 1)) / d);
  let h: number;
  if (max === r) h = g >= b ? q(g - b) : 180 - q(b - g);
  else if (max === g) h = b >= r ? 60 + q(b - r) : 60 - q(r - b);
  else h = r >= g ? 120 + q(r - g) : 120 - q(g - r);
  if (h >= 180) h -= 180;
  const s = Math.floor((255 * d + (max >> 1)) / max);
  return [h, s, max];
}

/** One column's HSV pixels, packed H, S, V. */
export function columnToHsv(rgb: Uint8Array, ledCount: number): Uint8Array {
  if (rgb.length !== ledCount * 3)
    throw new Error(
      `Column has ${rgb.length / 3} pixels, expected ${ledCount}`
    );
  const out = new Uint8Array(ledCount * 3);
  for (let i = 0; i < ledCount; i++) {
    const [h, s, v] = rgbToLighttoysHsv(
      rgb[i * 3]!,
      rgb[i * 3 + 1]!,
      rgb[i * 3 + 2]!
    );
    out[i * 3] = h;
    out[i * 3 + 1] = s;
    out[i * 3 + 2] = v;
  }
  return out;
}

const samePixel = (px: Uint8Array, a: number, b: number) =>
  px[a * 3] === px[b * 3] &&
  px[a * 3 + 1] === px[b * 3 + 1] &&
  px[a * 3 + 2] === px[b * 3 + 2];

/**
 * Encode one HSV column as segments of literals and repeats (column encoder at
 * 0x140250590, column writer at 0x1402507d0). A run of three or more equal
 * pixels, or of two or more reaching the column end, becomes a repeat, split
 * at 255. Only a column ending in literals gets a closing 0. When that is
 * longer than the plain form, the plain form is written instead.
 */
export function encodeColumn(hsv: Uint8Array): Uint8Array {
  const n = hsv.length / 3;
  const out: number[] = [];
  const literals = (from: number, to: number) => {
    const count = to - from;
    out.push(count & 0xff, count >> 8);
    for (let i = from * 3; i < to * 3; i++) out.push(hsv[i]!);
  };
  let litStart = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && samePixel(hsv, i, j)) j++;
    let run = j - i;
    if (run >= 3 || (run >= 2 && j === n)) {
      let first = true;
      while (run > 0) {
        const r = Math.min(run, 255);
        if (first) literals(litStart, i);
        else literals(0, 0);
        out.push(r, hsv[i * 3]!, hsv[i * 3 + 1]!, hsv[i * 3 + 2]!);
        run -= r;
        first = false;
      }
      litStart = j;
    }
    i = j;
  }
  if (litStart < n) {
    literals(litStart, n);
    out.push(0);
  }
  const plainLength = (n + 1) * 3;
  if (out.length === 0 || out.length > plainLength) {
    const plain = new Uint8Array(plainLength);
    plain[0] = n & 0xff;
    plain[1] = n >> 8;
    plain.set(hsv, 2);
    return plain;
  }
  return Uint8Array.from(out);
}

/**
 * A fresh show UID. Bits 0-3 are 9 and bits 4-15 are 0xC2 (so the low half
 * always reads 0x0C29), bits 16-25 hold the clock's milliseconds, bits 26-30
 * are random, and bit 31 makes the UID and creation time together hold an odd
 * number of set bits.
 */
export function makeShowUid(
  createdAt: number,
  millis: number,
  random: number
): number {
  let uid = (0x0c29 | ((millis % 1000) << 16) | ((random & 0x1f) << 26)) >>> 0;
  if ((popcount(uid) + popcount(createdAt >>> 0)) % 2 === 0)
    uid = (uid | 0x80000000) >>> 0;
  return uid;
}

function popcount(x: number): number {
  let n = 0;
  for (let v = x >>> 0; v; v >>>= 1) n += v & 1;
  return n;
}

/** Grows a byte buffer without copying on every write. */
class ByteWriter {
  private buf = new Uint8Array(64 * 1024);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private reserve(extra: number): void {
    if (this.length + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.reserve(1);
    this.buf[this.length++] = v;
  }

  u16(v: number): void {
    this.reserve(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }

  u32(v: number): void {
    this.reserve(4);
    this.view.setUint32(this.length, v >>> 0, true);
    this.length += 4;
  }

  bytes(b: Uint8Array): void {
    this.reserve(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }

  zeros(n: number): void {
    this.reserve(n);
    this.buf.fill(0, this.length, this.length + n);
    this.length += n;
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/**
 * Show time for one image. Composer multiplies the displayed length by the
 * column time (µs × 256), divides by 1000 to get ms × 256, and keeps whole ms
 * plus a 16-bit fraction.
 */
export function imageDuration(
  displayLength: number,
  columnTime: number
): { ms: number; frac: number } {
  const p = BigInt(displayLength >>> 0) * BigInt(columnTime >>> 0);
  const q = p / 1000n;
  const rem = p % 1000n;
  const frac =
    (Number(q & 0xffn) << 8) | Number(((rem * 65536n) / 1000n) >> 8n);
  return { ms: Number(q >> 8n), frac };
}

interface EncodedColumn {
  payload: Uint8Array;
  sums: [number, number, number];
}

/** Compile a show: header, images, image table, trailer. */
export function compileLighttoysShow(
  images: LighttoysImage[],
  options: LighttoysShowOptions
): Uint8Array {
  if (images.length === 0) throw new Error("A show needs at least one image");
  if (images.length > MAX_IMAGES)
    throw new Error(`At most ${MAX_IMAGES} images per show are supported`);

  const w = new ByteWriter();
  w.u32(options.uid);
  w.u32(options.createdAt);

  const table = new ByteWriter();
  let totalMs = 0;
  let totalFrac = 0;
  let totalColumns = 0;
  let pixelCount = 0;
  let sumH = 0;
  let sumS = 0;
  let sumV = 0;

  for (const image of images) {
    const { ledCount, columns, columnTime } = image;
    const count = image.columnCount ?? columns.length;
    if (columns.length === 0 || count <= 0)
      throw new Error("An image needs at least one column");
    if (!Number.isInteger(ledCount) || ledCount < 1 || ledCount > 0xffff)
      throw new Error(`Bad LED count ${ledCount}`);
    if (count > 0xffff)
      throw new Error(`An image holds at most 65535 columns, not ${count}`);

    const encoded: EncodedColumn[] = columns.map((rgb) => {
      const hsv = columnToHsv(rgb, ledCount);
      const sums: [number, number, number] = [0, 0, 0];
      for (let i = 0; i < hsv.length; i += 3) {
        sums[0] += hsv[i]!;
        sums[1] += hsv[i + 1]!;
        sums[2] += hsv[i + 2]!;
      }
      return { payload: encodeColumn(hsv), sums };
    });

    const imageStart = w.length;
    const startMs = totalMs;
    const startFrac = totalFrac;
    let previous = 0;
    for (let c = 0; c < count; c++) {
      const col = encoded[c % encoded.length]!;
      const length = col.payload.length + 4;
      w.u16(previous);
      w.u16(length);
      w.bytes(col.payload);
      previous = length;
      sumH = (sumH + col.sums[0]) >>> 0;
      sumS = (sumS + col.sums[1]) >>> 0;
      sumV = (sumV + col.sums[2]) >>> 0;
    }
    w.u16(previous);
    pixelCount = (pixelCount + count * ledCount) >>> 0;

    const displayLength = image.displayLength || count;
    const { ms, frac } = imageDuration(displayLength, columnTime);
    const fracSum = totalFrac + frac;
    totalFrac = fracSum & 0xffff;
    totalMs = (totalMs + ms + (fracSum >> 16)) >>> 0;
    totalColumns = (totalColumns + displayLength) >>> 0;

    table.u32(imageStart);
    table.u16(ledCount);
    table.u16(count);
    table.u32(columnTime);
    table.u32(startMs);
    table.u16(startFrac);
    table.u8(IMAGE_CLOSED);
    table.u8(0);
    table.u32(0); // spacing
    table.u32(displayLength);
    table.zeros(4);
  }

  const tableOffset = w.length;
  w.bytes(table.result());
  const trailerOffset = w.length;

  const avg = (sum: number) => Math.floor(sum / pixelCount);
  const summary =
    (((((Math.floor((avg(sumV) * 255) / 100) | 0x4000) << 8) |
      Math.floor((avg(sumS) * 255) / 100)) <<
      8) |
      (avg(sumH) >> 1)) >>>
    0;

  w.u32(trailerOffset);
  w.u32(totalMs);
  w.u32(totalColumns);
  w.u32(summary);
  w.u16(0); // loop setting (no *J)
  w.u16(0); // flags (no overflow table)
  w.u16(totalFrac);
  w.u16(0);
  // First image table: offset, start ms and fraction of its first image.
  w.u32(tableOffset);
  w.u32(0);
  w.u16(0);
  w.u16(0);
  w.zeros(7 * 12);
  w.u16(TRAILER_MARK);
  w.u16(images.length);
  w.u32(TRAILER_MAGIC);

  const out = w.result();
  if (out.length !== trailerOffset + TRAILER_BYTES)
    throw new Error("Trailer size mismatch");
  if (trailerOffset !== tableOffset + images.length * TABLE_ENTRY_BYTES)
    throw new Error("Table size mismatch");
  return out;
}

/**
 * Parse a Composer vpoi text script into images (for checking against
 * Composer's own exports). Handles `*X`, `*P`, `*p`, `*Z`, `*K`, `*E` and
 * pixel lines `*N,0xRRGGBB`; other commands are ignored like Composer's
 * `*G`, `*L` and `*Y`.
 */
export function parseVpoiScript(text: string): LighttoysImage[] {
  let leds = 80;
  let columnTime = 1000 << 8;
  const images: LighttoysImage[] = [];
  let current: { image: LighttoysImage; pending: number[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const px = /^\*(\d{1,3}),0x([0-9A-Fa-f]{6})$/.exec(line);
    if (px) {
      if (!current)
        throw new Error("Pixels outside an image are not supported");
      const rgb = parseInt(px[2]!, 16);
      for (let k = Number(px[1]); k > 0; k--)
        current.pending.push((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
      while (current.pending.length >= leds * 3) {
        current.image.columns.push(
          Uint8Array.from(current.pending.splice(0, leds * 3))
        );
      }
      continue;
    }
    if (!line.startsWith("*") || line.length < 2) continue;
    const arg = line.slice(2);
    switch (line[1]) {
      case "X":
        leds = Number(arg);
        break;
      case "P":
        columnTime = Number(arg) << 8;
        break;
      case "p":
        columnTime = Number(arg);
        break;
      case "Z":
        current = {
          image: {
            ledCount: leds,
            columns: [],
            columnTime,
            displayLength: Number(arg) || undefined,
          },
          pending: [],
        };
        images.push(current.image);
        break;
      case "K":
        current = null;
        break;
      case "E":
        return images;
    }
  }
  return images;
}
