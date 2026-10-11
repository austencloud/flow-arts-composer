import { describe, expect, it } from "vitest";
import { LedSampler, type LedSamplerConfig } from "../led-sampler";
import {
  DEFAULT_LED_CONFIG,
  type LedSample,
} from "../../domain/types/led-types";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

/**
 * The render loop samples several poses per slow frame. Each prior set needs
 * its own array, or the sets would overwrite each other and the frame's own
 * LEDs before the renderer reads them.
 */

const config: LedSamplerConfig = {
  canvasSize: 500,
  leftPropDimensions: { width: 252.8, height: 77.8 },
  rightPropDimensions: { width: 252.8, height: 77.8 },
  leftPropType: "staff",
  rightPropType: "staff",
};

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}

/** The sampler skips three warmup frames before it emits any LED. */
function warm(sampler: LedSampler): number {
  let t = 0;
  for (let i = 0; i < 3; i++) {
    sampler.update(propAt(0), null, config, t, DEFAULT_LED_CONFIG);
    t += 16;
  }
  return t;
}

describe("LedSampler output target", () => {
  it("writes into the supplied array without touching its own", () => {
    const sampler = new LedSampler();
    const t = warm(sampler);
    const own = sampler.update(propAt(0), null, config, t, DEFAULT_LED_CONFIG);
    const ownCount = own.length;
    expect(ownCount).toBeGreaterThan(0);
    const ownFirstX = own[0]!.x;
    const ownFirstY = own[0]!.y;

    const out: LedSample[] = [];
    const prior = sampler.update(
      propAt(1),
      null,
      config,
      t + 10,
      DEFAULT_LED_CONFIG,
      out
    );
    expect(prior).toBe(out);
    expect(out.length).toBe(ownCount);
    // The sampler's own array still holds the frame's LEDs, unchanged.
    expect(own[0]!.x).toBe(ownFirstX);
    expect(own[0]!.y).toBe(ownFirstY);
    expect(Math.hypot(out[0]!.x - ownFirstX, out[0]!.y - ownFirstY)).toBeGreaterThan(1);
  });

  it("returns to its own array when no target is supplied", () => {
    const sampler = new LedSampler();
    const t = warm(sampler);
    const out: LedSample[] = [];
    sampler.update(propAt(1), null, config, t, DEFAULT_LED_CONFIG, out);
    const own = sampler.update(propAt(0), null, config, t + 16, DEFAULT_LED_CONFIG);
    expect(own).not.toBe(out);
    expect(own.length).toBeGreaterThan(0);
    // Reusing the external buffer trims it to the new set, not beyond.
    const again = sampler.update(propAt(2), null, config, t + 32, DEFAULT_LED_CONFIG, out);
    expect(again).toBe(out);
    expect(again.length).toBe(own.length);
  });
});
