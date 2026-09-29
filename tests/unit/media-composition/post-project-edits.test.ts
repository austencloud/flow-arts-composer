import { describe, expect, it } from "vitest";
import {
  PostProjectSchema,
  POST_BOX,
  POST_MAX_SPEED,
  POST_MIN_ITEM_SECONDS,
  findItem,
  type PostItem,
  type PostProject,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addOverlayItem,
  addTake,
  appendCardClip,
  appendVideoClip,
  deleteItem,
  duplicateItem,
  editItemKeyframes,
  moveMainItem,
  moveOverlayItem,
  removeTake,
  resetFraming,
  setItemFill,
  setProjectAudio,
  setProjectBackground,
  setTrackFlag,
  setVideoSpeed,
  splitItemAt,
  trimItem,
  trimItemToSource,
  updateItem,
  updateItemAt,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import {
  framingAt,
  isAnimated,
  opacityAt,
  setKeyframe,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  NOW,
  card,
  overlay,
  project as rawProject,
  round,
  spans,
  take,
  text,
  video,
} from "./post-project-fixtures";

const ctx = { now: NOW + 1 };

/** Projects as the editor holds them: laid out by the timeline's rules. */
const project = (...args: Parameters<typeof rawProject>) =>
  normalizeProject(rawProject(...args));

function valid(p: PostProject): PostProject {
  const parsed = PostProjectSchema.safeParse(p);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  return p;
}

function item(p: PostProject, id: string): PostItem {
  const found = findItem(p, id)?.item;
  expect(found, id).toBeTruthy();
  return found!;
}

/** Two clips, 0–10 and 10–16, with the dual look on the first and a text on the second. */
function twoClips(): PostProject {
  return project(
    [video("v1"), video("v2", { takeId: "b", sourceIn: 2, sourceOut: 8 })],
    [
      [
        overlay("anim", "animation", {
          fill: true,
          anchor: { itemId: "v1", offset: 0 },
          start: 0,
          duration: 10,
          box: { ...POST_BOX.bottom },
        }),
      ],
      [text("t1", 12, 2, { anchor: { itemId: "v2", offset: 2 } })],
    ]
  );
}

describe("takes", () => {
  it("adds a take once per file and refreshes it in place", () => {
    const base = project([], [], []);
    const added = valid(addTake(base, take("a"), ctx));
    expect(added.takes.map((entry) => entry.id)).toEqual(["a"]);
    expect(added.updatedAt).toBe(ctx.now);

    const again = addTake(added, take("a"), ctx);
    expect(again).toBe(added);

    const renamed = valid(
      addTake(added, { ...take("zzz"), takeKey: "key-a", label: "New" }, ctx)
    );
    expect(renamed.takes).toHaveLength(1);
    expect(renamed.takes[0]).toMatchObject({ id: "a", label: "New" });
  });

  it("gives a new take a free id when its id is taken", () => {
    const base = project([], [], [take("take-1")]);
    const added = valid(
      addTake(base, { ...take("take-1"), takeKey: "other" }, ctx)
    );
    expect(new Set(added.takes.map((entry) => entry.id)).size).toBe(2);
  });

  it("removes a take with its clips and their looks, and closes the gap", () => {
    const result = valid(removeTake(twoClips(), "a", ctx));
    expect(result.takes.map((entry) => entry.id)).toEqual(["b"]);
    expect(spans(result, 0)).toEqual([["v2", 0, 6]]);
    expect(findItem(result, "anim")).toBeNull();
    // The text follows its clip back to the start.
    expect(spans(result, 1)).toEqual([["t1", 2, 2]]);
  });

  it("returns the same project for an unknown take", () => {
    const base = twoClips();
    expect(removeTake(base, "nope", ctx)).toBe(base);
  });
});

describe("appending", () => {
  it("appends a whole clip of a take to the main track", () => {
    const result = appendVideoClip(twoClips(), "b", ctx)!;
    valid(result.project);
    const clip = item(result.project, result.itemId);
    expect(clip).toMatchObject({
      kind: "video",
      takeId: "b",
      sourceIn: 0,
      sourceOut: 20,
      speed: 1,
      start: 16,
      fit: "cover",
      box: POST_BOX.full,
      anchor: null,
      fill: false,
    });
  });

  it("clamps a requested span to the take", () => {
    const result = appendVideoClip(project([]), "a", ctx, {
      sourceIn: -3,
      sourceOut: 99,
    })!;
    expect(item(result.project, result.itemId)).toMatchObject({
      sourceIn: 0,
      sourceOut: 20,
    });
  });

  it("returns null for an unknown take", () => {
    expect(appendVideoClip(project([]), "nope", ctx)).toBeNull();
  });

  it("appends a card after the clips", () => {
    const result = appendCardClip(twoClips(), ctx, { label: " Card ", fadeIn: 0.25 });
    valid(result.project);
    expect(item(result.project, result.itemId)).toMatchObject({
      kind: "card",
      start: 16,
      duration: 5,
      label: "Card",
      fadeIn: 0.25,
    });
  });
});

describe("splitItemAt", () => {
  it("cuts a main clip at its source point and moves the look across", () => {
    const base = project(
      [video("v1", { fadeIn: 1, fadeOut: 1 }), video("v2", { sourceOut: 4 })],
      [
        [
          overlay("anim", "animation", {
            fill: true,
            anchor: { itemId: "v1", offset: 0 },
            duration: 10,
            fadeIn: 1,
            fadeOut: 1,
          }),
        ],
        [
          text("early", 1, 2, { anchor: { itemId: "v1", offset: 1 } }),
          text("late", 6, 2, { anchor: { itemId: "v1", offset: 6 } }),
        ],
      ]
    );
    const result = splitItemAt(base, "v1", 4, ctx)!;
    valid(result.project);
    const first = item(result.project, "v1");
    const second = item(result.project, result.newItemId);
    expect(first).toMatchObject({ sourceIn: 0, sourceOut: 4, fadeIn: 1, fadeOut: 0 });
    expect(second).toMatchObject({ sourceIn: 4, sourceOut: 10, fadeIn: 0, fadeOut: 1 });
    expect(spans(result.project, 0)).toEqual([
      ["v1", 0, 4],
      [result.newItemId, 4, 6],
      ["v2", 10, 4],
    ]);

    // The look is copied onto the second piece, both still filling.
    const looks = result.project.tracks[1]!.items;
    expect(looks.map((entry) => [entry.fill, entry.anchor?.itemId, round(entry.start), round(entry.duration)])).toEqual([
      [true, "v1", 0, 4],
      [true, result.newItemId, 4, 6],
    ]);
    expect(looks[0]!.fadeOut).toBe(0);
    expect(looks[1]!.fadeIn).toBe(0);

    // A text after the cut follows the second piece and stays put.
    expect(item(result.project, "late").anchor).toEqual({
      itemId: result.newItemId,
      offset: 2,
    });
    expect(item(result.project, "early").anchor?.itemId).toBe("v1");
    expect(spans(result.project, 2)).toEqual([
      ["early", 1, 2],
      ["late", 6, 2],
    ]);
  });

  it("cuts a slowed clip by its speed", () => {
    const base = project([video("v1", { sourceOut: 10, speed: 0.5 })]);
    const result = splitItemAt(base, "v1", 4, ctx)!;
    expect(item(result.project, "v1")).toMatchObject({ sourceOut: 2 });
    expect(item(result.project, result.newItemId)).toMatchObject({ sourceIn: 2 });
    expect(spans(result.project, 0)).toEqual([
      ["v1", 0, 4],
      [result.newItemId, 4, 16],
    ]);
  });

  it("splits an overlay into two pieces that keep their times", () => {
    const base = project(
      [video("v1")],
      [[overlay("anim", "animation", { fill: true, anchor: { itemId: "v1", offset: 0 }, duration: 10 })]]
    );
    const result = splitItemAt(base, "anim", 3, ctx)!;
    valid(result.project);
    expect(spans(result.project, 1)).toEqual([
      ["anim", 0, 3],
      [result.newItemId, 3, 7],
    ]);
    expect(item(result.project, result.newItemId)).toMatchObject({
      fill: false,
      anchor: { itemId: "v1", offset: 3 },
    });
  });

  it("refuses a cut too close to an edge", () => {
    const base = twoClips();
    expect(splitItemAt(base, "v1", POST_MIN_ITEM_SECONDS / 2, ctx)).toBeNull();
    expect(splitItemAt(base, "v1", 10 - POST_MIN_ITEM_SECONDS / 2, ctx)).toBeNull();
    expect(splitItemAt(base, "nope", 5, ctx)).toBeNull();
  });
});

describe("deleteItem", () => {
  it("removes a main clip with its look and leaves other overlays in place", () => {
    const base = project(
      [video("v1"), video("v2", { sourceOut: 6 })],
      [
        [overlay("anim", "animation", { fill: true, anchor: { itemId: "v1", offset: 0 }, duration: 10 })],
        [text("t1", 4, 2, { anchor: { itemId: "v1", offset: 4 } })],
      ]
    );
    const result = valid(deleteItem(base, "v1", ctx));
    expect(spans(result, 0)).toEqual([["v2", 0, 6]]);
    expect(findItem(result, "anim")).toBeNull();
    expect(item(result, "t1")).toMatchObject({
      start: 4,
      anchor: { itemId: "v2", offset: 4 },
    });
  });

  it("removes an overlay alone", () => {
    const result = valid(deleteItem(twoClips(), "t1", ctx));
    expect(findItem(result, "t1")).toBeNull();
    expect(spans(result, 0)).toEqual([
      ["v1", 0, 10],
      ["v2", 10, 6],
    ]);
  });

  it("returns the same project for an unknown item", () => {
    const base = twoClips();
    expect(deleteItem(base, "nope", ctx)).toBe(base);
  });
});

describe("duplicateItem", () => {
  it("copies a main clip and its look right after it", () => {
    const result = duplicateItem(twoClips(), "v1", ctx)!;
    valid(result.project);
    expect(spans(result.project, 0)).toEqual([
      ["v1", 0, 10],
      [result.newItemId, 10, 10],
      ["v2", 20, 6],
    ]);
    const copies = result.project.tracks
      .flatMap((track) => track.items)
      .filter((entry) => entry.anchor?.itemId === result.newItemId);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ kind: "animation", fill: true, start: 10, duration: 10 });
    // The text keeps following the second clip, now later.
    expect(item(result.project, "t1").start).toBe(22);
  });

  it("puts an overlay's copy after it, higher up when its track is busy", () => {
    const base = project(
      [video("v1", { sourceOut: 20 })],
      [[text("t1", 0, 2), text("t2", 2, 2)]]
    );
    const result = duplicateItem(base, "t1", ctx)!;
    valid(result.project);
    expect(spans(result.project, 1)).toEqual([
      ["t1", 0, 2],
      ["t2", 2, 2],
    ]);
    expect(spans(result.project, 2)).toEqual([[result.newItemId, 2, 2]]);
    expect(item(result.project, result.newItemId)).toMatchObject({
      fill: false,
      anchor: { itemId: "v1", offset: 2 },
    });
  });
});

