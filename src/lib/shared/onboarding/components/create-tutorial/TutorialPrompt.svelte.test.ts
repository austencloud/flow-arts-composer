import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";
import TutorialPrompt from "./TutorialPrompt.svelte";

describe("TutorialPrompt", () => {
  it("describes the three-action Construct guide and starts it", async () => {
    const onAccept = vi.fn();
    render(TutorialPrompt, { onAccept, onSkip: vi.fn() });

    await expect
      .element(page.getByRole("dialog", { name: "Try the Construct guide?" }))
      .toBeVisible();
    await expect
      .element(
        page.getByText(
          "Choose a start placement, add one pictograph, then play the sequence.",
          { exact: true }
        )
      )
      .toBeVisible();

    await page.getByRole("button", { name: "Start guide" }).click();
    expect(onAccept).toHaveBeenCalledOnce();
    await expectNoA11yViolations();
  });

  it("keeps the guide optional", async () => {
    const onSkip = vi.fn();
    render(TutorialPrompt, { onAccept: vi.fn(), onSkip });

    await page.getByRole("button", { name: "Skip for now" }).click();
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
