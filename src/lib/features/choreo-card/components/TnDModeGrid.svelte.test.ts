import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import TnDModeGrid from "./TnDModeGrid.svelte";

// Contains, not ends-with: a disabled chip carries its reason after the code.
function chip(container: HTMLElement, mode: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label*="(${mode})"]`
  );
  expect(button, `${mode} chip should render`).not.toBeNull();
  return button!;
}

describe("TnDModeGrid", () => {
  it("renders the six modes as a labelled radiogroup with the selection pressed", () => {
    const { container } = render(TnDModeGrid, {
      selected: "SO",
      onpick: vi.fn(),
    });

    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute("aria-label")).toBe("Timing and direction");
    expect(container.querySelectorAll("button").length).toBe(6);
    expect(chip(container, "SO").getAttribute("aria-pressed")).toBe("true");
    expect(chip(container, "TS").getAttribute("aria-pressed")).toBe("false");
  });

  it("presses nothing when selected is null", () => {
    const { container } = render(TnDModeGrid, {
      selected: null,
      onpick: vi.fn(),
    });

    expect(
      container.querySelectorAll('button[aria-pressed="true"]').length
    ).toBe(0);
  });

  it("reports the picked mode", async () => {
    const onpick = vi.fn();
    render(TnDModeGrid, { selected: "TS", onpick });

    await page.getByRole("button", { name: /Quarter Opposite/ }).click();

    expect(onpick).toHaveBeenCalledWith("QO");
  });

  it("disables listed modes with their reason in the tooltip and the name", () => {
    const { container } = render(TnDModeGrid, {
      selected: null,
      disabledModes: ["QS"],
      reasons: { QS: "Not compatible with a Reflection LOOP" },
      ariaLabel: "Hand timing and direction",
      onpick: vi.fn(),
    });

    const qs = chip(container, "QS");
    expect(qs.disabled).toBe(true);
    expect(qs.title).toBe("Not compatible with a Reflection LOOP");
    expect(qs.getAttribute("aria-label")).toBe(
      "Quarter Same, Sun (QS), Not compatible with a Reflection LOOP"
    );
    expect(chip(container, "QO").disabled).toBe(false);
    expect(chip(container, "QO").title).toBe("");
    expect(
      container.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")
    ).toBe("Hand timing and direction");
  });

  it("disables every chip when the grid is disabled", () => {
    const { container } = render(TnDModeGrid, {
      selected: "TS",
      disabled: true,
      onpick: vi.fn(),
    });

    expect(container.querySelectorAll("button:disabled").length).toBe(6);
  });
});