describe("moveMainItem", () => {
  it("reorders clips and carries anchored overlays", () => {
    const result = valid(moveMainItem(twoClips(), "v2", 0, ctx));
    expect(spans(result, 0)).toEqual([
      ["v2", 0, 6],
      ["v1", 6, 10],
    ]);
    expect(spans(result, 1)).toEqual([["anim", 6, 10]]);
    expect(spans(result, 2)).toEqual([["t1", 2, 2]]);
  });

  it("clamps the index and returns the same project when nothing moves", () => {
    const base = twoClips();
    expect(moveMainItem(base, "v2", 9, ctx)).toBe(base);
    expect(moveMainItem(base, "anim", 0, ctx)).toBe(base);
    expect(spans(moveMainItem(base, "v1", 9, ctx), 0)[1]![0]).toBe("v1");
  });
});

describe("moveOverlayItem", () => {
  const base = () =>
    project(
      [video("v1"), video("v2", { sourceOut: 10 })],
      [[text("t1", 0, 2)], [text("t2", 5, 2)]]
    );

  it("moves an overlay and anchors it to the clip under its start", () => {
    const result = valid(moveOverlayItem(base(), "t1", { start: 12, trackIndex: 1 }, ctx));
    expect(item(result, "t1")).toMatchObject({
      start: 12,
      anchor: { itemId: "v2", offset: 2 },
      fill: false,
    });
  });

  it("goes to the nearest track above with room when the target is busy", () => {
    const result = valid(moveOverlayItem(base(), "t1", { start: 5.5, trackIndex: 2 }, ctx));
    expect(spans(result, 1)).toEqual([["t2", 5, 2]]);
    expect(spans(result, 2)).toEqual([["t1", 5.5, 2]]);
  });

  it("makes a new top track when asked", () => {
    const start = base();
    const result = valid(moveOverlayItem(start, "t1", { start: 0, trackIndex: 3 }, ctx));
    expect(result.tracks).toHaveLength(3);
    expect(spans(result, 2)).toEqual([["t1", 0, 2]]);
  });

  it("clamps the start and leaves main clips alone", () => {
    const start = base();
    expect(item(moveOverlayItem(start, "t2", { start: -4, trackIndex: 2 }, ctx), "t2").start).toBe(0);
    expect(moveOverlayItem(start, "v1", { start: 3, trackIndex: 1 }, ctx)).toBe(start);
  });

  it("returns the same project when nothing changes", () => {
    const moved = moveOverlayItem(base(), "t1", { start: 1, trackIndex: 1 }, ctx);
    expect(moveOverlayItem(moved, "t1", { start: 1, trackIndex: 1 }, ctx)).toBe(moved);
  });

  it("skips a locked track and lands above it even when the locked track has room", () => {
    const locked = setTrackFlag(base(), "track-1", "locked", true, ctx);
    const result = valid(moveOverlayItem(locked, "t2", { start: 5, trackIndex: 1 }, ctx));
    expect(findItem(result, "t2")?.trackIndex).toBe(2);
    expect(spans(result, 1)).toEqual([["t1", 0, 2]]);
    expect(spans(result, 2)).toEqual([["t2", 5, 2]]);
  });

  it("lets an item slide along its own hidden track, but nothing else lands there", () => {
    const hidden = setTrackFlag(base(), "track-1", "hidden", true, ctx);
    const along = valid(moveOverlayItem(hidden, "t1", { start: 3, trackIndex: 1 }, ctx));
    expect(spans(along, 1)).toEqual([["t1", 3, 2]]);
    const onto = valid(moveOverlayItem(hidden, "t2", { start: 5, trackIndex: 1 }, ctx));
    expect(spans(onto, 1)).toEqual([["t1", 0, 2]]);
  });
});

