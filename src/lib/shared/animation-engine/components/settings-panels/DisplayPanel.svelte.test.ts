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

// The header's parts became their own switches on 2026-11-02, after Word,
// disabled (never hidden) while the header is off so the list keeps its shape.
// The silent failures: a part chip that writes the whole header or another
// part, and a list that reflows when Word goes off.
describe("DisplayPanel header parts", () => {
  const parts = [
    ["Level", "headerLevel"],
    ["LOOP", "headerLoop"],
    ["Turns", "headerTurns"],
    ["Reversals", "headerReversals"],
  ] as const;

  it("adds Level, LOOP, Turns and Reversals after Word as chips", async () => {
    const scope = scopeRef.current;
    if (!scope) throw new Error("no scope");
    render(DisplayPanel, { chips: true, showHeaderParts: true });

    const group = page.getByRole("group");
    await expect.element(group).toBeVisible();
    const labels = group
      .getByRole("button")
      .elements()
      .map((el) => el.textContent?.trim());
    expect(labels).toHaveLength(14);
    const word = labels.indexOf("Word");
    expect(labels.slice(word + 1, word + 5)).toEqual(
      parts.map(([label]) => label)
    );

    // Each chip turns off its own part only: the parts after it stay on.
    for (const [index, [label, key]] of parts.entries()) {
      await page.getByRole("button", { name: label, exact: true }).click();
      expect(scope.visibility.getVisibility(key), key).toBe(false);
      expect(scope.visibility.getVisibility("wordHeader")).toBe(true);
      for (const [, later] of parts.slice(index + 1)) {
        expect(scope.visibility.getVisibility(later), later).toBe(true);
      }
    }
  });

  it("keeps the parts in place but disabled while Word is off, as chips and as the Header row", async () => {
    const scope = scopeRef.current;
    if (!scope) throw new Error("no scope");
    scope.visibility.setVisibility("wordHeader", false);

    const chipsView = render(DisplayPanel, {
      chips: true,
      showHeaderParts: true,
    });
    for (const [label] of parts) {
      await expect
        .element(page.getByRole("button", { name: label, exact: true }))
        .toBeDisabled();
    }
    chipsView.unmount();

    render(DisplayPanel, { hostSized: true, showHeaderParts: true });
    // Beside picture tiles the parts are a Header row of small chips under
    // the ten tiles, so the tiles (and the stage above them) keep their size.
    expect(document.querySelectorAll(".vis-grid .rt-chip")).toHaveLength(10);
    const row = page.getByRole("group", { name: "Header" });
    await expect.element(row).toBeVisible();
    for (const [label] of parts) {
      await expect
        .element(row.getByRole("button", { name: label, exact: true }))
        .toBeDisabled();
    }
    scope.visibility.setVisibility("wordHeader", true);
    await expect
      .element(row.getByRole("button", { name: "Level", exact: true }))
      .toBeEnabled();
    await row.getByRole("button", { name: "Turns", exact: true }).click();
    expect(scope.visibility.getVisibility("headerTurns")).toBe(false);
    expect(scope.visibility.getVisibility("headerLevel")).toBe(true);
  });

  it("leaves other hosts at their ten switches", async () => {
    render(DisplayPanel, { chips: true });
    const group = page.getByRole("group");
    await expect.element(group).toBeVisible();
    expect(group.getByRole("button").elements()).toHaveLength(10);
  });
});
