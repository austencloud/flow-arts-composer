/**
 * Strict word derivation — the persistence gate.
 *
 * Regression cover for the "GI" defect (2026-07-08): a 12-step fused sequence
 * whose word saved as "GI" because the permissive deriver silently dropped every
 * step that resolved no letter. The existing Fuse test proves the letters derive;
 * these prove a PARTIAL derivation can no longer reach storage.
 *
 * Also pins the two corpus step-array shapes apart:
 *   - legacy raw `steps` with a `stepNumber === 0` start entry (letterless by design)
 *   - modern compositional steps with no start entry at all
 * Conflating either with an unresolved step breaks publishing.
 */
import { describe, it, expect } from "vitest";
import {
  deriveWordStatus,
  deriveWordStatusFromSteps,
  deriveWordStatusFromStepPairings,
  requireCompleteWord,
  IncompleteWordError,
  deriveWord,
  deriveWordFromBeats,
} from "../word-deriver";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getPersistedStepCount } from "$lib/shared/library/domain/sequence-min-length";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StepPairingData } from "$lib/shared/foundation/domain/models/step-pairing-data";

const motion = () =>
  createMotionData({
    motionType: "pro" as const,
    rotationDirection: "cw" as const,
    startLocation: "n" as const,
    endLocation: "e" as const,
    turns: 0,
    startOrientation: "in" as const,
    endOrientation: "in" as const,
  });

/** One content step. `letter: null` models a step whose lookup never resolved. */
function step(
  stepNumber: number,
  letter: string | null,
  extra: Partial<StepData> = {}
): StepData {
  return {
    id: `s${stepNumber}`,
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter,
    startPlacement: null,
    endPlacement: null,
    motions: { left: motion(), right: motion() },
    ...extra,
  } as StepData;
}

/** The legacy start-placement entry: stepNumber 0, letterless by design. */
const startStep = () => step(0, null);

function pairing(
  letter: string | null,
  extra: Partial<StepPairingData> = {}
): StepPairingData {
  return {
    letter: letter as StepPairingData["letter"],
    leftReversal: false,
    rightReversal: false,
    startPlacement: null,
    endPlacement: null,
    ...extra,
  };
}

const lettersOf = (word: string) => word.split("");

describe("deriveWordStatusFromSteps", () => {
  it("reports every step resolved for a complete sequence", () => {
    const steps = lettersOf("IIECCKIIECCK").map((l, i) => step(i + 1, l));
    const status = deriveWordStatusFromSteps(steps);

    expect(status.word).toBe("IIECCKIIECCK");
    expect(status.complete).toBe(true);
    expect(status.stepCount).toBe(12);
    expect(status.tokenCount).toBe(12);
    expect(status.missingStepIndexes).toEqual([]);
    expect(status.source).toBe("steps");
  });

  it("12 steps with one missing letter is incomplete, not an 11-token success", () => {
    const steps = lettersOf("IIECCKIIECCK").map((l, i) =>
      step(i + 1, i === 3 ? null : l)
    );
    const status = deriveWordStatusFromSteps(steps);

    expect(status.complete).toBe(false);
    expect(status.stepCount).toBe(12);
    expect(status.tokenCount).toBe(11);
    expect(status.missingStepIndexes).toEqual([3]);
  });

  it("the historical GI case: 10 of 12 unresolved never yields a 2-token word", () => {
    // The shape that produced "GI": most steps unresolved, two survivors.
    const steps = lettersOf("IIECCKIIECCK").map((l, i) =>
      step(i + 1, i === 0 ? "G" : i === 1 ? "I" : null)
    );
    const status = deriveWordStatusFromSteps(steps);

    // The permissive helper still happily returns the junk word...
    expect(deriveWord(createSequenceData({ id: "x", steps }))).toBe("GI");
    // ...the strict one refuses it.
    expect(status.complete).toBe(false);
    expect(status.tokenCount).toBe(2);
    expect(status.stepCount).toBe(12);
    expect(status.missingStepIndexes).toHaveLength(10);
  });

  it("drops a legacy stepNumber-0 start entry instead of calling it a missing step", () => {
    const steps = [startStep(), ...lettersOf("ABC").map((l, i) => step(i + 1, l))];
    const status = deriveWordStatusFromSteps(steps);

    expect(status.complete).toBe(true);
    expect(status.word).toBe("ABC");
    expect(status.stepCount).toBe(3);
    expect(status.missingStepIndexes).toEqual([]);
  });

  it("modern compositional steps carry no start entry and still validate", () => {
    const steps = lettersOf("ABC").map((l, i) => step(i + 1, l));
    expect(deriveWordStatusFromSteps(steps).stepCount).toBe(3);
    expect(deriveWordStatusFromSteps(steps).complete).toBe(true);
  });

  it("missing indexes are reported against content steps, not the raw array", () => {
    // With a start entry present, a null at raw index 2 is content step 1.
    const steps = [startStep(), step(1, "A"), step(2, null), step(3, "C")];
    expect(deriveWordStatusFromSteps(steps).missingStepIndexes).toEqual([1]);
  });

  it("treats an intentional blank as neither a token nor a failure", () => {
    const steps = [
      step(1, "A"),
      step(2, null, { isBlank: true }),
      step(3, "C"),
    ];
    const status = deriveWordStatusFromSteps(steps);

    expect(status.complete).toBe(true);
    expect(status.word).toBe("AC");
    expect(status.blankStepIndexes).toEqual([1]);
    expect(status.missingStepIndexes).toEqual([]);
  });

  it("treats a whitespace-only letter as unresolved", () => {
    const status = deriveWordStatusFromSteps([step(1, "A"), step(2, "   ")]);
    expect(status.complete).toBe(false);
    expect(status.missingStepIndexes).toEqual([1]);
  });

  it("preserves token order and multi-character glyphs", () => {
    const steps = ["Σ-", "W-", "Φ"].map((l, i) => step(i + 1, l));
    expect(deriveWordStatusFromSteps(steps).word).toBe("Σ-W-Φ");
  });

  it("an empty array, or one containing only a start entry, resolves to none", () => {
    expect(deriveWordStatusFromSteps([]).source).toBe("none");
    expect(deriveWordStatusFromSteps([startStep()]).source).toBe("none");
    expect(deriveWordStatusFromSteps([startStep()]).complete).toBe(false);
  });
});

