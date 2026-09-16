import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import OptionPickerDesktopLayoutHarness from "./OptionPickerDesktopLayoutHarness.svelte";

/**
 * Choosing a start placement expands the workspace, and StandardWorkspaceLayout
 * eases its grid columns over 450ms to do it. The picker mounts on the first
 * frame of that ease, so its first measurement is the panel's PRE-expansion
 * width. Committing that width opened the 8-column desktop grid inside a panel
 * about to be half as wide, then swapped it for the swipe layout half a second
 * later — moving the option the user was already reaching for.
 */
describe("OptionPickerContent settling width", () => {
  it("opens in the destination layout while the panel is still shrinking", async () => {
    render(OptionPickerDesktopLayoutHarness, {
      width: 1089,
      settledWidth: 545,
      settleMs: 450,
      height: 700,
      sideBySide: true,
    });

    const desktopGridSeenAt: number[] = [];
    let swipeSeenAt: number | null = null;
    const start = performance.now();

    while (performance.now() - start < 1200) {
      const elapsed = Math.round(performance.now() - start);
      if (document.querySelector(".sections-container")) {
        desktopGridSeenAt.push(elapsed);
      }
      if (swipeSeenAt === null && document.querySelector(".swipe-container")) {
        swipeSeenAt = elapsed;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    // The wide grid must never have been on screen, not merely be gone by now.
    expect(desktopGridSeenAt).toEqual([]);
    expect(swipeSeenAt).not.toBeNull();

    const harness = document.querySelector<HTMLElement>(".harness");
    expect(harness).not.toBeNull();
    expect(harness!.getBoundingClientRect().width).toBeCloseTo(545, 0);
  });

  it("still opens the desktop grid when the panel settles wide", async () => {
    render(OptionPickerDesktopLayoutHarness, {
      width: 1600,
      settledWidth: 900,
      settleMs: 450,
      height: 700,
      sideBySide: true,
    });

    const start = performance.now();
    let swipeSeenAt: number | null = null;
    let desktopSeenAt: number | null = null;

    while (performance.now() - start < 1200) {
      const elapsed = Math.round(performance.now() - start);
      if (swipeSeenAt === null && document.querySelector(".swipe-container")) {
        swipeSeenAt = elapsed;
      }
      if (
        desktopSeenAt === null &&
        document.querySelector(".sections-container")
      ) {
        desktopSeenAt = elapsed;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    expect(swipeSeenAt).toBeNull();
    expect(desktopSeenAt).not.toBeNull();
  });
});
