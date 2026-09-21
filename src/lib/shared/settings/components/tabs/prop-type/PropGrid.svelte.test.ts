import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import PropGrid from "./PropGrid.svelte";

function renderRail(fanAppearance: FanAppearance) {
  const onFanAppearanceChange = vi.fn();
  render(PropGrid, {
    selectedPropType: PropType.FAN,
    onSelect: vi.fn(),
    layout: "rail",
    fanAppearance,
    onFanAppearanceChange,
  });
  return onFanAppearanceChange;
}

describe("PropGrid fan look credit", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  it.each([
    {
      build: "star",
      originator: "Renegade Juggling",
      short: "Renegade",
      sourceUrl: "https://renegadejuggling.com/products/fire-fan-star",
    },
    {
      build: "flat-grip",
      originator: "Forged Creations",
      short: "Forged",
      sourceUrl: "https://forgedfans.com/products/flat-grip-fire-fans",
    },
  ] as const)(
    "links the $build rail heading back to $originator",
    async ({ build, originator, short, sourceUrl }) => {
      renderRail({ build, frameColor: "black", cover: "bare" });

      await page.getByTestId("fan-look-chip").click();

      const credit = page.getByRole("link", { name: `${originator} source` });
      await expect.element(credit).toBeVisible();
      await expect.element(credit).toHaveAttribute("href", sourceUrl);
      expect(credit.element().querySelector(".credit-short")?.textContent).toBe(
        short
      );
      expect(credit.element().querySelector(".credit-long")?.textContent).toBe(
        originator
      );
    }
  );

  it("keeps the heading plain for the house DoodleGrip", async () => {
    renderRail({ build: "fire", frameColor: "black", cover: "bare" });

    expect(document.querySelector('[data-testid="prop-look-chip"]')).toBeNull();
    await page.getByTestId("fan-look-chip").click();

    await expect
      .element(page.getByRole("button", { name: "Back to all props" }))
      .toBeVisible();
    expect(document.querySelector(".rail-credit")).toBeNull();
  });

  it("offers the global 3D model choice in a captured prop's rail", async () => {
    const onPropLookChange = vi.fn();
    render(PropGrid, {
      selectedPropType: PropType.STAFF,
      onSelect: vi.fn(),
      layout: "rail",
      fanAppearance: { build: "fire", frameColor: "black", cover: "bare" },
      onFanAppearanceChange: vi.fn(),
      propLook: "pictograph",
      onPropLookChange,
    });

    await page.getByTestId("prop-look-chip").click();
    const model = page.getByRole("radio", { name: "3D model" });
    const pictograph = page.getByRole("radio", { name: "Pictograph" });
    await expect.element(model).toBeVisible();
    await expect.element(pictograph).toHaveAttribute("aria-checked", "true");

    await model.click();
    expect(onPropLookChange).toHaveBeenCalledWith("model");
  });
});
