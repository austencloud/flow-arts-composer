import { describe, expect, it } from "vitest";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  FeatureVideoFileSchema,
} from "#lib/shared/media-composition/domain/feature-video.js";
import {
  POST_MUSIC_MAX_SECONDS,
  PostMusicSchema,
  type PostMusic,
} from "#lib/shared/media-composition/domain/post-music.js";
import {
  PostProjectSchema,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { setProjectAudio } from "#lib/shared/media-composition/domain/post-project-edits.js";
import { normalizeProject } from "#lib/shared/media-composition/domain/post-project-normalize.js";
import { NOW, project, video } from "./post-project-fixtures";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: "/api/dev/feature-videos/promo/media/music/derail.wav",
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

const firstError = (value: unknown) =>
  PostMusicSchema.safeParse(value).error?.issues[0]?.message;

describe("post music", () => {
  it("parses music with a grid as it was written", () => {
    const value = music({
      artist: "Yellowbase",
      license: "Epidemic Sound Pro, trial, 2026-10-07",
      grid: { bpm: 85, downbeatSeconds: 0.42, beatsPerBar: 4 },
    });
    expect(PostMusicSchema.parse(value)).toEqual(value);
  });

  it("allows bar 1 to fall before the file's first second", () => {
    const value = music({
      grid: { bpm: 85, downbeatSeconds: -0.25, beatsPerBar: 4 },
    });
    expect(PostMusicSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    [
      "an outside url",
      music({ url: "https://example.test/song.mp3" }),
      "Music must be a feature video media url.",
    ],
    [
      "an end at its start",
      music({ sourceInSeconds: 10, sourceOutSeconds: 10 }),
      "The music must end after it starts.",
    ],
    [
      "an end past the file",
      music({ sourceOutSeconds: 121 }),
      "The music cannot run past the end of its file.",
    ],
  ])("refuses %s", (_name, value, message) => {
    expect(firstError(value)).toBe(message);
  });

  it.each([
    ["a gain of 2.5", music({ gain: 2.5 })],
    [
      "10 BPM",
      music({ grid: { bpm: 10, downbeatSeconds: 0, beatsPerBar: 4 } }),
    ],
    [
      "0 beats a bar",
      music({ grid: { bpm: 85, downbeatSeconds: 0, beatsPerBar: 0 } }),
    ],
    [
      "13 beats a bar",
      music({ grid: { bpm: 85, downbeatSeconds: 0, beatsPerBar: 13 } }),
    ],
    [
      "3.5 beats a bar",
      music({ grid: { bpm: 85, downbeatSeconds: 0, beatsPerBar: 3.5 } }),
    ],
    ["an unknown key", { ...music(), tempo: 85 }],
    ["a blank label", music({ label: "   " })],
    ["a start before 0", music({ startSeconds: -1 })],
  ])("refuses %s", (_name, value) => {
    expect(PostMusicSchema.safeParse(value).success).toBe(false);
  });

  it("survives the layout pass and the take-sound switch", () => {
    const withMusic: PostProject = {
      ...project([video("v1")]),
      music: music({ startSeconds: 1 }),
    };
    expect(normalizeProject(withMusic).music).toEqual(
      music({ startSeconds: 1 })
    );
    const silent = setProjectAudio(withMusic, "silent", { now: NOW + 1 });
    expect(silent.audio).toBe("silent");
    expect(silent.music).toEqual(music({ startSeconds: 1 }));
  });

  it("rides on a post, which still parses without it", () => {
    const plain = project([video("v1")]);
    expect(PostProjectSchema.safeParse(plain).success).toBe(true);
    const withMusic = { ...plain, music: music() };
    expect(PostProjectSchema.parse(withMusic)).toEqual(withMusic);
    expect(
      PostProjectSchema.safeParse({ ...plain, music: music({ gain: 3 }) })
        .success
    ).toBe(false);
  });
});

describe("the numbers a post's music can hold", () => {
  const gridAt = (downbeatSeconds: number) => ({
    bpm: 85,
    downbeatSeconds,
    beatsPerBar: 4,
  });

  it("takes music up to four hours long", () => {
    expect(POST_MUSIC_MAX_SECONDS).toBe(4 * 60 * 60);
  });

  it.each([
    ["a bar 1 at 1e17 s", music({ grid: gridAt(1e17) })],
    ["a bar 1 at -1e17 s", music({ grid: gridAt(-1e17) })],
    [
      "a bar 1 just after the limit",
      music({ grid: gridAt(POST_MUSIC_MAX_SECONDS + 1) }),
    ],
    [
      "a bar 1 just before the limit",
      music({ grid: gridAt(-POST_MUSIC_MAX_SECONDS - 1) }),
    ],
    [
      "a file longer than the limit",
      music({ durationSeconds: POST_MUSIC_MAX_SECONDS + 1 }),
    ],
    [
      "a start after the limit",
      music({ startSeconds: POST_MUSIC_MAX_SECONDS + 1 }),
    ],
  ])("refuses %s", (_name, value) => {
    expect(PostMusicSchema.safeParse(value).success).toBe(false);
  });

  it("takes each limit itself, and a bar 1 before the file starts", () => {
    for (const value of [
      music({ grid: gridAt(POST_MUSIC_MAX_SECONDS) }),
      music({ grid: gridAt(-POST_MUSIC_MAX_SECONDS) }),
      music({ grid: gridAt(-12.5) }),
      music({
        durationSeconds: POST_MUSIC_MAX_SECONDS,
        sourceOutSeconds: POST_MUSIC_MAX_SECONDS,
      }),
      music({ startSeconds: POST_MUSIC_MAX_SECONDS }),
    ])
      expect(PostMusicSchema.safeParse(value).success).toBe(true);
  });

  it("makes a post that holds more invalid, so it does not load, as with any wrong music", () => {
    // Music is part of the post, which is read whole: a saved copy or a
    // feature video file with music outside these limits is not a post.
    const plain = project([video("v1")]);
    const file = (held: PostMusic) =>
      FeatureVideoFileSchema.safeParse({
        format: FEATURE_VIDEO_FILE_FORMAT,
        slug: "promo",
        title: "Promo",
        revision: 1,
        savedAt: NOW,
        project: { ...plain, music: held },
      }).success;
    expect(
      PostProjectSchema.safeParse({ ...plain, music: music() }).success
    ).toBe(true);
    expect(file(music())).toBe(true);
    for (const held of [
      music({ grid: gridAt(1e17) }),
      music({ durationSeconds: POST_MUSIC_MAX_SECONDS + 1 }),
      music({ startSeconds: 1e17 }),
    ]) {
      expect(
        PostProjectSchema.safeParse({ ...plain, music: held }).success
      ).toBe(false);
      expect(file(held)).toBe(false);
    }
  });
});
