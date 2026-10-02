import { describe, expect, it } from "vitest";
import {
  POST_BOX,
  type PostAnimationItem,
  type PostItem,
  type PostMovesItem,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  joinTimelineGroup,
  selectTimelineItem,
  timelineGroupOf,
  timelineHandoffPair,
  timelineItemOrder,
  type TimelineSelection,
} from "$lib/shared/share/components/post-studio/editor/timeline/post-timeline-selection";
import { overlay, project, text, video } from "./post-project-fixtures";

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

describe("the animation and the square it becomes", () => {
  /** An animation that shrinks into the square over 9 to 10 seconds. */
  function handoffProject(alsoOnAnimationRow: PostItem[] = []) {
    const anim = overlay("anim", "animation", {
      start: 0,
      duration: 10,
      box: { ...POST_BOX.bottom },
      anchor: { itemId: "v1", offset: 0 },
      fadeOut: 1,
    } as Partial<PostAnimationItem>);
    const pip = overlay("pip", "moves", {
      start: 9,
      duration: 12,
      box: { x: 0.6, y: 0.78, width: 0.4, height: 0.22 },
      anchor: { itemId: "v2", offset: 0 },
      animationAppearance: { mandala: false },
    } as Partial<PostMovesItem>);
    return project(
      [
        video("v1", {
          start: 0,
          pinnedStart: true,
          transitionOut: { duration: 1, type: "crossfade", incomingId: "v2" },
        } as Partial<PostVideoItem>),
        video("v2", {
          takeId: "b",
          start: 9,
          sourceIn: 0,
          sourceOut: 12,
          pinnedStart: true,
        }),
      ],
      [[anim, ...alsoOnAnimationRow], [pip]]
    );
  }

  it("joins them across the stretch where one becomes the other", () => {
    expect(timelineHandoffPair(handoffProject())).toEqual({
      animationId: "anim",
      movesId: "pip",
      animationTrackIndex: 1,
      movesTrackIndex: 2,
      start: 9,
      end: 10,
    });
  });

  it("leaves them apart when a clip sits where the square would be drawn", () => {
    expect(timelineHandoffPair(handoffProject([text("title", 15, 2)]))).toBe(
      null
    );
    expect(
      timelineHandoffPair(handoffProject([text("later", 22, 2)]))
    ).not.toBe(null);
  });

  it("acts on both halves from either one", () => {
    const pair = timelineHandoffPair(handoffProject());
    expect(timelineGroupOf(pair, "pip")).toEqual(["anim", "pip"]);
    expect(timelineGroupOf(pair, "anim")).toEqual(["anim", "pip"]);
    expect(timelineGroupOf(pair, "v1")).toEqual(["v1"]);
    expect(timelineGroupOf(null, "pip")).toEqual(["pip"]);
  });

  it("keeps the pair whole in a selection, focused on the half pressed", () => {
    const pair = timelineHandoffPair(handoffProject());
    const pressed = joinTimelineGroup(
      { ids: ["pip"], anchorId: "pip", focusId: "pip" },
      pair,
      "pip"
    );
    expect(pressed).toEqual({
      ids: ["anim", "pip"],
      anchorId: "pip",
      focusId: "pip",
    });
    // A toggle that dropped one half drops both.
    expect(
      joinTimelineGroup(
        { ids: ["v1", "anim"], anchorId: "v1", focusId: "v1" },
        pair,
        "pip"
      )
    ).toEqual({ ids: ["v1"], anchorId: "v1", focusId: "v1" });
    // A range that reached one half takes the other along.
    expect(
      joinTimelineGroup(
        { ids: ["v1", "anim"], anchorId: "v1", focusId: "anim" },
        pair,
        "v2"
      ).ids
    ).toEqual(["v1", "anim", "pip"]);
  });
});
