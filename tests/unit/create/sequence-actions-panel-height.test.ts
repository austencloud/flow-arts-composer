import { describe, expect, it } from "vitest";
import {
  DRAWER_HANDLE_FOOTPRINT,
  fittedToolPanelHeight,
  getSequenceActionsPanelHeight,
} from "#lib/features/create/shared/components/sequence-actions/sequence-actions-panel-height.js";

describe("Sequence Actions panel height", () => {
  it.each([
    {
      name: "iPhone SE",
      viewportHeight: 667,
      basePanelHeight: 334,
      expected: 382,
    },
    {
      name: "fold cover portrait",
      viewportHeight: 960,
      basePanelHeight: 480,
      expected: 528,
    },
    {
      name: "open fold portrait",
      viewportHeight: 832,
      basePanelHeight: 416,
      expected: 464,
    },
  ])(
    "adds one row for $name drill-downs",
    ({ viewportHeight, basePanelHeight, expected }) => {
      expect(
        getSequenceActionsPanelHeight({
          basePanelHeight,
          viewportHeight,
          workspaceContext: true,
          hasDrilldown: true,
        })
      ).toBe(expected);
    }
  );

  it("keeps the root actions at the measured controls height", () => {
    expect(
      getSequenceActionsPanelHeight({
        basePanelHeight: 334,
        viewportHeight: 667,
        workspaceContext: true,
        hasDrilldown: false,
      })
    ).toBe(334);
  });

  it("does not change side-by-side drawers", () => {
    expect(
      getSequenceActionsPanelHeight({
        basePanelHeight: 412,
        viewportHeight: 412,
        workspaceContext: false,
        hasDrilldown: true,
      })
    ).toBe(412);
  });

  it("never shrinks below the measured controls footprint", () => {
    expect(
      getSequenceActionsPanelHeight({
        basePanelHeight: 300,
        viewportHeight: 500,
        workspaceContext: true,
        hasDrilldown: true,
      })
    ).toBe(300);
  });
});

describe("Sequence Actions fitted tool panel", () => {
  it("leaves the drawer body as tall as the root actions, plus a pixel", () => {
    // Body = navigation bar + tool panel - handle footprint.
    const toolPanel = fittedToolPanelHeight({
      contentHeight: 318,
      navigationBarHeight: 44,
    });
    expect(toolPanel).toBe(318 + DRAWER_HANDLE_FOOTPRINT - 44 + 1);
    expect(44 + toolPanel - DRAWER_HANDLE_FOOTPRINT).toBeGreaterThan(318);
  });

  it("rounds a fractional measurement up", () => {
    expect(
      fittedToolPanelHeight({ contentHeight: 318.4, navigationBarHeight: 44 })
    ).toBe(Math.ceil(318.4 + DRAWER_HANDLE_FOOTPRINT - 44) + 1);
  });

  it("asks for no fit before anything is measured", () => {
    expect(
      fittedToolPanelHeight({ contentHeight: 0, navigationBarHeight: 44 })
    ).toBe(0);
  });
});
