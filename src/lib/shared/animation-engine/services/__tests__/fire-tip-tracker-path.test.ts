import { describe, expect, it } from "vitest";
import { FireTipTracker } from "../fire-tip-tracker";
import type { FireTipTrackerConfig } from "../fire-tip-tracker";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { MotionSubSample } from "../motion-sub-sampler";

/**
 * On a resampled frame the tracker writes `path`: the tip's positions at the
 * sub-frame instants, oldest first, strictly between the previous and current
 * tip. The fire renderer sweeps that polyline instead of the chord.
 */

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}

function sample(angle: number, timeMs: number): MotionSubSample {
  return {
    left: propAt(angle),
    right: propAt(-angle),
    layers: [],
    timeMs,
  };
}

const config: FireTipTrackerConfig = {
  canvasSize: 500,
  leftPropDimensions: { width: 252.8, height: 77.8 },
  rightPropDimensions: { width: 252.8, height: 77.8 },
  leftPropType: "staff",
  rightPropType: "staff",
};

const QUARTER = Math.PI / 2;

/** The tracker skips three warmup frames before it emits any tip. */
function warm(tracker: FireTipTracker): number {
  let t = 0;
  for (let i = 0; i < 3; i++) {
    tracker.update(propAt(0), null, config, t);
    t += 16;
  }
  return t;
}

const radiusOf = (p: { x: number; y: number }) =>
  Math.hypot(p.x - 250, p.y - 250);

describe("FireTipTracker path", () => {
  it("writes one path point per sample, on the arc, between prev and cur", () => {
    const tracker = new FireTipTracker();
    let t = warm(tracker);
    tracker.update(propAt(0), null, config, t);
    t += 100;
    const samples = [1, 2, 3].map((i) =>
      sample((QUARTER * i) / 4, t - 100 + 25 * i)
    );
    const result = tracker.update(propAt(QUARTER), null, config, t, samples);
    expect(result.tips.length).toBeGreaterThan(0);
    for (const tip of result.tips) {
      expect(tip.path?.length).toBe(3);
      const r0 = radiusOf({ x: tip.prevX, y: tip.prevY });
      for (const p of tip.path!) expect(radiusOf(p)).toBeCloseTo(r0, 6);
      expect(radiusOf({ x: tip.x, y: tip.y })).toBeCloseTo(r0, 6);
      // Oldest first: each point is further around the arc than the last.
      const angleOf = (p: { x: number; y: number }) =>
        Math.atan2(p.y - 250, p.x - 250);
      const a0 = angleOf({ x: tip.prevX, y: tip.prevY });
      let previous = a0;
      for (const p of tip.path!) {
        const a = angleOf(p);
        expect(Math.abs(a - a0)).toBeGreaterThan(Math.abs(previous - a0) - 1e-9);
        previous = a;
      }
    }
  });

  it("omits the path on the first valid frame and when no samples are given", () => {
    const tracker = new FireTipTracker();
    const t = warm(tracker);
    const first = tracker.update(propAt(0), null, config, t, [
      sample(0.1, t - 5),
    ]);
    expect(first.tips[0]!.path).toBeUndefined();
    const second = tracker.update(propAt(0.2), null, config, t + 16);
    expect(second.tips[0]!.path).toBeUndefined();
  });

  it("clears a stale path on the next plain frame", () => {
    const tracker = new FireTipTracker();
    let t = warm(tracker);
    tracker.update(propAt(0), null, config, t);
    t += 100;
    const sampled = tracker.update(propAt(QUARTER), null, config, t, [
      sample(QUARTER / 2, t - 50),
    ]);
    expect(sampled.tips[0]!.path?.length).toBe(1);
    const plain = tracker.update(propAt(QUARTER + 0.1), null, config, t + 16);
    expect(plain.tips[0]!.path).toBeUndefined();
  });

  it("keeps the path continuous with a rendered transform", () => {
    const tracker = new FireTipTracker();
    let t = warm(tracker);
    const shifted: FireTipTrackerConfig = {
      ...config,
      renderedTransforms: {
        left: {
          centerX: 260,
          centerY: 240,
          angle: QUARTER,
          scaleFactor: 500 / 950,
        },
        right: null,
      },
    };
    tracker.update(propAt(0), null, config, t);
    t += 100;
    const result = tracker.update(propAt(QUARTER), null, shifted, t, [
      sample(QUARTER * 0.999, t - 1),
    ]);
    const tip = result.tips[0]!;
    const p = tip.path![0]!;
    // The sample sits a hair before the current step, so its path point lands
    // next to the rendered tip, not next to the fallback-math tip.
    expect(Math.hypot(p.x - tip.x, p.y - tip.y)).toBeLessThan(1);
  });

  it("gives tunnel-layer tips their own layer path", () => {
    const tracker = new FireTipTracker();
    let t = warm(tracker);
    const layered: FireTipTrackerConfig = {
      ...config,
      additionalLayers: [{ leftProp: propAt(1), rightProp: null }],
    };
    tracker.update(propAt(0), null, layered, t);
    t += 100;
    const result = tracker.update(
      propAt(QUARTER),
      null,
      { ...layered, additionalLayers: [{ leftProp: propAt(1 + QUARTER), rightProp: null }] },
      t,
      [
        {
          ...sample(QUARTER / 2, t - 50),
          layers: [{ left: propAt(1 + QUARTER / 2), right: null }],
        },
        {
          ...sample(QUARTER * 0.75, t - 25),
          layers: [{ left: null, right: null }],
        },
      ]
    );
    const base = result.tips.filter((tip) => tip.propIndex === 0);
    const layer = result.tips.filter((tip) => tip.propIndex === 2);
    expect(base.length).toBeGreaterThan(0);
    expect(layer.length).toBe(base.length);
    for (const tip of base) expect(tip.path?.length).toBe(2);
    // The second sample vouched for no layer pose, so the layer path has one.
    for (const tip of layer) expect(tip.path?.length).toBe(1);
  });
});
