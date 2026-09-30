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

  it("retries a stalled recovery once its new position is buffered", () => {
    const stalled = {
      ...playingState,
      currentTime: 3,
      targetTime: 8,
      previousTargetTime: 7.98,
      awaitingFrame: true,
      waiting: true,
      recoveryElapsedMs: 5000,
      targetBuffered: true,
    };
    expect(shouldSeekPreviewVideo(stalled)).toBe(true);
    expect(
      shouldSeekPreviewVideo({ ...stalled, recoveryElapsedMs: 2999 })
    ).toBe(false);
    expect(shouldSeekPreviewVideo({ ...stalled, targetBuffered: false })).toBe(
      false
    );
    expect(
      shouldSeekPreviewVideo({ ...stalled, sinceLastCorrectionMs: 2999 })
    ).toBe(false);
    expect(shouldSeekPreviewVideo({ ...stalled, seeking: true })).toBe(false);
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

  it("recovers missing presented frames even when the native clock keeps up", () => {
    const stalled = {
      ...playingState,
      currentTime: 8,
      targetTime: 8,
      previousTargetTime: 7.98,
      presentedTime: 4,
      sinceLastPresentedFrameMs: 3000,
      targetBuffered: true,
      visible: true,
    };
    expect(shouldSeekPreviewVideo(stalled)).toBe(true);
    expect(shouldSeekPreviewVideo({ ...stalled, presentedTime: null })).toBe(
      true
    );
    expect(
      shouldSeekPreviewVideo({ ...stalled, sinceLastPresentedFrameMs: 2999 })
    ).toBe(false);
    expect(shouldSeekPreviewVideo({ ...stalled, presentedTime: 7.99 })).toBe(
      false
    );
    expect(shouldSeekPreviewVideo({ ...stalled, targetBuffered: false })).toBe(
      false
    );
    expect(shouldSeekPreviewVideo({ ...stalled, visible: false })).toBe(false);
    expect(shouldSeekPreviewVideo({ ...stalled, playing: false })).toBe(false);
    expect(shouldSeekPreviewVideo({ ...stalled, seeking: true })).toBe(false);
    expect(
      shouldSeekPreviewVideo({ ...stalled, sinceLastCorrectionMs: 2999 })
    ).toBe(false);
  });
});
