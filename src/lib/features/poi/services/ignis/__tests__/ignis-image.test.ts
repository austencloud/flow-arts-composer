import { describe, expect, it } from "vitest";
import { createEmptyPattern, setPixel } from "#lib/shared/poi/domain/strip-pattern.js";
import { crc32 } from "../ignis-codec";
import { CHUNK_SIZE, averageBrightness, encodeImage, ledBrightFor, mapChannel, maxImageColumns } from "../ignis-image";

describe("Ignis image encoding", () => {
  it("maps colours the way the Utility does (255 lands on 254)", () => {
    expect(mapChannel(0)).toBe(0);
    expect(mapChannel(128)).toBe(127);
    expect(mapChannel(255)).toBe(254);
  });

  it("dims bright images and leaves dark ones at full brightness", () => {
    const white = createEmptyPattern(200, 4, "white");
    for (const f of white.frames) f.colors.fill(255);
    expect(averageBrightness(white)).toBeCloseTo(254 / 255, 6);
    expect(ledBrightFor(averageBrightness(white))).toBe(4);
    expect(ledBrightFor(averageBrightness(createEmptyPattern(200, 4, "black")))).toBe(21);
    expect(ledBrightFor(0.001, 50)).toBe(21);
  });

  it("lays out columns as pad, [E0|bright, B, G, R] per LED bottom-up, pad", () => {
    const p = createEmptyPattern(200, 3, "dots");
    setPixel(p, 1, 199, { r: 255, g: 0, b: 0 }); // bottom row of the picture
    setPixel(p, 1, 0, { r: 0, g: 0, b: 255 }); // top row
    const img = encodeImage(p, { ledCount: 200 });

    expect(img.header).toMatchObject({ width: 3, height: 200, colSize: 808, scale: 0x400000 });
    const col1 = img.data.subarray(808, 808 * 2);
    expect([...col1.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...col1.subarray(4, 8)]).toEqual([0xe0 | img.ledBright, 0, 0, 254]); // LED 0 = bottom = red
    expect([...col1.subarray(800, 804)]).toEqual([0xe0 | img.ledBright, 254, 0, 0]); // LED 199 = top = blue
    expect([...col1.subarray(804)]).toEqual([0, 0, 0, 0]);
  });

  it("pads to whole chunks and checksums only the real data", () => {
    const p = createEmptyPattern(200, 5, "five");
    const img = encodeImage(p, { ledCount: 200 });
    expect(img.data.length).toBe(Math.ceil((5 * 808) / CHUNK_SIZE) * CHUNK_SIZE);
    expect(img.chunks).toHaveLength(2);
    expect(img.header.dataCrc).toBe(crc32(img.data.subarray(0, 5 * 808)));
  });

  it("resamples to the poi's LED count and cuts over-wide patterns", () => {
    expect(maxImageColumns(200)).toBe(972);
    const img = encodeImage(createEmptyPattern(100, 1000, "wide"), { ledCount: 200 });
    expect(img.header.height).toBe(200);
    expect(img.header.width).toBe(972);
    expect(img.truncated).toBe(true);
  });
});
