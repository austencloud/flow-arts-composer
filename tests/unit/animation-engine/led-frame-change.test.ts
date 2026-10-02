import { describe, expect, it, vi } from "vitest";
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

describe("WebGLLedRenderer resize", () => {
  interface Fbo {
    fbo: object;
    texture: object;
  }
  interface ResizeProbe {
    canvas: { width: number; height: number };
    gl: unknown;
    displayWidth: number;
    displayHeight: number;
    accumFBOs: { read: Fbo; write: Fbo } | null;
    createFramebuffers(): void;
    resize(width: number, height: number): void;
  }

  /** A GL stand-in that records blits and which framebuffers are deleted. */
  function fakeGl() {
    const blits: Array<{ read: unknown; draw: unknown; rects: number[] }> = [];
    const deleted = new Set<unknown>();
    let read: unknown = null;
    let draw: unknown = null;
    const gl = new Proxy(
      {
        READ_FRAMEBUFFER: "read",
        DRAW_FRAMEBUFFER: "draw",
        FRAMEBUFFER: "both",
        createTexture: () => ({}),
        createFramebuffer: () => ({}),
        deleteFramebuffer: (fbo: unknown) => deleted.add(fbo),
        bindFramebuffer: (target: string, fbo: unknown) => {
          if (target !== "draw") read = fbo;
          if (target !== "read") draw = fbo;
        },
        blitFramebuffer: (...args: number[]) =>
          blits.push({ read, draw, rects: args.slice(0, 8) }),
      } as Record<string | symbol, unknown>,
      { get: (target, key) => (key in target ? target[key] : () => undefined) }
    );
    return { gl, blits, deleted };
  }

  it("carries the retained light onto the re-centred square instead of wiping it", () => {
    const { gl, blits, deleted } = fakeGl();
    const probe = new WebGLLedRenderer() as unknown as ResizeProbe;
    vi.stubGlobal("devicePixelRatio", 1);
    probe.canvas = { width: 0, height: 0 };
    probe.gl = gl;
    probe.displayWidth = 400;
    probe.displayHeight = 700;
    probe.createFramebuffers();
    const before = probe.accumFBOs!.read;

    // The tall frame shrinks to its square, as the tunnel's canvas does when
    // it settles into the animation's box.
    probe.resize(360, 360);

    expect(blits).toHaveLength(1);
    expect(blits[0]!.read).toBe(before.fbo);
    expect(blits[0]!.draw).toBe(probe.accumFBOs!.read.fbo);
    // Old square: 400 wide, 150 down a 700 frame. New square: the whole frame.
    expect(blits[0]!.rects).toEqual([0, 150, 400, 550, 0, 0, 360, 360]);
    expect(deleted.has(before.fbo)).toBe(true);
    vi.unstubAllGlobals();
  });
});
