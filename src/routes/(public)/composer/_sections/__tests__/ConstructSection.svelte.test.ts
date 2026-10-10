import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "#lib/features/create/construct/start-placement-picker/components/StartPlacementPicker.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);
vi.mock(
  "#lib/features/create/construct/option-picker/components/OptionPicker.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);
vi.mock(
  "#lib/shared/sequence-viewer/components/AnimationPlayer.svelte",
  async () => ({
    default: (await import("./ConstructDemoTestStub.svelte")).default,
  })
);
vi.mock(
  "#lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte",
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

/** The action slot during the start pick. It has no controls, so it takes
 *  focus itself and needs a name for a screen reader to announce. */
function startPrompt() {
  return page.getByRole("group", { name: "Choose your start placement" });
}

async function playOneStep(): Promise<void> {
  render(ConstructSection, { presentationMode: "guided-build" });
  await page.getByRole("button", { name: "Choose start" }).click();
  await page.getByRole("button", { name: "Add step" }).click();
  await press("Play sequence");
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
});

/**
 * The picker pane swaps its whole content between phases, and Clear sequence
 * removes itself, so each of these used to drop focus to <body> at any width.
 * Clear sequence and Build another both lead back to the start pick, where
 * focus rests on the action slot's named prompt. The attract act stays idle
 * (active: false) so it cannot build over the test.
 */
describe.each([
  { layout: "below 1200 px", width: 1024, height: 500 },
  { layout: "at 1200 px and wider", width: 1400, height: 900 },
])("ConstructSection focus across phases $layout", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
    window.scrollTo(0, 0);
  });

  function renderDemo() {
    return render(ConstructSection, {
      presentationMode: "guided-build",
      active: false,
    });
  }

  it("keeps focus in the picker after a start position is picked", async () => {
    const { container } = renderDemo();
    await press("Choose start");

    await expect
      .element(page.getByRole("button", { name: "Add step" }))
      .toBeInTheDocument();
    const pane = container.querySelector(".picker-pane");
    await expect.poll(() => pane?.contains(document.activeElement)).toBe(true);
  });

  it("hands focus to the named start prompt after Clear sequence", async () => {
    renderDemo();
    await press("Choose start");
    await press("Add step");
    await press("Clear sequence");

    await expect.element(startPrompt()).toHaveFocus();
    await expect.poll(() => inView(document.activeElement)).toBe(true);
  });

  it("hands focus to the named start prompt after Build another", async () => {
    renderDemo();
    await press("Choose start");
    await press("Add step");
    await press("Play sequence");
    await press("Build another");

    await expect.element(startPrompt()).toHaveFocus();
    await expect.poll(() => inView(document.activeElement)).toBe(true);
  });

  it("moves focus to Build another when the eighth step starts playback", async () => {
    renderDemo();
    await press("Choose start");
    for (let step = 0; step < 8; step++) await press("Add step");

    await expect
      .element(page.getByRole("button", { name: "Build another" }))
      .toHaveFocus();
    await expect.poll(() => inView(document.activeElement)).toBe(true);
  });
});
