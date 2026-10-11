import { describe, expect, it } from "vitest";
import {
  runForwardTracker,
  buildTipSeriesPixels,
  MAX_FILLED_GAP,
  type FrameTrackResult,
  type EndStatus,
} from "#lib/shared/media-composition/services/staff-tip-tracking.js";
import type { DetectionBlob } from "#lib/shared/media-composition/services/staff-tip-detection.js";
import { TIP_FILLED, TIP_MISSING, TIP_SEEN } from "#lib/shared/media-composition/domain/staff-tip-track.js";

function blob(x: number, y: number, colour: "red" | "blue", overrides: Partial<DetectionBlob> = {}): DetectionBlob {
  return {
    x,
    y,
    area: 120,
    hot: 25,
    colour,
    mix: 0,
    strength: 150,
    bbox: [x - 5, y - 5, x + 5, y + 5],
    ...overrides,
  };
}

describe("runForwardTracker", () => {
  it("keeps end identity through a staff spinning up to ~25 degrees per frame", () => {
    const centre = { x: 100, y: 100 };
    const length = 50;
    const stepRadians = (25 * Math.PI) / 180;
    const frameCount = 20;

    const trueA: { x: number; y: number }[] = [];
    const trueB: { x: number; y: number }[] = [];
    const detections: DetectionBlob[][] = [];
    for (let i = 0; i < frameCount; i++) {
      const angle = i * stepRadians;
      const a = { x: centre.x + length * Math.cos(angle), y: centre.y + length * Math.sin(angle) };
      const b = { x: centre.x - length * Math.cos(angle), y: centre.y - length * Math.sin(angle) };
      trueA.push(a);
      trueB.push(b);
      // Push the "A" physical point first so the very first frame's
      // pool_for (stable-sorted, equal hot) initialises A to it.
      detections.push([blob(a.x, a.y, "blue"), blob(b.x, b.y, "blue")]);
    }

    const results = runForwardTracker(detections, "blue");

    for (let i = 0; i < frameCount; i++) {
      expect(results[i]!.faStatus).toBe("meas");
      expect(results[i]!.fbStatus).toBe("meas");
      expect(results[i]!.A!.x).toBeCloseTo(trueA[i]!.x, 3);
      expect(results[i]!.A!.y).toBeCloseTo(trueA[i]!.y, 3);
      expect(results[i]!.B!.x).toBeCloseTo(trueB[i]!.x, 3);
      expect(results[i]!.B!.y).toBeCloseTo(trueB[i]!.y, 3);
    }
  });

  it("keeps both staffs' end identity across a crossing where their ends merge into one mixed blob", () => {
    const frameCount = 10;
    const mergeFrame = 5;

    // Blue: A fixed off to the side; B travels left-to-right through x=120.
    // Red: A fixed off to the side (different spot); B travels right-to-left
    // through the same x=120, so the two B ends coincide exactly at mergeFrame.
    const blueA = { x: 20, y: 20 };
    const redA = { x: 20, y: 200 };
    const blueB = (i: number) => ({ x: 100 + 4 * i, y: 100 });
    const redB = (i: number) => ({ x: 140 - 4 * i, y: 100 });

    const blueDetections: DetectionBlob[][] = [];
    const redDetections: DetectionBlob[][] = [];
    for (let i = 0; i < frameCount; i++) {
      const bB = blueB(i);
      const rB = redB(i);
      const framesShared: DetectionBlob[] = [blob(blueA.x, blueA.y, "blue"), blob(redA.x, redA.y, "red")];
      if (i === mergeFrame) {
        expect(bB.x).toBe(rB.x); // sanity: the two B ends really do coincide here
        framesShared.push(blob(bB.x, bB.y, "blue", { mix: 0.5 }));
      } else {
        framesShared.push(blob(bB.x, bB.y, "blue"), blob(rB.x, rB.y, "red"));
      }
      blueDetections.push(framesShared);
      redDetections.push(framesShared);
    }

    const blueResults = runForwardTracker(blueDetections, "blue");
    const redResults = runForwardTracker(redDetections, "red");

    for (let i = 0; i < frameCount; i++) {
      const bB = blueB(i);
      const rB = redB(i);
      expect(blueResults[i]!.A!.x).toBeCloseTo(blueA.x, 3);
      expect(blueResults[i]!.A!.y).toBeCloseTo(blueA.y, 3);
      expect(blueResults[i]!.B!.x).toBeCloseTo(bB.x, 3);
      expect(blueResults[i]!.B!.y).toBeCloseTo(bB.y, 3);

      expect(redResults[i]!.A!.x).toBeCloseTo(redA.x, 3);
      expect(redResults[i]!.A!.y).toBeCloseTo(redA.y, 3);
      expect(redResults[i]!.B!.x).toBeCloseTo(rB.x, 3);
      expect(redResults[i]!.B!.y).toBeCloseTo(rB.y, 3);
    }
  });
});