describe("trimItem", () => {
  it("cuts a main clip's head and keeps its place", () => {
    const base = twoClips();
    const result = valid(trimItem(base, "v1", "start", 3, ctx));
    expect(item(result, "v1")).toMatchObject({ sourceIn: 3, start: 0, duration: 7 });
    expect(spans(result, 0)[1]).toEqual(["v2", 7, 6]);
    expect(spans(result, 1)).toEqual([["anim", 0, 7]]);
    expect(spans(result, 2)).toEqual([["t1", 9, 2]]);
  });

  it("gives the same result when re-applied to the starting project", () => {
    const base = twoClips();
    const once = trimItem(base, "v2", "end", 13, ctx);
    const again = trimItem(base, "v2", "end", 13, ctx);
    expect(again).toEqual(once);
    expect(item(once, "v2")).toMatchObject({ sourceIn: 2, sourceOut: 5 });
  });

  it("keeps a clip inside its take and at least the shortest length", () => {
    const base = twoClips();
    expect(item(trimItem(base, "v2", "end", 99, ctx), "v2")).toMatchObject({ sourceOut: 20 });
    expect(item(trimItem(base, "v2", "start", -5, ctx), "v2")).toMatchObject({ sourceIn: 0 });
    const shortest = item(trimItem(base, "v1", "start", 99, ctx), "v1");
    expect(round(shortest.duration)).toBe(POST_MIN_ITEM_SECONDS);
  });

  it("trims a card's length from either edge", () => {
    const base = project([video("v1"), card("c1", 5)]);
    expect(round(item(trimItem(base, "c1", "start", 11, ctx), "c1").duration)).toBe(4);
    expect(round(item(trimItem(base, "c1", "end", 17, ctx), "c1").duration)).toBe(7);
  });

  it("moves an overlay's start with its end fixed and ends its fill", () => {
    const base = twoClips();
    const result = valid(trimItem(base, "anim", "start", 2, ctx));
    expect(item(result, "anim")).toMatchObject({
      start: 2,
      duration: 8,
      fill: false,
      anchor: { itemId: "v1", offset: 2 },
    });
    const ended = valid(trimItem(base, "t1", "end", 15, ctx));
    expect(item(ended, "t1")).toMatchObject({ start: 12, duration: 3 });
  });

  it("moves an overlay clip's start through its source", () => {
    const base = project(
      [video("v1", { sourceOut: 20 })],
      [[video("pip", { takeId: "b", sourceIn: 4, sourceOut: 8, start: 5 })]]
    );
    const result = valid(trimItem(base, "pip", "start", 6, ctx));
    expect(item(result, "pip")).toMatchObject({ start: 6, sourceIn: 5, sourceOut: 8 });
  });

  it("returns the same project when the edge does not move", () => {
    const base = trimItem(twoClips(), "v1", "end", 10, ctx);
    expect(trimItem(base, "v1", "end", 10, ctx)).toBe(base);
  });

  it("keeps a fill-linked overlay linked when re-trimming its edge to where it already is", () => {
    const base = twoClips();
    const result = trimItem(base, "anim", "end", 10, ctx);
    expect(result).toBe(base);
    expect(item(result, "anim").fill).toBe(true);
  });

  it("leaves a plain anchored overlay unchanged when its edge does not move", () => {
    const base = project(
      [video("v1"), video("v2", { sourceOut: 8 })],
      [[text("t2", 12.4, 2, { anchor: { itemId: "v2", offset: 2.4 } })]]
    );
    expect(trimItem(base, "t2", "start", 12.4, ctx)).toBe(base);
  });
});

