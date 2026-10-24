import { describe, expect, it } from "vitest";
import { RuntimeMotionRequest } from "../../../src/lib/shared/3d/services/runtime-motion-request.js";
import type { SequenceData } from "../../../src/lib/shared/foundation/domain/models/sequence-data.js";

function score(): SequenceData {
  return {
    id: "current-score",
    name: "Current score",
    word: "AB",
    thumbnails: [],
    steps: [{ id: "step-1", stepNumber: 1, duration: 1 }] as SequenceData["steps"],
  };
}

describe("runtime motion request", () => {
  it("captures the edited score without later source edits changing the export", () => {
    const source = score();
    const request = new RuntimeMotionRequest(source);
    expect(request.sequence).not.toBe(source);
    expect(request.matches(source)).toBe(true);

    const edited = { ...source, steps: [{ ...source.steps[0]!, duration: 2 }] };
    expect(request.matches(edited)).toBe(false);
    expect(request.sequence.steps[0]!.duration).toBe(1);
  });

  it("rejects a late result after cancellation", () => {
    const source = score();
    const request = new RuntimeMotionRequest(source);
    request.cancel();
    expect(request.matches(source)).toBe(false);
  });
});
