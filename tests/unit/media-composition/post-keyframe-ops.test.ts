import { describe, expect, it } from "vitest";
import {
  channelKeyframeSeconds,
  easingPresetOf,
  findItem,
  keyframeCount,
  opacityAt,
  segmentAt,
  type PostBox,
  type PostItem,
  type PostMusic,
  type PostProject,
} from "@austencloud/video-editor/core";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "#lib/shared/media-composition/domain/post-project-ops.js";
import { NOW, card, overlay, project, video } from "./post-project-fixtures";
import { keyframeListing } from "../../../scripts/feature-video/keyframe-list.mjs";
import { withBatchTimes } from "../../../scripts/feature-video/time-args.mjs";

const ctx = editContext(NOW + 1);
const BOX: PostBox = { x: 0.6, y: 0.04, width: 0.36, height: 0.2 };
/** 120 bpm from 0 s, four beats a bar: bar 2 is at 2 s, bar 2 beat 3 at 3 s. */
const GRID = { bpm: 120, downbeatSeconds: 0, beatsPerBar: 4 };

const music: PostMusic = {
  id: "music-1",
  url: "/api/dev/feature-videos/promo/media/music/song.wav",
  label: "Song",
  startSeconds: 0,
  sourceInSeconds: 0,
  sourceOutSeconds: 60,
  durationSeconds: 60,
  gain: 1,
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
  grid: GRID,
};

/** Footage on the main lane and a square m1 from 2 s to 8 s over it. */
function post(): PostProject {
  return {
    ...project(
      [video("v1", { sourceOut: 12 })],
      [[overlay("m1", "moves", { start: 2, duration: 6, box: BOX })]]
    ),
    music,
  };
}

function run(start: PostProject, ...ops: PostProjectOp[]): PostProject {
  return applyPostProjectOps(start, ops, ctx);
}

function itemOf(p: PostProject, id: string): PostItem {
  const found = findItem(p, id);
  if (!found) throw new Error(`no ${id}`);
  return found.item;
}

const keys = (p: PostProject, channel: "box" | "opacity" = "opacity") =>
  channelKeyframeSeconds(itemOf(p, "m1"), channel).map(
    (s) => Math.round(s * 1000) / 1000
  );

/** m1 with opacity keys at 3 s (0.5) and 5 s (1). */
function keyed(): PostProject {
  return run(
    post(),
    {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: 3,
      patch: { opacity: 0.5 },
    },
    { op: "keyframe", item: "m1", action: "set", at: 5, patch: { opacity: 1 } }
  );
}

describe("keyframe set", () => {
  it("makes a keyframe on a still channel, then a second one", () => {
    const next = keyed();
    expect(keys(next)).toEqual([3, 5]);
    expect(opacityAt(itemOf(next, "m1"), 3)).toBeCloseTo(0.5, 6);
    expect(opacityAt(itemOf(next, "m1"), 5)).toBeCloseTo(1, 6);
  });

  it("changes the keyframe already there, and a repeat changes nothing", () => {
    const start = keyed();
    const changed = run(start, {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: 3,
      patch: { opacity: 0.25 },
    });
    expect(keys(changed)).toEqual([3, 5]);
    expect(opacityAt(itemOf(changed, "m1"), 3)).toBeCloseTo(0.25, 6);
    const same = run(start, {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: 3,
      patch: { opacity: 0.5 },
    });
    expect(same).toBe(start);
  });

  it("reads --own as seconds from the item's start, and a bar on the beat grid", () => {
    const own = run(post(), {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: 1,
      own: true,
      patch: { box: { ...BOX, x: 0.1 } },
    });
    expect(keys(own, "box")).toEqual([3]);
    const bar = run(post(), {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: { bar: 2, beat: 3 },
      patch: { opacity: 0.5 },
    });
    expect(keys(bar)).toEqual([3]);
  });

  it("sets the easing that leaves the keyframe", () => {
    const next = run(keyed(), {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: 3,
      patch: { opacity: 0.5 },
      easing: "ease-in",
    });
    const segment = segmentAt(itemOf(next, "m1"), "opacity", 3);
    expect(easingPresetOf(segment!.easing)).toBe("ease-in");
  });

  it("refuses fields that do not animate, unknown easings and times outside the item", () => {
    expect(() =>
      run(post(), {
        op: "keyframe",
        item: "m1",
        action: "set",
        at: 3,
        patch: { label: "x" } as never,
      })
    ).toThrow("set keys only fields that animate");
    expect(() =>
      run(keyed(), {
        op: "keyframe",
        item: "m1",
        action: "set",
        at: 3,
        patch: { opacity: 0.5 },
        easing: "bouncy",
      })
    ).toThrow(/Unknown easing "bouncy". Use one of linear, ease-in.*hold/);
    expect(() =>
      run(post(), {
        op: "keyframe",
        item: "m1",
        action: "set",
        at: 3,
        patch: { opacity: 0.5 },
        easing: "ease-in",
      })
    ).toThrow("has one keyframe on opacity");
    expect(() =>
      run(post(), {
        op: "keyframe",
        item: "m1",
        action: "set",
        at: 9,
        patch: { opacity: 0.5 },
      })
    ).toThrow("--at 9 s is outside m1, which runs 2 s to 8 s.");
    expect(() =>
      run(post(), {
        op: "keyframe",
        item: "m1",
        action: "set",
        at: 3,
        patch: { zoom: 2 },
      })
    ).toThrow(
      'm1 (moves) has no channel "framing". Its channels: box, opacity.'
    );
  });
});

