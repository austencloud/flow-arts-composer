import { describe, expect, it } from "vitest";
import {
  compileLighttoysShow,
  encodeColumn,
  imageDuration,
  makeShowUid,
  parseVpoiScript,
  rgbToLighttoysHsv,
} from "../lighttoys-show";

const px = (...pixels: [number, number, number][]) =>
  Uint8Array.from(pixels.flat());

describe("rgbToLighttoysHsv", () => {
  it("matches Composer's integer HSV", () => {
    expect(rgbToLighttoysHsv(255, 0, 0)).toEqual([0, 255, 255]);
    expect(rgbToLighttoysHsv(0, 255, 0)).toEqual([60, 255, 255]);
    expect(rgbToLighttoysHsv(0, 0, 255)).toEqual([120, 255, 255]);
    expect(rgbToLighttoysHsv(255, 0, 10)).toEqual([179, 255, 255]);
    expect(rgbToLighttoysHsv(10, 10, 10)).toEqual([0, 0, 10]);
    expect(rgbToLighttoysHsv(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it("wraps a hue of 180 to 0 and breaks ties toward red", () => {
    expect(rgbToLighttoysHsv(255, 0, 1)).toEqual([0, 255, 255]);
    expect(rgbToLighttoysHsv(255, 255, 0)[0]).toBe(30);
  });
});

describe("encodeColumn", () => {
  it("writes one repeat and no closing segment for a solid column", () => {
    const solid = new Uint8Array(85 * 3).fill(7);
    expect(Array.from(encodeColumn(solid))).toEqual([0, 0, 85, 7, 7, 7]);
  });

  it("splits repeats at 255", () => {
    const solid = new Uint8Array(300 * 3).fill(1);
    expect(Array.from(encodeColumn(solid))).toEqual([
      0, 0, 255, 1, 1, 1, 0, 0, 45, 1, 1, 1,
    ]);
  });

  it("closes literals with a zero repeat", () => {
    expect(
      Array.from(encodeColumn(px([1, 1, 1], [2, 2, 2], [3, 3, 3])))
    ).toEqual([3, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]);
  });

  it("repeats a pair only when it reaches the column end", () => {
    expect(
      Array.from(encodeColumn(px([1, 1, 1], [2, 2, 2], [2, 2, 2])))
    ).toEqual([1, 0, 1, 1, 1, 2, 2, 2, 2]);
    expect(
      Array.from(encodeColumn(px([1, 1, 1], [1, 1, 1], [2, 2, 2])))
    ).toEqual([3, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 0]);
  });
});

describe("makeShowUid", () => {
  it("keeps the fixed low half and odd parity with the timestamp", () => {
    for (const [time, ms, rnd] of [
      [1756000000, 0, 0],
      [1756000001, 999, 31],
      [1, 512, 7],
    ] as const) {
      const uid = makeShowUid(time, ms, rnd);
      expect(uid & 0xffff).toBe(0x0c29);
      expect((uid >>> 16) & 0x3ff).toBe(ms);
      const bits = (uid.toString(2) + (time >>> 0).toString(2)).replace(
        /0/g,
        ""
      ).length;
      expect(bits % 2).toBe(1);
    }
  });
});

describe("imageDuration", () => {
  it("gives the start times Composer wrote for a real show", () => {
    // First logo of the 2026-08-24 show: 8147 columns at *p334902; the
    // second image starts at 10658 ms (rounded) in Composer's show.json.
    const { ms, frac } = imageDuration(8147, 334902);
    expect(Math.round(ms + frac / 65536)).toBe(10658);
    expect(ms).toBe(10657);
    expect(imageDuration(1000, 1000 << 8)).toEqual({ ms: 1000, frac: 0 });
  });
});

describe("compileLighttoysShow", () => {
  it("lays out header, columns, table and trailer", () => {
    const red = px(
      ...Array.from(
        { length: 4 },
        () => [255, 0, 0] as [number, number, number]
      )
    );
    const mixed = px([255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 0, 0]);
    const bin = compileLighttoysShow(
      [
        {
          ledCount: 4,
          columns: [red, mixed],
          columnTime: 1000 << 8,
          displayLength: 3000,
        },
      ],
      { uid: 0x12340c29, createdAt: 1756000000 }
    );
    const dv = new DataView(bin.buffer);
    expect(dv.getUint32(0, true)).toBe(0x12340c29);
    expect(dv.getUint32(4, true)).toBe(1756000000);
    // Column 1: prev 0, length 4 + 6; column 2: plain literals (4 px + 0).
    expect(dv.getUint16(8, true)).toBe(0);
    expect(dv.getUint16(10, true)).toBe(10);
    expect(dv.getUint16(18, true)).toBe(10);
    expect(dv.getUint16(20, true)).toBe(4 + 15);
    const endMark = 8 + 10 + 19;
    expect(dv.getUint16(endMark, true)).toBe(19);
    const table = endMark + 2;
    expect(dv.getUint32(table, true)).toBe(8);
    expect(dv.getUint16(table + 4, true)).toBe(4);
    expect(dv.getUint16(table + 6, true)).toBe(2);
    expect(dv.getUint32(table + 8, true)).toBe(1000 << 8);
    expect(bin[table + 0x12]).toBe(0xa9);
    expect(dv.getUint32(table + 0x18, true)).toBe(3000);
    const trailer = table + 32;
    expect(bin.length).toBe(trailer + 128);
    expect(dv.getUint32(trailer, true)).toBe(trailer);
    expect(dv.getUint32(trailer + 4, true)).toBe(3000);
    expect(dv.getUint32(trailer + 8, true)).toBe(3000);
    expect(dv.getUint32(trailer + 0x18, true)).toBe(table);
    expect(dv.getUint16(trailer + 0x78, true)).toBe(0x8008);
    expect(dv.getUint16(trailer + 0x7a, true)).toBe(1);
    expect(String.fromCharCode(...bin.slice(-4))).toBe("sIOP");
  });

  it("averages H, S and V into the trailer summary like Composer", () => {
    const red = px([255, 0, 0], [255, 0, 0]);
    const bin = compileLighttoysShow(
      [{ ledCount: 2, columns: [red], columnTime: 256000 }],
      {
        uid: 0x0c29,
        createdAt: 0,
      }
    );
    const summary = new DataView(bin.buffer).getUint32(
      bin.length - 128 + 12,
      true
    );
    // V 255 → 650 | 0x4000, S 255 → 650 OR-ed into the next byte, H 0.
    expect(summary).toBe((((((650 | 0x4000) << 8) | 650) << 8) | 0) >>> 0);
  });

  it("parses a Composer script with its image settings", () => {
    const script = [
      "*X2",
      "*p334902",
      "*Z500",
      "*1,0xFF0000",
      "*1,0x00FF00",
      "*2,0x000000",
      "*K",
      "*E",
    ].join("\r\n");
    const [image] = parseVpoiScript(script);
    expect(image!.columns).toHaveLength(2);
    expect(image!.columnTime).toBe(334902);
    expect(image!.displayLength).toBe(500);
  });
});
