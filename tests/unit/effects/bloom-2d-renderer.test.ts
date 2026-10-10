import { describe, expect, it, vi } from "vitest";
import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  Bloom2DRenderer,
  type BloomTipInput,
} from "#lib/shared/effects/renderers/bloom-2d-renderer.js";
import type { Bloom2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";

function makeContext(withCanvas = false) {
  const radial: number[][] = [];
  const linear: Array<{ stops: Array<[number, string]> }> = [];
  const calls = { drawImage: 0, scale: 0, stroke: 0, fill: 0 };
  const gradient = () => {
    const stops: Array<[number, string]> = [];
    return {
      stops,
      addColorStop: vi.fn((offset: number, color: string) => {
        stops.push([offset, color]);
      }),
    };
  };
  const context: any = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    scale: vi.fn(() => calls.scale++),
    stroke: vi.fn(() => calls.stroke++),
    fill: vi.fn(() => calls.fill++),
    drawImage: vi.fn(() => calls.drawImage++),
    createRadialGradient: vi.fn((...args: number[]) => {
      const value = gradient();
      radial.push(args);
      return value;
    }),
    createLinearGradient: vi.fn(() => {
      const value = gradient();
      linear.push(value);
      return value;
    }),
  };
  if (withCanvas) context.canvas = { width: 400, height: 300 };
  return {
    context: context as CanvasRenderingContext2D,
    radial,
    linear,
    calls,
  };
}

function params(overrides: Partial<Bloom2DParams> = {}): Bloom2DParams {
  return {
    ...DEFAULT_EFFECTS_CONFIG.bloom,
    blendMode: "lighter",
    ...overrides,
  };
}

function tip(x = 100): BloomTipInput {
  return {
    x,
    y: 150,
    propIndex: 0,
    tipIndex: 0,
    color: "#3b82f6",
  };
}

function installOffscreen(context: CanvasRenderingContext2D): void {
  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number
    ) {}
    getContext() {
      return context;
    }
  }
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
}

describe("Bloom2DRenderer optical layers", () => {
  it("does not put a stationary source or white core into history", () => {
    const renderer = new Bloom2DRenderer();
    const main = makeContext(true);
    const history = makeContext();
    installOffscreen(history.context);

    try {
      const config = params({
        afterglow: 0.9,
        streak: 0,
        spikes: 0,
      });
      renderer.render(main.context, config, [tip()]);
      renderer.render(main.context, config, [tip()]);

      expect(history.radial).toHaveLength(0);
      expect(main.radial).toHaveLength(4);
      expect(main.calls.drawImage).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stores one moving colored halo in history, never a white core", () => {
    const renderer = new Bloom2DRenderer();
    const main = makeContext(true);
    const history = makeContext();
    installOffscreen(history.context);

    try {
      const config = params({
        afterglow: 0.9,
        streak: 0,
        spikes: 0,
      });
      renderer.render(main.context, config, [tip(100)]);
      renderer.render(main.context, config, [tip(140)]);

      expect(history.radial).toHaveLength(1);
      expect(main.radial).toHaveLength(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a different dominant layer structure for every preset", () => {
    const signatures = new Map<string, string>();

    for (const preset of BLOOM_PRESETS) {
      const renderer = new Bloom2DRenderer();
      const config = params(preset.patch ?? {});
      renderer.render(makeContext().context, config, [tip(100)]);
      const moving = makeContext();
      renderer.render(moving.context, config, [tip(200)]);
      signatures.set(
        preset.name,
        [moving.radial.length, moving.linear.length, moving.calls.scale].join(
          ":"
        )
      );
    }

    expect(Object.fromEntries(signatures)).toEqual({
      Supernova: "2:8:0",
      Comet: "3:0:1",
      Halo: "2:0:0",
    });
  });
});