describe("deriveWordStatusFromStepPairings", () => {
  it("derives from pairings when steps have not been hydrated", () => {
    const status = deriveWordStatusFromStepPairings(
      lettersOf("ABC").map((l) => pairing(l))
    );
    expect(status.word).toBe("ABC");
    expect(status.complete).toBe(true);
    expect(status.source).toBe("stepPairings");
  });

  it("treats every pairing as a content step: a leading null is a missing step", () => {
    // Never guess that a leading null is a start entry: the modern write path
    // does not emit one, so guessing would swallow an unresolved first step.
    const status = deriveWordStatusFromStepPairings([
      pairing(null),
      pairing("A"),
      pairing(null),
      pairing("C"),
    ]);
    expect(status.stepCount).toBe(4);
    expect(status.complete).toBe(false);
    expect(status.missingStepIndexes).toEqual([0, 2]);
  });

  it("stepCount matches getPersistedStepCount, which counts pairings raw", () => {
    const pairings = lettersOf("ABC").map((l) => pairing(l));
    const sequence = createSequenceData({ id: "x", steps: [], stepPairings: pairings });
    expect(deriveWordStatusFromStepPairings(pairings).stepCount).toBe(
      getPersistedStepCount(sequence)
    );
  });
});

describe("deriveWordStatus (sequence level)", () => {
  it("prefers hydrated steps over pairings", () => {
    const sequence = createSequenceData({
      id: "x",
      steps: lettersOf("ABC").map((l, i) => step(i + 1, l)),
      stepPairings: lettersOf("XYZ").map((l) => pairing(l)),
    });
    const status = deriveWordStatus(sequence);
    expect(status.source).toBe("steps");
    expect(status.word).toBe("ABC");
  });

  it("does NOT fall back to complete-looking pairings when steps are incomplete", () => {
    // The dangerous case: hydration half-failed, but the stored pairings still
    // look whole. Falling back here would launder a broken sequence.
    const sequence = createSequenceData({
      id: "x",
      steps: [step(1, "A"), step(2, null), step(3, "C")],
      stepPairings: lettersOf("ABC").map((l) => pairing(l)),
    });
    const status = deriveWordStatus(sequence);

    expect(status.source).toBe("steps");
    expect(status.complete).toBe(false);
    expect(status.missingStepIndexes).toEqual([1]);
  });

  it("uses pairings only when steps are absent", () => {
    const sequence = createSequenceData({
      id: "x",
      steps: [],
      stepPairings: lettersOf("ABC").map((l) => pairing(l)),
    });
    expect(deriveWordStatus(sequence).source).toBe("stepPairings");
  });

  it("never consults word, name, displayName or intendedWord", () => {
    const sequence = createSequenceData({
      id: "x",
      steps: [],
      word: "SHOULDNOTAPPEAR",
      name: "Assemble Sequence",
      displayName: "My Cool Sequence",
      intendedWord: "NOPE",
    });
    const status = deriveWordStatus(sequence);

    expect(status.word).toBe("");
    expect(status.complete).toBe(false);
    expect(status.source).toBe("none");
  });
});

