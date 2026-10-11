import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

vi.mock("./StudioCastPreview.svelte", async () => ({
  default: (await import("./StudioCastPreviewTestStub.svelte")).default,
}));

import StageStarterTestHarness from "./StageStarterTestHarness.svelte";

const VIEWPORTS = [
  { label: "phone portrait", width: 375, height: 667 },
  { label: "phone landscape", width: 960, height: 412 },
  { label: "tablet portrait", width: 820, height: 1180 },
  { label: "desktop", width: 1440, height: 900 },
  { label: "large desktop", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
] as const;

const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

async function enterFormationStep(): Promise<void> {
  await page.getByRole("button", { name: "Build from an empty stage" }).click();
  await settle();
  await page.getByRole("button", { name: "Pick one for me" }).click();
  await settle();
  await page.getByRole("button", { name: "8 performers" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await settle();
}

describe("StageStarter guided cast and formation", () => {
  afterEach(async () => {
    localStorage.removeItem("tka-stage-starter-dismissed");
    await page.viewport(1440, 900);
  });

  it("keeps six formation choices reachable without horizontal overflow", async () => {
    localStorage.removeItem("tka-stage-starter-dismissed");
    await page.viewport(375, 667);
    render(StageStarterTestHarness);
    await enterFormationStep();

    expect(
      page.getByRole("button", { name: /Line One clear row/ }).elements()
    ).toHaveLength(1);
    expect(
      page.getByRole("button", { name: /Stagger Offset the rows/ }).elements()
    ).toHaveLength(1);
    await expectNoA11yViolations();

    for (const viewport of VIEWPORTS) {
      await page.viewport(viewport.width, viewport.height);
      await settle();

      const dialog =
        document.querySelector<HTMLDialogElement>("dialog.base-modal");
      const modalBody = dialog?.querySelector<HTMLElement>(".modal-body");
      const starter = dialog?.querySelector<HTMLElement>(".guide-surface");
      const formationGrid =
        dialog?.querySelector<HTMLElement>(".formation-grid");
      const dialogRect = dialog?.getBoundingClientRect();

      expect(dialog, `${viewport.label}: dialog exists`).not.toBeNull();
      expect(modalBody, `${viewport.label}: modal body exists`).not.toBeNull();
      expect(starter, `${viewport.label}: starter exists`).not.toBeNull();
      expect(
        formationGrid,
        `${viewport.label}: formation grid exists`
      ).not.toBeNull();
      expect(
        dialogRect!.left,
        `${viewport.label}: dialog stays inside the left edge`
      ).toBeGreaterThanOrEqual(-0.5);
      expect(
        dialogRect!.right,
        `${viewport.label}: dialog stays inside the right edge`
      ).toBeLessThanOrEqual(window.innerWidth + 0.5);
      expect(
        dialogRect!.bottom,
        `${viewport.label}: dialog stays inside the bottom edge`
      ).toBeLessThanOrEqual(window.innerHeight + 0.5);
      expect(
        starter!.scrollWidth,
        `${viewport.label}: no horizontal content overflow`
      ).toBeLessThanOrEqual(starter!.clientWidth + 1);
      const columnCount = getComputedStyle(formationGrid!)
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length;
      expect(columnCount, `${viewport.label}: formation grid recomposes`).toBe(
        viewport.width <= 375 ? 2 : 3
      );

      modalBody!.scrollTop = 0;
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null))
      );
      if (import.meta.env.VITE_CAPTURE_STAGE_STARTER === "1") {
        await page.screenshot({
          path: `__screenshots__/stage-starter-${viewport.width}x${viewport.height}-top.png`,
        });
      }

      modalBody!.scrollTop = modalBody!.scrollHeight;
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null))
      );
      const nextButton = page.getByRole("button", { name: "Next" }).element();
      const bodyRect = modalBody!.getBoundingClientRect();
      const nextRect = nextButton.getBoundingClientRect();
      expect(
        nextRect.bottom,
        `${viewport.label}: final action remains reachable`
      ).toBeLessThanOrEqual(bodyRect.bottom + 0.5);

      if (import.meta.env.VITE_CAPTURE_STAGE_STARTER === "1") {
        await page.screenshot({
          path: `__screenshots__/stage-starter-${viewport.width}x${viewport.height}-bottom.png`,
        });
      }
    }
  });
});
