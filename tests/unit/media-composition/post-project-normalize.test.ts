import { describe, expect, it } from "vitest";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";
import {
  PostProjectSchema,
  type PostEasing,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  card,
  overlay,
  project,
  spans,
  take,
  text,
  video,
} from "./post-project-fixtures";

describe("normalizeProject", () => {
  it("binds a saved legacy crossfade to its current neighbor", () => {
    const result = normalizeProject(
      project([
        card("a", 5, { transitionOut: { type: "crossfade", duration: 1 } }),
        card("b", 4),
        card("c", 4),
      ])
    );
    expect(result.tracks[0]!.items[0]!.transitionOut?.incomingId).toBe("b");
  });

  it("lays main clips end to end at their speed", () => {
    const result = normalizeProject(
      project([
        video("v1", { sourceIn: 2, sourceOut: 8, start: 99 }),
        video("v2", { sourceIn: 0, sourceOut: 4, speed: 0.5 }),
        card("c1", 5),
      ])
    );
    expect(spans(result, 0)).toEqual([
      ["v1", 0, 6],
      ["v2", 6, 8],
      ["c1", 14, 5],
    ]);
  });

  it("cuts a clip to its take's length", () => {
    const result = normalizeProject(
      project([video("v1", { sourceIn: 5, sourceOut: 30 })], [], [take("a", 12)])
    );
    const clip = result.tracks[0]!.items[0]!;
    expect(clip.kind === "video" && clip.sourceOut).toBe(12);
    expect(clip.duration).toBe(7);
  });

  it("carries anchored overlays with their clip", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), video("v2", { sourceOut: 6 })],
        [[text("t1", 0, 2, { anchor: { itemId: "v2", offset: 1 } })]]
      )
    );
    expect(spans(result, 1)).toEqual([["t1", 5, 2]]);
  });

  it("makes a filling overlay span its clip exactly", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), video("v2", { sourceOut: 6 })],
        [
          [
            overlay("anim", "animation", {
              fill: true,
              anchor: { itemId: "v2", offset: 3 },
              start: 0,
              duration: 1,
            }),
          ],
        ]
      )
    );
    expect(spans(result, 1)).toEqual([["anim", 4, 6]]);
    expect(result.tracks[1]!.items[0]!.anchor).toEqual({
      itemId: "v2",
      offset: 0,
    });
  });

  it("keeps an overlay in place when its clip is gone, following the clip under it", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), video("v3", { sourceOut: 6 })],
        [[text("t1", 5, 2, { anchor: { itemId: "gone", offset: 1 } })]]
      )
    );
    const moved = result.tracks[1]!.items[0]!;
    expect(moved.start).toBe(5);
    expect(moved.anchor).toEqual({ itemId: "v3", offset: 1 });
  });

  it("anchors a filling overlay to the clip under it when its own is gone", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), video("v2", { sourceOut: 6 })],
        [
          [
            overlay("anim", "animation", {
              fill: true,
              anchor: { itemId: "gone", offset: 0 },
              start: 4.5,
            }),
          ],
        ]
      )
    );
    expect(spans(result, 1)).toEqual([["anim", 4, 6]]);
  });

  it("drops fill from an overlay with no clip under it", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 })],
        [[overlay("anim", "animation", { fill: true, start: 10 })]]
      )
    );
    const item = result.tracks[1]!.items[0]!;
    expect(item.fill).toBe(false);
    expect(item.anchor).toBeNull();
    expect(item.start).toBe(10);
  });

  it("moves an overlapping overlay up to the next track with room", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 10 })],
        [
          [text("t1", 0, 3), text("t2", 2, 3)],
          [text("t3", 0, 1)],
        ]
      )
    );
    expect(spans(result, 1)).toEqual([["t1", 0, 3]]);
    expect(spans(result, 2)).toEqual([
      ["t3", 0, 1],
      ["t2", 2, 3],
    ]);
  });

  it("opens a new track when no track above has room", () => {
    const result = normalizeProject(
      project([video("v1", { sourceOut: 10 })], [[text("t1", 0, 3), text("t2", 1, 3)]])
    );
    expect(result.tracks).toHaveLength(3);
    expect(spans(result, 2)).toEqual([["t2", 1, 3]]);
    expect(result.tracks[2]!.id).not.toBe(result.tracks[1]!.id);
  });

  it("lets items that only touch share a track", () => {
    const result = normalizeProject(
      project([video("v1", { sourceOut: 10 })], [[text("t1", 0, 3), text("t2", 3, 3)]])
    );
    expect(result.tracks).toHaveLength(2);
  });

  it("moves overlays off the main track and removes empty overlay tracks", () => {
    const result = normalizeProject(
      project([video("v1", { sourceOut: 4 }), text("t1", 1, 2)], [[], []])
    );
    expect(spans(result, 0)).toEqual([["v1", 0, 4]]);
    expect(result.tracks).toHaveLength(2);
    expect(spans(result, 1)).toEqual([["t1", 1, 2]]);
  });

  it("never lets an overlay clip fill", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 10 })],
        [
          [
            video("pip", {
              sourceOut: 3,
              fill: true,
              anchor: { itemId: "v1", offset: 2 },
            }),
          ],
        ]
      )
    );
    expect(spans(result, 1)).toEqual([["pip", 2, 3]]);
    expect(result.tracks[1]!.items[0]!.fill).toBe(false);
  });

  it("fits fades inside the item, scaling the pair down together when both are capped", () => {
    const result = normalizeProject(
      project([card("c1", 2, { fadeIn: 5, fadeOut: 3 })])
    );
    const item = result.tracks[0]!.items[0]!;
    // Capped independently this would be {fadeIn: 2, fadeOut: 2}, which still
    // sums past the 2s item - both are scaled down so they add up to it.
    expect(item.fadeIn).toBe(1);
    expect(item.fadeOut).toBe(1);
  });

  it("scales fades down together when a speed change shrinks the clip under them", () => {
    const result = normalizeProject(
      project([video("v1", { sourceOut: 10, speed: 4, fadeIn: 2, fadeOut: 2 })])
    );
    const item = result.tracks[0]!.items[0]!;
    expect(item.duration).toBe(2.5);
    expect(item.fadeIn).toBe(1.25);
    expect(item.fadeOut).toBe(1.25);
  });

  it("leaves fades unchanged when they already fit", () => {
    const result = normalizeProject(project([card("c1", 10, { fadeIn: 1, fadeOut: 2 })]));
    const item = result.tracks[0]!.items[0]!;
    expect(item.fadeIn).toBe(1);
    expect(item.fadeOut).toBe(2);
  });

  it("keeps overlapping items on a track that is hidden instead of bumping one up", () => {
    const raw = project(
      [video("v1", { sourceOut: 10 })],
      [[text("t1", 0, 3), text("t2", 2, 3)]]
    );
    const hidden = {
      ...raw,
      tracks: raw.tracks.map((track, index) =>
        index === 1 ? { ...track, hidden: true } : track
      ),
    };
    const result = normalizeProject(hidden);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[1]!.hidden).toBe(true);
    expect(spans(result, 1)).toEqual([
      ["t1", 0, 3],
      ["t2", 2, 3],
    ]);
  });

  it("never lands a displaced item on a hidden track even when it has room", () => {
    const raw = project(
      [video("v1", { sourceOut: 10 }), text("stray", 1, 2)],
      [[text("far", 50, 1)]]
    );
    const hidden = {
      ...raw,
      tracks: raw.tracks.map((track, index) =>
        index === 1 ? { ...track, hidden: true } : track
      ),
    };
    const result = normalizeProject(hidden);
    expect(spans(result, 0)).toEqual([["v1", 0, 10]]);
    expect(result.tracks[1]!.hidden).toBe(true);
    expect(spans(result, 1)).toEqual([["far", 50, 1]]);
    expect(result.tracks).toHaveLength(3);
    expect(spans(result, 2)).toEqual([["stray", 1, 2]]);
  });

  it("returns the same project when nothing changes", () => {
    const once = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), card("c1", 5)],
        [[text("t1", 1, 2, { anchor: { itemId: "v1", offset: 1 } })]]
      )
    );
    expect(normalizeProject(once)).toBe(once);
  });

  it("keeps unchanged items when one moves", () => {
    const once = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), card("c1", 5)],
        [[text("t1", 6, 2)]]
      )
    );
    const moved = {
      ...once,
      tracks: once.tracks.map((track, index) =>
        index === 1
          ? {
              ...track,
              items: track.items.map((item) => ({ ...item, start: 7 })),
            }
          : track
      ),
    };
    const result = normalizeProject(moved);
    expect(result.tracks[0]).toBe(once.tracks[0]);
    expect(result.tracks[1]!.items[0]!.start).toBe(7);
  });

  it("produces a project the schema accepts", () => {
    const result = normalizeProject(
      project(
        [video("v1", { sourceOut: 4 }), card("c1", 5)],
        [[overlay("anim", "animation", { fill: true, anchor: { itemId: "v1", offset: 0 } })]]
      )
    );
    expect(PostProjectSchema.safeParse(result).success).toBe(true);
  });
});

