import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

vi.mock(
  "$lib/shared/pictograph/shared/components/PictographContainer.svelte",
  async () => ({
    default: (
      await import("$lib/shared/pictograph/grid/components/PropPlacementGridTestRenderer.svelte")
    ).default,
  })
);

import BuildStartPlacement from "./BuildStartPlacement.svelte";

describe("BuildStartPlacement", () => {
  it("applies merged and center poses through the Assemble placement contract", async () => {
    const onLeftOrientationChange = vi.fn();
    const onRightOrientationChange = vi.fn();
    const onApplyPlacement = vi.fn();

    render(BuildStartPlacement, {
      gridMode: GridMode.SKEWED,
      showCenter: true,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      leftOrientation: Orientation.IN,
      rightOrientation: Orientation.OUT,
      onLeftOrientationChange,
      onRightOrientationChange,
      onApplyPlacement,
    });

    const center = page.getByRole("button", { name: "Center point" });
    const centerElement = center.element() as SVGCircleElement;
    centerElement.focus();
    centerElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await expect
      .element(page.getByRole("button", { name: "Center point (left prop)" }))
      .toBeVisible();
    const north = page.getByRole("button", { name: "North point" });
    const northElement = north.element() as SVGCircleElement;
    northElement.focus();
    northElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await expect
      .element(page.getByRole("button", { name: "North point (right prop)" }))
      .toBeVisible();
    const applyButton = page
      .getByRole("button", {
        name: "Use this placement",
      })
      .element() as HTMLButtonElement;
    expect(applyButton.disabled).toBe(false);
    applyButton.click();

    expect(onLeftOrientationChange).toHaveBeenCalledWith(Orientation.CENTER_N);
    await vi.waitFor(() =>
      expect(onApplyPlacement).toHaveBeenCalledWith(
        expect.objectContaining({
          leftLocation: GridLocation.CENTER,
          rightLocation: GridLocation.NORTH,
          gridMode: GridMode.SKEWED,
          leftOrientation: Orientation.CENTER_N,
          rightOrientation: Orientation.OUT,
        })
      )
    );
  });
});
