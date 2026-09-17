import { describe, expect, it } from "vitest";
import {
  calculateTrailSourceEndpoint,
  type PropEndpointConfig,
} from "../prop-position-calculator";
import { LedSampler, type LedSamplerConfig } from "../led-sampler";
import { DEFAULT_LED_CONFIG } from "../../domain/types/led-types";
import { getTipPoints } from "../../domain/types/prop-tip-points";
import { TrailCapturer } from "../trail-capturer";
import { DEFAULT_TRAIL_SETTINGS, TrailMode } from "../../domain/types/trail-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";

const CANVAS = 950;
const CENTRE = CANVAS / 2;
const TRIGENG = { width: 250, height: 236.7 };
const trigengTips = getTipPoints("trigeng").points;

/** A prop parked on the canvas centre, unrotated. */
function centred(): PropState {
  return { centerPathAngle: 0, staffRotationAngle: 0, x: 0, y: 0 } as PropState;
}

/**
 * The Canvas2D renderer draws a chirality-B prop through `scale(-1, 1)` after
 * rotating it, so every painted point lands at (-dx, dy) in prop-local space.
 * Trail sources and LED positions are built from the same tip table the fire
 * tracker uses, so they have to mirror the same way or a three-armed trigeng
 * draws its trail and LEDs 60 degrees away from the painted arm.
 */
describe("chirality flip geometry", () => {
  it("mirrors a trail tip source across the prop's vertical axis", () => {
    const base: PropEndpointConfig = { canvasSize: CANVAS, propDimensions: TRIGENG };
    const plain = calculateTrailSourceEndpoint(
      centred(),
      base,
      { type: "tip", index: 0 },
      "trigeng"
    )!;
    const flipped = calculateTrailSourceEndpoint(
      centred(),
      { ...base, flipped: true },
      { type: "tip", index: 0 },
      "trigeng"
    )!;
    expect(plain.x - CENTRE).toBeCloseTo(trigengTips[0]!.dx, 3);
    expect(flipped.x - CENTRE).toBeCloseTo(-trigengTips[0]!.dx, 3);
    expect(flipped.y).toBeCloseTo(plain.y, 3);
  });

  it("mirrors a custom lab offset the same way", () => {
    const flipped = calculateTrailSourceEndpoint(
      centred(),
      { canvasSize: CANVAS, propDimensions: TRIGENG, flipped: true },
      { type: "custom", dx: 40, dy: 10 },
      "trigeng"
    )!;
    expect(flipped.x - CENTRE).toBeCloseTo(-40, 3);
    expect(flipped.y - CENTRE).toBeCloseTo(10, 3);
  });

  it("mirrors LED positions for a flipped prop", () => {
    const config: LedSamplerConfig = {
      canvasSize: CANVAS,
      leftPropDimensions: TRIGENG,
      rightPropDimensions: TRIGENG,
      leftPropType: "trigeng",
      rightPropType: "trigeng",
      rightPropFlipped: true,
    };
    const sampler = new LedSampler();
    const ledConfig = {
      ...structuredClone(DEFAULT_LED_CONFIG),
      enabled: true,
      device: { ...DEFAULT_LED_CONFIG.device, ledCount: 3 },
    };
    let leds = sampler.update(centred(), centred(), config, 0, ledConfig);
    for (let t = 16; leds.length === 0 && t < 200; t += 16) {
      leds = sampler.update(centred(), centred(), config, t, ledConfig);
    }
    const left = leds.filter((led) => led.propIndex === 0);
    const right = leds.filter((led) => led.propIndex === 1);
    expect(left[0]!.x - CENTRE).toBeCloseTo(trigengTips[0]!.dx, 3);
    expect(right[0]!.x - CENTRE).toBeCloseTo(-trigengTips[0]!.dx, 3);
    expect(right[0]!.y).toBeCloseTo(left[0]!.y, 3);
  });

  it("captures a flipped prop's trail from the mirrored tip", () => {
    const capturer = new TrailCapturer();
    capturer.initialize({
      canvasSize: CANVAS,
      leftPropDimensions: TRIGENG,
      rightPropDimensions: TRIGENG,
      leftPropType: "trigeng",
      rightPropType: "trigeng",
      trailSettings: { ...DEFAULT_TRAIL_SETTINGS, mode: TrailMode.LOOP_CLEAR },
      isSeamlesslyLoopable: true,
    });
    // A stationary prop never lays a point, so spin both props in place. The
    // capturer holds its first point back until the animation has settled.
    const RATE = 0.002;
    const spinning = (t: number): PropState =>
      ({ centerPathAngle: 0, staffRotationAngle: t * RATE, x: 0, y: 0 }) as PropState;
    for (let t = 0; t < 3000; t += 16) {
      capturer.captureFrame(
        { leftProp: spinning(t), rightProp: spinning(t), rightPropFlipped: true },
        0,
        t
      );
    }
    const tip = trigengTips[0]!;
    const leftTrail = capturer.getTrailPoints(0, 0);
    const rightTrail = capturer.getTrailPoints(1, 0);
    expect(leftTrail.length).toBeGreaterThan(3);
    expect(rightTrail).toHaveLength(leftTrail.length);
    // Both hands spin through the same angles and lay points on the same
    // frames, so each right point must be the left point's mirror: recover
    // the prop angle from the left point, then rotate (-dx, dy) by it.
    const reach = Math.hypot(tip.dx, tip.dy);
    const tipPhase = Math.atan2(tip.dy, tip.dx);
    leftTrail.forEach((left, index) => {
      const right = rightTrail[index]!;
      expect(Math.hypot(left.x - CENTRE, left.y - CENTRE)).toBeCloseTo(reach, 3);
      const a = Math.atan2(left.y - CENTRE, left.x - CENTRE) - tipPhase;
      expect(right.x - CENTRE).toBeCloseTo(-tip.dx * Math.cos(a) - tip.dy * Math.sin(a), 3);
      expect(right.y - CENTRE).toBeCloseTo(-tip.dx * Math.sin(a) + tip.dy * Math.cos(a), 3);
    });
  });
});

describe("mandala guide chirality", () => {
  it("mirrors the guide's tip offsets for a flipped prop", async () => {
    const { mirrorTipOffsets, resolveMandalaTipOffsets } = await import(
      "$lib/shared/mandala/services/mandala-path-preparer"
    );
    const { TrackingMode } = await import("../../domain/types/trail-types");
    const plain = resolveMandalaTipOffsets("trigeng", TrackingMode.BOTH_ENDS);
    const mirrored = mirrorTipOffsets(plain, true);
    expect(plain.length).toBeGreaterThan(0);
    mirrored.forEach((point, index) => {
      expect(point.dx).toBeCloseTo(-plain[index]!.dx, 6);
      expect(point.dy).toBeCloseTo(plain[index]!.dy, 6);
    });
    expect(mirrorTipOffsets(plain, false)).toBe(plain);
  });
});
