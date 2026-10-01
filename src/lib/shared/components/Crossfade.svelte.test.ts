import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import CrossfadeTestHarness from "./CrossfadeTestHarness.svelte";

/**
 * The invariants here are the silent-failure class: a duplicated layer or a
 * frozen animateHeight box after an interrupted swap looks fine one frame
 * later in casual use and only shows up as intermittent layout jumps. Prop
 * Studio's build deck leans on both (rapid Triad/Trigeng toggling).
 */

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

function layers(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[data-testid="stage"] .crossfade > .layer'
    ),
  ];
}

function stepLayers(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[data-testid="step-stage"] .crossfade > .layer'
    ),
  ];
}

function focusLayers(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[data-testid="focus-stage"] .crossfade > .layer'
    ),
  ];
}

/**
 * Presses a control from the keyboard and watches the swap it starts: whether
 * focus ever fell to <body>, and whether a layer was aria-hidden while it
 * still held focus (Chrome blocks that and logs a warning).
 */
async function pressFromKeyboard(
  name: string
): Promise<{ fellToBody: boolean; hidFocusedLayer: boolean }> {
  const setAttribute = Element.prototype.setAttribute;
  let hidFocusedLayer = false;
  const spy = vi
    .spyOn(Element.prototype, "setAttribute")
    .mockImplementation(function (this: Element, attr, value) {
      if (
        attr === "aria-hidden" &&
        value === "true" &&
        this.classList.contains("layer") &&
        this.contains(document.activeElement)
      ) {
        hidFocusedLayer = true;
      }
      setAttribute.call(this, attr, value);
    });
  let fellToBody = false;
  let watching = true;
  const watch = () => {
    fellToBody ||= document.activeElement === document.body;
    if (watching) requestAnimationFrame(watch);
  };
  try {
    (
      page.getByRole("button", { name, exact: true }).element() as HTMLElement
    ).focus();
    await userEvent.keyboard("{Enter}");
    watch();
    await settle();
  } finally {
    watching = false;
    spy.mockRestore();
  }
  fellToBody ||= document.activeElement === document.body;
  return { fellToBody, hidFocusedLayer };
}

describe("Crossfade interruption", () => {
  it("settles an active swap when the in-app reduced motion setting changes", async () => {
    const { container } = render(CrossfadeTestHarness);
    await settle();
    await page.getByRole("button", { name: "Show gamma" }).click();
    try {
      document.documentElement.dataset.motionPreference = "reduce";
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      expect(
        container
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running")
      ).toHaveLength(0);
      expect(layers(container)).toHaveLength(1);
      expect(layers(container)[0]?.textContent).toContain("gamma panel");
    } finally {
      delete document.documentElement.dataset.motionPreference;
    }
  });

  it("keeps only the current controls interactive while outgoing layers fade", async () => {
    const { container } = render(CrossfadeTestHarness);
    await page
      .getByRole("button", { name: "Measure interactive layers" })
      .click();
    await settle();
    expect(page.getByTestId("observed-overlap").element().textContent).toBe(
      "true"
    );
    expect(
      Number(page.getByTestId("interactive-layer-count").element().textContent)
    ).toBe(1);
    const current = layers(container);
    expect(current).toHaveLength(1);
    expect(current[0]?.inert).toBe(false);
    expect(current[0]?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("measures layout height without inheriting an ancestor's visual scale", async () => {
    const { container } = render(CrossfadeTestHarness);
    await settle();
    const scaledBox = container.querySelector<HTMLElement>(
      '[data-testid="scaled-stage"] .crossfade'
    );

    expect(Number.parseFloat(scaledBox?.style.height ?? "0")).toBeCloseTo(
      125,
      0
    );
  });

  it("settles to exactly one layer with the final content after rapid key changes", async () => {
    const { container } = render(CrossfadeTestHarness);

    await page.getByRole("button", { name: "Rapid toggle" }).click();
    await settle();

    const settled = layers(container);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.textContent).toContain("beta panel");
  });

  it("eases the box to the final layer's height, not a stale interrupted one", async () => {
    const { container } = render(CrossfadeTestHarness);

    await page.getByRole("button", { name: "Rapid toggle" }).click();
    await settle();

    const box = container.querySelector<HTMLElement>(".crossfade");
    expect(box).not.toBeNull();
    // beta's panel is 160px tall; an interrupted height animation that froze
    // partway would leave the box between 60 and 160.
    expect(box!.getBoundingClientRect().height).toBeCloseTo(160, 0);
  });

  it("keeps tracking heights across later swaps after an interruption", async () => {
    const { container } = render(CrossfadeTestHarness);

    await page.getByRole("button", { name: "Rapid toggle" }).click();
    await settle();
    await page.getByRole("button", { name: "Show gamma" }).click();
    await settle();

    const settled = layers(container);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.textContent).toContain("gamma panel");
    const box = container.querySelector<HTMLElement>(".crossfade");
    expect(box!.getBoundingClientRect().height).toBeCloseTo(100, 0);
  });

  it("eases a taller layer back down instead of snapping to the short height", async () => {
    render(CrossfadeTestHarness);

    await page.getByRole("button", { name: "Measure collapse" }).click();
    await settle();

    const midpoint = Number(
      page.getByTestId("collapse-midpoint").element().textContent
    );
    expect(midpoint).toBeGreaterThan(60);
    expect(midpoint).toBeLessThan(160);
  });

  it("keeps sequential step copy from becoming readable at the same time", async () => {
    const { container } = render(CrossfadeTestHarness);

    await page.getByRole("button", { name: "Measure step forward" }).click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(
      Number(page.getByTestId("max-readable-step-layers").element().textContent)
    ).toBe(1);
    const settled = stepLayers(container);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.textContent).toContain("second decision");
    expect(
      container
        .querySelector<HTMLElement>('[data-testid="step-stage"] .crossfade')
        ?.getBoundingClientRect().height
    ).toBeCloseTo(130, 0);
  });

  it("uses the supplied direction when stepping back", async () => {
    const { container } = render(CrossfadeTestHarness);
    await page.getByRole("button", { name: "Measure step forward" }).click();
    await settle();

    await page.getByRole("button", { name: "Measure step back" }).click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(
      Number(page.getByTestId("max-back-outgoing-x").element().textContent)
    ).toBeGreaterThan(0);

    expect(stepLayers(container)[0]?.textContent).toContain("first decision");
  });
});