describe("trimItemToSource", () => {
  it("sets a clip's In and Out as times in its take", () => {
    const base = twoClips();
    const cut = valid(trimItemToSource(base, "v2", "start", 4, ctx));
    expect(item(cut, "v2")).toMatchObject({ start: 10, sourceIn: 4, sourceOut: 8 });
    const ended = valid(trimItemToSource(base, "v2", "end", 5, ctx));
    expect(item(ended, "v2")).toMatchObject({ sourceIn: 2, sourceOut: 5 });
  });

  it("counts a sped-up clip's source, not its time on the post", () => {
    const base = project([video("v1", { speed: 2, sourceOut: 12 })]);
    const result = valid(trimItemToSource(base, "v1", "end", 6, ctx));
    expect(item(result, "v1")).toMatchObject({ sourceIn: 0, sourceOut: 6 });
    expect(round(item(result, "v1").duration)).toBe(3);
  });

  it("keeps a typed point inside the take", () => {
    const base = twoClips();
    expect(item(trimItemToSource(base, "v2", "end", 99, ctx), "v2")).toMatchObject({
      sourceOut: 20,
    });
    expect(item(trimItemToSource(base, "v2", "start", -3, ctx), "v2")).toMatchObject({
      sourceIn: 0,
    });
  });

  it("leaves anything but a clip, or a value that is not a time, alone", () => {
    const base = twoClips();
    expect(trimItemToSource(base, "t1", "start", 3, ctx)).toBe(base);
    expect(trimItemToSource(base, "v1", "start", Number.NaN, ctx)).toBe(base);
  });
});

