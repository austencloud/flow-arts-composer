// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPoiReversalObservationFile } from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-observations";
import { createPoiReversalReviewState } from "../../src/lib/features/levels/poi-lab/state/poi-reversal-review-state.svelte";

describe("poi reversal review state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("requires corrective detail before recording an illegal observation", () => {
    const state = createPoiReversalReviewState(
      createEmptyPoiReversalObservationFile(),
      vi.fn()
    );
    state.selectVerdict("illegal");

    expect(state.canRecord).toBe(false);
    expect(state.recordCurrent()).toEqual({
      ok: false,
      message: "Choose the first illegal step and explain what breaks",
    });
    expect(state.observations).toHaveLength(0);

    state.selectFailureStep(5);
    state.setReason("The head loses the path at this reversal.");
    expect(state.canRecord).toBe(true);
    expect(state.recordCurrent().ok).toBe(true);
    expect(state.observations[0]).toMatchObject({
      verdict: "illegal",
      firstIllegalStep: 5,
      reason: "The head loses the path at this reversal.",
    });
  });

  it("backs up a new observation and restores it after a lost tab", () => {
    const seed = createEmptyPoiReversalObservationFile();
    const first = createPoiReversalReviewState(seed, vi.fn());
    first.selectVerdict("legal");
    expect(first.recordCurrent().ok).toBe(true);
    expect(first.dirtyCount).toBe(1);

    const restored = createPoiReversalReviewState(seed, vi.fn());
    expect(restored.observations).toHaveLength(1);
    expect(restored.dirtyCount).toBe(1);
    expect(restored.uniqueReviewedCount).toBe(1);
  });

  it("persists the full file and clears only the saved dirty set", async () => {
    const persist = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Saved 1 observation" });
    const state = createPoiReversalReviewState(
      createEmptyPoiReversalObservationFile(),
      persist
    );
    state.selectVerdict("unsure");
    state.setReason("Needs a slower pass.");
    state.recordCurrent();

    await expect(state.save()).resolves.toEqual({
      ok: true,
      message: "Saved 1 observation",
    });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        generatorVersion: 1,
        observations: expect.arrayContaining([
          expect.objectContaining({
            verdict: "unsure",
            reason: "Needs a slower pass.",
          }),
        ]),
      })
    );
    expect(state.dirtyCount).toBe(0);
    expect(
      localStorage.getItem("poi-reversal-observations-unsaved-v1")
    ).toBeNull();
  });

  it("keeps observations dirty when persistence fails", async () => {
    const state = createPoiReversalReviewState(
      createEmptyPoiReversalObservationFile(),
      vi.fn().mockResolvedValue({ ok: false, message: "Disk is read-only" })
    );
    state.selectVerdict("legal");
    state.recordCurrent();

    await expect(state.save()).resolves.toEqual({
      ok: false,
      message: "Disk is read-only",
    });
    expect(state.dirtyCount).toBe(1);
    expect(state.saveResult?.ok).toBe(false);
  });
});
