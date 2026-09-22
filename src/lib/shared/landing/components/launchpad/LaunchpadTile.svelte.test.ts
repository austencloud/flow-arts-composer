import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import LaunchpadTile from "./LaunchpadTile.svelte";
import { LAUNCHPAD_TILES, type LaunchpadTileDef } from "./launchpad-tiles";

const ACTION_TILE = {
  id: "what-is",
  href: "#what-is",
  heading: "What is a CAP?",
  descriptor: "One prop traces a closed loop.",
  span: "1x1",
  color: "#38bdf8",
  icon: "fa-infinity",
  activate: true,
} satisfies LaunchpadTileDef;

const MEDIA_TILE = {
  id: "composer",
  href: "/composer",
  heading: "Composer",
  descriptor: "Build and animate TKA sequences.",
  span: "2x2",
  color: "#a78bfa",
  icon: "fa-pen-nib",
  media: "mandala",
} satisfies LaunchpadTileDef;

describe("LaunchpadTile enhanced actions", () => {
  it("keeps the fallback href and intercepts an ordinary activation", async () => {
    const onActivate = vi.fn();
    render(LaunchpadTile, {
      tile: ACTION_TILE,
      active: false,
      index: 0,
      onActivate,
    });

    const link = page.getByRole("link", { name: /What is a CAP\?/ });
    await expect.element(link).toHaveAttribute("href", "#what-is");

    const element = document.querySelector<HTMLAnchorElement>(
      '[data-tile-id="what-is"] .tile-link'
    );
    expect(element).toBeInstanceOf(HTMLAnchorElement);
    expect(
      document.querySelector('[data-tile-id="what-is"] button.tile-link')
    ).toBeNull();

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    element!.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith(ACTION_TILE);

    const modifiedClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    element!.dispatchEvent(modifiedClick);

    expect(modifiedClick.defaultPrevented).toBe(false);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("renders meaningful static media before the optional renderer activates", () => {
    render(LaunchpadTile, {
      tile: MEDIA_TILE,
      active: false,
      index: 0,
    });

    const poster = document.querySelector<HTMLElement>(
      '[data-tka-static-media="composer"]'
    );

    expect(poster).toBeInstanceOf(HTMLElement);
    expect(Number(getComputedStyle(poster!).opacity)).toBeGreaterThan(0);
    expect(poster?.textContent).toContain("TKA");
  });

  // The poster is a fallback for slow links. Once the live media chunk
  // settles it must fade out at every viewport tier, including the compact
  // tier (phones, short landscape, wide-but-short desktops) where the tier
  // rules dim the poster with a more specific selector. Regression: on
  // 2026-09-21 the "2009 - 2022" timeline and the "TKA" wordmark stayed drawn
  // over the live pictograph and dictionary entry at those sizes.
  it.each([
    ["phone", 390, 844],
    ["wide short desktop", 1920, 880],
    ["laptop control", 1440, 900],
  ])(
    "hides the poster after live media mounts (%s)",
    async (_label, width, height) => {
      await page.viewport(width, height);
      const glossary = LAUNCHPAD_TILES.find((tile) => tile.id === "glossary");
      expect(glossary?.media).toBe("dictionary");

      render(LaunchpadTile, {
        tile: glossary!,
        active: true,
        index: 0,
      });

      const media = document.querySelector<HTMLElement>(
        '[data-tile-id="glossary"] .media'
      );
      const poster = document.querySelector<HTMLElement>(
        '[data-tka-static-media="glossary"]'
      );
      expect(media).toBeInstanceOf(HTMLElement);
      expect(poster).toBeInstanceOf(HTMLElement);

      await expect
        .poll(() => media!.classList.contains("media-loaded"), {
          timeout: 10_000,
        })
        .toBe(true);
      await expect
        .poll(() => Number(getComputedStyle(poster!).opacity), {
          timeout: 2_000,
        })
        .toBe(0);
    }
  );
});