describe("setVideoSpeed", () => {
  it("clamps the speed and ripples the clips after it", () => {
    const result = valid(setVideoSpeed(twoClips(), "v1", 99, ctx));
    expect(item(result, "v1")).toMatchObject({ speed: POST_MAX_SPEED, sourceIn: 0, sourceOut: 10 });
    expect(spans(result, 0)).toEqual([
      ["v1", 0, 2.5],
      ["v2", 2.5, 6],
    ]);
    expect(spans(result, 1)).toEqual([["anim", 0, 2.5]]);
  });

  it("ignores items that are not clips", () => {
    const base = twoClips();
    expect(setVideoSpeed(base, "t1", 2, ctx)).toBe(base);
  });
});

describe("updateItem", () => {
  it("applies only the fields the item's kind owns", () => {
    const base = twoClips();
    const result = valid(
      updateItem(base, "t1", { text: "Hi", size: "l", zoom: 3, mode: "mandala" }, ctx)
    );
    const updated = item(result, "t1");
    expect(updated).toMatchObject({ text: "Hi", size: "l" });
    expect(updated).not.toHaveProperty("zoom");
    expect(updated).not.toHaveProperty("mode");
  });

  it("clamps numbers and folds rotation", () => {
    const result = valid(
      updateItem(
        twoClips(),
        "v1",
        { zoom: 99, panX: -3, volume: 5, opacity: 2, rotation: 190, fadeIn: 50 },
        ctx
      )
    );
    expect(item(result, "v1")).toMatchObject({
      zoom: 4,
      panX: -0.5,
      volume: 2,
      opacity: 1,
      rotation: -170,
      fadeIn: 10,
    });
  });

  it("keeps a clip's span inside its take", () => {
    const result = valid(updateItem(twoClips(), "v2", { sourceIn: 30, sourceOut: 1 }, ctx));
    const clip = item(result, "v2");
    expect(clip.kind === "video" && round(clip.sourceIn)).toBe(19.9);
    expect(clip.kind === "video" && clip.sourceOut).toBe(20);
  });

  it("sets, changes and removes a clip's staff effect", () => {
    const set = valid(updateItem(twoClips(), "v1", { staffEffect: "sparkles" }, ctx));
    expect(item(set, "v1")).toMatchObject({ staffEffect: { effect: "sparkles" } });
    const changed = valid(updateItem(set, "v1", { staffEffect: "trails" }, ctx));
    expect(item(changed, "v1")).toMatchObject({ staffEffect: { effect: "trails" } });
    const cleared = valid(updateItem(changed, "v1", { staffEffect: null }, ctx));
    expect(item(cleared, "v1")).not.toHaveProperty("staffEffect");
    expect(updateItem(cleared, "v1", { staffEffect: null }, ctx)).toBe(cleared);
  });

  it("sets and removes a name", () => {
    const named = valid(updateItem(twoClips(), "v1", { label: "  Run  " }, ctx));
    expect(item(named, "v1").label).toBe("Run");
    const cleared = valid(updateItem(named, "v1", { label: "  " }, ctx));
    expect(item(cleared, "v1")).not.toHaveProperty("label");
  });

  it("ends an overlay's fill when its length is set", () => {
    const result = valid(updateItem(twoClips(), "anim", { duration: 4 }, ctx));
    expect(item(result, "anim")).toMatchObject({ duration: 4, fill: false });
  });

  it("keeps a moved box inside the frame", () => {
    const result = valid(
      updateItem(twoClips(), "t1", { box: { x: 0.9, y: -1, width: 0.5, height: 0.01 } }, ctx)
    );
    expect(item(result, "t1").box).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.05 });
  });

  it("returns the same project when nothing changes", () => {
    const base = twoClips();
    expect(updateItem(base, "v1", { zoom: 1, flip: false }, ctx)).toBe(base);
    expect(updateItem(base, "v1", { overlay: false }, ctx)).toBe(base);
    expect(updateItem(base, "nope", { zoom: 2 }, ctx)).toBe(base);
  });
});

