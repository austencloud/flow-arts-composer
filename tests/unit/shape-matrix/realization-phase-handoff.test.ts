import { describe, expect, it } from "vitest";
import { resolveRealizationEntryStep } from "#lib/shared/shape-matrix/services/realization-phase-handoff.js";

describe("realization phase handoff", () => {
  it("preserves normalized cycle phase across different sequence lengths", () => {
    expect(
      resolveRealizationEntryStep({
        outgoingStep: 3,
        outgoingStepCount: 4,
        incomingStepCount: 8,
        fallbackKey: "unused",
      })
    ).toBe(5);
  });

  it("preserves fractional progress instead of snapping to a beat", () => {
    expect(
      resolveRealizationEntryStep({
        outgoingStep: 2.5,
        outgoingStepCount: 4,
        incomingStepCount: 6,
        fallbackKey: "unused",
      })
    ).toBeCloseTo(3.25);
  });

  it("wraps a completed outgoing cycle before mapping it", () => {
    expect(
      resolveRealizationEntryStep({
        outgoingStep: 5.5,
        outgoingStepCount: 4,
        incomingStepCount: 8,
        fallbackKey: "unused",
      })
    ).toBe(2);
  });

  it("uses a deterministic moving phase before an outgoing player exists", () => {
    const first = resolveRealizationEntryStep({
      outgoingStep: 0,
      outgoingStepCount: 0,
      incomingStepCount: 4,
      fallbackKey: "QS|pro-1-in|anti-1-out",
    });
    const second = resolveRealizationEntryStep({
      outgoingStep: 0,
      outgoingStepCount: 0,
      incomingStepCount: 4,
      fallbackKey: "QS|pro-1-in|anti-1-out",
    });

    expect(first).toBe(second);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(5);
  });
});
