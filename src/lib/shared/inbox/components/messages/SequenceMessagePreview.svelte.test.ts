import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";

vi.mock("#lib/shared/choreo-card/components/TKAWordGlyph.svelte", async () => ({
  default: (await import("./SequenceMessagePreviewGlyphTestStub.svelte"))
    .default,
}));

vi.mock(
  "#lib/shared/browse/components/PropAwareThumbnail.svelte",
  async () => ({
    default: (await import("./SequenceMessagePreviewCardTestStub.svelte"))
      .default,
  })
);

import SequenceMessagePreview from "./SequenceMessagePreview.svelte";

class IdleIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

describe("SequenceMessagePreview activation", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays static until Play is activated and exposes resolution failure", async () => {
    let finishResolution: (value: null) => void = () => {};
    const loadSequence = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          finishResolution = resolve;
        })
    );

    render(SequenceMessagePreview, {
      word: "YR0L",
      loadSequence,
    });

    const playButton = page.getByRole("button", {
      name: "Play YR0L preview",
    });
    await expect.element(playButton).toBeVisible();
    expect(loadSequence).not.toHaveBeenCalled();
    expect(document.querySelector("button button")).toBeNull();

    await playButton.click();
    expect(loadSequence).toHaveBeenCalledOnce();
    await expect.element(playButton).toBeDisabled();
    await expect.element(playButton).toHaveAttribute("aria-busy", "true");

    finishResolution(null);
    await expect.element(page.getByText("Preview unavailable")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeVisible();
  });

  it("keeps an active, visible preview on its Choreo Card until Play is clicked", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const loadSequence = vi.fn(() => new Promise<null>(() => undefined));

    render(SequenceMessagePreview, {
      word: "YR0L",
      loadSequence,
      playbackActive: true,
    });

    const playButton = page.getByRole("button", {
      name: "Play YR0L preview",
    });
    await expect.element(playButton).toBeVisible();
    await expect.element(playButton).toBeEnabled();
    expect(loadSequence).not.toHaveBeenCalled();
  });

  it("replaces the fallback poster with the resolved Choreo Card", async () => {
    const loadSequence = vi.fn(async () =>
      createSequenceData({
        id: "sequence-1",
        word: "YR0L",
      })
    );

    render(SequenceMessagePreview, {
      word: "YR0L",
      loadSequence,
      playbackActive: false,
      playbackMounted: false,
    });

    await page.getByRole("button", { name: "Play YR0L preview" }).click();

    await expect.element(page.getByTestId("choreo-card")).toBeVisible();
    expect(loadSequence).toHaveBeenCalledOnce();
  });

  it("uses the same explicit Play action when reduced motion is enabled", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const loadSequence = vi.fn(() => new Promise<null>(() => undefined));

    render(SequenceMessagePreview, {
      word: "YR0L",
      loadSequence,
      playbackActive: true,
    });

    const playButton = page.getByRole("button", {
      name: "Play YR0L preview",
    });
    await expect.element(playButton).toBeVisible();
    await expect.element(playButton).toBeEnabled();
    await playButton.click();
    expect(loadSequence).toHaveBeenCalledOnce();
    await expect.element(playButton).toBeDisabled();
    expect(
      document.querySelector('[data-preview-state="card"]')
    ).not.toBeNull();
  });
});
