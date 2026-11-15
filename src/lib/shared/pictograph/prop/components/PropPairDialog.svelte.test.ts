import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import PropPairDialog from "./PropPairDialog.svelte";

const value = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogMode: false,
};

function open(onPick = vi.fn(), onclose = vi.fn()) {
  render(PropPairDialog, {
    open: true,
    title: "Save with props",
    hint: "Saved with the sequence",
    value,
    onclose,
    onPick,
  });
  return { onPick, onclose };
}

async function pickFan() {
  await expect
    .poll(() => document.querySelector('[data-prop-tile="fan"]'))
    .not.toBeNull();
  const tile = document.querySelector<HTMLElement>('[data-prop-tile="fan"]')!;
  (tile.matches("button") ? tile : tile.querySelector("button")!).click();
}

describe("PropPairDialog is the one prop screen", () => {
  beforeEach(async () => {
    await page.viewport(387, 775);
  });

  it("shows the host's title, hint and the Both / Left / Right row on Both", async () => {
    open();
    await expect.element(page.getByText("Save with props")).toBeVisible();
    await expect.element(page.getByText("Saved with the sequence")).toBeVisible();
    await expect
      .element(page.getByTestId("hand-choice-both"))
      .toBeVisible();
    expect(
      document
        .querySelector("[data-testid='hand-choice-both']")
        ?.closest("[role='radio']")
        ?.getAttribute("aria-checked") ??
        document
          .querySelector("[data-testid='hand-choice-both']")
          ?.getAttribute("aria-checked")
    ).toBe("true");
  });

  it("mounts outside the host so a contained ancestor cannot clip it", async () => {
    const { container } = render(PropPairDialog, {
      open: true,
      title: "Save with props",
      value,
      onclose: vi.fn(),
      onPick: vi.fn(),
    });
    await expect.poll(() => document.querySelector("dialog")).not.toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
    const layer =
      document.querySelector("[data-overlay-layer]") ?? document.body;
    expect(layer.contains(document.querySelector("dialog"))).toBe(true);
  });

  it("a Left pick changes the left prop only", async () => {
    const { onPick, onclose } = open();
    await page.getByTestId("hand-choice-left").click();
    await pickFan();
    expect(onPick).toHaveBeenCalledWith({
      leftPropType: PropType.FAN,
      rightPropType: PropType.STAFF,
      catDogMode: true,
    });
    expect(onclose).not.toHaveBeenCalled();
  });

  it("a pick under Both gives both hands the prop", async () => {
    const { onPick } = open();
    await pickFan();
    expect(onPick).toHaveBeenCalledWith({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
    });
  });
});
