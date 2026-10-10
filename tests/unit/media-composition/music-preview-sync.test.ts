import { describe, expect, it, vi } from "vitest";
import {
  MUSIC_DRIFT_SECONDS,
  musicClockBoundaries,
  musicClockMedia,
  musicPreviewTarget,
  musicSoundsAt,
  shouldSeekMusic,
} from "#lib/shared/media-composition/services/music-preview-sync.js";

// The file plays from its 5 s at the post's 2 s, through its 35 s.
const placed = { startSeconds: 2, sourceInSeconds: 5, sourceOutSeconds: 35 };

describe("musicPreviewTarget", () => {
  it("follows the post clock inside the music", () => {
    expect(musicPreviewTarget(placed, 2)).toEqual({ seconds: 5, inside: true });
    expect(musicPreviewTarget(placed, 10)).toEqual({
      seconds: 13,
      inside: true,
    });
  });

  it("waits at the trimmed edges outside it", () => {
    expect(musicPreviewTarget(placed, 0)).toEqual({
      seconds: 5,
      inside: false,
    });
    expect(musicPreviewTarget(placed, 32)).toEqual({
      seconds: 35,
      inside: false,
    });
  });
});

describe("musicSoundsAt", () => {
  // The music's planned stretch: the post's 2 s to 8 s.
  const segment = {
    takeId: "music:music-1",
    postStartSeconds: 2,
    sourceInSeconds: 5,
    durationSeconds: 6,
  };

  it("is true from the stretch's first instant up to its last", () => {
    expect(musicSoundsAt(segment, 1.99)).toBe(false);
    expect(musicSoundsAt(segment, 2)).toBe(true);
    expect(musicSoundsAt(segment, 7.99)).toBe(true);
    expect(musicSoundsAt(segment, 8)).toBe(false);
  });

  it("is false without a planned stretch", () => {
    expect(musicSoundsAt(null, 4)).toBe(false);
  });
});

describe("shouldSeekMusic", () => {
  const steady = {
    currentTime: 10,
    targetTime: 10.2,
    previousTargetTime: 10.18,
    playing: true,
    seeking: false,
  };

  it("lets playing music run a little ahead or behind", () => {
    expect(shouldSeekMusic(steady)).toBe(false);
    expect(
      shouldSeekMusic({
        ...steady,
        targetTime: 10 + MUSIC_DRIFT_SECONDS + 0.01,
      })
    ).toBe(true);
  });

  it("lands within a frame after a jump, a pause or the first check", () => {
    expect(shouldSeekMusic({ ...steady, previousTargetTime: 4 })).toBe(true);
    expect(shouldSeekMusic({ ...steady, jumped: true })).toBe(true);
    expect(shouldSeekMusic({ ...steady, playing: false })).toBe(true);
    expect(shouldSeekMusic({ ...steady, previousTargetTime: null })).toBe(true);
    expect(
      shouldSeekMusic({ ...steady, playing: false, targetTime: 10.02 })
    ).toBe(false);
  });

  it("never seeks while a seek is running", () => {
    expect(shouldSeekMusic({ ...steady, playing: false, seeking: true })).toBe(
      false
    );
  });
});

describe("the music in the preview clock", () => {
  // The music's planned stretch: the post's 2 s to 8 s.
  const segment = {
    takeId: "music:music-1",
    postStartSeconds: 2,
    sourceInSeconds: 5,
    durationSeconds: 6,
  };
  const state = { currentTime: 9.02, ready: true, ended: false };

  it("sets the clock from the music's own time while it sounds", () => {
    expect(musicClockMedia(placed, segment, 6, () => state)).toEqual({
      ...state,
      targetTime: 9,
      playbackRate: 1,
    });
  });

  it("is left out, unread, while the music is silent", () => {
    const read = vi.fn(() => state);
    expect(musicClockMedia(placed, segment, 1, read)).toBeNull();
    expect(musicClockMedia(placed, segment, 8, read)).toBeNull();
    expect(musicClockMedia(placed, null, 4, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("stops a clock step at the music's first and last instants", () => {
    expect(musicClockBoundaries(segment)).toEqual([2, 8]);
    expect(musicClockBoundaries(null)).toEqual([]);
  });
});
