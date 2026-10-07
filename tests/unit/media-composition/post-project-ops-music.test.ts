import { describe, expect, it } from "vitest";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import type {
  PostProject,
  PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video-url";
import { NO_GRID_MESSAGE } from "$lib/shared/media-composition/domain/music-grid";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import { NOW, card, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const URL = featureVideoMediaUrl("promo", "music/derail.wav");
const GRID = { bpm: 120, downbeatSeconds: 5.25, beatsPerBar: 4 };

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 120,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

function withMusic(
  fields: Partial<PostMusic> = {},
  main = [video("v1")]
): PostProject {
  return { ...project(main), music: music(fields) };
}

function run(start: PostProject, ...ops: PostProjectOp[]): PostProject {
  return applyPostProjectOps(start, ops, ctx);
}

function firstClip(next: PostProject): PostVideoItem {
  return next.tracks[0]!.items[0] as PostVideoItem;
}

describe("add-music", () => {
  it("puts a file under the post, whole and at full level, named after it", () => {
    const next = run(project([video("v1")]), {
      op: "add-music",
      url: URL,
      durationSeconds: 96.5,
    });
    expect(next.music).toEqual({
      id: "music-1",
      url: URL,
      label: "derail",
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 96.5,
      durationSeconds: 96.5,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    });
    expect(next.updatedAt).toBe(NOW + 1);
  });

  it("takes a name, an artist and a license", () => {
    const next = run(project([video("v1")]), {
      op: "add-music",
      url: URL,
      durationSeconds: 90,
      label: " Derail ",
      artist: "Yellowbase",
      license: "Epidemic Sound, 2026-10-06",
    });
    expect(next.music).toMatchObject({
      label: "Derail",
      artist: "Yellowbase",
      license: "Epidemic Sound, 2026-10-06",
    });
  });

  it("keeps a chosen name and the trims when the same file comes back", () => {
    const before = withMusic({
      label: "Derail (edit)",
      artist: "Yellowbase",
      startSeconds: 1,
      sourceInSeconds: 8,
      sourceOutSeconds: 60,
    });
    const next = run(before, {
      op: "add-music",
      url: URL,
      durationSeconds: 100,
    });
    expect(next.music).toMatchObject({
      label: "Derail (edit)",
      artist: "Yellowbase",
      startSeconds: 1,
      sourceInSeconds: 8,
      sourceOutSeconds: 60,
      durationSeconds: 100,
    });
  });

  it("refuses music from outside a feature video, and a length below zero", () => {
    expect(() =>
      run(project([]), {
        op: "add-music",
        url: "https://example.test/a.wav",
        durationSeconds: 3,
      })
    ).toThrow(
      "Edit 1 (add-music): Music's url must be a feature video media url"
    );
    expect(() =>
      run(project([]), { op: "add-music", url: URL, durationSeconds: -1 })
    ).toThrow("durationSeconds must be a positive number.");
  });
});

describe("music", () => {
  it("changes the level, fades and words, and null or blank clears a credit", () => {
    const before = withMusic({ artist: "Yellowbase", license: "Epidemic" });
    const next = run(before, {
      op: "music",
      gain: 0.6,
      fadeInSeconds: 0.5,
      fadeOutSeconds: 2,
      label: "Derail (radio edit)",
      artist: null,
      license: " ",
    });
    expect(next.music).toEqual(
      music({
        gain: 0.6,
        fadeInSeconds: 0.5,
        fadeOutSeconds: 2,
        label: "Derail (radio edit)",
      })
    );
  });

  it("sets the grid first, so bars in the same edit count on it", () => {
    const before = withMusic({
      startSeconds: 2,
      sourceInSeconds: 5,
      sourceOutSeconds: 35,
    });
    const next = run(before, {
      op: "music",
      bpm: 120,
      downbeatSeconds: 5.25,
      sourceInSeconds: { bar: 2 },
      sourceOutSeconds: { bar: 10 },
    });
    expect(next.music?.grid).toEqual(GRID);
    expect(next.music?.sourceInSeconds).toBeCloseTo(7.25, 9);
    expect(next.music?.sourceOutSeconds).toBeCloseTo(23.25, 9);
  });

  it("reads a start bar on the post's clock", () => {
    const before = withMusic({
      startSeconds: 2,
      sourceInSeconds: 5,
      sourceOutSeconds: 35,
      grid: GRID,
    });
    // Bar 3 sounds at the post's 2.25 + 2 * 2 s.
    const next = run(before, { op: "music", startSeconds: { bar: 3 } });
    expect(next.music?.startSeconds).toBeCloseTo(6.25, 9);
  });

  it("drops the grid for bpm null, after which no bar can be named", () => {
    const next = run(withMusic({ grid: GRID }), { op: "music", bpm: null });
    expect(next.music).not.toHaveProperty("grid");
    expect(() =>
      run(next, { op: "music", sourceInSeconds: { bar: 2 } })
    ).toThrow(NO_GRID_MESSAGE);
  });

  it("refuses unknown settings, wrong values and a downbeat with no tempo", () => {
    const before = withMusic();
    const bad = (op: Record<string, unknown>) => () =>
      run(before, { op: "music", ...op } as unknown as PostProjectOp);
    expect(bad({ gian: 0.5 })).toThrow(
      'Edit 1 (music): Unknown music setting "gian".'
    );
    expect(bad({ gain: "loud" })).toThrow("gain must be a number.");
    expect(bad({ artist: 7 })).toThrow(
      "artist must be text, or null to remove it."
    );
    expect(bad({ bpm: "fast" })).toThrow(
      "bpm must be a number, or null to remove the beat grid."
    );
    expect(bad({ downbeatSeconds: 0.4 })).toThrow(
      "A downbeat and beats per bar need a tempo."
    );
    expect(bad({ startSeconds: "soon" })).toThrow(
      "startSeconds must be a number of seconds or a bar like @9 or @9.3."
    );
  });

  it("says how to add music when the post has none", () => {
    const ops: PostProjectOp[] = [
      { op: "music", gain: 1 },
      { op: "remove-music" },
      { op: "sync-to-music", item: "v1", offsetSeconds: 0 },
    ];
    for (const op of ops)
      expect(() => run(project([video("v1")]), op)).toThrow(
        "This post has no music. Add it with: add-music <file>."
      );
  });
});

describe("remove-music", () => {
  it("takes the music off the post", () => {
    expect(run(withMusic(), { op: "remove-music" })).not.toHaveProperty(
      "music"
    );
  });
});

describe("sync-to-music", () => {
  it("starts the clip where its take meets the music", () => {
    // The camera started 2.5 s before the music: the music's 0 s is the take's 2.5 s.
    const before = withMusic({}, [video("v1", { sourceIn: 0, sourceOut: 10 })]);
    const clip = firstClip(
      run(before, { op: "sync-to-music", item: "v1", offsetSeconds: -2.5 })
    );
    expect([clip.sourceIn, clip.sourceOut, clip.start, clip.duration]).toEqual([
      2.5, 12.5, 0, 10,
    ]);
  });

  it("counts the music's own trim and place", () => {
    // The music plays its 10 s at the post's 4 s, and the clip starts at 0 s.
    const before = withMusic({ startSeconds: 4, sourceInSeconds: 10 }, [
      video("v1", { sourceIn: 6, sourceOut: 16 }),
    ]);
    const clip = firstClip(
      run(before, { op: "sync-to-music", item: "v1", offsetSeconds: 3 })
    );
    // At the post's 4 s the music is at 10 s and the take at 7 s: 3 s apart.
    expect([clip.sourceIn, clip.sourceOut]).toEqual([3, 13]);
  });

  it("refuses a clip that cannot stay in time", () => {
    const before = withMusic({}, [
      video("v1", { sourceIn: 0, sourceOut: 10 }),
      video("v2", { takeId: "b", speed: 2 }),
      card("c1"),
    ]);
    const sync = (item: string, offsetSeconds: number) => () =>
      run(before, { op: "sync-to-music", item, offsetSeconds });
    expect(sync("v1", 2.5)).toThrow(
      "this clip would start 2.5 s before its take does"
    );
    // The take is 20 s long; in time, the clip would play its 12 s to 22 s.
    expect(sync("v1", -12)).toThrow(
      "this clip would run 2 s past the end of its take"
    );
    expect(sync("v2", 0)).toThrow("Only a clip at normal speed");
    expect(sync("c1", 0)).toThrow('"c1" is not a video clip.');
    expect(sync("nope", 0)).toThrow('No item "nope" in this post.');
  });
});

describe("times named as bars", () => {
  const before = withMusic(
    { startSeconds: 2, sourceInSeconds: 5, sourceOutSeconds: 35, grid: GRID },
    [video("v1", { sourceOut: 20 })]
  );

  it("places titles at a bar", () => {
    const next = run(before, { op: "add-titles", at: { bar: 5 } });
    const titles = next.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "titles");
    // 2.25 + 4 bars * 2 s.
    expect(titles?.start).toBeCloseTo(10.25, 9);
  });

  it("trims a clip to a bar and beat, and to plain seconds as before", () => {
    const toBeat = run(before, {
      op: "trim",
      item: "v1",
      edge: "end",
      seconds: { bar: 3, beat: 3 },
    });
    // 2.25 + (2 * 4 + 2) beats * 0.5 s.
    expect(firstClip(toBeat).duration).toBeCloseTo(7.25, 9);
    const toSeconds = run(before, {
      op: "trim",
      item: "v1",
      edge: "end",
      seconds: 6,
    });
    expect(firstClip(toSeconds).duration).toBeCloseTo(6, 9);
  });
});

describe("the editor bridge", () => {
  it("lets an edit add music, which is not one of the locked parts", () => {
    const before = project([video("v1")]);
    const after = run(before, {
      op: "add-music",
      url: URL,
      durationSeconds: 90,
    });
    expect(bridgeLockedChange(before, after)).toBeNull();
  });
});
