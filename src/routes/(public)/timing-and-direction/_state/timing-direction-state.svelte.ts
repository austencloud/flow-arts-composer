import { getContext, setContext, untrack } from "svelte";
import { TIMING_DIRECTION_MODES } from "$lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
import { TIMING_DIRECTION_ARTICLES } from "../_data/timing-direction-articles";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

export const timingDirectionPreviews = TIMING_DIRECTION_ARTICLES.map(
  (article) => ({
    article,
    motion: TIMING_DIRECTION_MODES.find(
      (mode) =>
        mode.timing === article.timing && mode.direction === article.direction
    )!,
    href: `/timing-and-direction/${article.slug}`,
  })
);

export function createTimingDirectionState(initialSlug?: string) {
  let selected = $state.raw(
    timingDirectionPreviews.find((mode) => mode.article.slug === initialSlug) ??
      timingDirectionPreviews.find((mode) => mode.article.code === "TS")!
  );
  let playing = $state(true);
  let step = $state(0);
  let target = $state.raw<HTMLElement | null>(null);
  let exampleSequence = $state.raw<SequenceData | null>(null);
  let seek: ((step: number) => void) | null = null;
  let pendingSeekStep = $state(0);
  let seekVersion = $state(0);
  let propDisplay = $state<"hands" | "staff">(
    selected.article.code === "TO" ? "staff" : "hands"
  );

  return {
    get selected() {
      return selected;
    },
    get playing() {
      return playing;
    },
    set playing(value: boolean) {
      playing = value;
    },
    get step() {
      return step;
    },
    get sequence() {
      return exampleSequence ?? selected.motion.sequence;
    },
    get pendingSeek() {
      return { step: pendingSeekStep, version: seekVersion };
    },
    followStep(value: number, sequenceId: string | null) {
      const sequence = exampleSequence ?? selected.motion.sequence;
      if (sequenceId === sequence.id) {
        step = value;
        if (
          (sequence.metadata as { turnLoopClosed?: boolean } | undefined)
            ?.turnLoopClosed === false &&
          value >= sequence.steps.length + 0.99
        ) {
          playing = false;
        }
      }
    },
    togglePlayback() {
      const sequence = exampleSequence ?? selected.motion.sequence;
      if (
        !playing &&
        (sequence.metadata as { turnLoopClosed?: boolean } | undefined)
          ?.turnLoopClosed === false &&
        step >= sequence.steps.length + 0.99
      ) {
        step = 0;
        pendingSeekStep = 0;
        seekVersion += 1;
        // Reset the engine before publishing play intent. Otherwise its retained
        // end frame can report once more after `playing` flips true and stop an
        // open loop before the deferred layout seek has reached the player.
        untrack(() => seek?.(0));
      }
      playing = !playing;
    },
    select(slug: string) {
      const next = timingDirectionPreviews.find(
        (mode) => mode.article.slug === slug
      );
      if (next) selected = next;
      propDisplay = selected.article.code === "TO" ? "staff" : "hands";
      exampleSequence = null;
      step = 0;
      pendingSeekStep = 0;
      seekVersion += 1;
    },
    selectExample(sequence: SequenceData, nextStep: number) {
      exampleSequence = sequence;
      step = nextStep;
      pendingSeekStep = nextStep;
      seekVersion += 1;
    },
    seekStep(nextStep: number) {
      step = nextStep;
      pendingSeekStep = nextStep;
      seekVersion += 1;
    },
    runPendingSeek() {
      seek?.(pendingSeekStep);
    },
    registerSeek(next: ((step: number) => void) | null) {
      seek = next;
      untrack(() => seek?.(pendingSeekStep));
    },
    get propDisplay() {
      return propDisplay;
    },
    set propDisplay(value: "hands" | "staff") {
      propDisplay = value;
    },
    get target() {
      return target;
    },
    registerTarget(node: HTMLElement) {
      target = node;
      return {
        destroy() {
          if (target === node) target = null;
        },
      };
    },
  };
}

type TimingDirectionState = ReturnType<typeof createTimingDirectionState>;
const contextKey = Symbol("timing-direction-player");
export function setTimingDirectionState(state: TimingDirectionState) {
  setContext(contextKey, state);
}
export function getTimingDirectionState(): TimingDirectionState {
  return getContext(contextKey);
}
