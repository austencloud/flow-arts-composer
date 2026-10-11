import { describe, expect, it } from "vitest";
import {
  minimumInlineControlsHeight,
  selectOptionControlsPresentation,
} from "#lib/features/create/construct/option-picker/services/option-controls-presentation.js";

describe("Construct option controls presentation", () => {
  it("keeps controls inline in a tall narrow pane", () => {
    expect(
      selectOptionControlsPresentation({
        hasControls: true,
        fullInlineEligible: false,
        containerHeight: 1847,
        canShowTurnRows: true,
      })
    ).toBe("inline");
  });

  it("uses disclosure only when the option surface would become too short", () => {
    const withoutTurns = minimumInlineControlsHeight(false);
    const withTurns = minimumInlineControlsHeight(true);

    expect(withoutTurns).toBe(424);
    expect(withTurns).toBe(560);

    expect(
      selectOptionControlsPresentation({
        hasControls: true,
        fullInlineEligible: false,
        containerHeight: withoutTurns - 1,
        canShowTurnRows: false,
      })
    ).toBe("disclosed");
    expect(
      selectOptionControlsPresentation({
        hasControls: true,
        fullInlineEligible: false,
        containerHeight: withoutTurns,
        canShowTurnRows: false,
      })
    ).toBe("inline");
    expect(
      selectOptionControlsPresentation({
        hasControls: true,
        fullInlineEligible: false,
        containerHeight: withTurns - 1,
        canShowTurnRows: true,
      })
    ).toBe("disclosed");
    expect(
      selectOptionControlsPresentation({
        hasControls: true,
        fullInlineEligible: false,
        containerHeight: withTurns,
        canShowTurnRows: true,
      })
    ).toBe("inline");
  });

  it("preserves the full desktop header when its width contract is met", () => {
    expect(
      selectOptionControlsPresentation({
        hasControls: true,
        fullInlineEligible: true,
        containerHeight: 360,
        canShowTurnRows: true,
      })
    ).toBe("inline");
  });

  it("renders no settings surface when the host exposes no controls", () => {
    expect(
      selectOptionControlsPresentation({
        hasControls: false,
        fullInlineEligible: false,
        containerHeight: 1200,
        canShowTurnRows: false,
      })
    ).toBe("hidden");
  });
});