describe("keyframe move", () => {
  it("moves the keyframe within 0.02 s of --at", () => {
    const next = run(keyed(), {
      op: "keyframe",
      item: "m1",
      action: "move",
      at: 3.015,
      to: 4,
    });
    expect(keys(next)).toEqual([4, 5]);
    expect(opacityAt(itemOf(next, "m1"), 4)).toBeCloseTo(0.5, 6);
  });

  it("names the nearest keyframes on each side when none is that close", () => {
    expect(() =>
      run(keyed(), {
        op: "keyframe",
        item: "m1",
        action: "move",
        at: 3.5,
        to: 4,
      })
    ).toThrow(
      "m1 has no keyframe within 0.02 s of 3.5 s. Nearest before: opacity at 3 s; after: opacity at 5 s."
    );
  });

  it("refuses a move onto, past or outside another keyframe or the item", () => {
    const move = (to: number) =>
      run(keyed(), { op: "keyframe", item: "m1", action: "move", at: 3, to });
    expect(() => move(5)).toThrow("opacity already has a keyframe at 5 s");
    expect(() => move(6)).toThrow("would pass its neighbour at 5 s");
    expect(() => move(8.5)).toThrow("--to 8.5 s is outside m1");
  });
});

describe("keyframe retime, delete and clear", () => {
  it("gives each keyframe of a channel its new time, in order", () => {
    const next = run(keyed(), {
      op: "keyframe",
      item: "m1",
      action: "retime",
      channel: "opacity",
      times: [2.5, 7],
    });
    expect(keys(next)).toEqual([2.5, 7]);
    expect(opacityAt(itemOf(next, "m1"), 7)).toBeCloseTo(1, 6);
  });

  it("refuses the wrong count, falling times and a missing channel", () => {
    const retime = (times: number[], channel = "opacity") =>
      run(keyed(), {
        op: "keyframe",
        item: "m1",
        action: "retime",
        channel,
        times,
      });
    expect(() => retime([3])).toThrow(
      "m1 has 2 keyframes on opacity; --times gave 1."
    );
    expect(() => retime([5, 3])).toThrow("--times must rise");
    expect(() => retime([3, 4], "box")).toThrow("m1 has no keyframes on box.");
    expect(() => retime([3, 4], "glow")).toThrow('no channel "glow"');
  });

  it("deletes the keyframe at a time", () => {
    const next = run(keyed(), {
      op: "keyframe",
      item: "m1",
      action: "delete",
      at: 5,
    });
    expect(keys(next)).toEqual([3]);
    expect(() =>
      run(keyed(), {
        op: "keyframe",
        item: "m1",
        action: "delete",
        at: 4,
        channel: "opacity",
      })
    ).toThrow("Nearest before: opacity at 3 s; after: opacity at 5 s.");
  });

  it("clears a channel or every keyframe, and a second clear changes nothing", () => {
    const start = run(keyed(), {
      op: "keyframe",
      item: "m1",
      action: "set",
      at: 4,
      patch: { box: { ...BOX, x: 0.2 } },
    });
    const opacityOnly = run(start, {
      op: "keyframe",
      item: "m1",
      action: "clear",
      channel: "opacity",
    });
    expect(keys(opacityOnly)).toEqual([]);
    expect(keys(opacityOnly, "box")).toEqual([4]);
    // The value at the item's start stays.
    expect(itemOf(opacityOnly, "m1").opacity).toBeCloseTo(0.5, 6);
    const all = run(start, { op: "keyframe", item: "m1", action: "clear" });
    expect(keyframeCount(itemOf(all, "m1"))).toBe(0);
    expect(run(all, { op: "keyframe", item: "m1", action: "clear" })).toBe(all);
  });

  it("refuses an unknown item or action", () => {
    expect(() =>
      run(post(), { op: "keyframe", item: "nope", action: "clear" })
    ).toThrow('No item "nope" in this post.');
    expect(() =>
      run(post(), { op: "keyframe", item: "m1", action: "spin" as never })
    ).toThrow(
      "--action must be one of list, set, move, retime, delete, clear."
    );
  });
});

