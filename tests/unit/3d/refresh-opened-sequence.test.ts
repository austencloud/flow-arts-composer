import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import demo from "$lib/shared/landing/data/demo-sequence.json";
import {
  isOpenedSequence,
  refreshOpenedPerformers,
  sequence3DContentSignature,
  type SequenceRefreshPerformer,
} from "$lib/shared/3d/state/refresh-opened-sequence";

const previous = demo as unknown as SequenceData;
const joined = {
  ...previous,
  conjoined: { toward: "e", steps: 2 },
} as SequenceData;

function performer(
  sequence: SequenceData,
  playing: boolean
): SequenceRefreshPerformer {
  let loadedSequence = sequence;
  let step = 3;
  let progress = 0.42;
  let isPlaying = playing;
  return {
    get loadedSequence() {
      return loadedSequence;
    },
    get currentStepIndex() {
      return step;
    },
    get progress() {
      return progress;
    },
    get isPlaying() {
      return isPlaying;
    },
    loadSequence: vi.fn((next) => {
      loadedSequence = next;
      step = 0;
      progress = 0;
      isPlaying = false;
    }),
    goToStep: vi.fn((next) => {
      step = next;
      progress = 0;
    }),
    setProgress: vi.fn((next) => {
      progress = next;
    }),
    play: vi.fn(() => {
      isPlaying = true;
    }),
  };
}

describe("refresh opened 3D sequence", () => {
  it("detects sequence ID and path override changes", () => {
    expect(
      sequence3DContentSignature({ ...previous, id: "different" })
    ).not.toBe(sequence3DContentSignature(previous));
    const changedPath = {
      ...previous,
      steps: [
        {
          ...previous.steps[0],
          motions: {
            ...previous.steps[0].motions,
            left: {
              ...previous.steps[0].motions.left,
              pathShape: "concave" as const,
            },
          },
        },
        ...previous.steps.slice(1),
      ],
    };
    expect(sequence3DContentSignature(changedPath)).not.toBe(
      sequence3DContentSignature(previous)
    );
  });
  it("refreshes a same-ID join change while retaining beat, progress, and paused state", () => {
    const paused = performer({ ...previous }, false);
    const playing = performer({ ...previous }, true);
    const independent = performer({ ...previous, word: "independent" }, true);
    expect(isOpenedSequence(joined, previous)).toBe(false);

    refreshOpenedPerformers([paused, playing, independent], previous, joined);

    expect(paused.loadedSequence).toBe(joined);
    expect(paused.currentStepIndex).toBe(3);
    expect(paused.progress).toBe(0.42);
    expect(paused.isPlaying).toBe(false);
    expect(playing.isPlaying).toBe(true);
    expect(independent.loadedSequence.word).toBe("independent");
  });
});
