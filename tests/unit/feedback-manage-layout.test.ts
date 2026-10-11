import { describe, expect, it } from "vitest";
import {
  getFeedbackManageLayoutMode,
  isFeedbackManageQueueMode,
} from "#lib/features/feedback/domain/feedback-manage-layout.js";

describe("feedback Manage layout classification", () => {
  it.each([
    [{ width: 375, height: 667 }, "compact"],
    [{ width: 599, height: 900 }, "compact"],
    [{ width: 600, height: 900 }, "queue"],
    [{ width: 749, height: 750 }, "queue"],
    [{ width: 1319, height: 900 }, "queue"],
    [{ width: 1320, height: 900 }, "kanban"],
    [{ width: 2599, height: 1440 }, "kanban"],
    [{ width: 2600, height: 1440 }, "wide-kanban"],
    [{ width: 3840, height: 2160 }, "wide-kanban"],
  ] as const)("classifies %o as %s", (size, expected) => {
    expect(getFeedbackManageLayoutMode(size)).toBe(expected);
  });

  it("uses the dense queue whenever the container is short", () => {
    expect(getFeedbackManageLayoutMode({ width: 3840, height: 479 })).toBe(
      "compact-height"
    );
    expect(getFeedbackManageLayoutMode({ width: 960, height: 480 })).toBe(
      "queue"
    );
  });

  it("identifies every non-Kanban composition as a queue", () => {
    expect(isFeedbackManageQueueMode("compact")).toBe(true);
    expect(isFeedbackManageQueueMode("queue")).toBe(true);
    expect(isFeedbackManageQueueMode("compact-height")).toBe(true);
    expect(isFeedbackManageQueueMode("kanban")).toBe(false);
    expect(isFeedbackManageQueueMode("wide-kanban")).toBe(false);
  });
});
