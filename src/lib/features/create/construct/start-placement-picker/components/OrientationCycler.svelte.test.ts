import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import OrientationCycler from "./OrientationCycler.svelte";

describe("OrientationCycler interradial palette", () => {
  it("keeps Construct on the existing four-orientation cycle by default", async () => {
    const onOrientationChange = vi.fn();
    render(OrientationCycler, {
      orientation: Orientation.IN,
      onOrientationChange,
      color: "blue",
    });

    await page
      .getByRole("button", { name: "Previous Left orientation" })
      .click();
    expect(onOrientationChange).toHaveBeenCalledWith(Orientation.CLOCK);
  });

  it("inserts compound orientations when a research surface opts in", async () => {
    const onOrientationChange = vi.fn();
    render(OrientationCycler, {
      orientation: Orientation.IN,
      onOrientationChange,
      color: "blue",
      allowInterradial: true,
    });

    await page
      .getByRole("button", { name: "Previous Left orientation" })
      .click();
    expect(onOrientationChange).toHaveBeenCalledWith(Orientation.CLOCK_IN);
  });

  it("moves center orientations counterclockwise with the left arrow", async () => {
    const onOrientationChange = vi.fn();
    render(OrientationCycler, {
      orientation: Orientation.CENTER_N,
      onOrientationChange,
      color: "blue",
      centered: true,
    });

    await page
      .getByRole("button", { name: "Previous Left orientation" })
      .click();
    expect(onOrientationChange).toHaveBeenCalledWith(Orientation.CENTER_NW);
  });

  it("moves center orientations clockwise with the right arrow", async () => {
    const onOrientationChange = vi.fn();
    render(OrientationCycler, {
      orientation: Orientation.CENTER_N,
      onOrientationChange,
      color: "blue",
      centered: true,
    });

    await page.getByRole("button", { name: "Next Left orientation" }).click();
    expect(onOrientationChange).toHaveBeenCalledWith(Orientation.CENTER_NE);
  });
});
