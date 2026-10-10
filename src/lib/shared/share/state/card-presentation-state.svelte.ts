import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  cardPresentationsEqual,
  normalizeCardPresentation,
  type CardPresentation,
} from "#lib/shared/share/domain/models/card-presentation.js";

interface CardPresentationStateInputs {
  getDefault: () => CardPresentation;
}

/** Viewer-session presentation state shared by Card and the final share draft. */
export function createCardPresentationState(
  inputs: CardPresentationStateInputs
) {
  let sequenceKey = "";
  let presentation = $state<CardPresentation>(
    normalizeCardPresentation(inputs.getDefault())
  );
  let baselinePresentation = $state<CardPresentation>(presentation);
  let saving = $state(false);

  function load(sequence: SequenceData): void {
    const nextKey = sequence.id || sequence.word || sequence.name || "sequence";
    if (sequenceKey === nextKey) return;

    sequenceKey = nextKey;
    const stored = sequence.cardPresentation
      ? normalizeCardPresentation(sequence.cardPresentation)
      : null;
    presentation = stored ?? normalizeCardPresentation(inputs.getDefault());
    baselinePresentation = presentation;
    saving = false;
  }

  function set(next: CardPresentation): void {
    presentation = normalizeCardPresentation(next);
  }

  function markSaved(next: CardPresentation): void {
    const normalized = normalizeCardPresentation(next);
    presentation = normalized;
    baselinePresentation = normalized;
  }

  return {
    get value() {
      return presentation;
    },
    get dirty() {
      return !cardPresentationsEqual(presentation, baselinePresentation);
    },
    get saving() {
      return saving;
    },
    set saving(value: boolean) {
      saving = value;
    },
    load,
    set,
    markSaved,
  };
}

export type CardPresentationState = ReturnType<
  typeof createCardPresentationState
>;