describe("keyframe list", () => {
  it("lists keyframes by channel with own time, post time, bar and beat", () => {
    const start = keyed();
    const listing = keyframeListing(start, "m1");
    expect(listing).toEqual({
      item: "m1",
      start: 2,
      channels: {
        opacity: [
          { own: 1, post: 3, bar: 2, beat: 3 },
          { own: 3, post: 5, bar: 3, beat: 3 },
        ],
      },
    });
    expect(run(start, { op: "keyframe", item: "m1", action: "list" })).toBe(
      start
    );
    const noGrid = keyframeListing({ ...start, music: undefined }, "m1", "box");
    expect(noGrid.channels).toEqual({ box: [] });
  });
});

describe("move", () => {
  it("moves an overlay, its keyframes with it, and keeps its track", () => {
    const next = run(keyed(), { op: "move", item: "m1", to: 1 });
    const m1 = findItem(next, "m1")!;
    expect(m1.item.start).toBeCloseTo(1, 6);
    expect(m1.trackIndex).toBe(1);
    expect(keys(next)).toEqual([2, 4]);
    expect(opacityAt(m1.item, 2)).toBeCloseTo(0.5, 6);
  });

  it("puts a main clip at a time through the editor's own placement, keys and all", () => {
    const k2 = { ...card("k2", 4), start: 4 } as PostItem;
    const base = run(project([card("k1", 4), k2]), {
      op: "keyframe",
      item: "k2",
      action: "set",
      at: 5,
      patch: { opacity: 0.4 },
    });
    const next = run(base, { op: "move", item: "k2", to: 6 });
    const moved = findItem(next, "k2")!;
    expect(moved.trackIndex).toBe(0);
    expect(moved.item.start).toBeCloseTo(6, 6);
    const own = channelKeyframeSeconds(moved.item, "opacity").map(
      (s) => s - moved.item.start
    );
    expect(own[0]).toBeCloseTo(1, 6);
    expect(() =>
      run(base, { op: "move", item: "k2", to: 6, track: 1 })
    ).toThrow("k2 is on the main track and stays there; leave out --track.");
  });

  it("refuses a track that is not there, and a move to where it is changes nothing", () => {
    const start = post();
    expect(() =>
      run(start, { op: "move", item: "m1", to: 1, track: 5 })
    ).toThrow("--track must be a whole number from 1 to 2");
    // The first move ties the overlay to the clip under it; a second changes nothing.
    const moved = run(start, { op: "move", item: "m1", to: 2 });
    expect(run(moved, { op: "move", item: "m1", to: 2 })).toBe(moved);
  });
});

describe("times in a batch file", () => {
  it("reads @ bars and clocks with the flags' parser and keeps the object form", () => {
    const ops = withBatchTimes([
      { op: "trim", item: "m1", edge: "end", seconds: "1:02.5" },
      {
        op: "keyframe",
        item: "m1",
        action: "retime",
        times: ["@2.3", 7, { bar: 4 }],
      },
      { op: "move", item: "m1", to: "@29.3" },
      { op: "fly-into-next", item: "m1", seconds: 1.13 },
    ]);
    expect(ops).toEqual([
      { op: "trim", item: "m1", edge: "end", seconds: 62.5 },
      {
        op: "keyframe",
        item: "m1",
        action: "retime",
        times: [{ bar: 2, beat: 3 }, 7, { bar: 4 }],
      },
      { op: "move", item: "m1", to: { bar: 29, beat: 3 } },
      { op: "fly-into-next", item: "m1", seconds: 1.13 },
    ]);
    expect(() =>
      withBatchTimes([{ op: "move", item: "m1", to: "soon" }])
    ).toThrow("Edit 1 (move): --to must be seconds");
  });

  it("lands a bar string on the beat grid like the flag does", () => {
    const next = run(
      post(),
      ...(withBatchTimes([
        {
          op: "keyframe",
          item: "m1",
          action: "set",
          at: "@2.3",
          patch: { opacity: 0.5 },
        },
      ]) as PostProjectOp[])
    );
    expect(keys(next)).toEqual([3]);
  });
});