describe("addOverlayItem", () => {
  it("adds to the top track when it has room, anchored to the clip under it", () => {
    const result = addOverlayItem(twoClips(), { kind: "text", at: 3 }, ctx)!;
    valid(result.project);
    expect(findItem(result.project, result.itemId)?.trackIndex).toBe(2);
    expect(item(result.project, result.itemId)).toMatchObject({
      kind: "text",
      text: "",
      size: "m",
      start: 3,
      duration: 3,
      anchor: { itemId: "v1", offset: 3 },
    });
  });

  it("opens a new track on top when the top one is busy", () => {
    const result = addOverlayItem(twoClips(), { kind: "moves", at: 12.5 }, ctx)!;
    valid(result.project);
    expect(findItem(result.project, result.itemId)?.trackIndex).toBe(3);
    expect(item(result.project, result.itemId)).toMatchObject({ mode: "arrows" });
  });

  it("fills the clip under it when asked", () => {
    const result = addOverlayItem(twoClips(), { kind: "carousel", at: 12, fill: true }, ctx)!;
    valid(result.project);
    expect(item(result.project, result.itemId)).toMatchObject({
      start: 10,
      duration: 6,
      fill: true,
      anchor: { itemId: "v2", offset: 0 },
    });
  });

  it("adds an overlay clip of a take, or nothing for an unknown one", () => {
    const result = addOverlayItem(twoClips(), { kind: "video", at: 1, takeId: "b", sourceOut: 3 }, ctx)!;
    valid(result.project);
    expect(item(result.project, result.itemId)).toMatchObject({ sourceIn: 0, sourceOut: 3, duration: 3 });
    expect(addOverlayItem(twoClips(), { kind: "video", at: 1, takeId: "nope" }, ctx)).toBeNull();
  });

  it("opens a new track on top when the top one is hidden, even with room", () => {
    const hidden = valid(setTrackFlag(twoClips(), "track-2", "hidden", true, ctx));
    const result = addOverlayItem(hidden, { kind: "text", at: 3 }, ctx)!;
    valid(result.project);
    expect(findItem(result.project, result.itemId)?.trackIndex).toBe(3);
    expect(result.project.tracks[3]).toMatchObject({ hidden: false, locked: false });
  });

  it("opens a new track on top when the top one is locked, even with room", () => {
    const locked = valid(setTrackFlag(twoClips(), "track-2", "locked", true, ctx));
    const result = addOverlayItem(locked, { kind: "text", at: 3 }, ctx)!;
    valid(result.project);
    expect(findItem(result.project, result.itemId)?.trackIndex).toBe(3);
    expect(result.project.tracks[3]).toMatchObject({ hidden: false, locked: false });
  });
});

describe("setItemFill", () => {
  it("spans the clip under the overlay, and lets it go again", () => {
    const filled = valid(setItemFill(twoClips(), "t1", true, ctx));
    expect(item(filled, "t1")).toMatchObject({ start: 10, duration: 6, fill: true });
    const released = valid(setItemFill(filled, "t1", false, ctx));
    expect(item(released, "t1")).toMatchObject({ start: 10, duration: 6, fill: false });
  });

  it("leaves clips and unchanged items alone", () => {
    const base = twoClips();
    expect(setItemFill(base, "v1", true, ctx)).toBe(base);
    expect(setItemFill(base, "anim", true, ctx)).toBe(base);
  });
});

