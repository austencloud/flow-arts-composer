import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureEvent: vi.fn(),
}));

import { captureEvent } from "$lib/shared/analytics/services/posthog";
import {
  logConstructContextPreviewReady,
  logConstructImmediateUndo,
  logConstructLetterTypeGroupSelected,
  logConstructOptionApplied,
  logConstructStartPlacementCompleted,
  resetConstructAnalyticsForTests,
} from "$lib/features/create/construct/services/construct-analytics";

describe("Construct privacy-safe analytics", () => {
  beforeEach(() => {
    vi.mocked(captureEvent).mockClear();
    resetConstructAnalyticsForTests();
  });

  it("records action metadata without sequence content", () => {
    logConstructStartPlacementCompleted({
      path: "build",
      gridMode: "diamond",
    });
    logConstructLetterTypeGroupSelected({
      group: "Type2",
      source: "selector",
    });
    logConstructContextPreviewReady({
      stepNumber: 2,
      latencyMs: 143.6,
      autoplay: false,
    });

    expect(captureEvent).toHaveBeenNthCalledWith(
      1,
      "construct_start_pose_completed",
      { path: "build", grid_mode: "diamond" }
    );
    expect(captureEvent).toHaveBeenNthCalledWith(
      2,
      "construct_movement_type_selected",
      { family: "Type2", source: "selector" }
    );
    expect(captureEvent).toHaveBeenNthCalledWith(
      3,
      "construct_context_preview_ready",
      {
        step_number: 2,
        latency_ms: 144,
        autoplay: false,
      }
    );
  });

  it("correlates only an undo within five seconds of an option change", () => {
    logConstructOptionApplied({ stepNumber: 3 }, 1_000);

    expect(logConstructImmediateUndo(5_999)).toBe(true);
    expect(captureEvent).toHaveBeenLastCalledWith("construct_immediate_undo", {
      step_number: 3,
      elapsed_ms: 4_999,
    });

    logConstructOptionApplied({ stepNumber: 4 }, 10_000);
    expect(logConstructImmediateUndo(15_001)).toBe(false);
  });
});
