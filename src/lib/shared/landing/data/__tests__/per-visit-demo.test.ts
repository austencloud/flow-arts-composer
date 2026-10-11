import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateSequence: vi.fn(),
}));

vi.mock("#lib/shared/create/services/generation-orchestrator.js", () => ({
  generationOrchestrator: {
    generateSequence: mocks.generateSequence,
  },
}));

vi.mock(
  "#lib/shared/foundation/domain/models/generation/generate-models.js",
  () => ({
    DifficultyLevel: {
      BEGINNER: "beginner",
      INTERMEDIATE: "intermediate",
      ADVANCED: "advanced",
    },
    GenerationMode: { CIRCULAR: "circular" },
  })
);

vi.mock(
  "#lib/shared/foundation/domain/models/generation/circular-models.js",
  () => ({
    LOOPType: { ROTATED: "rotated" },
    Period: { QUARTERED: "quartered" },
  })
);

vi.mock("#lib/shared/pictograph/grid/domain/enums/grid-enums.js", () => ({
  GridMode: { DIAMOND: "diamond" },
}));

vi.mock("#lib/shared/pictograph/prop/domain/enums/prop-type.js", () => ({
  PropType: { STAFF: "staff" },
}));

import { generatePerVisitDemo } from "../per-visit-demo";

function generatedSequence(letters: string[]) {
  return {
    id: `generated-${letters.join("")}`,
    name: "Generated hero sequence",
    word: letters.join(""),
    steps: letters.map((letter) => ({ letter })),
  };
}

beforeEach(() => {
  mocks.generateSequence.mockReset();
  mocks.generateSequence.mockResolvedValue(generatedSequence(["A", "B", "C"]));
});

describe("generatePerVisitDemo level selection", () => {
  it.each([
    [0, "beginner"],
    [1 / 3 - 0.000001, "beginner"],
    [1 / 3, "intermediate"],
    [2 / 3 - 0.000001, "intermediate"],
    [2 / 3, "advanced"],
    [0.999999, "advanced"],
  ] as const)(
    "maps the random draw %s into the %s third",
    async (draw, difficulty) => {
      await generatePerVisitDemo({ random: () => draw });

      expect(mocks.generateSequence).toHaveBeenCalledWith(
        expect.objectContaining({ difficulty })
      );
    }
  );

  it("keeps one difficulty across quality-filter retries", async () => {
    const random = vi.fn(() => 0.5);
    mocks.generateSequence
      .mockResolvedValueOnce(generatedSequence(["Σ"]))
      .mockResolvedValueOnce(generatedSequence(["A", "B", "C"]));

    await generatePerVisitDemo({ random });

    expect(random).toHaveBeenCalledTimes(1);
    expect(mocks.generateSequence).toHaveBeenCalledTimes(2);
    expect(
      mocks.generateSequence.mock.calls.map(([options]) => options.difficulty)
    ).toEqual(["intermediate", "intermediate"]);
  });

  it("makes a fresh level draw for each generated sequence", async () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9);

    await generatePerVisitDemo({ random });
    await generatePerVisitDemo({ random });

    expect(random).toHaveBeenCalledTimes(2);
    expect(
      mocks.generateSequence.mock.calls.map(([options]) => options.difficulty)
    ).toEqual(["beginner", "advanced"]);
  });
});
