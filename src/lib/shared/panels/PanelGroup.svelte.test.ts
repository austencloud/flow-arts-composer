/**
 * PanelGroup backdrop hold.
 *
 * While the track slides, the animated backdrop holds its last frame so the
 * slide gets the frame budget. A hold that never released would leave the
 * backdrop frozen with nothing on screen to show why, so this guards the
 * release as much as the hold.
 */
import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerBackgroundFreezeTarget } from "$lib/shared/background/shared/state/background-hold.svelte";
import PanelGroupMotionTestHarness from "./PanelGroupMotionTestHarness.svelte";

function settle(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inMotion(): boolean {
  return (
    document.querySelector(".panel-group")?.hasAttribute("data-panel-motion") ??
    false
  );
}

describe("PanelGroup backdrop hold", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("holds the animated backdrop while the track slides, then lets it run", async () => {
    const screen = render(PanelGroupMotionTestHarness, { folded: false });
    await settle(300);
    const backdrop = { freeze: vi.fn(), unfreeze: vi.fn() };
    registerBackgroundFreezeTarget(backdrop);

    await screen.rerender({ folded: true });
    await settle(50);
    expect(inMotion(), "the fold is sliding").toBe(true);
    expect(backdrop.freeze, "slide holds it").toHaveBeenCalledTimes(1);
    expect(backdrop.unfreeze).not.toHaveBeenCalled();

    await settle(800);
    expect(inMotion(), "the fold has settled").toBe(false);
    expect(backdrop.unfreeze, "released after settling").toHaveBeenCalledTimes(
      1
    );

    await screen.rerender({ folded: false });
    await settle(50);
    expect(backdrop.freeze, "unfolding holds it again").toHaveBeenCalledTimes(
      2
    );
    await settle(800);
    expect(backdrop.unfreeze, "released again").toHaveBeenCalledTimes(2);
  });
});