describe("normalizeProject: keyframe canonicalization", () => {
  // Card, not text: text is not a MAIN_TRACK_KINDS member, so a lone text
  // item on the main array would be displaced onto a new overlay track and
  // these tests would be reading the wrong track's empty items[0].
  const LINEAR: PostEasing = [0, 0, 1, 1];

  it("sorts keyframes by time", () => {
    const result = normalizeProject(
      project([
        card("c1", 10, {
          keyframes: {
            opacity: [
              { t: 8, value: 0.8, easing: LINEAR },
              { t: 2, value: 0.2, easing: LINEAR },
            ],
          },
        }),
      ])
    );
    const clip = result.tracks[0]!.items[0]!;
    expect(clip.keyframes?.opacity?.map((k) => k.t)).toEqual([2, 8]);
  });

  it("merges keyframes within half a frame of post time, the later one winning", () => {
    const half = 1 / 60; // POST_KEYFRAME_MERGE_SECONDS
    const result = normalizeProject(
      project([
        card("c1", 10, {
          keyframes: {
            opacity: [
              { t: 3, value: 0.3, easing: LINEAR },
              { t: 3 + half * 0.5, value: 0.9, easing: LINEAR },
            ],
          },
        }),
      ])
    );
    const clip = result.tracks[0]!.items[0]!;
    expect(clip.keyframes?.opacity).toHaveLength(1);
    expect(clip.keyframes?.opacity?.[0]).toMatchObject({ value: 0.9 });
  });

  it("measures a video's merge distance in post seconds, not raw content time", () => {
    // At speed 2, a 0.02s content-time gap is only a 0.01s post-time gap -
    // within half a frame (~0.0167s) once mapped through the take's own
    // clock, even though the raw content-time gap alone is not.
    const result = normalizeProject(
      project([
        video("v1", {
          sourceOut: 20,
          speed: 2,
          keyframes: {
            framing: [
              {
                t: 4,
                value: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
                easing: LINEAR,
              },
              {
                t: 4.02,
                value: { zoom: 2, panX: 0, panY: 0, rotation: 0 },
                easing: LINEAR,
              },
            ],
          },
        }),
      ])
    );
    const clip = result.tracks[0]!.items[0]!;
    const framing = clip.kind === "video" ? clip.keyframes?.framing : undefined;
    expect(framing).toHaveLength(1);
    expect(framing?.[0]?.value.zoom).toBe(2);
  });

  it("clamps an out-of-range keyframe value", () => {
    const result = normalizeProject(
      project([
        card("c1", 10, {
          keyframes: {
            opacity: [{ t: 3, value: 1.5, easing: LINEAR }],
            box: [
              {
                t: 5,
                value: { x: 0.9, y: 0, width: 0.5, height: 0.5 },
                easing: LINEAR,
              },
            ],
          },
        }),
      ])
    );
    const clip = result.tracks[0]!.items[0]!;
    expect(clip.keyframes?.opacity?.[0]?.value).toBe(1);
    expect(clip.keyframes?.box?.[0]?.value).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
  });

  it("prunes an empty channel, and the whole keyframes object once every channel is empty", () => {
    const emptied = normalizeProject(
      project([card("c1", 10, { keyframes: { opacity: [] } })])
    );
    expect(emptied.tracks[0]!.items[0]!.keyframes).toBeUndefined();

    const partial = normalizeProject(
      project([
        card("c2", 10, {
          keyframes: {
            opacity: [],
            box: [
              {
                t: 1,
                value: { x: 0, y: 0, width: 1, height: 1 },
                easing: LINEAR,
              },
            ],
          },
        }),
      ])
    );
    const clip = partial.tracks[0]!.items[0]!;
    expect(clip.keyframes?.opacity).toBeUndefined();
    expect(clip.keyframes?.box).toHaveLength(1);
  });

  it("keeps the same keyframes array reference when already canonical", () => {
    const opacity = [
      { t: 2, value: 0.2, easing: LINEAR },
      { t: 8, value: 0.8, easing: LINEAR },
    ];
    const result = normalizeProject(
      project([card("c1", 10, { keyframes: { opacity } })])
    );
    const clip = result.tracks[0]!.items[0]!;
    expect(clip.keyframes?.opacity).toBe(opacity);
  });
});
