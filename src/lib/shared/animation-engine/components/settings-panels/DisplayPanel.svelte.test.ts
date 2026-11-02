import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationVisibilityStateManager } from "../../state/animation-visibility-state.svelte";
import { createAnimationSettingsState } from "../../state/animation-settings-state.svelte";
import DisplayPanel from "./DisplayPanel.svelte";

const scopeRef = vi.hoisted(() => ({
  current: null as {
    visibility: AnimationVisibilityStateManager;
    settings: ReturnType<typeof createAnimationSettingsState>;
  } | null,
}));

vi.mock("../../state/animation-scope-context", () => ({
  getAnimationScopeContext: () => scopeRef.current,
}));

beforeEach(() => {
  scopeRef.current = {
    visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
    settings: createAnimationSettingsState({ ephemeral: true }),
  };
});

describe("DisplayPanel prop visibility", () => {
  it("shows props with one click when trail-only mode was persisted", async () => {
    const scope = scopeRef.current;
    expect(scope).not.toBeNull();
    if (!scope) return;

    scope.settings.setHideProps(true);
    render(DisplayPanel);

    const propsButton = page.getByRole("button", {
      name: "Props",
      exact: true,
    });
    await expect.element(propsButton).toHaveAttribute("aria-pressed", "false");

    await propsButton.click();

    expect(scope.visibility.getVisibility("props")).toBe(true);
    expect(scope.settings.trail.hideProps).toBe(false);
    await expect.element(propsButton).toHaveAttribute("aria-pressed", "true");
  });
});

// Settings → Display's phone screen draws the same switches as small chips.
// The silent failure is a chip row that drops a switch or writes the wrong
// layer; the step-number chip also carries the label the pictograph and card
// use ("Step numbers"), so the three screens agree.
describe("DisplayPanel chips", () => {
  it("renders every switch as a toggle chip and a chip writes its own layer", async () => {
    const scope = scopeRef.current;
    if (!scope) throw new Error("no scope");
    render(DisplayPanel, { chips: true });

    const group = page.getByRole("group");
    await expect.element(group).toBeVisible();
    // Ten switches, none drawn as a picture tile.
    expect(group.getByRole("button").elements()).toHaveLength(10);
    expect(document.querySelector(".vis-grid-shell")).toBeNull();

    const before = scope.visibility.getVisibility("stepNumbers");
    const stepChip = page.getByRole("button", {
      name: "Step numbers",
      exact: true,
    });
    await expect
      .element(stepChip)
      .toHaveAttribute("aria-pressed", String(before));
    await stepChip.click();
    expect(scope.visibility.getVisibility("stepNumbers")).toBe(!before);
    await expect
      .element(stepChip)
      .toHaveAttribute("aria-pressed", String(!before));
  });
});
