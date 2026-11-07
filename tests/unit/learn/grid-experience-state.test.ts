import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGridExperienceState,
  GRID_LAST_STEP,
  GRID_SCREENS,
  gridScreenIndexFromSaved,
  normalizeGridStep,
} from "#lib/features/learn/components/interactive/grid-concept/grid-experience-state.svelte.js";

describe("grid experience persistence migration", () => {
  it("keeps current progress and clamps steps from the removed ending", () => {
    expect(GRID_LAST_STEP).toBe(2);
    expect(normalizeGridStep(0)).toBe(0);
    expect(normalizeGridStep(2)).toBe(2);
    expect(normalizeGridStep(3)).toBe(2);
    expect(normalizeGridStep(4)).toBe(2);
  });

  it("rejects malformed persisted steps", () => {
    expect(normalizeGridStep(-1)).toBe(0);
    expect(normalizeGridStep(Number.NaN)).toBe(0);
    expect(normalizeGridStep(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("resumes every saved place on its own screen", () => {
    expect(gridScreenIndexFromSaved({ step: 0 })).toBe(0);
    GRID_SCREENS.forEach((screen, index) => {
      expect(
        gridScreenIndexFromSaved({
          step: screen.step,
          phaseData: {
            gridPhase: screen.gridPhase,
            pointTypePhase: screen.pointTypePhase,
          },
        })
      ).toBe(index);
    });
  });

  it("lands a saved place with an unknown phase on the first screen of its step", () => {
    expect(
      gridScreenIndexFromSaved({ step: 1, phaseData: { gridPhase: "gone" } })
    ).toBe(1);
    expect(
      gridScreenIndexFromSaved({ step: 2, phaseData: { pointTypePhase: 7 } })
    ).toBe(5);
    expect(gridScreenIndexFromSaved({ step: 4 })).toBe(5);
  });
});

describe("grid experience screens", () => {
  // A frame that never paints: every press lands before any queued callback.
  let queuedFrames: FrameRequestCallback[] = [];

  function runFrames() {
    while (queuedFrames.length > 0) queuedFrames.shift()!(0);
  }

  beforeEach(() => {
    queuedFrames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has eight screens with no announcement used twice", () => {
    expect(GRID_SCREENS).toHaveLength(8);
    expect(new Set(GRID_SCREENS.map((s) => s.announcementKey)).size).toBe(8);
  });

  it("moves one screen per press, in order, inside a single frame", () => {
    const state = createGridExperienceState(true);
    const seen = [state.screenIndex];
    for (let press = 0; press < 7; press++) {
      expect(state.next()).toBe(true);
      seen.push(state.screenIndex);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(state.step).toBe(2);
    expect(state.pointTypePhase).toBe("outer");
    expect(state.isLastScreen).toBe(true);
  });

  it("stays on the last screen however many more presses land in one frame", () => {
    const state = createGridExperienceState(true);
    for (let press = 0; press < 30; press++) state.next();
    runFrames();
    expect(state.screenIndex).toBe(7);
    expect(state.step).toBeLessThanOrEqual(GRID_LAST_STEP);
    expect(state.next()).toBe(false);
    expect(state.effectiveHighlightPhase).toBe("outer");
  });

  it("stays on the first screen however many back presses land in one frame", () => {
    const state = createGridExperienceState(true);
    state.next();
    for (let press = 0; press < 30; press++) state.previous();
    runFrames();
    expect(state.screenIndex).toBe(0);
    expect(state.step).toBe(0);
    expect(state.previous()).toBe(false);
    expect(state.effectivePhase).toBe("intro");
  });

  it("returns through every screen in reverse", () => {
    const state = createGridExperienceState(true);
    for (let press = 0; press < 7; press++) state.next();
    const seen = [state.screenIndex];
    while (state.previous()) seen.push(state.screenIndex);
    expect(seen).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("shows the phase each screen teaches", () => {
    const state = createGridExperienceState(true);
    const phases = [[state.effectivePhase, state.effectiveHighlightPhase]];
    while (state.next()) {
      phases.push([state.effectivePhase, state.effectiveHighlightPhase]);
    }
    expect(phases).toEqual([
      ["intro", "none"],
      ["split", "none"],
      ["diamond-labels", "none"],
      ["box-labels", "none"],
      ["merged", "none"],
      ["diamond", "center"],
      ["diamond", "hand"],
      ["diamond", "outer"],
    ]);
  });
});
