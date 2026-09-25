import { describe, expect, it, vi } from "vitest";
import { sequenceFrameAt } from "$lib/shared/media-composition/domain/sequence-frame";
import type { PaintFrame } from "$lib/shared/media-composition/services/post-studio-layer-painter";
import {
  createAnimationOverlayPainter,
  registerAnimationOverlayPainterFactory,
} from "$lib/shared/media-composition/services/animation-overlay-painter-registry";
import {
  PostAnimationOverlayPainter,
  resolveOverlayStep,
} from "$lib/features/compose/services/post-animation-overlay-painter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

// Same beat pattern sequence-frame.test.ts uses for DCK: a 2-beat move in an
// otherwise 1-beat-per-move, 8-move pass.
const DCK_DURATIONS = [1, 1, 2, 1, 1, 1, 1, 1];

function buildSequence(): SequenceData {
  const steps = DCK_DURATIONS.map((duration, index) => ({
    duration,
    letter: null,
    stepNumber: index + 1,
  })) as unknown as StepData[];
  return { steps } as unknown as SequenceData;
}

function paintFrameFor(arrival: number): PaintFrame {
  return {
    projectProgress: 0,
    sourceTimeSeconds: 0,
    sequenceFrame: sequenceFrameAt(arrival, DCK_DURATIONS),
  };
}

/** A 2D-context stand-in covering every method canvas-renderer.ts's
 * step-number and progress-bar drawing calls, so paint() can run without a
 * real canvas. */
function createFakeContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textBaseline: "",
    textAlign: "",
    globalAlpha: 1,
    lineWidth: 0,
    lineCap: "",
  } as unknown as CanvasRenderingContext2D & {
    save: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
  };
}

describe("resolveOverlayStep", () => {
  it("shows nothing during the opening pose, matching the Animate export's start-placement pass", () => {
    const frame = sequenceFrameAt(0, DCK_DURATIONS);
    expect(resolveOverlayStep(frame)).toEqual({
      stepIndex: null,
      beatNumber: null,
    });
  });

  it("names the move in flight mid-pass", () => {
    const frame = sequenceFrameAt(2.5, DCK_DURATIONS);
    expect(frame.move).toBe(3); // sanity check against sequence-frame.test.ts
    expect(resolveOverlayStep(frame)).toEqual({ stepIndex: 2, beatNumber: 3 });
  });

  it("keeps the landing that closes a pass on that pass's last move", () => {
    const frame = sequenceFrameAt(8, DCK_DURATIONS);
    expect(resolveOverlayStep(frame)).toEqual({ stepIndex: 7, beatNumber: 8 });
  });

  it("wraps into the next pass's first move just past the landing", () => {
    const frame = sequenceFrameAt(8.5, DCK_DURATIONS);
    expect(resolveOverlayStep(frame)).toEqual({ stepIndex: 0, beatNumber: 1 });
  });
});

describe("PostAnimationOverlayPainter.paint", () => {
  it("draws nothing when the layer has no sequence frame yet", () => {
    const painter = new PostAnimationOverlayPainter(buildSequence());
    const ctx = createFakeContext();

    painter.paint(
      ctx,
      { x: 0, y: 0, width: 950, height: 950 },
      { projectProgress: 0, sourceTimeSeconds: 0 }
    );

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("hides the beat number during the opening pose but still draws the (empty) progress bar", () => {
    const painter = new PostAnimationOverlayPainter(buildSequence());
    const ctx = createFakeContext();

    painter.paint(
      ctx,
      { x: 0, y: 0, width: 950, height: 950 },
      paintFrameFor(0)
    );

    expect(ctx.fillText).not.toHaveBeenCalled();
    // Background + track are unconditional in drawProgressBar; only the
    // progress fill itself is skipped at 0%.
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it("draws the beat number for the move in flight", () => {
    const painter = new PostAnimationOverlayPainter(buildSequence());
    const ctx = createFakeContext();

    painter.paint(
      ctx,
      { x: 0, y: 0, width: 950, height: 950 },
      paintFrameFor(2.5)
    );

    expect(ctx.fillText).toHaveBeenCalledWith(
      "3",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("draws on the animation's centred square in a region wider than tall", () => {
    // The split's animation region is 1080 wide and 960 tall; its square is
    // 960 on a side, 60 px in from the left.
    const painter = new PostAnimationOverlayPainter(buildSequence());
    const ctx = createFakeContext();

    painter.paint(
      ctx,
      { x: 0, y: 960, width: 1080, height: 960 },
      paintFrameFor(2.5)
    );

    expect(ctx.translate).toHaveBeenCalledWith(60, 960);
  });

  it("draws no glyph before prepare() resolves, per the painter interface's contract", () => {
    const painter = new PostAnimationOverlayPainter(buildSequence());
    const ctx = createFakeContext();

    painter.paint(
      ctx,
      { x: 0, y: 0, width: 950, height: 950 },
      paintFrameFor(2.5)
    );

    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});

describe("animation-overlay-painter-registry", () => {
  it("returns null before a factory registers, then the registered painter after", () => {
    // This registry module is a fresh import for this test file (vitest
    // isolates module state per test file), so no earlier test's
    // registration can leak in here.
    expect(createAnimationOverlayPainter(buildSequence())).toBeNull();

    const built = new PostAnimationOverlayPainter(buildSequence());
    registerAnimationOverlayPainterFactory(() => built);

    expect(createAnimationOverlayPainter(buildSequence())).toBe(built);
  });
});
