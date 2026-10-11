import { describe, it, expect } from "vitest";
import {
  advanceTail,
  computeVisiblePath,
  createTailState,
  type Point2D,
  type TailState,
} from "#lib/shared/animation-engine/domain/tail-recession.js";

const LEADING_EDGE = 20;
const FRAME_MS = 16.67;

/**
 * Simulate `movingFrames` frames of motion — push one point per frame at
 * spatial interval `stepPx` — then return the resulting ring + tail state
 * ready for stationary-phase tests.
 */
function simulateMotion(
  movingFrames: number,
  stepPx: number,
): { ring: Point2D[]; state: TailState } {
  const ring: Point2D[] = [{ x: 0, y: 0 }];
  let state = createTailState(LEADING_EDGE);
  for (let i = 0; i < movingFrames; i++) {
    ring.push({ x: (i + 1) * stepPx, y: 0 });
    state = advanceTail(state, ring, true, FRAME_MS, LEADING_EDGE);
  }
  return { ring, state };
}

describe("tail-recession", () => {
  it("tracks speed from ring segments during motion", () => {
    const stepPx = 10;
    const { state } = simulateMotion(30, stepPx);
    // EMA should converge to the constant per-frame speed.
    expect(state.speedPxPerMs).toBeCloseTo(stepPx / FRAME_MS, 3);
    expect(state.visibleCount).toBe(LEADING_EDGE);
    expect(state.prog).toBe(0);
  });

  it("tail advances at pre-stop speed once the prop stops", () => {
    const stepPx = 10;
    const { ring } = simulateMotion(30, stepPx);
    let state = simulateMotion(30, stepPx).state;

    // Five stationary frames should advance the endpoint by roughly
    // 5 * stepPx pixels along the ring path — i.e. 5 full segments.
    for (let i = 0; i < 5; i++) {
      state = advanceTail(state, ring, false, FRAME_MS, LEADING_EDGE);
    }
    expect(state.visibleCount).toBe(LEADING_EDGE - 5);
    expect(state.prog).toBeCloseTo(0, 3);
  });

  it("a faster prop retreats more pixels per frame than a slow one", () => {
    // Both props capture one point per frame, so they shrink at the same
    // SEGMENT rate — but the fast prop's segments are longer in space, so
    // the endpoint covers more PIXELS per frame. That spatial rate is what
    // the user perceives as "speed of the tail catching up."
    const slow = simulateMotion(30, 5);
    const fast = simulateMotion(30, 20);

    const measureEndpointX = (ring: Point2D[], s: TailState): number => {
      const start = ring.length - s.visibleCount;
      const a = ring[start]!;
      const b = ring[start + 1] ?? a;
      return a.x + (b.x - a.x) * s.prog;
    };

    const slowStart = measureEndpointX(slow.ring, slow.state);
    const fastStart = measureEndpointX(fast.ring, fast.state);

    let slowState = slow.state;
    let fastState = fast.state;
    for (let i = 0; i < 5; i++) {
      slowState = advanceTail(slowState, slow.ring, false, FRAME_MS, LEADING_EDGE);
      fastState = advanceTail(fastState, fast.ring, false, FRAME_MS, LEADING_EDGE);
    }
    const slowTravel = measureEndpointX(slow.ring, slowState) - slowStart;
    const fastTravel = measureEndpointX(fast.ring, fastState) - fastStart;
    expect(fastTravel).toBeGreaterThan(slowTravel * 2);
  });

  it("respects variable segment lengths when the prop decelerates", () => {
    // Build a ring whose last segment is much shorter than earlier ones
    // (prop decelerated then stopped). The tail should use the EMA'd
    // speed — not just the last segment — so recession keeps the
    // "pre-stop motion finishing" feel instead of crawling.
    const ring: Point2D[] = [{ x: 0, y: 0 }];
    let state = createTailState(LEADING_EDGE);
    // 20 fast frames (step = 20px)
    for (let i = 1; i <= 20; i++) {
      ring.push({ x: i * 20, y: 0 });
      state = advanceTail(state, ring, true, FRAME_MS, LEADING_EDGE);
    }
    const fastOnlySpeed = state.speedPxPerMs;
    // 3 slow frames (step = 2px) — prop slammed the brakes
    for (let i = 0; i < 3; i++) {
      const last = ring[ring.length - 1]!;
      ring.push({ x: last.x + 2, y: 0 });
      state = advanceTail(state, ring, true, FRAME_MS, LEADING_EDGE);
    }
    // EMA should still weight the fast history heavily (not collapse to 2px).
    expect(state.speedPxPerMs).toBeGreaterThan(fastOnlySpeed * 0.3);
  });

  it("visible path's first point monotonically advances toward head during recession", () => {
    const stepPx = 15;
    const { ring } = simulateMotion(30, stepPx);
    let state = simulateMotion(30, stepPx).state;

    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      state = advanceTail(state, ring, false, FRAME_MS, LEADING_EDGE);
      const path = computeVisiblePath(ring, state, 500, 500);
      samples.push(path[0]![0]);
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]! - 1e-9);
    }
    expect(samples[samples.length - 1]! - samples[0]!).toBeGreaterThan(0.05);
  });

  it("visibleCount grows back toward leadingEdge when motion resumes", () => {
    const stepPx = 10;
    const { ring } = simulateMotion(30, stepPx);
    let state = simulateMotion(30, stepPx).state;

    // Stationary long enough to fully close the window.
    for (let i = 0; i < 200; i++) {
      state = advanceTail(state, ring, false, FRAME_MS, LEADING_EDGE);
    }
    expect(state.visibleCount).toBe(2);

    // Now simulate motion resuming — each moving frame grows visibleCount by 1.
    for (let i = 0; i < LEADING_EDGE; i++) {
      ring.push({ x: ring[ring.length - 1]!.x + stepPx, y: 0 });
      state = advanceTail(state, ring, true, FRAME_MS, LEADING_EDGE);
    }
    expect(state.visibleCount).toBe(LEADING_EDGE);
    expect(state.prog).toBe(0);
  });

  it("never shrinks below 2 points", () => {
    const stepPx = 10;
    const { ring } = simulateMotion(30, stepPx);
    let state = simulateMotion(30, stepPx).state;
    for (let i = 0; i < 1000; i++) {
      state = advanceTail(state, ring, false, FRAME_MS, LEADING_EDGE);
    }
    expect(state.visibleCount).toBe(2);
    const path = computeVisiblePath(ring, state, 500, 500);
    expect(path.length).toBe(2);
  });

  it("stationary prop with no prior motion does nothing", () => {
    const ring: Point2D[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    let state = createTailState(LEADING_EDGE);
    // Never reported as moved — speed stays 0.
    for (let i = 0; i < 10; i++) {
      state = advanceTail(state, ring, false, FRAME_MS, LEADING_EDGE);
    }
    expect(state.speedPxPerMs).toBe(0);
    expect(state.visibleCount).toBe(LEADING_EDGE);
    expect(state.prog).toBe(0);
  });
});
