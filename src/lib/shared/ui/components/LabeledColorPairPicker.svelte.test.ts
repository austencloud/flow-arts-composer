import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import LabeledColorPairPicker from "./LabeledColorPairPicker.svelte";
import { COLOR_PRESETS } from "../color-presets";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

const LEFT = "#ef4444";
const RIGHT = "#3b82f6";

function renderPicker(overrides: Record<string, unknown> = {}) {
  const onchange = vi.fn();
  const onswap = vi.fn();
  const screen = render(LabeledColorPairPicker, {
    left: LEFT,
    right: RIGHT,
    onchange,
    onswap,
    ...overrides,
  });
  return { screen, onchange, onswap };
}

async function openLeft() {
  await page.getByRole("button", { name: `Edit Left prop, ${LEFT.toUpperCase()}` }).click();
}

describe("LabeledColorPairPicker", () => {
  it("applies a swatch to the hand being edited", async () => {
    const { onchange } = renderPicker();
    await openLeft();
    const first = COLOR_PRESETS[0]!;
    await page.getByRole("button", { name: `Left prop: ${first.name}` }).click();
    expect(onchange).toHaveBeenCalledWith("left", first.hex);
  });

  it("marks the swatch matching the current value as pressed", async () => {
    const preset = COLOR_PRESETS[5]!;
    renderPicker({ left: preset.hex });
    await page
      .getByRole("button", { name: `Edit Left prop, ${preset.hex.toUpperCase()}` })
      .click();
    await expect
      .element(page.getByRole("button", { name: `Left prop: ${preset.name}` }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: `Left prop: ${COLOR_PRESETS[0]!.name}` }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("swaps through the caller", async () => {
    const { onswap } = renderPicker();
    await page.getByRole("button", { name: "Swap left and right colors" }).click();
    expect(onswap).toHaveBeenCalledTimes(1);
  });

  it("hides the swap button when the caller cannot swap", async () => {
    renderPicker({ onswap: undefined });
    await expect
      .element(page.getByRole("button", { name: "Swap left and right colors" }))
      .not.toBeInTheDocument();
  });

  it("accepts a full hex from the field and ignores a partial one", async () => {
    const { onchange } = renderPicker();
    await openLeft();
    const field = page.getByRole("textbox", { name: "Left prop hex color" });
    await field.fill("#12");
    expect(onchange).not.toHaveBeenCalledWith("left", "#12");
    await field.fill("#123456");
    expect(onchange).toHaveBeenCalledWith("left", "#123456");
  });

  it("moves the hue with the keyboard", async () => {
    const { onchange } = renderPicker();
    await openLeft();
    const hue = page.getByRole("slider", { name: "Left prop hue" });
    await hue.click();
    await userEvent.keyboard("{ArrowRight}");
    const calls = onchange.mock.calls.filter(([hand]) => hand === "left");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)![1]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has no axe violations with the editor open", async () => {
    renderPicker();
    await openLeft();
    await expectNoA11yViolations();
  });
});
