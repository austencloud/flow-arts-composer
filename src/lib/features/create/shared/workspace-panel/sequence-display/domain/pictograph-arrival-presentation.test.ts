import { describe, expect, it } from "vitest";
import {
  getPictographArrivalPresentation,
  shouldInterruptArrivalOnTap,
} from "./pictograph-arrival-presentation";

describe("getPictographArrivalPresentation", () => {
  it("plays over the screen only on Construct's phone tier", () => {
    expect(getPictographArrivalPresentation({ constructPhoneTier: true })).toBe(
      "screen"
    );
    expect(
      getPictographArrivalPresentation({ constructPhoneTier: false })
    ).toBe("workspace");
  });
});

describe("shouldInterruptArrivalOnTap", () => {
  it.each(["preparing", "entering", "moving", "holding"])(
    "sends a full-screen commit to its cell from %s",
    (phase) => {
      expect(
        shouldInterruptArrivalOnTap({
          presentation: "screen",
          intent: "commit",
          phase,
        })
      ).toBe(true);
    }
  );

  it.each(["landing", "handing-off"])(
    "leaves a commit that is already %s alone",
    (phase) => {
      expect(
        shouldInterruptArrivalOnTap({
          presentation: "screen",
          intent: "commit",
          phase,
        })
      ).toBe(false);
    }
  );

  it("never cuts a held audition short", () => {
    expect(
      shouldInterruptArrivalOnTap({
        presentation: "screen",
        intent: "audition",
        phase: "moving",
      })
    ).toBe(false);
  });

  it("keeps the workspace stage's timing unchanged", () => {
    expect(
      shouldInterruptArrivalOnTap({
        presentation: "workspace",
        intent: "commit",
        phase: "moving",
      })
    ).toBe(false);
  });
});
