/**
 * Legacy letter alias normalization.
 *
 * The legacy import/repair scripts (import-sequence.cjs,
 * repair-broken-start-placements.cjs) wrote the gamma start-placement letter as
 * uppercase "Γ" (U+0393), copying the legacy desktop convention. The app's
 * canonical alphabet (letter.ts, @tka/tka-types) uses lowercase "γ" (U+03B3).
 * A scanned sequence carrying the legacy letter crashed the /q scan page:
 * getLetterType("Γ") threw "Unknown letter: Γ" inside the animator glyph.
 *
 * These tests lock the fix at all three layers: the domain canon
 * (normalizeLetter/getLetterType), the glyph asset path, and the scan-path
 * letter deriver that previously preserved any already-set letter verbatim.
 */
import { describe, expect, it } from "vitest";

import {
  Letter,
  getLetterType,
  normalizeLetter,
} from "$lib/shared/foundation/domain/models/letter";
import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
import { getLetterImagePath } from "$lib/shared/pictograph/tka-glyph/utils/letter-image-getter";
import { deriveLettersForSequence } from "$lib/shared/navigation/services/letter-deriver";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const LEGACY_GAMMA = "Γ"; // "Γ" — what the legacy scripts wrote
const CANONICAL_GAMMA = "γ"; // "γ" — Letter.GAMMA

function makeStaticStep(letter: string | null): StepData {
  const motion = {
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.NORTH,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    propType: PropType.STAFF,
  };
  return {
    id: "step-0",
    stepNumber: 0,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: letter as StepData["letter"],
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: createMotionData({ ...motion, hand: HandSide.LEFT }),
      right: createMotionData({
        ...motion,
        hand: HandSide.RIGHT,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.SOUTH,
      }),
    },
  };
}

describe("normalizeLetter", () => {
  it("maps the legacy uppercase gamma to the canonical lowercase letter", () => {
    expect(normalizeLetter(LEGACY_GAMMA)).toBe(Letter.GAMMA);
    expect(Letter.GAMMA).toBe(CANONICAL_GAMMA);
  });

  it("passes canonical letters through unchanged", () => {
    expect(normalizeLetter(CANONICAL_GAMMA)).toBe(Letter.GAMMA);
    expect(normalizeLetter("A")).toBe(Letter.A);
    expect(normalizeLetter("Σ-")).toBe(Letter.SIGMA_DASH);
  });

  it("returns null for genuinely unknown input", () => {
    expect(normalizeLetter("!")).toBeNull();
    expect(normalizeLetter("")).toBeNull();
    expect(normalizeLetter(null)).toBeNull();
    expect(normalizeLetter(undefined)).toBeNull();
  });
});

describe("getLetterType with legacy alias", () => {
  it("resolves legacy Γ to TYPE6 instead of throwing", () => {
    expect(getLetterType(LEGACY_GAMMA as Letter)).toBe(LetterType.TYPE6);
  });

  it("still throws for genuinely unknown letters", () => {
    expect(() => getLetterType("!" as Letter)).toThrow(/Unknown letter/);
  });
});

describe("getLetterImagePath with legacy alias", () => {
  it("returns the canonical lowercase-gamma asset path for legacy Γ", () => {
    expect(getLetterImagePath(LEGACY_GAMMA as Letter)).toBe(
      `/images/letters_trimmed/${LetterType.TYPE6}/${CANONICAL_GAMMA}.svg`
    );
  });
});

describe("deriveLettersForSequence with legacy alias", () => {
  it("normalizes an already-set legacy start-placement letter to canon", async () => {
    const start = makeStaticStep(LEGACY_GAMMA);
    const sequence = createSequenceData({
      word: "",
      name: "",
      steps: [],
      startPlacement: {
        id: start.id,
        letter: start.letter,
        gridPlacement: start.startPlacement,
        startPlacement: start.startPlacement,
        endPlacement: start.endPlacement,
        motions: start.motions,
      },
    });

    const derived = await deriveLettersForSequence(sequence);
    expect(derived.startPlacement?.letter).toBe(Letter.GAMMA);
  });

  it("normalizes legacy letters on steps too", async () => {
    const sequence = createSequenceData({
      word: "",
      name: "",
      steps: [makeStaticStep(LEGACY_GAMMA)],
    });

    const derived = await deriveLettersForSequence(sequence);
    expect(derived.steps[0]?.letter).toBe(Letter.GAMMA);
  });

  it("keeps Latin B and Greek beta distinct in a scanned sequence word", async () => {
    const letters = [Letter.B, Letter.BETA, Letter.GAMMA];
    const sequence = createSequenceData({
      word: "",
      name: "",
      steps: letters.map((letter, index) => ({
        ...makeStaticStep(letter),
        id: `step-${index + 1}`,
        stepNumber: index + 1,
      })),
    });

    const derived = await deriveLettersForSequence(sequence);

    expect(derived.word).toBe("Bβγ");
    expect([...derived.word]).toEqual(["B", "β", "γ"]);
    expect(derived.word).toBe(
      derived.steps.map((step) => step.letter).join("")
    );
  });
});
