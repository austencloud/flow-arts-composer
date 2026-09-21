import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { tick } from "svelte";
import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
import { EMPTY_META_PUBLISH_STATUS } from "$lib/shared/share/services/meta-publish";
import PostShareSheet from "$lib/shared/share/components/PostShareSheet.svelte";
import "../../src/app.css";

const { renderCard, deliverCard } = vi.hoisted(() => ({
  renderCard: vi.fn(),
  deliverCard: vi.fn(async () => ({
    status: "done",
    message: "Download started",
  })),
}));
vi.mock("$lib/shared/share/get-sharer", () => ({
  getSharer: () => ({ getCardImageBlob: renderCard }),
}));
vi.mock("$lib/shared/share/services/post-handoff", async (original) => ({
  ...(await original<
    typeof import("$lib/shared/share/services/post-handoff")
  >()),
  downloadArtifact: deliverCard,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function realSequence(steps = 16): SequenceData {
  const sequence = structuredClone(demo);
  sequence.steps = sequence.steps.slice(0, steps);
  sequence.word = sequence.steps.map((step) => step.letter).join("");
  return {
    ...sequence,
    id: `live-download-${steps}`,
  } as unknown as SequenceData;
}

async function openCard(sequence: SequenceData, columns: number | null = 2) {
  await page.viewport(1920, 1080);
  const composition = getImageCompositionManager();
  composition.setPersistenceSuspended(true);
  composition.setShowQRCode(false);
  composition.setShowMandala(true);
  composition.setColumnCountForStepCount(sequence.steps.length, columns);
  getVisibilityStateManager().setGridVisibility(true);
  return render(PostShareSheet, {
    isOpen: true,
    sequence,
    shareUrl: "",
    videoBlobUrl: null,
    isExportingVideo: false,
    exportProgress: null,
    onClose: vi.fn(),
    initialArtifact: "card",
    availableArtifacts: ["card"],
    initialEntry: "download",
    canCreateLink: false,
    metaStatusOverride: EMPTY_META_PUBLISH_STATUS,
  });
}

afterEach(() => {
  renderCard.mockReset();
  deliverCard.mockClear();
});

describe("Download card with real live pictographs", () => {
  it("honors an immediate click while the initial Auto layout settles", async () => {
    const png = deferred<Blob>();
    renderCard.mockReturnValue(png.promise);
    const screen = await openCard(realSequence(), null);
    // Click synchronously before waiting for assets, layout, or the PNG request.
    // Playwright's stability wait would conceal the first-paint boundary here.
    const download = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Download card");
    expect(download).toBeDefined();
    download!.click();
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
    png.resolve(new Blob(["initial Auto card"], { type: "image/png" }));
    await expect.poll(() => deliverCard.mock.calls.length).toBe(1);
    await screen.unmount();
  });

  it.each([
    [375, 667],
    [820, 1180],
  ])("contains the entire live card at %i × %i", async (width, height) => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence());
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
    await page.viewport(width, height);
    await expect
      .poll(() => {
        const stage = document
          .querySelector(".stage.live-card-stage")
          ?.getBoundingClientRect();
        const card = document
          .querySelector(".live-export-card .preview-stack")
          ?.getBoundingClientRect();
        return (
          !!stage &&
          !!card &&
          card.width > 0 &&
          card.height > 0 &&
          card.left >= stage.left - 1 &&
          card.right <= stage.right + 1 &&
          card.top >= stage.top - 1 &&
          card.bottom <= stage.bottom + 1
        );
      })
      .toBe(true);
    await screen.unmount();
  });

  it("fits Auto to the phone preview instead of the full viewport height", async () => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence(8), null);
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
    await page.viewport(375, 667);
    await expect
      .poll(() => {
        const stage = document
          .querySelector(".stage.live-card-stage")
          ?.getBoundingClientRect();
        const card = document
          .querySelector(".live-export-card .preview-stack")
          ?.getBoundingClientRect();
        // The former viewport-based choice squeezed this eight-step card into
        // a 66px strip inside a 334px stage, despite Auto being selected.
        return (
          !!stage &&
          !!card &&
          card.width > stage.width * 0.6 &&
          card.height <= stage.height
        );
      })
      .toBe(true);
    await screen.unmount();
  });

  it("prepares a pinned layout and honors one explicit download while PNG is pending", async () => {
    const png = deferred<Blob>();
    renderCard.mockReturnValue(png.promise);
    const screen = await openCard(realSequence());
    await expect
      .poll(() => renderCard.mock.calls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    expect(
      document.querySelectorAll(".live-export-card .live-pictograph").length
    ).toBe(17);
    expect(deliverCard).not.toHaveBeenCalled();
    await page
      .getByRole("button", { name: "Download card", exact: true })
      .click();
    png.resolve(new Blob(["prepared card"], { type: "image/png" }));
    await expect.poll(() => deliverCard.mock.calls.length).toBe(1);
    expect(document.querySelector(".live-export-card")).not.toBeNull();
    await tick();
    expect(deliverCard).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("can return from a pinned layout to Auto and back without a rendering loop", async () => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence());
    await expect
      .poll(() => renderCard.mock.calls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    await page
      .getByRole("button", {
        name: "Auto columns and start placement",
        exact: true,
      })
      .click();
    await expect
      .poll(
        () =>
          renderCard.mock.calls.at(-1)?.[1].resolvedRenderOptions.columnCount
      )
      .not.toBe(2);
    const auto = renderCard.mock.calls.at(-1)?.[1].resolvedRenderOptions;
    await page.getByRole("button", { name: "2 columns", exact: true }).click();
    await expect
      .poll(
        () =>
          renderCard.mock.calls.at(-1)?.[1].resolvedRenderOptions.columnCount
      )
      .toBe(2);
    await page
      .getByRole("button", {
        name: "Auto columns and start placement",
        exact: true,
      })
      .click();
    await expect
      .poll(() => renderCard.mock.calls.at(-1)?.[1].resolvedRenderOptions)
      .toEqual(auto);
    await screen.unmount();
  });

  it("cancels queued delivery when the sequence changes and ignores the old PNG", async () => {
    const oldPng = deferred<Blob>();
    const newPng = deferred<Blob>();
    renderCard.mockImplementation((sequence: SequenceData) =>
      sequence.id === "live-download-16" ? oldPng.promise : newPng.promise
    );
    const screen = await openCard(realSequence());
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Download card", exact: true })
      .click();
    await screen.rerender({ sequence: realSequence(4) });
    await expect
      .poll(() => renderCard.mock.calls.at(-1)?.[0].id)
      .toBe("live-download-4");
    expect(
      document.querySelectorAll(".live-export-card .live-pictograph").length
    ).toBe(5);
    oldPng.resolve(new Blob(["old"], { type: "image/png" }));
    newPng.resolve(new Blob(["current"], { type: "image/png" }));
    await tick();
    await expect
      .element(page.getByRole("button", { name: "Download card", exact: true }))
      .toBeEnabled();
    expect(deliverCard).not.toHaveBeenCalled();
    await page
      .getByRole("button", { name: "Download card", exact: true })
      .click();
    await expect.poll(() => deliverCard.mock.calls.length).toBe(1);
    await screen.unmount();
  });

  it("retries a failed PNG without remounting already visible pictographs", async () => {
    const first = deferred<Blob>();
    const retry = deferred<Blob>();
    renderCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(retry.promise);
    const screen = await openCard(realSequence());
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
    const liveCell = document.querySelector(
      ".live-export-card .live-pictograph"
    );
    first.reject(new Error("PNG preparation failed"));
    await page
      .getByRole("button", { name: "Retry image", exact: true })
      .click();
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(1);
    expect(document.querySelector(".live-export-card .live-pictograph")).toBe(
      liveCell
    );
    retry.resolve(new Blob(["retry"], { type: "image/png" }));
    await expect.poll(() => deliverCard.mock.calls.length).toBe(1);
    await screen.unmount();
  });
});
