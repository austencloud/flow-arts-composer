import { describe, expect, it } from "vitest";
import { ClaudeCodeCopier } from "#lib/shared/browse/services/claude-code-copier.js";
import type { SequenceDetailLoader } from "#lib/shared/browse/services/sequence-detail-loader.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";

const loadedDetail = {
  needsFullLoad: () => false,
  loadFullSequence: async (sequence: SequenceData) => sequence,
} as unknown as SequenceDetailLoader;

describe("ClaudeCodeCopier", () => {
  it("includes every step duration and documents the field", async () => {
    const sequence = createSequenceData({
      id: "duration-copy-test",
      word: "A",
      steps: [
        createStepData({ stepNumber: 1, duration: 5 }),
        createStepData({ stepNumber: 2, duration: 1 }),
        createStepData({ stepNumber: 3, duration: 1.25 }),
      ],
    });
    const copier = new ClaudeCodeCopier(loadedDetail);

    const prompt = await copier.generatePrompt(sequence);

    expect(prompt).toContain(
      "step = number [letter] [position>position] d=beats [rev:BR]"
    );
    expect(prompt).toContain("\n1 d=5\n");
    expect(prompt).toContain("\n2 d=1\n");
    expect(prompt).toContain("\n3 d=1.25\n");
  });
});
