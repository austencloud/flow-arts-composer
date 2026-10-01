import { describe, expect, it } from "vitest";
import {
  selectTimelineItem,
  timelineItemOrder,
  type TimelineSelection,
} from "$lib/shared/share/components/post-studio/editor/timeline/post-timeline-selection";
import { project, text, video } from "./post-project-fixtures";

describe("timeline selection", () => {
  const post = project(
    [
      video("v1", { sourceOut: 2 }),
      video("middle", { start: 5, sourceOut: 2 }),
      video("v2", { start: 10, sourceOut: 2 }),
    ],
    [
      [text("t2", 10, 2), text("t1", 0, 2), text("t-middle", 5, 2)],
      [text("other-layer", 5, 2)],
    ]
  );
  const empty: TimelineSelection = { ids: [], anchorId: null, focusId: null };
  const select = (
    current: TimelineSelection,
    itemId: string,
    modifier: "plain" | "range" | "toggle"
  ) =>
    selectTimelineItem(
      current,
      itemId,
      timelineItemOrder(post, itemId),
      modifier
    );

  it.each([
    ["v1", "v2"],
    ["v2", "v1"],
  ])("selects from %s to %s only on the main track", (anchorId, focusId) => {
    const first = select(empty, anchorId, "plain");
    expect(select(first, focusId, "range")).toEqual({
      ids: ["v1", "middle", "v2"],
      anchorId,
      focusId,
    });
  });

  it("keeps the original anchor when shortening a range", () => {
    const first = select(empty, "v1", "plain");
    const range = select(first, "v2", "range");
    expect(select(range, "middle", "range")).toEqual({
      ids: ["v1", "middle"],
      anchorId: "v1",
      focusId: "middle",
    });
  });

  it("selects an overlay range in time order without other layers", () => {
    const first = select(empty, "t1", "plain");
    expect(select(first, "t2", "range").ids).toEqual(["t1", "t-middle", "t2"]);
  });

  it("starts a new range when Shift-click crosses to another track", () => {
    const first = select(empty, "v1", "plain");
    const across = select(first, "t1", "range");
    expect(across).toEqual({ ids: ["t1"], anchorId: "t1", focusId: "t1" });
    expect(select(across, "t2", "range").ids).toEqual(["t1", "t-middle", "t2"]);
  });

  it("toggles individual items across tracks and keeps a valid focus", () => {
    const first = select(empty, "v1", "plain");
    const added = select(first, "t2", "toggle");
    expect(added.ids).toEqual(["v1", "t2"]);
    expect(added.focusId).toBe("t2");
    const removed = select(added, "t2", "toggle");
    expect(removed.ids).toEqual(["v1"]);
    expect(removed.focusId).toBe("v1");
    expect(select(removed, "v1", "toggle")).toEqual(empty);
  });
});
