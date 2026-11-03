import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import type { AccountSetupState } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
import Harness from "./BackgroundTab.setup-step.test-harness.svelte";

// A new member opened the Theme page, kept the theme they had, and the setup
// checklist still listed "Choose your theme".
function fakeSetup() {
  const setup = $state({ available: false, themeDone: false });
  const markThemeChosen = vi.fn(async () => {
    setup.themeDone = true;
  });
  const state = {
    get available() {
      return setup.available;
    },
    get tasks() {
      return [{ id: "theme", complete: setup.themeDone }];
    },
    get saveError() {
      return null;
    },
    markThemeChosen,
    retrySave: vi.fn(),
  } as unknown as AccountSetupState;
  return { setup, state, markThemeChosen };
}

describe("Settings Theme page and the setup checklist", () => {
  it("counts opening the page as choosing a theme, once progress loads", async () => {
    const { setup, state, markThemeChosen } = fakeSetup();
    render(Harness, { state });

    expect(markThemeChosen).not.toHaveBeenCalled();
    setup.available = true;

    await vi.waitFor(() => expect(markThemeChosen).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markThemeChosen).toHaveBeenCalledTimes(1);
  });

  // Theme folded into Settings → Display (2026-11-02). As a Display screen
  // the showroom must still count as the choice, go back, and apply.
  it("works as the Display tab's Theme screen", async () => {
    const { setup, state, markThemeChosen } = fakeSetup();
    setup.available = true;
    const onBack = vi.fn();
    const onUpdate = vi.fn();
    render(Harness, { state, onBack, onUpdate });

    await vi.waitFor(() => expect(markThemeChosen).toHaveBeenCalledTimes(1));
    expect(document.querySelector("[data-theme-screen]")).not.toBeNull();

    await page.getByRole("button", { name: "Back" }).click();
    expect(onBack).toHaveBeenCalledTimes(1);

    await page.getByRole("button", { name: "Ocean", exact: true }).click();
    await page.getByRole("button", { name: "Use Ocean", exact: true }).click();
    await vi.waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        key: "backgroundType",
        value: "ocean",
      })
    );
  });
});
