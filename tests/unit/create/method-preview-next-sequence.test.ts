/**
 * Generate and Tunnel draw each turn's sequence ahead, in the background.
 * Under reduced motion no turn ever plays, so nothing is fetched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createNextSequenceDraw } from "#lib/features/create/shared/components/method-previews/method-preview-next-sequence.js";

const SEQUENCE = { id: "drawn", steps: [{}] } as unknown as SequenceData;

const drawMatrixRealization = vi.hoisted(() =>
  vi.fn(async (): Promise<{ sequence: SequenceData } | null> => null)
);
vi.mock("#lib/shared/landing/data/shape-matrix-hero-pool.js", () => ({
  drawMatrixRealization,
}));

/** Let the background task and the draw's promise chain run. */
const flushDraw = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function setup(reduced = { value: false }) {
  const draw = createNextSequenceDraw({
    emptyWarning: "empty",
    errorWarning: "failed",
    reducedMotion: () => reduced.value,
  });
  return { draw, reduced };
}

afterEach(() => {
  drawMatrixRealization.mockReset();
  drawMatrixRealization.mockImplementation(async () => null);
});

describe("next sequence draw", () => {
  it("draws the next sequence in the background and hands it over once", async () => {
    drawMatrixRealization.mockResolvedValue({ sequence: SEQUENCE });
    const { draw } = setup();
    draw.request();
    draw.request();
    await flushDraw();
    expect(drawMatrixRealization).toHaveBeenCalledTimes(1);
    expect(draw.take()).toBe(SEQUENCE);
    expect(draw.take()).toBeNull();
  });

  it("fetches nothing under reduced motion, and draws once motion returns", async () => {
    drawMatrixRealization.mockResolvedValue({ sequence: SEQUENCE });
    const { draw, reduced } = setup({ value: true });
    draw.request();
    await flushDraw();
    expect(drawMatrixRealization).not.toHaveBeenCalled();
    expect(draw.take()).toBeNull();

    reduced.value = false;
    draw.request();
    await flushDraw();
    expect(drawMatrixRealization).toHaveBeenCalledTimes(1);
    expect(draw.take()).toBe(SEQUENCE);
  });

  it("stops asking once the source returns nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { draw } = setup();
      draw.request();
      await flushDraw();
      draw.request();
      await flushDraw();
      expect(drawMatrixRealization).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("empty");
      expect(draw.take()).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("drops a draw that lands after the scene has gone", async () => {
    drawMatrixRealization.mockResolvedValue({ sequence: SEQUENCE });
    const { draw } = setup();
    draw.request();
    draw.dispose();
    await flushDraw();
    expect(draw.take()).toBeNull();
  });
});