describe("track and project flags", () => {
  it("hides and locks tracks", () => {
    const hidden = valid(setTrackFlag(twoClips(), "track-1", "hidden", true, ctx));
    expect(hidden.tracks[1]).toMatchObject({ hidden: true, locked: false });
    expect(setTrackFlag(hidden, "track-1", "hidden", true, ctx)).toBe(hidden);
    expect(setTrackFlag(hidden, "nope", "locked", true, ctx)).toBe(hidden);
  });

  it("switches the sound", () => {
    const base = twoClips();
    expect(valid(setProjectAudio(base, "silent", ctx)).audio).toBe("silent");
    expect(setProjectAudio(base, "takes", ctx)).toBe(base);
  });

  it("switches the background, and stores the dark default as nothing", () => {
    const base = twoClips();
    expect(setProjectBackground(base, "dark", ctx)).toBe(base);

    const blurred = valid(setProjectBackground(base, "blur", ctx));
    expect(blurred.background).toBe("blur");
    expect(setProjectBackground(blurred, "blur", ctx)).toBe(blurred);

    const dark = valid(setProjectBackground(blurred, "dark", ctx));
    expect("background" in dark).toBe(false);
  });
});

describe("editItemKeyframes", () => {
  it("applies an item-level keyframe edit and finishes the project", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const next = valid(
      editItemKeyframes(base, "v1", (it) => setKeyframe(it, "opacity", 5, 0.4), ctx)
    );
    expect(isAnimated(item(next, "v1"), "opacity")).toBe(true);
    expect(next.updatedAt).toBe(ctx.now);
  });

  it("is a no-op (same project reference) when the edit changes nothing", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    expect(editItemKeyframes(base, "v1", (it) => it, ctx)).toBe(base);
  });

  it("is a no-op for an item that doesn't exist", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    expect(
      editItemKeyframes(base, "nope", (it) => setKeyframe(it, "opacity", 5, 0.4), ctx)
    ).toBe(base);
  });
});

describe("updateItemAt", () => {
  it("routes an animated framing field into a keyframe instead of the static field", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const withKeyframe = editItemKeyframes(
      base,
      "v1",
      (it) => setKeyframe(it, "framing", 0, { zoom: 1, panX: 0, panY: 0, rotation: 0 }),
      ctx
    );
    const next = valid(updateItemAt(withKeyframe, "v1", { zoom: 3 }, 5, ctx));
    const updated = item(next, "v1") as PostVideoItem;
    // The static field is untouched; a keyframe was written at s = 5 instead.
    expect(updated.zoom).toBe(1);
    expect(framingAt(updated, 5).zoom).toBe(3);
  });

  it("falls back to a plain static update when the channel isn't animated", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const next = valid(updateItemAt(base, "v1", { zoom: 3 }, 5, ctx));
    const updated = item(next, "v1") as PostVideoItem;
    expect(updated.zoom).toBe(3);
    expect(isAnimated(updated, "framing")).toBe(false);
  });

  it("updates an unanimated field in the same patch normally alongside an animated one", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const withKeyframe = editItemKeyframes(
      base,
      "v1",
      (it) => setKeyframe(it, "framing", 0, { zoom: 1, panX: 0, panY: 0, rotation: 0 }),
      ctx
    );
    const next = valid(
      updateItemAt(withKeyframe, "v1", { zoom: 3, volume: 0.5 }, 5, ctx)
    );
    const updated = item(next, "v1") as PostVideoItem;
    expect(updated.volume).toBe(0.5);
    expect(framingAt(updated, 5).zoom).toBe(3);
  });
});

