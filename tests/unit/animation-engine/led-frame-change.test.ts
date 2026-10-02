import { describe, expect, it } from "vitest";
import { WebGLLedRenderer } from "$lib/shared/animation-engine/services/led/web-gl-led-renderer";
import {
  DEFAULT_LED_CONFIG,
  type LedFrameInput,
  type LedSample,
} from "$lib/shared/animation-engine/domain/types/led-types";

/** The streak geometry for one frame, read back from the instance buffer. */
interface SegmentProbe {
  buildSegments(
    input: LedFrameInput,
    config: typeof DEFAULT_LED_CONFIG,
    dt: number,
    timeDiscontinuity: boolean
  ): number;
  instanceData: Float32Array;
  displayWidth: number;
  displayHeight: number;
}

const STRIDE = 11;

function staff(x: number, y: number): LedSample[] {
  return [0, 1].map((ledIndex) => ({
    x,
    y: y + ledIndex * 60,
    propIndex: 0,
    ledIndex,
    endpointIndex: ledIndex,
    brightness: 1,
    r: 1,
    g: 1,
    b: 1,
  }));
}

function sweptLength(probe: SegmentProbe, written: number): number {
  let total = 0;
  for (let i = 0; i < written; i++) {
    const o = i * STRIDE;
    total += Math.hypot(
      probe.instanceData[o + 2]! - probe.instanceData[o]!,
      probe.instanceData[o + 3]! - probe.instanceData[o + 1]!
    );
  }
  return total;
}

function renderer(): SegmentProbe {
  const probe = new WebGLLedRenderer() as unknown as SegmentProbe;
  probe.displayWidth = 396;
  probe.displayHeight = 700;
  return probe;
}

describe("WebGLLedRenderer frame changes", () => {
  it("does not streak a staff across a re-centred frame", () => {
    const probe = renderer();
    // Tall frame: the square sits 176 px down. Then the frame shrinks to the
    // square, so the same staff is drawn 176 px higher without having moved.
    probe.buildSegments(
      {
        leds: staff(200, 300),
        currentTime: 1000,
        canvasWidth: 396,
        canvasHeight: 700,
      },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );
    probe.displayHeight = 349;
    const written = probe.buildSegments(
      {
        leds: staff(200, 124),
        currentTime: 1016,
        canvasWidth: 396,
        canvasHeight: 349,
      },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );

    expect(written).toBeGreaterThan(0);
    expect(sweptLength(probe, written)).toBeLessThan(1);
  });

  it("still streaks real motion inside an unchanged frame", () => {
    const probe = renderer();
    const frame = { canvasWidth: 396, canvasHeight: 700 };
    probe.buildSegments(
      { leds: staff(200, 300), currentTime: 1000, ...frame },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );
    const written = probe.buildSegments(
      { leds: staff(200, 124), currentTime: 1016, ...frame },
      DEFAULT_LED_CONFIG,
      1 / 60,
      false
    );

    expect(sweptLength(probe, written)).toBeGreaterThan(100);
  });
});
