import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { tick } from "svelte";
import demo from "../../src/lib/shared/landing/data/demo-sequence.json";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
import { EMPTY_META_PUBLISH_STATUS } from "$lib/shared/share/services/meta-publish";
import type { MetaPublishStatus } from "$lib/shared/share/services/meta-publish";
import PostShareSheet from "$lib/shared/share/components/PostShareSheet.svelte";
import { DURATION } from "$lib/shared/transitions/transitions";
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

interface HeightSample {
  timestamp: number;
  height: number;
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function hasRunningFiniteAnimation(dialog: HTMLDialogElement): boolean {
  return dialog.getAnimations({ subtree: true }).some((animation) => {
    const iterations = animation.effect?.getTiming().iterations;
    return animation.playState === "running" && iterations !== Infinity;
  });
}

async function settledDialogHeight(dialog: HTMLDialogElement): Promise<number> {
  const deadline = performance.now() + 2_000;
  let previous = dialog.getBoundingClientRect().height;
  let stableFrames = 0;
  while (performance.now() < deadline) {
    await nextFrame();
    const current = dialog.getBoundingClientRect().height;
    if (
      !hasRunningFiniteAnimation(dialog) &&
      Math.abs(current - previous) < 1
    ) {
      stableFrames += 1;
      if (stableFrames >= 3) return current;
    } else {
      stableFrames = 0;
    }
    previous = current;
  }
  throw new Error("Share dialog did not settle within 2 seconds");
}

async function sampleDialogHeights(
  dialog: HTMLDialogElement,
  count: number,
  initialHeight: number
): Promise<HeightSample[]> {
  const samples = [{ timestamp: performance.now(), height: initialHeight }];
  for (let frame = 0; frame < count; frame += 1) {
    const timestamp = await nextFrame();
    samples.push({
      timestamp,
      height: dialog.getBoundingClientRect().height,
    });
  }
  return samples;
}

function assertContinuousHeightMotion(
  samples: HeightSample[],
  direction: "shrinking" | "growing",
  label: string
): void {
  const start = samples[0]!.height;
  const end = samples.at(-1)!.height;
  expect(Math.abs(start - end)).toBeGreaterThan(20);
  expect(
    samples.some(
      ({ height }) =>
        height > Math.min(start, end) + 2 && height < Math.max(start, end) - 2
    )
  ).toBe(true);

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const elapsed = current.timestamp - previous.timestamp;
    const delta = current.height - previous.height;
    // Bound motion relative to the distance and shared clock. The standard
    // cubic easing peaks below 3x its average speed; 3.5 allows frame rounding.
    // A fixed px/frame limit rejects valid motion when rendering drops a frame.
    const maximumDelta =
      (Math.abs(start - end) * Math.max(0, elapsed) * 3.5) / DURATION.normal +
      2;
    if (Math.abs(delta) > maximumDelta) {
      throw new Error(
        `${label} jumped ${delta.toFixed(1)}px after ${elapsed.toFixed(1)}ms: ${samples.map(({ timestamp, height }) => `${timestamp.toFixed(1)}:${height.toFixed(1)}`).join(", ")}`
      );
    }
    if (direction === "shrinking" && delta > 2) {
      throw new Error(`${label} grew during its shrink: ${delta.toFixed(1)}px`);
    }
    if (direction === "growing" && delta < -2) {
      throw new Error(
        `${label} shrank during its growth: ${delta.toFixed(1)}px`
      );
    }
  }
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

const INSTAGRAM_CONNECTED: MetaPublishStatus = {
  instagram: {
    accountId: "render-parity-instagram",
    username: "render-parity",
    accountType: "CREATOR",
    route: "instagram-login",
    expiresAtMs: Date.now() + 60_000,
    capabilities: null,
  },
  facebookPage: null,
};

async function openCard(
  sequence: SequenceData,
  columns: number | null = 2,
  options: {
    availableArtifacts?: readonly ("card" | "video")[];
    initialArtifact?: "card" | "video";
    videoBlobUrl?: string | null;
    initialEntry?: "chooser" | "download";
    metaStatusOverride?: MetaPublishStatus;
  } = {}
) {
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
    videoBlobUrl: options.videoBlobUrl ?? null,
    isExportingVideo: false,
    exportProgress: null,
    onClose: vi.fn(),
    initialArtifact: options.initialArtifact ?? "card",
    availableArtifacts: options.availableArtifacts ?? ["card"],
    initialEntry: options.initialEntry ?? "download",
    canCreateLink: false,
    metaStatusOverride: options.metaStatusOverride ?? EMPTY_META_PUBLISH_STATUS,
  });
}

afterEach(() => {
  renderCard.mockReset();
  deliverCard.mockClear();
});

