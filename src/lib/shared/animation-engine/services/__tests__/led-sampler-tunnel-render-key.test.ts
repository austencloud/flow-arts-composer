import { describe, expect, it } from "vitest";
import { LedSampler, type LedSamplerConfig } from "../led-sampler";
import { DEFAULT_LED_CONFIG } from "../../domain/types/led-types";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

/**
 * Tunnel copies draw the same fan build as the base pair, so their LEDs must
 * sit on that build's tips too. They used the notation table, which put a
 * Sense Fan copy's lights on the pictograph fan's ribs, off the shell.
 */

const config: LedSamplerConfig = {
  canvasSize: 950,
  leftPropDimensions: { width: 260, height: 207 },
  rightPropDimensions: { width: 260, height: 207 },
  leftPropType: "fan",
  rightPropType: "fan",
  leftPropRenderKey: "fan__sense",
  rightPropRenderKey: "fan__sense",
};

const pose: PropState = { centerPathAngle: 0.7, staffRotationAngle: 0.7 };

describe("LedSampler tunnel render key", () => {
  it("lights a tunnel copy on the same tips as the base prop in the same pose", () => {
    const sampler = new LedSampler();
    const layered = {
      ...config,
      additionalLayers: [{ leftProp: pose, rightProp: null }],
    };
    let leds = sampler.update(pose, null, layered, 0, DEFAULT_LED_CONFIG);
    for (let t = 16; t < 200; t += 16) {
      leds = sampler.update(pose, null, layered, t, DEFAULT_LED_CONFIG);
    }
    const base = leds.filter((l) => l.propIndex === 0);
    const copy = leds.filter((l) => l.propIndex === 2);
    expect(base.length).toBeGreaterThan(0);
    expect(copy).toHaveLength(base.length);
    copy.forEach((led, i) => {
      expect(led.x).toBeCloseTo(base[i]!.x, 3);
      expect(led.y).toBeCloseTo(base[i]!.y, 3);
    });
  });
});
