import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { shapeKey } from "#lib/shared/mandala/services/mandala-fingerprint.js";
import type {
  MotionLike,
  StepLike,
} from "#lib/shared/mandala/services/types.js";
import { QuizType } from "#lib/features/learn/quiz/domain/enums/quiz-enums.js";

const catalogLoader = vi.hoisted(() => ({
  getCachedCatalogs: vi.fn(),
  loadCatalogs: vi.fn(),
  loadCatalogSequencesPage: vi.fn(),
}));

vi.mock(
  "#lib/features/choreo-card/services/catalog-loader.js",
  () => catalogLoader
);

import {
  generateSequenceMatchQuestion,
  resetState,
} from "#lib/features/learn/quiz/services/sequence-question-generator.js";

const BASE_MOTION: MotionLike = {
  motionType: "pro",
  rotationDirection: "cw",
  startLocation: "n",
  endLocation: "e",
  startOrientation: "out",
  endOrientation: "out",
  turns: 0,
};

function step(left: Partial<MotionLike>, right: Partial<MotionLike>): StepLike {
  return {
    motions: {
      left: { ...BASE_MOTION, ...left },
      right: { ...BASE_MOTION, ...right },
    },
  };
}

function sequence(
  id: string,
  word: string,
  steps: readonly StepLike[]
): SequenceData {
  return { id, word, steps } as unknown as SequenceData;
}

const targetSteps: StepLike[] = [
  step(
    { startLocation: "n", endLocation: "e" },
    { startLocation: "s", endLocation: "w" }
  ),
  step(
    { startLocation: "e", endLocation: "s" },
    { startLocation: "w", endLocation: "n" }
  ),
];

const secondShapeSteps: StepLike[] = [
  step(
    {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "n",
      endLocation: "w",
    },
    {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "s",
      endLocation: "e",
    }
  ),
  step(
    {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "w",
      endLocation: "s",
    },
    {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "e",
      endLocation: "n",
    }
  ),
];

const thirdShapeSteps: StepLike[] = [
  step(
    {
      motionType: "dash",
      rotationDirection: "noRotation",
      startLocation: "n",
      endLocation: "s",
    },
    {
      motionType: "dash",
      rotationDirection: "noRotation",
      startLocation: "e",
      endLocation: "w",
    }
  ),
];

const fourthShapeSteps: StepLike[] = [
  ...targetSteps,
  step(
    {
      motionType: "static",
      startLocation: "s",
      endLocation: "s",
      turns: 1,
    },
    {
      motionType: "static",
      startLocation: "n",
      endLocation: "n",
      turns: 1,
    }
  ),
];

const target = sequence("target", "A", targetSteps);
const sameAsTarget = sequence("same-as-target", "B", targetSteps);
const secondShape = sequence("second-shape", "C", secondShapeSteps);
const sameAsSecond = sequence("same-as-second", "D", secondShapeSteps);
const thirdShape = sequence("third-shape", "E", thirdShapeSteps);
const fourthShape = sequence("fourth-shape", "F", fourthShapeSteps);
const pool = [
  target,
  sameAsTarget,
  secondShape,
  sameAsSecond,
  thirdShape,
  fourthShape,
];

const catalog = {
  id: "mandala-test-catalog",
  level: 1,
} as unknown as Catalog;

function mandalaKey(value: SequenceData): string {
  return shapeKey(calculate(value.steps));
}

describe("sequence match questions", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
    catalogLoader.getCachedCatalogs.mockReturnValue([catalog]);
    catalogLoader.loadCatalogSequencesPage.mockResolvedValue({
      sequences: pool,
      lastDoc: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetState();
  });

  it("offers exactly one answer for each rendered mandala shape", async () => {
    let randomCall = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      randomCall += 1;
      return randomCall === 1 ? 0 : ((randomCall % 9) + 1) / 10;
    });

    const question = await generateSequenceMatchQuestion("question-1", {
      optionCount: 4,
      lessonType: QuizType.MANDALA_TO_CARD,
    });

    const options = question.answerOptions.map(
      (option) => option.content as SequenceData
    );
    const optionShapeKeys = options.map(mandalaKey);
    const targetShapeKey = mandalaKey(target);

    expect(question.questionContent).toBe(target);
    expect(options).toHaveLength(4);
    expect(new Set(optionShapeKeys).size).toBe(4);
    expect(
      optionShapeKeys.filter((key) => key === targetShapeKey)
    ).toHaveLength(1);
    expect(options.map((option) => option.id)).not.toContain(sameAsTarget.id);
    expect(
      question.answerOptions.filter((option) => option.isCorrect)
    ).toHaveLength(1);
  });
});
