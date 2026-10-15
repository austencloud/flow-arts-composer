import { describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import {
  describeReviewSetup,
  reviewCostUsd,
  reviewWithOpus,
} from "../../../scripts/tika/opus-reviewer.ts";

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 200, text: 200, reasoning: 0 },
};

const scenario = {
  id: "type1-misconception",
  name: { en: "Type 1 misconception" },
  category: "misconception-correction",
  userLevel: 1 as const,
  question: { en: "Type 1 is when both hands move, right?" },
  criteria: {
    mustInclude: ["shift"],
    mustNotInclude: ["turn"],
    expectedTools: ["list_letters_by_type"],
    keyFacts: [{ en: "Type 1 is when both hands SHIFT" }],
  },
  difficulty: "hard",
};

const answer = {
  explanation: "Yes, Type 1 is when both hands move.",
  toolsCalled: [],
  latencyMs: 10,
};

const grade = {
  grades: {
    domainAccuracy: 2,
    levelAppropriateness: 8,
    toolUsage: 3,
    conciseness: 7,
    helpfulness: 3,
  },
  overallScore: 3,
  recommendation: "incorrect",
  notes: "Agrees with the misconception.",
};

// A two-step review: look up a type and try to read a secrets file, then grade.
function reviewer(calls: LanguageModelV3CallOptions[]) {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      calls.push(options);
      if (calls.length === 1) {
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "types",
              toolName: "list_letters_by_type",
              input: JSON.stringify({ type: 1 }),
            },
            {
              type: "tool-call",
              toolCallId: "env",
              toolName: "read_codebase_file",
              input: JSON.stringify({ filepath: ".env" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_use" },
          usage,
          warnings: [],
        };
      }
      return {
        content: [
          { type: "text", text: "```json\n" + JSON.stringify(grade) + "\n```" },
        ],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage,
        warnings: [],
      };
    },
  });
}

describe("TIKA Opus reviewer", () => {
  it("answers its tool calls from local data, then parses the grade", async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const review = await reviewWithOpus(scenario, answer, {
      model: reviewer(calls),
    });

    expect(calls).toHaveLength(2);
    expect(review.verificationToolCalls.map((call) => call.tool)).toEqual([
      "list_letters_by_type",
      "read_codebase_file",
    ]);
    expect(review.verificationToolCalls[0].result).toContain(
      "Type 1 (Dual-Shift)"
    );
    expect(review.verificationToolCalls[1].result).toBe("Not readable: .env");
    expect(review.result.recommendation).toBe("incorrect");
    expect(review.result.overallScore).toBe(3);
    expect(review.result.opusNotes).toBe("Agrees with the misconception.");
    expect(review.usage).toEqual({
      inputTokens: 2000,
      outputTokens: 400,
      steps: 2,
    });
    expect(review.costUsd).toBeCloseTo(0.016, 6);
  });

  it("flags a review with no JSON grade for a human", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: "text", text: "Looks fine to me." }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage,
        warnings: [],
      }),
    });
    const review = await reviewWithOpus(scenario, answer, { model });
    expect(review.result.recommendation).toBe("flag-for-human");
    expect(review.result.uncertaintyReason).toBe(
      "No structured JSON in response"
    );
  });

  it("prices tokens at the review model's list rate", () => {
    expect(
      reviewCostUsd({ inputTokens: 1_000_000, outputTokens: 0, steps: 1 })
    ).toBe(4);
    expect(
      reviewCostUsd({ inputTokens: 0, outputTokens: 1_000_000, steps: 1 })
    ).toBe(20);
  });

  it("loads its reference data from the repository", () => {
    const setup = describeReviewSetup();
    expect(setup.model).toBe("claude-opus-5-5");
    expect(setup.data.glossaryTerms).toBeGreaterThan(0);
    expect(setup.data.letterTypes).toBe(6);
    expect(setup.data.pictographRows).toBeGreaterThan(0);
  });
});