function chooseFileType(group: Element, label: "Card" | "Video"): void {
  const button = [...group.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  expect(button).toBeDefined();
  button!.click();
}

describe("Download card with real live pictographs", () => {
  it.each([
    {
      width: 1562,
      height: 1540,
      initialArtifact: "card" as const,
      shouldGrow: true,
    },
    {
      width: 1562,
      height: 1540,
      initialArtifact: "video" as const,
      shouldGrow: true,
    },
    {
      width: 960,
      height: 412,
      initialArtifact: "card" as const,
      shouldGrow: false,
    },
  ])(
    "keeps a $initialArtifact to Card download reachable from the chooser at $width × $height",
    async ({ width, height, initialArtifact, shouldGrow }) => {
      renderCard.mockReturnValue(new Promise<Blob>(() => {}));
      const screen = await openCard(realSequence(8), 4, {
        initialEntry: "chooser",
        initialArtifact,
        availableArtifacts: ["card", "video"],
      });
      try {
        await page.viewport(width, height);
        const dialog = document.querySelector<HTMLDialogElement>(
          "dialog.share-sheet-modal"
        )!;
        const chooserHeight = await settledDialogHeight(dialog);
        await page.getByRole("button", { name: /Download a file/ }).click();
        if (initialArtifact === "video") {
          const fileType = document.querySelector(".file-type")!;
          await settledDialogHeight(dialog);
          chooseFileType(fileType, "Card");
        }
        await expect
          .poll(() => renderCard.mock.calls.length)
          .toBeGreaterThan(0);
        const cardHeight = await settledDialogHeight(dialog);

        if (shouldGrow) expect(cardHeight).toBeGreaterThan(chooserHeight + 100);

        const scrollArea = document.querySelector<HTMLElement>(
          ".sheet-scroll.download-route"
        )!;
        const footer = document.querySelector<HTMLElement>(".share-dock")!;
        const download = [
          ...footer.querySelectorAll<HTMLButtonElement>("button"),
        ].find((button) => button.textContent?.trim() === "Download card");
        const frame = dialog.getBoundingClientRect();
        const dock = footer.getBoundingClientRect();
        const wrapper = dialog.querySelector<HTMLElement>(
          ".modal-content-wrapper"
        )!;
        expect(getComputedStyle(wrapper).flex).toBe("0 0 auto");
        expect(download).toBeDefined();
        expect(download!.disabled).toBe(false);
        expect(dock.height).toBeGreaterThan(40);
        expect(dock.top).toBeGreaterThanOrEqual(frame.top);
        expect(dock.bottom).toBeLessThanOrEqual(frame.bottom + 1);
        expect(scrollArea.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          dock.top + 1
        );

        if (!shouldGrow) {
          expect(scrollArea.scrollHeight).toBeGreaterThan(
            scrollArea.clientHeight
          );
          scrollArea.scrollTop = scrollArea.scrollHeight;
          await nextFrame();
          expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            dialog.getBoundingClientRect().bottom + 1
          );
        }
      } finally {
        await screen.unmount();
      }
    }
  );

  it("contains the video status when the workspace has no live animation capture", async () => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence(8), 2, {
      availableArtifacts: ["card", "video"],
    });
    try {
      await page.getByRole("button", { name: "Video", exact: true }).click();
      for (const [width, height] of [
        [375, 667],
        [960, 412],
        [1920, 1080],
      ]) {
        await page.viewport(width!, height!);
        const dialog = document.querySelector<HTMLDialogElement>(
          "dialog.share-sheet-modal"
        )!;
        await settledDialogHeight(dialog);
        const stage = document.querySelector(".stage.video-placeholder")!;
        const message = stage.querySelector(".stage-refused")!;
        const frame = stage.getBoundingClientRect();
        const content = message.getBoundingClientRect();
        expect(content.height).toBeGreaterThan(20);
        expect(content.top).toBeGreaterThanOrEqual(frame.top);
        expect(content.bottom).toBeLessThanOrEqual(frame.bottom);
      }
      expect(deliverCard).not.toHaveBeenCalled();
    } finally {
      await screen.unmount();
    }
  });

  it("moves the actual sheet height through Card and Video instead of snapping", async () => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence(), 2, {
      availableArtifacts: ["card", "video"],
      videoBlobUrl: "data:video/mp4;base64,AAAA",
    });
    try {
      await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);

      const dialog = document.querySelector<HTMLDialogElement>(
        "dialog.share-sheet-modal"
      );
      const fileType = document.querySelector(".file-type");
      expect(dialog).not.toBeNull();
      expect(fileType).not.toBeNull();
      const cardHeight = await settledDialogHeight(dialog!);

      chooseFileType(fileType!, "Video");
      const cardToVideo = await sampleDialogHeights(dialog!, 14, cardHeight);
      assertContinuousHeightMotion(cardToVideo, "shrinking", "Card → Video");

      // Reverse while the return transition is still in flight: the dialog must
      // continue from its displayed height instead of flashing to either end.
      chooseFileType(fileType!, "Card");
      const videoToCard = await sampleDialogHeights(
        dialog!,
        14,
        dialog!.getBoundingClientRect().height
      );
      assertContinuousHeightMotion(videoToCard, "growing", "Video → Card");
    } finally {
      await screen.unmount();
    }

    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => true,
      }) as MediaQueryList) as typeof window.matchMedia;
    try {
      const reducedScreen = await openCard(realSequence(), 2, {
        availableArtifacts: ["card", "video"],
        videoBlobUrl: "data:video/mp4;base64,AAAA",
      });
      await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
      const reducedDialog = document.querySelector<HTMLDialogElement>(
        "dialog.share-sheet-modal"
      );
      const reducedFileType = document.querySelector(".file-type");
      await expect
        .poll(() => reducedDialog?.getBoundingClientRect().height ?? 0)
        .toBeGreaterThan(0);
      const reducedCardHeight = await settledDialogHeight(reducedDialog!);
      chooseFileType(reducedFileType!, "Video");
      await nextFrame();
      expect(reducedDialog!.getBoundingClientRect().height).toBeLessThan(
        reducedCardHeight - 20
      );
      await reducedScreen.unmount();
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it("keeps outgoing file controls inert during a rapid Card and Video reversal", async () => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence(), 2, {
      availableArtifacts: ["card", "video"],
      // The stage only needs a current URL to exercise the ready-video branch;
      // it does not decode or deliver this fixture.
      videoBlobUrl: "data:video/mp4;base64,AAAA",
    });
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);

    const fileType = document.querySelector(".file-type");
    expect(fileType).not.toBeNull();
    chooseFileType(fileType!, "Video");
    await expect
      .poll(() => document.querySelector(".video-settings"))
      .not.toBeNull();
    expect(
      document.querySelectorAll(".editing-column .crossfade > .layer[inert]")
        .length
    ).toBeGreaterThan(0);

    chooseFileType(fileType!, "Card");
    await expect
      .poll(() => document.querySelector(".card-settings"))
      .not.toBeNull();
    expect(
      document.querySelectorAll(".editing-column .crossfade > .layer[inert]")
        .length
    ).toBeGreaterThan(0);
    await screen.unmount();
  });

  it("keeps the Download dock reachable in short landscape", async () => {
    renderCard.mockReturnValue(new Promise<Blob>(() => {}));
    const screen = await openCard(realSequence());
    await expect.poll(() => renderCard.mock.calls.length).toBeGreaterThan(0);
    await page.viewport(960, 412);
    await expect
      .poll(() => {
        const dialog = document.querySelector("dialog.share-sheet-modal");
        const download = [
          ...document.querySelectorAll<HTMLButtonElement>("button"),
        ].find((button) => button.textContent?.trim() === "Download card");
        if (!dialog || !download) return false;
        return (
          download.getBoundingClientRect().bottom <=
          dialog.getBoundingClientRect().bottom + 1
        );
      })
      .toBe(true);
    await screen.unmount();
  });

  it("scrolls a prepared social-publish card to its review action", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 1600;
    const png = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), "image/png")
    );
    renderCard.mockResolvedValue(png);
    const screen = await openCard(realSequence(32), 2, {
      initialEntry: "chooser",
      metaStatusOverride: INSTAGRAM_CONNECTED,
    });
    await page.viewport(1440, 900);

    await page.getByRole("button", { name: /Publish socially/ }).click();
    await page
      .getByRole("button", { name: "Prepare card", exact: true })
      .click();
    await expect
      .poll(
        () =>
          document.querySelector<HTMLImageElement>(".publish-preview")
            ?.naturalHeight
      )
      .toBe(1600);
    await settledDialogHeight(
      document.querySelector("dialog.share-sheet-modal")!
    );

    const route = document.querySelector<HTMLElement>(
      ".sheet-scroll.publish-route"
    );
    const review = document.querySelector<HTMLElement>(
      ".publish-route button.network"
    );
    expect(route).not.toBeNull();
    expect(review).not.toBeNull();
    expect(route!.scrollHeight).toBeGreaterThan(route!.clientHeight);
    route!.scrollTop = route!.scrollHeight;
    await nextFrame();
    expect(review!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      route!.getBoundingClientRect().bottom + 1
    );

    await screen.unmount();
  });

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
