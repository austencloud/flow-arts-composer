import { describe, expect, it } from "vitest";
import {
  LOOP_CLIP_RENDERER_VERSION,
  clipBeatAt,
  clipStripStep,
  loopClipIndexKey,
  loopClipKey,
  loopClipUrl,
} from "../loop-clip-spec";

describe("loop clip keys", () => {
  it("places a clip under the versioned prefix", () => {
    expect(loopClipKey("seq_1792007602156_28496aaa")).toBe(
      `clips/r${LOOP_CLIP_RENDERER_VERSION}/seq_1792007602156_28496aaa.mp4`
    );
    expect(loopClipIndexKey()).toBe(
      `clips/r${LOOP_CLIP_RENDERER_VERSION}/index.json`
    );
  });

  it("refuses an id that could leave the prefix", () => {
    expect(() => loopClipKey("../secrets")).toThrow();
    expect(() => loopClipKey("a/b")).toThrow();
    expect(() => loopClipKey("")).toThrow();
  });

  it("serves from the public assets origin", () => {
    expect(loopClipUrl("clips/r1/x.mp4")).toBe(
      "https://assets.tkaflowarts.com/clips/r1/x.mp4"
    );
  });
});

describe("clipBeatAt", () => {
  it("maps time onto uniform one-beat steps and wraps at the loop", () => {
    const steps = [1, 1, 1, 1];
    expect(clipBeatAt(steps, 0)).toBe(0);
    expect(clipBeatAt(steps, 1.5)).toBe(1.5);
    expect(clipBeatAt(steps, 3.999)).toBeCloseTo(3.999);
    expect(clipBeatAt(steps, 4)).toBe(0);
    expect(clipBeatAt(steps, 5.25)).toBe(1.25);
  });

  it("gives a longer step proportionally more time", () => {
    const steps = [1, 2, 1];
    expect(clipBeatAt(steps, 1)).toBe(1);
    expect(clipBeatAt(steps, 2)).toBe(1.5);
    expect(clipBeatAt(steps, 3)).toBe(2);
  });

  it("honours a tempo other than 60 BPM", () => {
    expect(clipBeatAt([1, 1], 1, 0.5)).toBe(0);
    expect(clipBeatAt([1, 1], 0.75, 0.5)).toBe(1.5);
  });

  it("treats missing or bad durations as one beat and bad input as zero", () => {
    expect(clipBeatAt([0, Number.NaN, -3], 2.5)).toBe(2.5);
    expect(clipBeatAt([], 2)).toBe(0);
    expect(clipBeatAt([1], Number.NaN)).toBe(0);
  });
});

describe("clipStripStep", () => {
  it("offsets by the strip's start-placement cell", () => {
    expect(clipStripStep([1, 1, 1], 0)).toBe(1);
    expect(clipStripStep([1, 1, 1], 2.5)).toBe(3.5);
    expect(clipStripStep([1, 1, 1], 3)).toBe(1);
  });
});
