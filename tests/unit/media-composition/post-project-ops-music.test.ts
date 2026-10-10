import { describe, expect, it } from "vitest";
import { bridgeLockedChange } from "#lib/shared/media-composition/domain/post-project-bridge-guard.js";
import type {
  PostProject,
  PostVideoItem,
} from "#lib/shared/media-composition/domain/post-project.js";
import { featureVideoMediaUrl } from "#lib/shared/media-composition/domain/feature-video-url.js";
import { NO_GRID_MESSAGE } from "#lib/shared/media-composition/domain/music-grid.js";
import type { PostMusic } from "#lib/shared/media-composition/domain/post-music.js";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "#lib/shared/media-composition/domain/post-project-ops.js";
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

describe("music values out of range", () => {
  // 120 s of music, gridded at 120 BPM in 4, played from its 10 s to its 100 s.
  const gridded = withMusic({
    sourceInSeconds: 10,
    sourceOutSeconds: 100,
    grid: GRID,
  });
  const edit = (patch: Record<string, unknown>) =>
    ({ op: "music", ...patch }) as unknown as PostProjectOp;

  /** The edit is refused with this message, and the post is as it was. */
  function refused(
    patch: Record<string, unknown>,
    message: string,
    before: PostProject = gridded
  ): void {
    const frozen = JSON.stringify(before);
    expect(() => run(before, edit(patch))).toThrow(message);
    expect(JSON.stringify(before)).toBe(frozen);
  }

  const TEMPO = "bpm must be from 20 to 300.";
  const BEATS = "beatsPerBar must be a whole number from 1 to 12.";
  const DOWNBEAT =
    "downbeatSeconds must be from -120 s to 120 s (the file is 120 s long).";
  const START = "startSeconds must be from 0 s to 14400 s";

  it.each([
    ["a tempo of 1280", { bpm: 1280 }, TEMPO],
    ["a tempo below 20", { bpm: 19.9 }, TEMPO],
    ["3.5 beats a bar", { beatsPerBar: 3.5 }, BEATS],
    ["0 beats a bar", { beatsPerBar: 0 }, BEATS],
    ["13 beats a bar", { beatsPerBar: 13 }, BEATS],
    ["a level of 5", { gain: 5 }, "gain must be from 0 to 2."],
    ["a level below 0", { gain: -0.1 }, "gain must be from 0 to 2."],
    [
      "a fade in below 0",
      { fadeInSeconds: -1 },
      "fadeInSeconds must be 0 or more.",
    ],
    [
      "a fade out below 0",
      { fadeOutSeconds: -0.5 },
      "fadeOutSeconds must be 0 or more.",
    ],
    ["a bar 1 at 1e17 s", { downbeatSeconds: 1e17 }, DOWNBEAT],
    ["a bar 1 at -1e17 s", { downbeatSeconds: -1e17 }, DOWNBEAT],
    ["a bar 1 past the file's length", { downbeatSeconds: 120.5 }, DOWNBEAT],
    ["a start below 0", { startSeconds: -3 }, START],
    ["a start after four hours", { startSeconds: 14401 }, START],
  ])("refuses %s", (_name, patch, message) => {
    refused(patch, message);
  });

  it.each([
    [
      "a part that ends before it starts",
      { sourceInSeconds: 30, sourceOutSeconds: 20 },
      "The music's end (20 s) must come at least 0.1 s after its start (30 s).",
    ],
    [
      "an end before the start it has now",
      { sourceOutSeconds: 5 },
      "The music's end (5 s) must come at least 0.1 s after its start (10 s).",
    ],
    [
      "a start at the end it has now",
      { sourceInSeconds: 100 },
      "The music's end (100 s) must come at least 0.1 s after its start (100 s).",
    ],
    [
      "a start that leaves under 0.1 s",
      { sourceInSeconds: 99.95 },
      "The music's end (100 s) must come at least 0.1 s after its start (99.95 s).",
    ],
    [
      "a start before the file",
      { sourceInSeconds: -5 },
      "The music's start (-5 s) must be 0 s or later.",
    ],
    [
      "an end after the file",
      { sourceOutSeconds: 130 },
      "The music's end (130 s) cannot come after the end of its file (120 s).",
    ],
  ])("refuses %s", (_name, patch, message) => {
    refused(patch, message);
  });

  it("checks times named as bars after they are turned into seconds", () => {
    // On this grid bar 3 is the file's 9.25 s, bar 30 its 63.25 s.
    refused(
      { sourceInSeconds: { bar: 30 }, sourceOutSeconds: { bar: 3 } },
      "The music's end (9.25 s) must come at least 0.1 s after its start (63.25 s)."
    );
    refused(
      { sourceOutSeconds: { bar: 80 } },
      "The music's end (163.25 s) cannot come after the end of its file (120 s)."
    );
    refused(
      { sourceInSeconds: { bar: -5 } },
      "The music's start (-6.75 s) must be 0 s or later."
    );
    refused({ startSeconds: { bar: 100000 } }, START);
    // Bar 1 sounds at the post's 0 + (0.25 - 5) = -4.75 s.
    const early = withMusic({
      startSeconds: 0,
      sourceInSeconds: 5,
      sourceOutSeconds: 35,
      grid: { bpm: 120, downbeatSeconds: 0.25, beatsPerBar: 4 },
    });
    refused({ startSeconds: { bar: 1 } }, START, early);
    // Bar 9 sounds at 0 + (0.25 + 32 * 0.5 - 5) = 11.25 s, which is allowed.
    expect(
      run(early, edit({ startSeconds: { bar: 9 } })).music?.startSeconds
    ).toBeCloseTo(11.25, 9);
  });

  it("refuses the whole edit, so a good setting beside a wrong one is not applied", () => {
    refused({ gain: 0.5, bpm: 1280 }, TEMPO);
    refused(
      { label: "Radio edit", sourceInSeconds: 30, sourceOutSeconds: 20 },
      "The music's end (20 s) must come at least 0.1 s after its start (30 s)."
    );
    expect(() =>
      applyPostProjectOps(
        gridded,
        [edit({ gain: 0.5 }), edit({ bpm: 1280 })],
        ctx
      )
    ).toThrow(`Edit 2 (music): ${TEMPO}`);
  });

  it("applies values at the edges of their ranges", () => {
    const next = run(
      gridded,
      edit({
        bpm: 300,
        beatsPerBar: 12,
        downbeatSeconds: -120,
        gain: 2,
        fadeInSeconds: 0,
        startSeconds: 14400,
        sourceInSeconds: 0,
        sourceOutSeconds: 120,
      })
    );
    expect(next.music).toMatchObject({
      grid: { bpm: 300, downbeatSeconds: -120, beatsPerBar: 12 },
      gain: 2,
      fadeInSeconds: 0,
      startSeconds: 14400,
      sourceInSeconds: 0,
      sourceOutSeconds: 120,
    });
    expect(
      run(gridded, edit({ bpm: 20, downbeatSeconds: 120, gain: 0 })).music
    ).toMatchObject({
      grid: { bpm: 20, downbeatSeconds: 120, beatsPerBar: 4 },
      gain: 0,
    });
  });

  it("applies a played part of exactly the shortest length", () => {
    const music = run(
      gridded,
      edit({ sourceInSeconds: 10, sourceOutSeconds: 10.1 })
    ).music!;
    expect(music.sourceInSeconds).toBe(10);
    expect(music.sourceOutSeconds - music.sourceInSeconds).toBeCloseTo(0.1, 9);
  });

  it("checks an edge it is given against the other edge the music has now", () => {
    expect(run(gridded, edit({ sourceInSeconds: 50 })).music).toMatchObject({
      sourceInSeconds: 50,
      sourceOutSeconds: 100,
    });
    expect(run(gridded, edit({ sourceOutSeconds: 60 })).music).toMatchObject({
      sourceInSeconds: 10,
      sourceOutSeconds: 60,
    });
    expect(
      run(
        gridded,
        edit({ sourceInSeconds: { bar: 2 }, sourceOutSeconds: { bar: 10 } })
      ).music
    ).toMatchObject({ sourceInSeconds: 7.25, sourceOutSeconds: 23.25 });
  });

  it("still fits a fade longer than the part that plays", () => {
    // The music plays 10 s to 100 s: 90 s.
    expect(
      run(gridded, edit({ fadeInSeconds: 500 })).music?.fadeInSeconds
    ).toBe(90);
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
