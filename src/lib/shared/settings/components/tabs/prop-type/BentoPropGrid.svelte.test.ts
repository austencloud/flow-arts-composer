import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import BentoPropGrid from "./BentoPropGrid.svelte";

const CLUB_PICKER_PROPS = [
  PropType.CLUB,
  PropType.CLASSIC_CLUB,
  PropType.TORCH,
  PropType.BIGCLUB,
  PropType.BIGTORCH,
  PropType.FAN,
  PropType.TRIAD,
  PropType.MINIHOOP,
] as const;

describe("BentoPropGrid style drill-down", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  it("replaces the grid with the family's styles and selects only the chosen one", async () => {
    const onSelect = vi.fn();

    render(BentoPropGrid, {
      selectedPropType: PropType.CLUB,
      onSelect,
      allowedProps: CLUB_PICKER_PROPS,
    });

    const trigger = page.getByRole("button", { name: "Choose Club style" });
    await trigger.click();

    const back = page.getByRole("button", { name: "Back to all props" });
    await expect.element(back).toBeVisible();
    // The styles replace the grid rather than floating over it, so a tap on
    // a style can never land on a prop card behind it.
    await expect
      .element(page.getByRole("button", { name: "Select Fan prop type" }))
      .not.toBeInTheDocument();

    const torchOption = page.getByRole("button", {
      name: "Select Torch prop type",
    });
    await torchOption.click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(PropType.TORCH);

    // Picking stays one level down so styles can be compared; Back returns
    // to the full grid with the family tile closed.
    await expect.element(back).toBeVisible();
    await back.click();
    await expect
      .element(page.getByRole("button", { name: "Select Fan prop type" }))
      .toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("steps back on Escape without selecting anything", async () => {
    const onSelect = vi.fn();

    render(BentoPropGrid, {
      selectedPropType: PropType.CLUB,
      onSelect,
      allowedProps: CLUB_PICKER_PROPS,
    });

    const trigger = page.getByRole("button", { name: "Choose Club style" });
    await trigger.click();
    await expect
      .element(page.getByRole("button", { name: "Back to all props" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(onSelect).not.toHaveBeenCalled();
    await expect.element(trigger).toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("BentoPropGrid prop look", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  async function openBuugengDetails(showPropLook?: boolean): Promise<void> {
    render(BentoPropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect: vi.fn(),
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      ...(showPropLook === undefined ? {} : { showPropLook }),
    });
    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    await expect
      .element(page.getByRole("button", { name: "Big" }))
      .toBeVisible();
  }

  it("offers the 2D artwork choice by default", async () => {
    await openBuugengDetails();
    await expect
      .element(page.getByRole("radio", { name: "3D model" }))
      .toBeVisible();
  });

  it("leaves it out when the host renders in 3D", async () => {
    await openBuugengDetails(false);
    await expect
      .element(page.getByRole("radio", { name: "3D model" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("radio", { name: "Pictograph" }))
      .not.toBeInTheDocument();
  });
});
