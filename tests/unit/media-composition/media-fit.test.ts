import { describe, expect, it } from "vitest";
import {
  calculateMediaFit,
  resolvePanOffset,
  turnOf,
  turnedExtent,
} from "#lib/shared/media-composition/services/media-fit.js";

describe("calculateMediaFit", () => {
  it("centers a landscape source inside a portrait region", () => {
    const result = calculateMediaFit({
      sourceWidth: 1920,
      sourceHeight: 1080,
      regionWidth: 1080,
      regionHeight: 960,
      fit: "contain",
    });

    expect(result.drawRect).toEqual({
      x: 0,
      y: 176.25,
      width: 1080,
      height: 607.5,
    });
    expect(result.visibleSourceRect).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("returns the exact horizontal crop for a landscape source covering portrait", () => {
    const result = calculateMediaFit({
      sourceWidth: 1920,
      sourceHeight: 1080,
      regionWidth: 1080,
      regionHeight: 960,
      fit: "cover",
    });

    expect(result.drawRect.x).toBeCloseTo(-313.333333, 5);
    expect(result.drawRect.y).toBe(0);
    expect(result.drawRect.width).toBeCloseTo(1706.666667, 5);
    expect(result.drawRect.height).toBe(960);
    expect(result.visibleSourceRect).toEqual({
      x: 352.5,
      y: 0,
      width: 1215,
      height: 1080,
    });
  });

  it("stretches the full source into the region for fill", () => {
    expect(
      calculateMediaFit({
        sourceWidth: 800,
        sourceHeight: 1200,
        regionWidth: 1080,
        regionHeight: 1920,
        fit: "fill",
      })
    ).toEqual({
      drawRect: { x: 0, y: 0, width: 1080, height: 1920 },
      visibleSourceRect: { x: 0, y: 0, width: 800, height: 1200 },
    });
  });

  it("rejects geometry that cannot produce a frame", () => {
    expect(() =>
      calculateMediaFit({
        sourceWidth: 0,
        sourceHeight: 1080,
        regionWidth: 1080,
        regionHeight: 1920,
        fit: "cover",
      })
    ).toThrow("sourceWidth must be a positive finite number");
  });
});

describe("turnOf", () => {
  it("is exact at every quarter turn, either way round", () => {
    expect(turnOf(0)).toEqual({ cos: 1, sin: 0 });
    expect(turnOf(90)).toEqual({ cos: 0, sin: 1 });
    expect(turnOf(-90)).toEqual({ cos: 0, sin: -1 });
    expect(turnOf(180)).toEqual({ cos: -1, sin: 0 });
    expect(turnOf(-180)).toEqual({ cos: -1, sin: 0 });
    expect(turnOf(270)).toEqual({ cos: 0, sin: -1 });
  });

  it("uses the trig functions between quarter turns", () => {
    const { cos, sin } = turnOf(30);
    expect(cos).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(sin).toBeCloseTo(0.5, 12);
  });
});

describe("turnedExtent", () => {
  it("swaps the sides after a quarter turn", () => {
    expect(turnedExtent(1600, 900, 90)).toEqual({ width: 900, height: 1600 });
    expect(turnedExtent(1600, 900, -90)).toEqual({ width: 900, height: 1600 });
  });

  it("grows past both sides between quarter turns", () => {
    const extent = turnedExtent(100, 100, 45);
    expect(extent.width).toBeCloseTo(100 * Math.SQRT2, 9);
    expect(extent.height).toBeCloseTo(100 * Math.SQRT2, 9);
  });
});

describe("resolvePanOffset", () => {
  // A 16:9 picture drawn 1600x900 in an 800x900 slot: 800 hidden across,
  // nothing hidden down.
  const WIDE = {
    drawWidth: 1600,
    drawHeight: 900,
    regionWidth: 800,
    regionHeight: 900,
    scale: 1,
    translateX: 0.25,
    translateY: 0.3,
  };

  it("pans across what the slot hides and not down, unturned or upside down", () => {
    expect(resolvePanOffset(WIDE)).toEqual({ x: 200, y: 0 });
    expect(resolvePanOffset({ ...WIDE, rotationDegrees: 180 })).toEqual({
      x: 200,
      y: 0,
    });
  });

  it("pans down, not across, once a quarter turn stands the picture up", () => {
    // Turned, the picture covers 900x1600: 100 hidden across, 700 down.
    expect(
      resolvePanOffset({
        ...WIDE,
        translateX: 0.5,
        translateY: 0.5,
        rotationDegrees: 90,
      })
    ).toEqual({ x: 50, y: 350 });
  });

  it("measures a slight turn on the turned outline", () => {
    // Turned 12 degrees the picture's outline is about 1752x1213, so it hides
    // about 952 across and 313 down, and now pans down as well.
    const pan = resolvePanOffset({ ...WIDE, rotationDegrees: 12 });
    expect(pan.x).toBeCloseTo(238.039, 3);
    expect(pan.y).toBeCloseTo(93.897, 3);
  });
});