describe("Crossfade focus", () => {
  it("hands focus to the replacing controls when a focused control swaps itself out", async () => {
    const { container } = render(CrossfadeTestHarness);
    await settle();

    const watched = await pressFromKeyboard("Play");

    expect(watched).toEqual({ fellToBody: false, hidFocusedLayer: false });
    // Already moved when the swap committed, not a frame later.
    expect(page.getByTestId("focus-after-swap").element().textContent).toBe(
      "Keep building"
    );
    expect(document.activeElement?.textContent).toBe("Keep building");
    const settled = focusLayers(container);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.contains(document.activeElement)).toBe(true);
  });

  it("holds focus on the replacing layer when it has no controls", async () => {
    const { container } = render(CrossfadeTestHarness);
    await settle();
    await pressFromKeyboard("Play");

    const watched = await pressFromKeyboard("Finish");

    expect(watched).toEqual({ fellToBody: false, hidFocusedLayer: false });
    const settled = focusLayers(container);
    expect(settled).toHaveLength(1);
    expect(settled[0]?.textContent).toContain("Finished");
    expect(document.activeElement).toBe(settled[0]);
  });

  it("names a layer without controls when it takes focus", async () => {
    render(CrossfadeTestHarness);
    await settle();
    await pressFromKeyboard("Play");

    await pressFromKeyboard("Finish");

    // A screen reader announces where focus went, not an unnamed box.
    await expect
      .element(page.getByRole("group", { name: "Playback finished" }))
      .toHaveFocus();
  });

  it("moves focus before hiding the leaving layer when motion is reduced", async () => {
    // Without a fade, the leaving layer is hidden and removed in the same
    // commit that shows its replacement.
    document.documentElement.dataset.motionPreference = "reduce";
    try {
      const { container } = render(CrossfadeTestHarness);
      await settle();

      const watched = await pressFromKeyboard("Play");

      expect(watched).toEqual({ fellToBody: false, hidFocusedLayer: false });
      expect(document.activeElement?.textContent).toBe("Keep building");
      expect(focusLayers(container)).toHaveLength(1);
    } finally {
      delete document.documentElement.dataset.motionPreference;
    }
  });

  it("focusShown reaches a layer the key returns to mid-fade", async () => {
    const { container } = render(CrossfadeTestHarness);
    await settle();
    const outsideLayers = () => [
      ...container.querySelectorAll<HTMLElement>(
        '[data-testid="outside-stage"] .crossfade > .layer'
      ),
    ];
    const [idleLayer] = outsideLayers();

    await page
      .getByRole("button", { name: "Play and stop from outside" })
      .click();
    await settle();

    // The same layer, resumed rather than remounted, and focus inside it.
    expect(outsideLayers()).toEqual([idleLayer]);
    expect(document.activeElement?.textContent).toBe("Idle action");
    expect(idleLayer?.contains(document.activeElement)).toBe(true);
  });
});