describe("buildTipSeriesPixels", () => {
  /** Builds a synthetic end-A series: "meas" at `linear(i)` for indices in
   *  `measuredIndices`, "coast" (unmeasured) everywhere else, over `n` frames. */
  function series(n: number, measuredIndices: Set<number>): FrameTrackResult[] {
    const frames: FrameTrackResult[] = [];
    for (let i = 0; i < n; i++) {
      const status: EndStatus = measuredIndices.has(i) ? "meas" : "coast";
      frames.push({
        A: { x: i * 10, y: i * 5 },
        B: null,
        faStatus: status,
        fbStatus: "none",
      });
    }
    return frames;
  }

  it("fills a gap at or under the cap with cubic interpolation, marked TIP_FILLED", () => {
    // Measured 0..4, gap of 3 (5,6,7), measured 8..12.
    const measured = new Set<number>();
    for (let i = 0; i <= 4; i++) measured.add(i);
    for (let i = 8; i <= 12; i++) measured.add(i);
    const result = buildTipSeriesPixels(series(13, measured), "A");

    for (const gapIndex of [5, 6, 7]) {
      expect(result.state[gapIndex]).toBe(TIP_FILLED);
      // The underlying path is exactly linear, so a cubic spline through the
      // measured points reproduces it exactly at the filled samples too.
      expect(result.x[gapIndex]).toBeCloseTo(gapIndex * 10, 6);
      expect(result.y[gapIndex]).toBeCloseTo(gapIndex * 5, 6);
    }
    for (const measuredIndex of [0, 1, 2, 3, 4, 8, 9, 10, 11, 12]) {
      expect(result.state[measuredIndex]).toBe(TIP_SEEN);
    }
  });

  it("fills a gap exactly at the cap (5 samples) but leaves a 12-sample gap TIP_MISSING", () => {
    expect(MAX_FILLED_GAP).toBe(5);
    // Measured 0..2, gap of 5 (3..7), measured 8..10, gap of 12 (11..22), measured 23..25.
    const measured = new Set<number>();
    for (let i = 0; i <= 2; i++) measured.add(i);
    for (let i = 8; i <= 10; i++) measured.add(i);
    for (let i = 23; i <= 25; i++) measured.add(i);
    const result = buildTipSeriesPixels(series(26, measured), "A");

    for (let gapIndex = 3; gapIndex <= 7; gapIndex++) {
      expect(result.state[gapIndex]).toBe(TIP_FILLED);
    }
    for (let gapIndex = 11; gapIndex <= 22; gapIndex++) {
      expect(result.state[gapIndex]).toBe(TIP_MISSING);
      expect(result.x[gapIndex]).toBe(-1);
      expect(result.y[gapIndex]).toBe(-1);
    }
  });

  it("leaves runs before the first and after the last measured sample as TIP_MISSING", () => {
    const measured = new Set([5, 6, 7]);
    const result = buildTipSeriesPixels(series(10, measured), "A");

    for (const leading of [0, 1, 2, 3, 4]) {
      expect(result.state[leading]).toBe(TIP_MISSING);
    }
    for (const trailing of [8, 9]) {
      expect(result.state[trailing]).toBe(TIP_MISSING);
    }
  });
});
