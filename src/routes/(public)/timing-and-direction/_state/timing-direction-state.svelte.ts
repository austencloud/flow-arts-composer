import { getContext, setContext } from "svelte";
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
  let seek = $state.raw<((step: number) => void) | null>(null);
  let seekStep = $state(0);
  let seekVersion = $state(0);

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
      return { step: seekStep, version: seekVersion };
    },
    followStep(value: number, sequenceId: string | null) {
      if (sequenceId === (exampleSequence ?? selected.motion.sequence).id) {
        step = value;
      }
    },
    select(slug: string) {
      const next = timingDirectionPreviews.find(
        (mode) => mode.article.slug === slug
      );
      if (next) selected = next;
      exampleSequence = null;
      step = 0;
    },
    selectExample(sequence: SequenceData, nextStep: number) {
      exampleSequence = sequence;
      step = nextStep;
      seekStep = nextStep;
      seekVersion += 1;
    },
    runPendingSeek() {
      seek?.(seekStep);
    },
    registerSeek(next: ((step: number) => void) | null) {
      seek = next;
      seek?.(seekStep);
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
