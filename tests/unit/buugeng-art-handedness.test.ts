import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Buugeng chirality A means one shape in every version. A buugeng is an S, so
// rotating it never changes its handedness and only a mirror does. On
// 2026-10-15 the Version 2 sprites (captured from the Flow DNA model) were the
// mirror of the notation art, so "A" picked opposite shapes depending on the
// version. This locks every artwork the pictograph draws to the notation art.

const ROOT = resolve(__dirname, "../..");
const PROPS = resolve(ROOT, "static/images/props");

const NOTATION = ["buugeng.svg", "bigbuugeng.svg"];
const MODEL_SPRITES = [
  "appearances/model/buugeng-blue.svg",
  "appearances/model/buugeng-red.svg",
  "appearances/model/bigbuugeng-blue.svg",
  "appearances/model/bigbuugeng-red.svg",
];

/**
 * Sign of the alpha-weighted x/y covariance about the ink centroid. An S whose
 * upper lobe sits on the left has its ink in the upper-left and lower-right,
 * which is one sign; its mirror has the other.
 */
async function handedness(svg: Buffer): Promise<number> {
  // Model sprites wrap a captured WebP in an <image>, which librsvg will not
  // decode, so measure the capture itself. Placement inside the box cannot
  // change the sign, because the covariance is taken about the ink centroid.
  const embedded = /href="data:image\/[a-z]+;base64,([^"]+)"/.exec(
    svg.toString("utf8")
  );
  const source = embedded ? Buffer.from(embedded[1]!, "base64") : svg;
  const { data, info } = await sharp(source, { density: 96 })
    .resize({ width: 400 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let mass = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + 3]!;
      mass += alpha;
      sumX += alpha * x;
      sumY += alpha * y;
    }
  }
  const cx = sumX / mass;
  const cy = sumY / mass;
  let covariance = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * info.channels + 3]!;
      covariance += alpha * (x - cx) * (y - cy);
    }
  }
  return Math.sign(covariance / mass);
}

describe("buugeng artwork handedness", () => {
  it("measures a mirror as the opposite hand", async () => {
    const svg = readFileSync(resolve(PROPS, "buugeng.svg"), "utf8");
    const mirrored = svg.replace(
      /<path /,
      '<path transform="translate(262.6 0) scale(-1 1)" '
    );
    const original = await handedness(Buffer.from(svg));
    expect(original).not.toBe(0);
    expect(await handedness(Buffer.from(mirrored))).toBe(-original);
  });

  it("draws every version with the notation art's handedness", async () => {
    const read = (file: string) => readFileSync(resolve(PROPS, file));
    const reference = await handedness(read(NOTATION[0]!));
    for (const file of [...NOTATION, ...MODEL_SPRITES]) {
      expect({ file, hand: await handedness(read(file)) }).toEqual({
        file,
        hand: reference,
      });
    }
  });
});
