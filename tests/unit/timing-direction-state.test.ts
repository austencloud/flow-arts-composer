import { describe, expect, it } from "vitest";
import {
  createTimingDirectionState,
  timingDirectionPreviews,
} from "../../src/routes/(public)/timing-and-direction/_state/timing-direction-state.svelte";

describe("timing and direction playback continuity", () => {
  it("starts direct article visits on the requested mode", () => {
    for (const mode of timingDirectionPreviews) {
      expect(
        createTimingDirectionState(mode.article.slug).selected.article.code
      ).toBe(mode.article.code);
    }
  });

  it("restarts the loop on selection, keeps pause state, and ignores stale player callbacks", () => {
    const playback = createTimingDirectionState();
    const oldSequenceId = playback.selected.motion.sequence.id;
    playback.playing = false;
    playback.followStep(2.375, oldSequenceId);
    expect(playback.step).toBe(2.375);
    // Modes no longer share a step count, so selection restarts the new loop
    // from its first beat and bumps the seek version for the player.
    const { version } = playback.pendingSeek;
    playback.select("quarter-time-opposite-direction");
    expect(playback.step).toBe(0);
    expect(playback.pendingSeek).toEqual({ step: 0, version: version + 1 });
    playback.followStep(1.5, oldSequenceId);
    expect(playback.step).toBe(0);
    expect(playback.playing).toBe(false);
    playback.followStep(2.5, playback.selected.motion.sequence.id);
    expect(playback.step).toBe(2.5);
  });

  it("does not let an outgoing slot detach a newer route's slot", () => {
    const playback = createTimingDirectionState();
    const oldSlot = document.createElement("div");
    const newSlot = document.createElement("div");
    const oldRegistration = playback.registerTarget(oldSlot);
    const newRegistration = playback.registerTarget(newSlot);
    oldRegistration.destroy();
    expect(playback.target).toBe(newSlot);
    newRegistration.destroy();
    expect(playback.target).toBeNull();
  });

  it("keeps playback isolated between layout instances", () => {
    const first = createTimingDirectionState();
    const second = createTimingDirectionState();
    first.playing = false;
    first.select("quarter-time-same-direction");
    expect(second.playing).toBe(true);
    expect(second.selected.article.code).toBe("TS");
  });
});
