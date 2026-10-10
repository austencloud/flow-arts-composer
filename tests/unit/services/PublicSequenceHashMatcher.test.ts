import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(),
}));

import { PublicSequenceHashMatcher } from "#lib/shared/sequence-viewer/services/public-sequence-hash-matcher.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

describe("PublicSequenceHashMatcher", () => {
  it("distinguishes identical motions with different durations", async () => {
    const oneBeat = createSequenceData({
      word: "A",
      steps: [createStepData({ stepNumber: 1, duration: 1 })],
    });
    const fiveBeats = {
      ...oneBeat,
      steps: oneBeat.steps.map((step) => ({ ...step, duration: 5 })),
    };
    const matcher = new PublicSequenceHashMatcher();

    const [oneBeatHash, fiveBeatHash] = await Promise.all([
      matcher.computeEncoderHash(oneBeat),
      matcher.computeEncoderHash(fiveBeats),
    ]);

    expect(oneBeatHash).not.toBe(fiveBeatHash);
  });
});