describe("resetFraming", () => {
  it("resets zoom, pan and rotation to identity and drops framing keyframes only", () => {
    const base = project([
      video("v1", { sourceOut: 10, zoom: 2, panX: 0.1, panY: -0.1, rotation: 30 }),
    ]);
    let withKeyframes = editItemKeyframes(
      base,
      "v1",
      (it) =>
        setKeyframe(it, "framing", 0, {
          zoom: 2,
          panX: 0.1,
          panY: -0.1,
          rotation: 30,
        }),
      ctx
    );
    withKeyframes = editItemKeyframes(
      withKeyframes,
      "v1",
      (it) => setKeyframe(it, "opacity", 3, 0.5),
      ctx
    );
    const next = valid(resetFraming(withKeyframes, "v1", ctx));
    const reset = item(next, "v1") as PostVideoItem;
    expect(reset).toMatchObject({ zoom: 1, panX: 0, panY: 0, rotation: 0 });
    expect(isAnimated(reset, "framing")).toBe(false);
    // A keyframe on a different channel survives.
    expect(isAnimated(reset, "opacity")).toBe(true);
  });

  it("is a no-op already at identity with no framing keyframes", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    expect(resetFraming(base, "v1", ctx)).toBe(base);
  });

  it("is a no-op for a non-video item", () => {
    const base = project([card("c1", 10)]);
    expect(resetFraming(base, "c1", ctx)).toBe(base);
  });
});

describe("shiftKeyframes wiring in trim and split", () => {
  it("keeps a main-track card's opacity keyframe at the same offset into its remaining content after a head trim", () => {
    const base = project([card("c1", 10)]);
    const withKeyframe = editItemKeyframes(
      base,
      "c1",
      (it) => setKeyframe(it, "opacity", 6, 0.4),
      ctx
    );
    const trimmed = valid(trimItem(withKeyframe, "c1", "start", 3, ctx));
    const trimmedItem = item(trimmed, "c1");
    expect(trimmedItem.duration).toBeCloseTo(7, 9);
    // The remaining footage used to start 3s in; it now starts at its own 0,
    // so the keyframe rides forward with it and still reads 0.4 there.
    expect(opacityAt(trimmedItem, trimmedItem.start + 3)).toBeCloseTo(0.4, 9);
  });

  it("keeps an overlay's opacity keyframe at the same post second when its start trims forward", () => {
    const base = project(
      [video("v1", { sourceOut: 20 })],
      [[text("t1", 2, 6)]]
    );
    const withKeyframe = editItemKeyframes(
      base,
      "t1",
      (it) => setKeyframe(it, "opacity", 5, 0.5),
      ctx
    );
    const trimmed = valid(trimItem(withKeyframe, "t1", "start", 4, ctx));
    const trimmedItem = item(trimmed, "t1");
    expect(trimmedItem.start).toBeCloseTo(4, 9);
    expect(opacityAt(trimmedItem, 5)).toBeCloseTo(0.5, 9);
  });

  it("never shifts a video item's framing keyframes when it trims, since they already ride the take's clock", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const withKeyframe = editItemKeyframes(
      base,
      "v1",
      (it) => setKeyframe(it, "framing", 2, { zoom: 2, panX: 0, panY: 0, rotation: 0 }),
      ctx
    );
    const trimmed = valid(trimItem(withKeyframe, "v1", "end", 8, ctx));
    const trimmedItem = item(trimmed, "v1") as PostVideoItem;
    // Content time 2 is unchanged; only the item's own span got shorter.
    expect(trimmedItem.keyframes?.framing).toEqual(
      (item(withKeyframe, "v1") as PostVideoItem).keyframes?.framing
    );
    expect(framingAt(trimmedItem, 2).zoom).toBe(2);
  });

  it("keeps a single-keyframe video framing value correct on both pieces of a split", () => {
    const base = project([video("v1", { sourceOut: 10 })]);
    const withKeyframe = editItemKeyframes(
      base,
      "v1",
      (it) => setKeyframe(it, "framing", 2, { zoom: 2, panX: 0, panY: 0, rotation: 0 }),
      ctx
    );
    const result = splitItemAt(withKeyframe, "v1", 4, ctx)!;
    valid(result.project);
    const first = item(result.project, "v1") as PostVideoItem;
    const second = item(result.project, result.newItemId) as PostVideoItem;
    expect(framingAt(first, 1).zoom).toBe(2);
    expect(framingAt(second, 7).zoom).toBe(2);
  });

  it("re-maps the post second a video framing keyframe lands on when its speed changes", () => {
    const base = project([video("v1", { sourceOut: 20, speed: 1 })]);
    const withKeyframe = editItemKeyframes(
      base,
      "v1",
      (it) => setKeyframe(it, "framing", 10, { zoom: 2, panX: 0, panY: 0, rotation: 0 }),
      ctx
    );
    const sped = valid(setVideoSpeed(withKeyframe, "v1", 2, ctx));
    const fastItem = item(sped, "v1") as PostVideoItem;
    // Same take instant (media second 10), now reached in half the post time.
    expect(framingAt(fastItem, 5).zoom).toBeCloseTo(2, 6);
  });
});
