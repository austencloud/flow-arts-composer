import { describe, expect, it } from "vitest";
import {
  previewPlaybackRate,
  shouldSeekPreviewVideo,
} from "$lib/shared/media-composition/services/video-preview-seek";

const playingState = {
  currentTime: 3,
  targetTime: 3.2,
  previousTargetTime: 3.18,
  playing: true,
  seeking: false,
  waiting: false,
  awaitingFrame: false,
  sinceLastCorrectionMs: Infinity,
};

describe("video preview synchronization", () => {
  it("corrects normal playback drift with rate, without restarting decoding", () => {
    expect(shouldSeekPreviewVideo(playingState)).toBe(false);
    expect(previewPlaybackRate(1, 0.2, false)).toBeCloseTo(1.08);
    expect(previewPlaybackRate(1, -0.2, false)).toBeCloseTo(0.92);
    expect(previewPlaybackRate(1, 0.01, false)).toBe(1);
  });

  it("bounds correction around the authored speed and rests while recovering", () => {
    expect(previewPlaybackRate(0.5, 1, false)).toBeCloseTo(0.575);
    expect(previewPlaybackRate(2, -1, false)).toBeCloseTo(1.7);
    expect(previewPlaybackRate(1, 1, true)).toBe(1);
  });

  it("waits for presented progress and a cooldown before a large drift seek", () => {
    const behind = {
      ...playingState,
      targetTime: 5.2,
      previousTargetTime: 5.18,
    };
    expect(shouldSeekPreviewVideo({ ...behind, seeking: true })).toBe(false);
    expect(shouldSeekPreviewVideo({ ...behind, waiting: true })).toBe(false);
    expect(shouldSeekPreviewVideo({ ...behind, awaitingFrame: true })).toBe(
      false
    );
    expect(
      shouldSeekPreviewVideo({ ...behind, sinceLastCorrectionMs: 2999 })
    ).toBe(false);
    expect(shouldSeekPreviewVideo(behind)).toBe(true);
  });

  it("seeks a deliberate source jump even during playback recovery", () => {
    expect(
      shouldSeekPreviewVideo({
        ...playingState,
        targetTime: 3.7,
        waiting: true,
        awaitingFrame: true,
        sinceLastCorrectionMs: 0,
      })
    ).toBe(true);
  });

  it("keeps paused scrubs exact but waits for an outstanding seek", () => {
    const paused = {
      ...playingState,
      playing: false,
      waiting: true,
      targetTime: 3.05,
    };
    expect(shouldSeekPreviewVideo(paused)).toBe(true);
    expect(shouldSeekPreviewVideo({ ...paused, seeking: true })).toBe(false);
    expect(shouldSeekPreviewVideo({ ...paused, targetTime: 3.02 })).toBe(false);
  });
});
