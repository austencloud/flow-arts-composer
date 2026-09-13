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
