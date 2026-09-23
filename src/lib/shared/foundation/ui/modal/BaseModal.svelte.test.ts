import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";
import BaseModalTestHarness from "./BaseModalTestHarness.svelte";

const FOLD_VIEWPORTS = [
  { label: "Fold cover portrait", width: 344, height: 884 },
  { label: "Fold cover landscape", width: 884, height: 344 },
  { label: "Fold unfolded portrait", width: 619, height: 720 },
  { label: "Fold unfolded landscape", width: 720, height: 619 },
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "iPad", width: 768, height: 1024 },
] as const;

function nextLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe("BaseModal fit sizing", () => {
  afterEach(async () => {
    document.querySelector('[data-testid="external-overlay"]')?.remove();
    document.documentElement.style.removeProperty("--viewport-height");
    document.documentElement.style.removeProperty("--viewport-offset-top");
    document.documentElement.style.removeProperty("--viewport-offset-bottom");
    delete document.documentElement.dataset.motionPreference;
    await page.viewport(414, 896);
  });

  it("keeps tall content reachable across Fold-sized viewports", async () => {
    await page.viewport(FOLD_VIEWPORTS[0].width, FOLD_VIEWPORTS[0].height);
    render(BaseModalTestHarness);

    await expect
      .element(page.getByRole("dialog", { name: "Scrollable modal" }))
      .toBeVisible();

    const openedState = document.querySelector<HTMLOutputElement>(
      '[data-testid="base-modal-opened-state"]'
    );
    expect(openedState?.textContent?.trim()).toBe("1:true");
    expect(
      document
        .querySelector("dialog.base-modal")
        ?.hasAttribute("data-keyboard-shortcuts-ignore")
    ).toBe(true);

    for (const viewport of FOLD_VIEWPORTS) {
      await page.viewport(viewport.width, viewport.height);
      await nextLayout();

      const dialog =
        document.querySelector<HTMLDialogElement>("dialog.base-modal");
      const scrollBody = dialog?.querySelector<HTMLElement>(".modal-body");
      const endButton = page
        .getByRole("button", { name: "End of modal" })
        .element();

      expect(dialog, `${viewport.label}: dialog exists`).not.toBeNull();
      expect(
        scrollBody,
        `${viewport.label}: scroll body exists`
      ).not.toBeNull();

      const dialogRect = dialog!.getBoundingClientRect();
      expect(
        dialogRect.top,
        `${viewport.label}: dialog top`
      ).toBeGreaterThanOrEqual(-0.5);
      expect(
        dialogRect.bottom,
        `${viewport.label}: dialog bottom`
      ).toBeLessThanOrEqual(window.innerHeight + 0.5);
      expect(
        scrollBody!.scrollHeight,
        `${viewport.label}: body has overflow to scroll`
      ).toBeGreaterThan(scrollBody!.clientHeight);

      scrollBody!.scrollTop = scrollBody!.scrollHeight;
      await nextLayout();

      const bodyRect = scrollBody!.getBoundingClientRect();
      const buttonRect = endButton.getBoundingClientRect();
      expect(
        buttonRect.top,
        `${viewport.label}: final action top`
      ).toBeGreaterThanOrEqual(bodyRect.top - 0.5);
      expect(
        buttonRect.bottom,
        `${viewport.label}: final action bottom`
      ).toBeLessThanOrEqual(bodyRect.bottom + 0.5);
    }

    // Chrome Android normally shrinks only visualViewport for the keyboard.
    // Keep the layout viewport tall and publish the smaller visible rectangle.
    await page.viewport(619, 720);
    document.documentElement.style.setProperty("--viewport-height", "420px");
    document.documentElement.style.setProperty("--viewport-offset-top", "0px");
    document.documentElement.style.setProperty(
      "--viewport-offset-bottom",
      "300px"
    );
    await nextLayout();

    const keyboardDialog =
      document.querySelector<HTMLDialogElement>("dialog.base-modal");
    const keyboardBody =
      keyboardDialog?.querySelector<HTMLElement>(".modal-body");
    const keyboardDialogRect = keyboardDialog!.getBoundingClientRect();
    expect(
      keyboardDialogRect.top,
      "keyboard: dialog top"
    ).toBeGreaterThanOrEqual(-0.5);
    expect(
      keyboardDialogRect.bottom,
      "keyboard: dialog bottom"
    ).toBeLessThanOrEqual(420.5);
    expect(
      keyboardBody!.scrollHeight,
      "keyboard: body remains scrollable"
    ).toBeGreaterThan(keyboardBody!.clientHeight);

    await expectNoA11yViolations();
  });

  it("keeps short fit modals content-sized on phones", async () => {
    await page.viewport(375, 667);
    render(BaseModalTestHarness, { shortContent: true });
    await nextLayout();

    const dialog = document.querySelector<HTMLDialogElement>(
      "dialog.base-modal[data-size='fit']"
    );
    const wrapper = dialog?.querySelector<HTMLElement>(
      ".modal-content-wrapper"
    );

    expect(dialog).not.toBeNull();
    expect(wrapper).not.toBeNull();
    expect(dialog!.getBoundingClientRect().height).toBeCloseTo(
      wrapper!.getBoundingClientRect().height,
      0
    );
    expect(dialog!.getBoundingClientRect().height).toBeLessThan(
      window.innerHeight / 2
    );
  });

  it("animates later intrinsic height changes from the visible size", async () => {
    const capturedFrames: Keyframe[][] = [];
    const nativeAnimate = HTMLElement.prototype.animate;
    const nativeMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    HTMLElement.prototype.animate = function (
      frames: Keyframe[] | PropertyIndexedKeyframes,
      options?: number | KeyframeAnimationOptions
    ) {
      if (this.matches("dialog.base-modal")) {
        capturedFrames.push(Array.from(frames as Keyframe[]));
      }
      return nativeAnimate.call(this, frames, options);
    };

    try {
      render(BaseModalTestHarness, { shortContent: true, animation: "none" });
      await expect
        .poll(
          () => document.querySelector<HTMLDialogElement>("dialog.base-modal")?.dataset.entered
        )
        .toBe("true");
      await nextLayout();

      // Opening establishes a baseline. It should not create a separate size
      // animation before the user changes what the sheet contains.
      expect(capturedFrames).toHaveLength(0);

      await page.getByRole("button", { name: "Toggle content height" }).click();
      await nextLayout();
      expect(
        document.querySelector<HTMLDialogElement>("dialog.base-modal")?.style.height
      ).not.toBe("");
      await expect.poll(() => capturedFrames.length).toBe(1);
      const grow = capturedFrames[0]!;
      expect(grow[0]?.height).not.toBe(grow[1]?.height);

      // Reverse while the grow animation is still visible. The next motion
      // starts at that visible frame rather than jumping to the old endpoint.
      await new Promise((resolve) => setTimeout(resolve, 60));
      page
        .getByRole("button", { name: "Toggle content height" })
        .element()
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await expect.poll(() => capturedFrames.length).toBe(2);
      const shrink = capturedFrames[1]!;
      expect(shrink[0]?.height).not.toBe(grow[1]?.height);
      expect(shrink[0]?.height).not.toBe(shrink[1]?.height);

      // The in-app preference must settle existing WAAPI motion too; changing
      // only future durations or CSS does not stop an animation already running.
      document.documentElement.dataset.motionPreference = "reduce";
      await nextLayout();
      const dialog = document.querySelector<HTMLElement>("dialog.base-modal")!;
      expect(
        dialog
          .getAnimations()
          .filter((animation) => animation.playState === "running")
      ).toHaveLength(0);
      expect(dialog.offsetHeight).toBe(
        dialog.querySelector<HTMLElement>(".modal-content-wrapper")!
          .offsetHeight
      );
    } finally {
      HTMLElement.prototype.animate = nativeAnimate;
      window.matchMedia = nativeMatchMedia;
    }
  });

  it("settles content-sized changes immediately when motion is reduced", async () => {
    const nativeAnimate = HTMLElement.prototype.animate;
    let dialogAnimations = 0;
    HTMLElement.prototype.animate = function (
      frames: Keyframe[] | PropertyIndexedKeyframes,
      options?: number | KeyframeAnimationOptions
    ) {
      if (this.matches("dialog.base-modal")) dialogAnimations += 1;
      return nativeAnimate.call(this, frames, options);
    };
    document.documentElement.dataset.motionPreference = "reduce";

    try {
      render(BaseModalTestHarness, { shortContent: true, animation: "none" });
      await expect
        .poll(
          () => document.querySelector<HTMLDialogElement>("dialog.base-modal")?.dataset.entered
        )
        .toBe("true");
      await nextLayout();
      await page.getByRole("button", { name: "Toggle content height" }).click();
      await nextLayout();

      expect(dialogAnimations).toBe(0);
      const dialog = document.querySelector<HTMLElement>("dialog.base-modal")!;
      const wrapper = dialog.querySelector<HTMLElement>(
        ".modal-content-wrapper"
      )!;
      expect(dialog.offsetHeight).toBe(wrapper.offsetHeight);
    } finally {
      HTMLElement.prototype.animate = nativeAnimate;
    }
  });

  it("does not report opened when the modal closes before its delayed show", async () => {
    render(BaseModalTestHarness, { cancelBeforeOpen: true });

    await nextLayout();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const openedState = document.querySelector<HTMLOutputElement>(
      '[data-testid="base-modal-opened-state"]'
    );
    const dialog =
      document.querySelector<HTMLDialogElement>("dialog.base-modal");

    expect(openedState?.textContent?.trim()).toBe("0:false");
    expect(dialog?.open ?? false).toBe(false);
  });

  it("reports closed only once the dialog has left the top layer", async () => {
    render(BaseModalTestHarness, { animation: "pop" });
    await expect
      .element(page.getByRole("dialog", { name: "Scrollable modal" }))
      .toBeVisible();
    const closedState = () =>
      document
        .querySelector<HTMLOutputElement>(
          '[data-testid="base-modal-closed-state"]'
        )
        ?.textContent?.trim();

    await page.getByRole("button", { name: "Close modal" }).click();
    await nextLayout();

    // The exit animation is still running: the dialog is still modal, and a
    // surface opened now would sit beneath it. Nothing has been reported yet.
    const dialog =
      document.querySelector<HTMLDialogElement>("dialog.base-modal");
    expect(dialog?.open ?? false).toBe(true);
    expect(closedState()).toBe("0:true");

    await expect.poll(closedState).toBe("1:false");
    expect(
      document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open ??
        false
    ).toBe(false);
  });

  it("keeps a third-party overlay interactive when external overlays are allowed", async () => {
    let overlayClicks = 0;
    const externalOverlay = document.createElement("button");
    externalOverlay.type = "button";
    externalOverlay.dataset.testid = "external-overlay";
    externalOverlay.textContent = "Password manager suggestion";
    externalOverlay.style.cssText = [
      "position: fixed",
      "inset-block-start: 8px",
      "inset-inline-end: 8px",
      "z-index: 2147483647",
    ].join(";");
    externalOverlay.addEventListener("click", () => {
      overlayClicks += 1;
    });
    document.body.append(externalOverlay);

    render(BaseModalTestHarness, { allowExternalOverlays: true });

    const dialog = page.getByRole("dialog", { name: "Scrollable modal" });
    await expect.element(dialog).toBeVisible();

    const dialogElement =
      document.querySelector<HTMLDialogElement>("dialog.base-modal");
    expect(dialogElement?.matches(":modal") ?? true).toBe(false);
    await expect.element(page.getByTestId("external-overlay")).toBeVisible();

    await page.getByTestId("external-overlay").click();

    expect(overlayClicks).toBe(1);
    expect(document.activeElement).toBe(externalOverlay);
    expect(dialogElement?.open ?? false).toBe(true);
  });
});
