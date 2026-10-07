import { describe, expect, it } from "vitest";
import {
  POST_MUSIC_MAX_SECONDS,
  type PostMusic,
} from "$lib/shared/media-composition/domain/post-music";
import {
  POST_MUSIC_ID,
  removeMusic,
  setMusic,
  syncedSourceIn,
  trimMusic,
  updateMusic,
} from "$lib/shared/media-composition/domain/post-music-edits";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
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

const ctx = { now: NOW + 1 };
const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";
const OTHER = "/api/dev/feature-videos/promo/media/music/parsec.wav";
const GRID = { bpm: 85, downbeatSeconds: 0.42, beatsPerBar: 4 };

function withMusic(fields: Partial<PostMusic> = {}): PostProject {
  return { ...project([video("v1")]), music: music(fields) };
}

describe("setMusic", () => {
  it("puts a whole file under the post at full level", () => {
    const next = setMusic(
      project([video("v1")]),
      {
        url: URL,
        durationSeconds: 96.5,
        label: "Derail",
        artist: "Yellowbase",
      },
      ctx
    );
    expect(next.music).toEqual({
      id: POST_MUSIC_ID,
      url: URL,
      label: "Derail",
      artist: "Yellowbase",
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

  it("keeps the same file's place, trims, level, fades and grid", () => {
    const before = withMusic({
      startSeconds: 4,
      sourceInSeconds: 10,
      sourceOutSeconds: 70,
      gain: 0.7,
      fadeOutSeconds: 3,
      grid: GRID,
    });
    const next = setMusic(
      before,
      { url: URL, durationSeconds: 60, label: "Derail" },
      ctx
    );
    expect(next.music).toMatchObject({
      startSeconds: 4,
      sourceInSeconds: 10,
      sourceOutSeconds: 60,
      durationSeconds: 60,
      gain: 0.7,
      fadeOutSeconds: 3,
      grid: GRID,
    });
  });

  it("starts a different file over, keeping the music's id", () => {
    const before = withMusic({ startSeconds: 4, gain: 0.7, grid: GRID });
    const next = setMusic(
      before,
      { url: OTHER, durationSeconds: 80, label: "PARSEC" },
      ctx
    );
    expect(next.music).toEqual({
      id: "music-1",
      url: OTHER,
      label: "PARSEC",
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 80,
      durationSeconds: 80,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    });
  });

  it("changes nothing when the same file comes back as it was", () => {
    const before = withMusic();
    expect(
      setMusic(before, { url: URL, durationSeconds: 120, label: "Derail" }, ctx)
    ).toBe(before);
  });
});

describe("updateMusic", () => {
  it("fits each value into range", () => {
    const next = updateMusic(
      withMusic(),
      {
        gain: 5,
        fadeInSeconds: 500,
        sourceInSeconds: -3,
        sourceOutSeconds: 999,
        startSeconds: -1,
      },
      ctx
    );
    expect(next.music).toMatchObject({
      gain: 2,
      fadeInSeconds: 120,
      sourceInSeconds: 0,
      sourceOutSeconds: 120,
      startSeconds: 0,
    });
  });

  it("keeps a moved start before the end", () => {
    const next = updateMusic(withMusic(), { sourceInSeconds: 200 }, ctx);
    expect(next.music!.sourceInSeconds).toBeCloseTo(119.9, 9);
    expect(next.music!.sourceOutSeconds).toBe(120);
  });

  it("makes a grid from a BPM, starting at the music's first sound", () => {
    const next = updateMusic(
      withMusic({ sourceInSeconds: 3 }),
      { bpm: 85 },
      ctx
    );
    expect(next.music!.grid).toEqual({
      bpm: 85,
      downbeatSeconds: 3,
      beatsPerBar: 4,
    });
  });

  it("changes the grid and clears it", () => {
    const gridded = withMusic({ grid: GRID });
    expect(
      updateMusic(gridded, { downbeatSeconds: 0.5, beatsPerBar: 3.6 }, ctx)
        .music!.grid
    ).toEqual({ bpm: 85, downbeatSeconds: 0.5, beatsPerBar: 4 });
    expect(
      updateMusic(gridded, { beatsPerBar: 0 }, ctx).music!.grid!.beatsPerBar
    ).toBe(1);
    expect(
      updateMusic(gridded, { bpm: null }, ctx).music!.grid
    ).toBeUndefined();
  });

  it("ignores a downbeat when there is no grid", () => {
    const before = withMusic();
    expect(updateMusic(before, { downbeatSeconds: 1 }, ctx)).toBe(before);
  });

  it("fits bar 1 into the file's length, before its start or after it", () => {
    const gridded = withMusic({ grid: GRID });
    const downbeat = (seconds: number) =>
      updateMusic(gridded, { downbeatSeconds: seconds }, ctx).music!.grid!
        .downbeatSeconds;
    expect(downbeat(1e17)).toBe(120);
    expect(downbeat(-1e17)).toBe(-120);
    expect(downbeat(121)).toBe(120);
    // Inside the file's length, either side of its start, it stays as given.
    expect(downbeat(-0.25)).toBe(-0.25);
    expect(downbeat(119.5)).toBe(119.5);
  });

  it("fits the bar 1 of a grid made in the same edit", () => {
    expect(
      updateMusic(withMusic(), { bpm: 85, downbeatSeconds: 1e17 }, ctx).music!
        .grid
    ).toEqual({ bpm: 85, downbeatSeconds: 120, beatsPerBar: 4 });
  });

  it("keeps the start within the longest music a post takes", () => {
    const start = (seconds: number) =>
      updateMusic(withMusic(), { startSeconds: seconds }, ctx).music!
        .startSeconds;
    expect(start(1e17)).toBe(POST_MUSIC_MAX_SECONDS);
    expect(start(90)).toBe(90);
  });

  it("keeps a label, and clears an artist or license left blank", () => {
    const before = withMusic({ artist: "Yellowbase", license: "Trial" });
    expect(updateMusic(before, { label: "   " }, ctx)).toBe(before);
    const next = updateMusic(before, { artist: "  ", license: null }, ctx);
    expect(next.music!.artist).toBeUndefined();
    expect(next.music!.license).toBeUndefined();
    expect(
      updateMusic(before, { license: " Pro, 2026-10-07 " }, ctx).music!.license
    ).toBe("Pro, 2026-10-07");
  });

  it("changes nothing when every value is the one it has", () => {
    const before = withMusic({ grid: GRID });
    expect(updateMusic(before, { gain: 1, bpm: 85 }, ctx)).toBe(before);
    const silent = project([video("v1")]);
    expect(updateMusic(silent, { gain: 0.5 }, ctx)).toBe(silent);
  });
});

describe("trimMusic", () => {
  const placed = () =>
    withMusic({ startSeconds: 2, sourceInSeconds: 5, sourceOutSeconds: 35 });

  it("trims the opening, leaving the end where it sounds", () => {
    const next = trimMusic(placed(), "start", 4, ctx).music!;
    expect(next).toMatchObject({
      startSeconds: 4,
      sourceInSeconds: 7,
      sourceOutSeconds: 35,
    });
  });

  it("stops the opening at the file's first second and near the end", () => {
    expect(trimMusic(placed(), "start", -10, ctx).music).toMatchObject({
      startSeconds: 0,
      sourceInSeconds: 3,
    });
    const late = trimMusic(placed(), "start", 40, ctx).music!;
    expect(late.startSeconds).toBeCloseTo(31.9, 9);
    expect(late.sourceInSeconds).toBeCloseTo(34.9, 9);
  });

  it("trims the close, inside the file", () => {
    expect(trimMusic(placed(), "end", 20, ctx).music!.sourceOutSeconds).toBe(
      23
    );
    expect(trimMusic(placed(), "end", 1000, ctx).music!.sourceOutSeconds).toBe(
      120
    );
    expect(
      trimMusic(placed(), "end", 0, ctx).music!.sourceOutSeconds
    ).toBeCloseTo(5.1, 9);
  });
});

describe("removeMusic and syncedSourceIn", () => {
  it("removes the music, and changes nothing without it", () => {
    expect(removeMusic(withMusic(), ctx).music).toBeUndefined();
    const silent = project([video("v1")]);
    expect(removeMusic(silent, ctx)).toBe(silent);
  });

  it("finds the take second that sounds with the music where the clip sits", () => {
    // At the post's 10 s the music plays its 13 s; the camera started 3 s
    // into the music, so the take must be at its own 10 s.
    expect(
      syncedSourceIn({ startSeconds: 2, sourceInSeconds: 5 }, { start: 10 }, 3)
    ).toBe(10);
  });
});
