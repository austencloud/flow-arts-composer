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
});
