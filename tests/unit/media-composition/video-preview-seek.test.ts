import { describe, expect, it } from "vitest";
import {
  FOLLOW_AHEAD_SECONDS,
  FOLLOW_WINDOW_MS,
  previewPlaybackRate,
  rememberFollowLead,
  shouldSeekPreviewVideo,
  type FollowLead,
} from "#lib/shared/media-composition/services/video-preview-seek.js";

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
  it("keeps playback at the authored speed without seeking ordinary drift", () => {
    expect(shouldSeekPreviewVideo(playingState)).toBe(false);
    for (const authoredRate of [0.25, 0.5, 1, 2, 4]) {
      expect(previewPlaybackRate(authoredRate)).toBe(authoredRate);
    }
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
    expect(
      shouldSeekPreviewVideo({
        ...playingState,
        targetTime: 3.05,
        discontinuity: true,
      })
    ).toBe(true);
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

  it("speeds footage up or slows it down to keep its place just ahead of sounding music", () => {
    const place = FOLLOW_AHEAD_SECONDS;
    expect(previewPlaybackRate(1, [place - 0.015])).toBeCloseTo(1.1);
    expect(previewPlaybackRate(1, [place + 0.015])).toBeCloseTo(0.9);
    expect(previewPlaybackRate(1, [place - 0.03])).toBeCloseTo(1.15);
    expect(previewPlaybackRate(1, [place - 0.009])).toBeCloseTo(1.05);
    // Level with the music is behind its place, so it moves ahead.
    expect(previewPlaybackRate(1, [0])).toBeGreaterThan(1);
    // A small slip waits; a changed speed holds until the clip is back.
    expect(previewPlaybackRate(1, [place - 0.005])).toBe(1);
    expect(previewPlaybackRate(1, [place - 0.005], true)).toBeCloseTo(1.05);
    expect(previewPlaybackRate(1, [place - 0.0005], true)).toBe(1);
    // One stalled reading among steady ones changes nothing.
    expect(previewPlaybackRate(1, [place, place - 0.02, place])).toBe(1);
    expect(previewPlaybackRate(1, [place, place - 0.02])).toBe(1);
    // The change is a share of the authored speed.
    expect(previewPlaybackRate(2, [place - 0.015])).toBeCloseTo(2.2);
    expect(previewPlaybackRate(0.5, [place + 0.03])).toBeCloseTo(0.425);
    expect(previewPlaybackRate(1, [])).toBe(1);
  });

  it("remembers a clip's readings for a short window", () => {
    let recent: FollowLead[] = [];
    recent = rememberFollowLead(recent, { atMs: 0, seconds: 0.01 });
    recent = rememberFollowLead(recent, {
      atMs: FOLLOW_WINDOW_MS - 1,
      seconds: 0.02,
    });
    expect(recent.map((entry) => entry.seconds)).toEqual([0.01, 0.02]);
    recent = rememberFollowLead(recent, {
      atMs: FOLLOW_WINDOW_MS,
      seconds: 0.03,
    });
    expect(recent.map((entry) => entry.seconds)).toEqual([0.02, 0.03]);
  });

  it("keeps muted footage within a frame of sounding music while its own clock loses time", () => {
    for (const authored of [0.5, 1, 2]) {
      let lead = 0;
      let rate = authored;
      let worst = 0;
      let recent: FollowLead[] = [];
      for (let frame = 1; frame <= 1800; frame += 1) {
        // Each sixtieth of a second the footage covers rate / authored of the
        // music's time, and its clock loses whole 20 ms steps: one every half
        // second for 15 s, then two a twentieth of a second apart each second.
        lead += (rate / authored - 1) / 60;
        const lost =
          frame <= 900
            ? frame % 30 === 0
            : frame % 60 === 0 || frame % 60 === 3;
        if (lost) lead -= 0.02;
        worst = Math.max(worst, Math.abs(lead));
        recent = rememberFollowLead(recent, {
          atMs: (frame * 1000) / 60,
          seconds: lead,
        });
        rate = previewPlaybackRate(
          authored,
          recent.map((entry) => entry.seconds),
          rate !== authored
        );
      }
      expect(worst).toBeLessThan(1 / 30);
    }
  });

  it("moves footage that follows sounding music back once it is a quarter second off", () => {
    const following = { ...playingState, following: true, playbackRate: 1 };
    expect(shouldSeekPreviewVideo(following)).toBe(false);
    const lost = { ...following, targetTime: 3.3, previousTargetTime: 3.28 };
    expect(shouldSeekPreviewVideo(lost)).toBe(true);
    // The usual guards still apply.
    expect(
      shouldSeekPreviewVideo({ ...lost, sinceLastCorrectionMs: 2999 })
    ).toBe(false);
    expect(shouldSeekPreviewVideo({ ...lost, waiting: true })).toBe(false);
    expect(shouldSeekPreviewVideo({ ...lost, awaitingFrame: true })).toBe(
      false
    );
    // A quarter second of post time is half a second of double-speed footage.
    const doubled = { ...following, playbackRate: 2 };
    expect(
      shouldSeekPreviewVideo({
        ...doubled,
        targetTime: 3.4,
        previousTargetTime: 3.36,
      })
    ).toBe(false);
    expect(
      shouldSeekPreviewVideo({
        ...doubled,
        targetTime: 3.6,
        previousTargetTime: 3.56,
      })
    ).toBe(true);
    // Footage that does not follow music keeps its two seconds.
    expect(shouldSeekPreviewVideo({ ...lost, following: false })).toBe(false);
  });
});
