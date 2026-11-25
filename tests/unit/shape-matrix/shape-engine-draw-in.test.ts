import { describe, expect, it } from "vitest";
import { DURATION, STAGGER } from "@austencloud/motion";
import {
  MAX_DRAW_IN_FRAME_MS,
  SHAPE_MATRIX_DRAW_IN,
  createShapeMatrixDrawInTimeline,
  shapeMatrixDrawInDelay,
} from "@tka/shape-engine/services/shape-matrix-draw-in.js";
import { defaultShapeMatrixPair } from "@tka/shape-engine/app/state/shape-matrix-default-pair.js";
import { SHAPE_MATRIX_DEFAULT_TURN } from "@tka/shape-domain";

/** A hand-cranked requestAnimationFrame: `frame(now)` paints one. */
function handCrankedFrames() {
  let next = 0;
  const waiting = new Map<number, (now: number) => void>();
  return {
    frames: {
      request: (step: (now: number) => void) => {
        waiting.set(++next, step);
        return next;
      },
      cancel: (id: number) => void waiting.delete(id),
    },
    frame: (now: number) => {
      const due = [...waiting.values()];
      waiting.clear();
      due.forEach((step) => step(now));
    },
    waiting: () => waiting.size,
  };
}

describe("Shape Engine first fill", () => {
  it("draws from the corner outward, one diagonal at a time", () => {
    // The first row and column headers start together, next to the corner.
    expect(shapeMatrixDrawInDelay(0, 1)).toBe(0);
    expect(shapeMatrixDrawInDelay(1, 0)).toBe(0);
    // Every tile on one diagonal starts together, a stagger after the last.
    expect(shapeMatrixDrawInDelay(1, 1)).toBe(STAGGER.relaxed);
    expect(shapeMatrixDrawInDelay(2, 0)).toBe(STAGGER.relaxed);
    expect(shapeMatrixDrawInDelay(3, 4)).toBe(6 * STAGGER.relaxed);
  });

  it("starts on the first painted frame, however late that is", () => {
    const { frames, frame } = handCrankedFrames();
    const timeline = createShapeMatrixDrawInTimeline(frames);
    const seen: number[] = [];
    timeline.subscribe((elapsed) => seen.push(elapsed) > 0);
    frame(9000);
    frame(9016);
    expect(seen).toEqual([0, 16]);
  });

  it("does not count a stall that painted nothing", () => {
    const { frames, frame } = handCrankedFrames();
    const timeline = createShapeMatrixDrawInTimeline(frames);
    timeline.subscribe(() => true);
    frame(1000);
    frame(1016);
    // The page blocks for 1.4 s, longer than the whole fill.
    frame(2416);
    expect(timeline.elapsed()).toBe(16 + MAX_DRAW_IN_FRAME_MS);
  });

  it("shares one clock and one frame loop between tiles", () => {
    const { frames, frame, waiting } = handCrankedFrames();
    const timeline = createShapeMatrixDrawInTimeline(frames);
    const late: number[] = [];
    timeline.subscribe(() => true);
    frame(0);
    frame(40);
    timeline.subscribe((elapsed) => late.push(elapsed) > 0);
    expect(waiting()).toBe(1);
    frame(56);
    expect(late).toEqual([56]);
  });

  it("carries on from where it was when a tile restarts its drawing", () => {
    const { frames, frame } = handCrankedFrames();
    const timeline = createShapeMatrixDrawInTimeline(frames);
    const stop = timeline.subscribe(() => true);
    frame(0);
    frame(40);
    stop();
    timeline.subscribe(() => true);
    expect(timeline.elapsed()).toBe(40);
  });

  it("is over for good once every tile has finished", () => {
    const { frames, frame, waiting } = handCrankedFrames();
    const timeline = createShapeMatrixDrawInTimeline(frames);
    timeline.subscribe((elapsed) => elapsed < 30);
    frame(0);
    frame(40);
    expect(waiting()).toBe(0);
    // A tile that mounts later, however far from the corner, is past its turn.
    const lastTurn = shapeMatrixDrawInDelay(9, 9) + SHAPE_MATRIX_DRAW_IN.tileMs;
    expect(timeline.elapsed()).toBeGreaterThan(lastTurn);
  });

  it("uses the motion package's tokens, not its own milliseconds", () => {
    expect(SHAPE_MATRIX_DRAW_IN.tileMs).toBe(DURATION.scene);
    expect(SHAPE_MATRIX_DRAW_IN.diagonalMs).toBe(STAGGER.relaxed);
  });

  it("opens a first visit on a cell, not an empty stage", () => {
    const pair = defaultShapeMatrixPair(
      SHAPE_MATRIX_DEFAULT_TURN,
      SHAPE_MATRIX_DEFAULT_TURN
    );
    expect(pair).not.toBeNull();
    expect(pair!.left).toBeDefined();
    expect(pair!.right).toBeDefined();
  });
});
