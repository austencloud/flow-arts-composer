import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import {
  createTimingDirectionState,
  timingDirectionPreviews,
} from "../../src/routes/(public)/timing-and-direction/_state/timing-direction-state.svelte";

function sequenceFor(slug: string) {
  const preview = timingDirectionPreviews.find(
    (candidate) => candidate.article.slug === slug
  );
  if (!preview) throw new Error(`Missing timing/direction preview ${slug}`);
  return preview.motion.sequence;
}

describe("timing-direction playback commands", () => {
  it("rests an open prop loop at its end and replays from the beginning", () => {
    const state = createTimingDirectionState(
      "together-time-opposite-direction"
    );
    const sequence = {
      ...sequenceFor("together-time-opposite-direction"),
      id: "open-loop",
      metadata: { turnLoopClosed: false },
    };
    state.selectExample(sequence, 1);
    state.followStep(sequence.steps.length + 1, sequence.id);
    expect(state.playing).toBe(false);

    const seekPlaybackStates: boolean[] = [];
    state.registerSeek(() => seekPlaybackStates.push(state.playing));
    seekPlaybackStates.length = 0;

    state.togglePlayback();

    expect(seekPlaybackStates).toEqual([false]);
    expect(state.playing).toBe(true);
    expect(state.step).toBe(0);
    expect(state.pendingSeek.step).toBe(0);
  });

  it("switches prop display without resetting a selected sequence or its fractional playhead", () => {
    const state = createTimingDirectionState(
      "together-time-opposite-direction"
    );
    const sequence = sequenceFor("together-time-opposite-direction");
    state.selectExample(sequence, 1.625);
    const version = state.pendingSeek.version;
    expect(state.propDisplay).toBe("staff");
    state.propDisplay = "hands";
    expect(state.sequence).toBe(sequence);
    expect(state.step).toBe(1.625);
    expect(state.pendingSeek.version).toBe(version);
    state.propDisplay = "staff";
    expect(state.step).toBe(1.625);
    state.select("split-time-same-direction");
    expect(state.propDisplay).toBe("hands");
  });

  it("seeks within the active sequence and ignores frames from a retired sequence", () => {
    const state = createTimingDirectionState(
      "together-time-opposite-direction"
    );
    const sequence = {
      ...sequenceFor("together-time-opposite-direction"),
      id: "selected-loop",
    };
    const seek = vi.fn();
    state.registerSeek(seek);
    state.selectExample(sequence, 0);
    state.seekStep(2);
    state.runPendingSeek();
    expect(seek).toHaveBeenLastCalledWith(2);
    state.followStep(3.2, "retired-loop");
    expect(state.step).toBe(2);
    state.followStep(2.25, "selected-loop");
    expect(state.step).toBe(2.25);
  });

  it("publishes each selected example as one explicit seek command", () => {
    const state = createTimingDirectionState(
      "together-time-opposite-direction"
    );
    const seek = vi.fn(() => {
      void state.step;
    });

    flushSync();
    state.registerSeek(seek);
    flushSync();
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenLastCalledWith(0);

    const example = sequenceFor("together-time-opposite-direction");
    state.selectExample(example, 2);
    state.runPendingSeek();
    flushSync();
    expect(seek).toHaveBeenCalledTimes(2);
    expect(seek).toHaveBeenLastCalledWith(2);

    state.selectExample(example, 3);
    state.runPendingSeek();
    flushSync();
    expect(seek).toHaveBeenCalledTimes(3);
    expect(seek).toHaveBeenLastCalledWith(3);
  });

  it("clears an example command before another timing article mounts", () => {
    const state = createTimingDirectionState(
      "together-time-opposite-direction"
    );
    const seek = vi.fn();
    state.registerSeek(seek);

    state.selectExample(sequenceFor("together-time-opposite-direction"), 2);
    state.runPendingSeek();
    flushSync();
    state.select("split-time-same-direction");
    state.runPendingSeek();
    flushSync();

    expect(state.sequence.id).toBe(sequenceFor("split-time-same-direction").id);
    expect(state.step).toBe(0);
    expect(seek).toHaveBeenLastCalledWith(0);
  });
});
