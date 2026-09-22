import type { Step } from "@tka/tka-types";
import type { SequenceData } from "../domain/models/sequence-data";
import type { StepPairingData } from "../domain/models/step-pairing-data";
import { renderWordNotation, type WordUnit } from "../utils/word-notation";
import { isSkewedFrameStep, type FrameStepLike } from "./skewed-frame";

/** One resolved letter paired with its skew flag, for the four token sites below. */
const skewUnit = (letter: string, step: FrameStepLike): WordUnit => ({
  letter,
  skewed: isSkewedFrameStep(step),
});

/**
 * A beat with no letter contributes no unit to the word, so braces merge
 * across it: two skewed beats separated by an unlettered beat still share one
 * span, because the braces describe adjacency in the resolved word, not
 * adjacency of beats in the sequence.
 */
export function deriveWordFromBeats(steps: readonly Step[]): string {
  if (!steps || steps.length === 0) return "";

  const units: WordUnit[] = [];
  for (const step of steps) {
    const letter = step.letter ?? "";
    if (letter === "") continue;
    units.push(skewUnit(letter, step));
  }
  return renderWordNotation(units);
}

export function deriveWord(sequence: SequenceData): string {
  // First try to derive from steps (single source of truth when hydrated)
  if (sequence.steps && sequence.steps.length > 0) {
    const derived = deriveWordFromBeats(sequence.steps);
    if (derived) return derived;
  }

  // Steps aren't persisted to Firestore - they're derived at load time by the
  // hydrator. If hydration hasn't run yet, stepPairings still has the letters.
  if (sequence.stepPairings && sequence.stepPairings.length > 0) {
    const units: WordUnit[] = [];
    for (const pairing of sequence.stepPairings) {
      const letter = pairing.letter ?? "";
      if (letter === "") continue;
      units.push(skewUnit(letter, pairing));
    }
    const derived = renderWordNotation(units);
    if (derived) return derived;
  }

  // Fallback to stored word or name (for sequences without loaded steps)
  return sequence.word || sequence.name || "";
}

/**
 * Priority: displayName > intendedWord > word > name > id
 */
export function getSequenceDisplayName(sequence: SequenceData): string {
  if (sequence.displayName) return sequence.displayName;
  if (sequence.intendedWord) return sequence.intendedWord;
  return deriveWord(sequence) || sequence.name || sequence.id;
}

// Strict derivation — the persistence gate
//
// deriveWord() above is a *display* helper: it drops unlettered steps and falls
// back to name, which is right for a label and catastrophic for storage. A
// 12-beat sequence with two unresolved steps produced a plausible 10-token word
// that sailed into Firestore — the "GI" defect (see
// features/fuse/services/__tests__/fused-word-derivation.test.ts).
//
// The strict API below reports what the permissive one hides. Persistence and
// shortcode minting call this; labels keep calling deriveWord().
//
// Three step categories, and conflating them is how this goes wrong:
//
//   1. Start-position entry — structurally letterless, NOT a missing beat.
//      Legacy raw `steps` blobs carry it as `stepNumber === 0`
//      (public-sequences-loader filters exactly that). Modern compositional
//      sequences have no such entry at all: sequence-hydrator derives
//      `startPlacement` FROM steps[0], which is a real content beat. Both shapes
//      are live in the corpus, so we drop stepNumber 0 when present and treat
//      its absence as normal.
//   2. Intentional blank — `isBlank`, honored elsewhere (deck-composer skips
//      them). Contributes no token and is NOT a derivation failure. Whether a
//      blank may be PERSISTED is a separate policy owned by
//      sequence-persistence-normalizer, which currently refuses blanks because
//      the flag does not survive the round trip (extractStepPairings drops it;
//      step-deriver rebuilds every step with isBlank: false).
//   3. Unresolved beat — a content step whose letter never derived. THIS is the
//      one that must stop a write.

export interface WordDerivationStatus {
  /**
   * Notation word in beat order, skewed spans in braces. An unlettered beat
   * contributes no unit, so a span merges across it. Empty when nothing resolved.
   */
  readonly word: string;
  /** True when every content beat produced a token. The persistence gate. */
  readonly complete: boolean;
  /** Content beats considered — excludes the start-placement entry. */
  readonly stepCount: number;
  /** Resolved tokens. Equals stepCount only when complete and nothing is blank. */
  readonly tokenCount: number;
  /** Indexes (into the content-beat list, 0-based) that resolved no letter. */
  readonly missingStepIndexes: readonly number[];
  /** Indexes of deliberate blanks — excluded from missing, not a failure. */
  readonly blankStepIndexes: readonly number[];
  readonly source: "steps" | "stepPairings" | "none";
}

