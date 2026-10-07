import { describe, expect, it } from "vitest";
import {
  PostMusicSchema,
  type PostMusic,
} from "$lib/shared/media-composition/domain/post-music";
import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { setProjectAudio } from "$lib/shared/media-composition/domain/post-project-edits";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
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
