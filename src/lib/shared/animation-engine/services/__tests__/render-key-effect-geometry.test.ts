import { describe, expect, it } from "vitest";
import { LedSampler, type LedSamplerConfig } from "../led-sampler";
import { DEFAULT_LED_CONFIG } from "../../domain/types/led-types";
import { getTipPoints } from "../../domain/types/prop-tip-points";
import { TrailCapturer } from "../trail-capturer";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "../../domain/types/trail-types";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

const CANVAS = 950;
const CENTRE = CANVAS / 2;
const BIGFAN = { width: 600, height: 566.9 };
const BUILD = "bigfan__fire_bare";

function centred(): PropState {
  return { centerPathAngle: 0, staffRotationAngle: 0, x: 0, y: 0 } as PropState;
}

function primaryReach(key: string): number {
  const points = getTipPoints(key).points;
  const primary = points.reduce((best, point) =>
    point.dx > best.dx ? point : best
  );
  return Math.hypot(primary.dx, primary.dy);
}

/**
 * Trails and LEDs resolved tips from the notation prop type, so a big fan
 * drawn as a fire build traced the pictograph rim (297) instead of the wicks
 * on screen (219.8). With the loaded render key they follow the drawn build.
 */
describe("render-key effect geometry", () => {
  it("places LEDs on the loaded build's tips", () => {
    const points = getTipPoints(BUILD).points;
    expect(points[2]!.dx).not.toBeCloseTo(
      getTipPoints("bigfan").points[2]!.dx,
      0
    );
    const config: LedSamplerConfig = {
      canvasSize: CANVAS,
      leftPropDimensions: BIGFAN,
      rightPropDimensions: BIGFAN,
      leftPropType: "bigfan",
      rightPropType: "bigfan",
      leftPropRenderKey: BUILD,
    };
    const sampler = new LedSampler();
    const ledConfig = {
      ...structuredClone(DEFAULT_LED_CONFIG),
      enabled: true,
      device: { ...DEFAULT_LED_CONFIG.device, ledCount: points.length },
    };
    let leds = sampler.update(centred(), null, config, 0, ledConfig);
    for (let t = 16; leds.length === 0 && t < 200; t += 16) {
      leds = sampler.update(centred(), null, config, t, ledConfig);
    }
    const left = leds.filter((led) => led.propIndex === 0);
    expect(left).toHaveLength(points.length);
    left.forEach((led, index) => {
      expect(led.x - CENTRE).toBeCloseTo(points[index]!.dx, 3);
      expect(led.y - CENTRE).toBeCloseTo(points[index]!.dy, 3);
    });
  });

  it("captures trails from the loaded build's primary tip", () => {
    const capturer = new TrailCapturer();
    capturer.initialize({
      canvasSize: CANVAS,
      leftPropDimensions: BIGFAN,
      rightPropDimensions: BIGFAN,
      leftPropType: "bigfan",
      rightPropType: "bigfan",
      trailSettings: { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.LOOP_CLEAR },
      isSeamlesslyLoopable: true,
    });
    const spinning = (t: number): PropState =>
      ({
        centerPathAngle: 0,
        staffRotationAngle: t * 0.002,
        x: 0,
        y: 0,
      }) as PropState;
    for (let t = 0; t < 3000; t += 16) {
      capturer.captureFrame(
        {
          leftProp: spinning(t),
          rightProp: spinning(t),
          leftPropRenderKey: BUILD,
        },
        0,
        t
      );
    }
    const { left, right } = capturer.getAllTrailPoints();
    expect(left.length).toBeGreaterThan(3);
    expect(right.length).toBeGreaterThan(3);
    for (const point of left) {
      expect(Math.hypot(point.x - CENTRE, point.y - CENTRE)).toBeCloseTo(
        primaryReach(BUILD),
        3
      );
    }
    // The other hand has no loaded build and keeps the notation rim.
    for (const point of right) {
      expect(Math.hypot(point.x - CENTRE, point.y - CENTRE)).toBeCloseTo(
        primaryReach("bigfan"),
        3
      );
    }
  });
});
