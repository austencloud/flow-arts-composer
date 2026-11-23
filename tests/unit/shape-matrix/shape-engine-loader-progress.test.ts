import { describe, expect, it } from "vitest";
import {
  CREEP_CEILING,
  FINISH_MS,
  loaderFinished,
  loaderProgress,
} from "@tka/shape-engine/services/shape-loader-progress.js";

describe("Shape Engine loading drawing", () => {
  it("never completes while the matrix is still building, however long it takes", () => {
    for (const ms of [0, 500, 2000, 10_000, 60_000, 600_000]) {
      expect(loaderProgress(ms, null)).toBeLessThan(CREEP_CEILING);
    }
    expect(loaderFinished(600_000, null)).toBe(false);
  });

  it("keeps moving during a long wait instead of sitting still", () => {
    expect(loaderProgress(8000, null)).toBeGreaterThan(loaderProgress(6000, null));
    expect(loaderProgress(1000, null)).toBeGreaterThan(0.2);
  });

  it("closes only after the load finishes, without jumping back", () => {
    const readyAt = 1200;
    const before = loaderProgress(readyAt, null);
    expect(loaderProgress(readyAt, readyAt)).toBeCloseTo(before, 6);
    expect(loaderProgress(readyAt + FINISH_MS / 2, readyAt)).toBeGreaterThan(before);
    expect(loaderProgress(readyAt + FINISH_MS, readyAt)).toBe(1);
    expect(loaderFinished(readyAt + FINISH_MS - 1, readyAt)).toBe(false);
    expect(loaderFinished(readyAt + FINISH_MS, readyAt)).toBe(true);
  });
});