describe("requireCompleteWord", () => {
  it("returns the exact word for a complete sequence", () => {
    const sequence = createSequenceData({
      id: "x",
      steps: lettersOf("IIECCKIIECCK").map((l, i) => step(i + 1, l)),
    });
    expect(requireCompleteWord(sequence)).toBe("IIECCKIIECCK");
  });

  it("throws a typed error carrying the unresolved step indexes", () => {
    const sequence = createSequenceData({
      id: "x",
      steps: [step(1, "A"), step(2, null), step(3, "C")],
    });

    expect(() => requireCompleteWord(sequence)).toThrow(IncompleteWordError);
    try {
      requireCompleteWord(sequence);
    } catch (error) {
      const typed = error as IncompleteWordError;
      expect(typed.code).toBe("INCOMPLETE_WORD");
      expect(typed.status.missingStepIndexes).toEqual([1]);
      expect(typed.message).toContain("2/3");
    }
  });

  it("refuses an auto-name masquerading as a word", () => {
    // library-repository:708 does `word: sequence.word || metadata.name`, which
    // is how "Assemble Sequence" became a stored word. Strict derivation has no
    // path to it at all.
    const sequence = createSequenceData({
      id: "x",
      steps: [],
      name: "Assemble Sequence",
      word: "Assemble Sequence",
    });
    expect(() => requireCompleteWord(sequence)).toThrow(IncompleteWordError);
  });

  it("refuses a sequence with no steps and no pairings", () => {
    expect(() => requireCompleteWord(createSequenceData({ id: "x", steps: [] })))
      .toThrow(IncompleteWordError);
  });
});

describe("skewed spans in the derived word", () => {
  const skewedMotions = () => ({
    left: createMotionData({
      motionType: "pro" as const,
      rotationDirection: "cw" as const,
      startLocation: "n" as const,
      endLocation: "e" as const,
      turns: 0,
      startOrientation: "in" as const,
      endOrientation: "in" as const,
    }),
    right: createMotionData({
      motionType: "pro" as const,
      rotationDirection: "cw" as const,
      startLocation: "ne" as const,
      endLocation: "se" as const,
      turns: 0,
      startOrientation: "in" as const,
      endOrientation: "in" as const,
    }),
  });

  it("wraps consecutive skewed steps in one brace pair", () => {
    const steps = [
      step(1, "A"),
      step(2, "S", { motions: skewedMotions() }),
      step(3, "T", { motions: skewedMotions() }),
      step(4, "G"),
    ];
    expect(deriveWordFromBeats(steps)).toBe("A{ST}G");
    const status = deriveWordStatusFromSteps(steps);
    expect(status.word).toBe("A{ST}G");
    expect(status.complete).toBe(true);
    expect(status.tokenCount).toBe(4);
  });

  it("reads skewed pairings from their placements", () => {
    const pairings = [
      pairing("A", { startPlacement: "alpha1", endPlacement: "alpha3" }),
      pairing("U", { startPlacement: "eta2", endPlacement: "eta4" }),
      pairing("S", { startPlacement: "eta4", endPlacement: "eta6" }),
    ];
    expect(deriveWordStatusFromStepPairings(pairings).word).toBe("A{US}");
    expect(deriveWord(createSequenceData({ steps: [], stepPairings: pairings }))).toBe("A{US}");
  });

  it("merges skewed spans across an unlettered beat", () => {
    const steps = [
      step(1, "S", { motions: skewedMotions() }),
      step(2, null),
      step(3, "T", { motions: skewedMotions() }),
    ];
    expect(deriveWordFromBeats(steps)).toBe("{ST}");
    const status = deriveWordStatusFromSteps(steps);
    expect(status.complete).toBe(false);
    expect(status.missingStepIndexes).toEqual([1]);
  });

  it("agrees with the pairings source for the same beats, motions or placements", () => {
    const steps = [
      step(1, "A", { startPlacement: "alpha1", endPlacement: "alpha3" }),
      step(2, "S", { motions: skewedMotions(), startPlacement: "eta2", endPlacement: "eta4" }),
      step(3, "G", { startPlacement: "alpha5", endPlacement: "alpha7" }),
    ];
    const pairings = [
      pairing("A", { startPlacement: "alpha1", endPlacement: "alpha3" }),
      pairing("S", { startPlacement: "eta2", endPlacement: "eta4" }),
      pairing("G", { startPlacement: "alpha5", endPlacement: "alpha7" }),
    ];

    expect(deriveWordStatusFromSteps(steps).word).toBe(
      deriveWordStatusFromStepPairings(pairings).word
    );
    expect(deriveWord(createSequenceData({ steps, stepPairings: [] }))).toBe(
      deriveWord(createSequenceData({ steps: [], stepPairings: pairings }))
    );
  });

  it("wraps a leading skewed span that ends before the last beat", () => {
    const steps = [
      step(1, "S", { motions: skewedMotions() }),
      step(2, "T", { motions: skewedMotions() }),
      step(3, "G"),
    ];
    expect(deriveWordFromBeats(steps)).toBe("{ST}G");
  });

  it("does not brace a beat whose hands both skew but start and end pure", () => {
    const bothSkew = {
      left: createMotionData({
        motionType: "pro" as const,
        rotationDirection: "cw" as const,
        startLocation: "n" as const,
        endLocation: "ne" as const,
        turns: 0,
        startOrientation: "in" as const,
        endOrientation: "in" as const,
      }),
      right: createMotionData({
        motionType: "pro" as const,
        rotationDirection: "cw" as const,
        startLocation: "s" as const,
        endLocation: "sw" as const,
        turns: 0,
        startOrientation: "in" as const,
        endOrientation: "in" as const,
      }),
    };
    expect(deriveWordFromBeats([step(1, "A", { motions: bothSkew })])).toBe("A");
  });
});
