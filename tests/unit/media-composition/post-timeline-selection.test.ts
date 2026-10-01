import { describe, expect, it } from "vitest";
import {
  selectTimelineItem,
  timelineItemOrder,
} from "$lib/shared/share/components/post-studio/editor/timeline/post-timeline-selection";
import { project, text, video } from "./post-project-fixtures";

describe("timeline selection", () => {
  const order = ["v1", "t1", "v2", "t2"];

  it("selects a contiguous range from the anchor in timeline order", () => {
    const first = selectTimelineItem(
      { ids: [], anchorId: null, focusId: null },
      "v1",
      order,
      "plain"
    );
    const range = selectTimelineItem(first, "v2", order, "range");
    expect(range).toEqual({
      ids: ["v1", "t1", "v2"],
      anchorId: "v1",
      focusId: "v2",
    });
    expect(selectTimelineItem(range, "t1", order, "range").ids).toEqual([
      "v1",
      "t1",
    ]);
  });

  it("toggles individual items and gives the toolbar a valid focus", () => {
    const first = selectTimelineItem(
      { ids: [], anchorId: null, focusId: null },
      "v1",
      order,
      "plain"
    );
    const added = selectTimelineItem(first, "t2", order, "toggle");
    expect(added.ids).toEqual(["v1", "t2"]);
    expect(added.focusId).toBe("t2");
    const removed = selectTimelineItem(added, "t2", order, "toggle");
    expect(removed.ids).toEqual(["v1"]);
    expect(removed.focusId).toBe("v1");
    expect(selectTimelineItem(removed, "v1", order, "toggle")).toEqual({
      ids: [],
      anchorId: null,
      focusId: null,
    });
  });

  it("orders items by time and then layer", () => {
    const post = project(
      [video("v1"), video("v2", { start: 10 })],
      [[text("t1", 2, 2)], [text("t2", 10, 2)]]
    );
    expect(timelineItemOrder(post)).toEqual(["v1", "t1", "v2", "t2"]);
  });
});
