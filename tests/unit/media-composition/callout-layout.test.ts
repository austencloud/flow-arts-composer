import { describe, expect, it } from "vitest";
import {
  CALLOUT_RADIUS,
  CALLOUT_TAIL,
  calloutGeometry,
  calloutOverflow,
  traceCalloutPath,
  type CalloutPathTarget,
} from "#lib/shared/media-composition/domain/callout-layout.js";

// A 1920 by 1080 frame drawn at its own size: the box's share times the frame.
const BOX = { x: 0.5, y: 0.5, width: 0.25, height: 0.1 };
const RECT = { x: 960, y: 540, width: 480, height: 108 };
const HALF = CALLOUT_TAIL / Math.SQRT2;

describe("calloutGeometry", () => {
  it("puts the tail on the top edge, under a point above the plate", () => {
    const geometry = calloutGeometry(RECT, BOX, { x: 0.6, y: 0.3 }, "m");
    expect(geometry.tail?.side).toBe("top");
    expect(geometry.tail?.tip.x).toBeCloseTo(0.6 * 1920);
    expect(geometry.tail?.tip.y).toBeCloseTo(540 - HALF);
    expect(geometry.tail?.base1.y).toBe(540);
    expect(geometry.fontPx).toBeCloseTo(0.0315 * 1080);
  });

  it("keeps the tail off the rounded corner when the point is far to the side", () => {
    const geometry = calloutGeometry(RECT, BOX, { x: 0.05, y: 0.9 }, "m");
    expect(geometry.tail?.side).toBe("bottom");
    expect(geometry.tail?.tip.x).toBeCloseTo(960 + CALLOUT_RADIUS + HALF);
    expect(geometry.tail?.tip.y).toBeCloseTo(648 + HALF);
  });

  it("aims sideways at a point level with the plate", () => {
    const left = calloutGeometry(RECT, BOX, { x: 0.2, y: 0.55 }, "m");
    expect(left.tail?.side).toBe("left");
    expect(left.tail?.tip).toEqual({ x: 960 - HALF, y: 0.55 * 1080 });
    const right = calloutGeometry(RECT, BOX, { x: 0.9, y: 0.55 }, "m");
    expect(right.tail?.side).toBe("right");
  });

  it("draws no tail for a point inside the plate", () => {
    expect(
      calloutGeometry(RECT, BOX, { x: 0.6, y: 0.55 }, "m").tail
    ).toBeNull();
  });

  it("scales with the frame it is drawn into", () => {
    const double = { x: 1920, y: 1080, width: 960, height: 216 };
    const geometry = calloutGeometry(double, BOX, { x: 0.6, y: 0.3 }, "m");
    expect(geometry.unit).toBe(2);
    expect(geometry.radius).toBe(CALLOUT_RADIUS * 2);
    expect(geometry.fontPx).toBeCloseTo(0.0315 * 2160);
  });

  it("leaves room outside the box for the tail and shadow", () => {
    const insets = calloutOverflow({ width: 480, height: 108 }, BOX);
    expect(insets.top).toBeGreaterThan(HALF);
    expect(insets.bottom).toBeGreaterThan(insets.top);
  });
});

describe("traceCalloutPath", () => {
  it("traces the plate and tail as one closed outline", () => {
    const calls: string[] = [];
    const target: CalloutPathTarget = {
      beginPath: () => calls.push("begin"),
      moveTo: () => calls.push("move"),
      lineTo: () => calls.push("line"),
      arcTo: () => calls.push("arc"),
      closePath: () => calls.push("close"),
    };
    const geometry = calloutGeometry(RECT, BOX, { x: 0.6, y: 0.3 }, "m");
    traceCalloutPath(target, RECT, geometry);
    expect(calls.filter((call) => call === "begin")).toHaveLength(1);
    expect(calls.filter((call) => call === "arc")).toHaveLength(4);
    // Four straight edges plus the tail's three points.
    expect(calls.filter((call) => call === "line")).toHaveLength(7);
    expect(calls.at(-1)).toBe("close");
  });
});
