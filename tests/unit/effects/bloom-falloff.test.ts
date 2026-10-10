import { describe, expect, it, vi } from "vitest";
import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";
import { Bloom2DRenderer } from "#lib/shared/effects/renderers/bloom-2d-renderer.js";
import type { Bloom2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { EFFECT_CONTROLS } from "#lib/shared/effects/domain/effect-control-manifest.js";

function makeParams(): Bloom2DParams {
  return {
    intensity: 0.8,
    coreStrength: 0.45,
    radius: 40,
    color: "#e0e7ff",
    palette: ["#e0e7ff"],
    colorMode: "solid",
    falloff: "ring",
    pulse: 0,
    pulseRate: 1,
    streak: 0,
    spikes: 0,
    afterglow: 0,
    blendMode: "lighter",
  };
}

describe("Bloom falloff", () => {
  it("keeps hollow rings out of every authored preset", () => {
    expect(
      BLOOM_PRESETS.every((preset) => preset.patch?.falloff !== "ring")
    ).toBe(true);
    const falloff = EFFECT_CONTROLS.bloom.find(
      (control) => control.id === "bloom-falloff"
    );
    expect(falloff?.options?.map((option) => option.value)).toEqual([
      "smooth",
      "sharp",
    ]);
  });

  it("renders a legacy ring value as a center-lit smooth halo in 2D", () => {
    const offsets: number[] = [];
    const gradient = {
      addColorStop: vi.fn((offset: number) => offsets.push(offset)),
    };
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      globalCompositeOperation: "source-over",
      globalAlpha: 1,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    new Bloom2DRenderer().render(context, makeParams(), [
      {
        x: 100,
        y: 100,
        propIndex: 0,
        tipIndex: 0,
        color: "#e0e7ff",
      },
    ]);

    expect(offsets.slice(0, 3)).toEqual([0, 0.4, 1]);
  });
});
