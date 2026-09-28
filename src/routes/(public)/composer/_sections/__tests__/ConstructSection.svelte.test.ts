import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/features/create/construct/start-placement-picker/components/StartPlacementPicker.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);
vi.mock(
  "$lib/features/create/construct/option-picker/components/OptionPicker.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);
vi.mock(
  "$lib/shared/sequence-viewer/components/AnimationPlayer.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);
vi.mock(
  "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);

import ConstructSection from "../ConstructSection.svelte";

/**
 * Below 1200 px the play-phase actions sit under the player instead of in the
 * action slot, so the slot's crossfade cannot carry focus between them. A
 * keyboard user pressing one of them must never land back at the top of the
 * page, and the control that takes focus must be on screen.
 */

function inView(element: Element | null): boolean {
  if (!element) return false;
  const box = element.getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight;
}

async function press(name: string): Promise<void> {
  const control = page.getByRole("button", { name, exact: true });
  await expect.element(control).toBeVisible();
  (control.element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");
}

async function playOneStep() {
  const screen = render(ConstructSection, { presentationMode: "guided-build" });
  await page.getByRole("button", { name: "Choose start" }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  await press("Play sequence");
  return screen;
}

describe("ConstructSection focus below 1200 px", () => {
  beforeEach(async () => {
    // Short enough that the actions under the player start off screen.
    await page.viewport(1024, 500);
    window.scrollTo(0, 0);
  });

  it("moves focus from Play to Keep building and scrolls it into view", async () => {
    await playOneStep();

    await expect
      .element(page.getByRole("button", { name: "Keep building" }))
      .toHaveFocus();
    await expect.poll(() => inView(document.activeElement)).toBe(true);
  });

  it("returns focus to Play after Keep building", async () => {
    await playOneStep();
    await press("Keep building");

    await expect
      .element(page.getByRole("button", { name: "Play sequence" }))
      .toHaveFocus();
    await expect.poll(() => inView(document.activeElement)).toBe(true);
  });

  it("keeps focus in the action slot after Build another", async () => {
    const { container } = await playOneStep();
    await press("Build another");

    await expect
      .element(page.getByRole("button", { name: "Choose start" }))
      .toBeInTheDocument();
    const swap = container.querySelector(".action-swap");
    await expect.poll(() => swap?.contains(document.activeElement)).toBe(true);
    await expect.poll(() => inView(document.activeElement)).toBe(true);
  });
});