/** Thrown by requireCompleteWord when a sequence cannot be safely persisted. */
export class IncompleteWordError extends Error {
  readonly code = "INCOMPLETE_WORD" as const;
  constructor(readonly status: WordDerivationStatus) {
    super(
      `Word derivation incomplete: ${status.tokenCount}/${status.stepCount} beats resolved` +
        (status.missingStepIndexes.length > 0
          ? ` (unresolved beats: ${status.missingStepIndexes.join(", ")})`
          : "")
    );
    this.name = "IncompleteWordError";
  }
}

/** A token counts only when it is a non-empty, non-whitespace string. */
function tokenOf(letter: unknown): string | null {
  if (typeof letter !== "string") return null;
  const trimmed = letter.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function emptyStatus(source: WordDerivationStatus["source"]): WordDerivationStatus {
  return {
    word: "",
    complete: false,
    stepCount: 0,
    tokenCount: 0,
    missingStepIndexes: [],
    blankStepIndexes: [],
    source,
  };
}

/**
 * Strict derivation over hydrated steps. Drops a `stepNumber === 0` start entry
 * when one is present; every remaining step owes a token.
 */
export function deriveWordStatusFromSteps(
  steps: readonly Step[]
): WordDerivationStatus {
  if (!steps || steps.length === 0) return emptyStatus("none");

  const beats = steps.filter((step) => step.stepNumber !== 0);
  if (beats.length === 0) return emptyStatus("none");

  const tokens: WordUnit[] = [];
  const missingStepIndexes: number[] = [];
  const blankStepIndexes: number[] = [];

  beats.forEach((step, index) => {
    if (step.isBlank) {
      blankStepIndexes.push(index);
      return;
    }
    const token = tokenOf(step.letter);
    if (token === null) {
      missingStepIndexes.push(index);
      return;
    }
    tokens.push(skewUnit(token, step));
  });

  return {
    word: renderWordNotation(tokens),
    complete: missingStepIndexes.length === 0,
    stepCount: beats.length,
    tokenCount: tokens.length,
    missingStepIndexes,
    blankStepIndexes,
    source: "steps",
  };
}

/**
 * Strict derivation over compositional pairings, for a sequence that has not
 * been hydrated yet.
 *
 * EVERY pairing is a content beat. Pairings are extracted 1:1 from steps
 * (sequence-decomposer.extractStepPairings) and carry no stepNumber, so a start
 * entry could only ever be guessed at — and the modern write path never produces
 * one, because ensureComposition derives `startPlacement` as its own field from
 * steps[0], which is itself a content beat.
 *
 * So a leading null letter is NOT treated as a start entry. Guessing would
 * silently swallow a genuinely unresolved FIRST beat — precisely the silent-drop
 * failure this module exists to stop — and would desync stepCount from
 * getPersistedStepCount, which counts pairings raw.
 *
 * This fails closed by design: the worst case is a false "incomplete", which
 * blocks a write and gets reported. A false "complete" would corrupt data.
 */
export function deriveWordStatusFromStepPairings(
  stepPairings: readonly StepPairingData[]
): WordDerivationStatus {
  if (!stepPairings || stepPairings.length === 0) return emptyStatus("none");

  const beats = stepPairings;
  const tokens: WordUnit[] = [];
  const missingStepIndexes: number[] = [];

  beats.forEach((pairing, index) => {
    const token = tokenOf(pairing.letter);
    if (token === null) {
      missingStepIndexes.push(index);
      return;
    }
    tokens.push(skewUnit(token, pairing));
  });

  return {
    word: renderWordNotation(tokens),
    complete: missingStepIndexes.length === 0,
    stepCount: beats.length,
    tokenCount: tokens.length,
    missingStepIndexes,
    blankStepIndexes: [],
    source: "stepPairings",
  };
}

/**
 * Strict derivation for a whole sequence.
 *
 * Prefers hydrated steps. Falls back to stepPairings ONLY when steps are absent
 * — never when steps exist but are incomplete, which would let a complete-looking
 * pairing list paper over unresolved hydrated beats.
 *
 * Never consults `word`, `name`, `displayName`, or `intendedWord`.
 */
export function deriveWordStatus(sequence: SequenceData): WordDerivationStatus {
  if (sequence.steps && sequence.steps.length > 0) {
    return deriveWordStatusFromSteps(sequence.steps);
  }
  if (sequence.stepPairings && sequence.stepPairings.length > 0) {
    return deriveWordStatusFromStepPairings(sequence.stepPairings);
  }
  return emptyStatus("none");
}

/**
 * The persistence gate: the exact word, or a typed refusal.
 *
 * Call this anywhere a word is about to be written to Firestore or baked into a
 * shortcode. Throws IncompleteWordError rather than storing a partial word.
 */
export function requireCompleteWord(sequence: SequenceData): string {
  const status = deriveWordStatus(sequence);
  if (!status.complete || status.word.length === 0) {
    throw new IncompleteWordError(status);
  }
  return status.word;
}
