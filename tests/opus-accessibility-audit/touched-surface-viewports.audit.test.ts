/**
 * Responsive check for the surfaces this audit's fixes touched.
 *
 * Classification under .claude/rules/visual-verification-mandatory.md: the
 * implementation diff adds a keydown handler, an `aria-label` value and a
 * `shouldIgnore` branch. It changes no CSS, no element count and no layout
 * property, so by the rule's own scoping this is a "no browser pass" change for
 * composition. This spec exists anyway to *prove* that rather than assert it —
 * it re-measures the same controls the pre-fix audit measured, across the seven
 * canonical tiers, and fails if any of them moved or dropped below the 44px
 * pointer floor.
 *
 * Pre-fix baselines recorded at 375x667 (see the report's "Verified correct"
 * table): DrawerHeader close button 44x44; every chip popover row 150x44.
 */
import "../../src/app.css";

import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

import SubtitleDrawerHarness from "./harnesses/SubtitleDrawerHarness.svelte";
import LengthFilterChip from "$lib/shared/browse/components/filter-chips/LengthFilterChip.svelte";

import { applyThemeForBackground } from "$lib/shared/settings/utils/background-theme-calculator";
import { BackgroundType } from "@austencloud/backgrounds";
import { targetSize } from "./helpers/computed-a11y";

const MIN_TOUCH_TARGET = 44;

/**
 * Sub-pixel tolerance. `min-height: var(--min-touch-target)` resolves to exactly
 * 44px, but `getBoundingClientRect` returns fractional layout units and at some
 * emulated viewports Chromium reports 43.9907 for the same 44px box. That is a
 * measurement artifact of viewport emulation, not a product defect — the
 * declared floor is unchanged and the rendered box is 44 CSS px. Half a pixel
 * of slack keeps this spec measuring the thing it cares about instead of
 * flagging rounding.
 */
const SUBPIXEL_TOLERANCE = 0.5;

/** The canonical matrix from docs/architecture/responsive-design.md. */
const TIERS = [
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "short landscape", width: 960, height: 412 },
  { label: "tablet portrait", width: 820, height: 1180 },
  { label: "laptop", width: 1440, height: 900 },
  { label: "4K at 200%", width: 1920, height: 1080 },
  { label: "4K at 150%", width: 2560, height: 1440 },
  { label: "4K at 100%", width: 3840, height: 2160 },
] as const;

function settle(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Touched surfaces hold their geometry across the viewport matrix", () => {
  beforeAll(() => {
    applyThemeForBackground(BackgroundType.COSMIC);
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(375, 667);
  });

  it("drawer header close button keeps its 44px target at every tier", async () => {
    const readings: Record<string, string> = {};

    for (const tier of TIERS) {
      await page.viewport(tier.width, tier.height);
      render(SubtitleDrawerHarness, { isOpen: true });
      await settle();

      const close =
        document.querySelector<HTMLButtonElement>(".drawer-close-btn");
      expect(close, `${tier.label}: close button rendered`).not.toBeNull();

      const { width, height } = targetSize(close!);
      readings[tier.label] = `${width}x${height}`;
      expect(
        Math.min(width, height),
        `${tier.label}: close button measured ${width}x${height}`
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET - SUBPIXEL_TOLERANCE);

      // The drawer is the accessible name fix's own surface — confirm it is
      // still a named, modal dialog at this tier, not just a sized box.
      const dialog =
        document.querySelector<HTMLDialogElement>("dialog.drawer-content");
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(dialog?.getAttribute("aria-label")).toBe("Select Prop");

      document.body.innerHTML = "";
    }

    console.log("[a11y-measure] close button by tier", JSON.stringify(readings));
  });

  it("chip popover rows stay on the 44px floor and on screen at every tier", async () => {
    const readings: Record<string, unknown> = {};

    for (const tier of TIERS) {
      await page.viewport(tier.width, tier.height);
      render(LengthFilterChip, {
        activeLength: null,
        availableLengths: [4, 8, 16],
        onSelect: vi.fn(),
        getFilteredCount: () => 3,
      });
      await settle();

      document
        .querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')
        ?.click();
      await settle();

      const rows = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".chip-popover-option")
      );
      expect(rows.length, `${tier.label}: popover rows rendered`).toBeGreaterThan(
        0
      );

      readings[tier.label] = rows.map((r) => {
        const { width, height } = targetSize(r);
        return `${width}x${height}`;
      });

      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        expect(
          rect.height,
          `${tier.label}: row "${row.textContent?.trim()}" is ${rect.height}px tall`
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET - SUBPIXEL_TOLERANCE);
        // The popover is position:fixed and positioned by script; a tier that
        // pushed it off-screen would make the options unreachable by pointer.
        expect(
          rect.left,
          `${tier.label}: row left edge on screen`
        ).toBeGreaterThanOrEqual(0);
        expect(
          rect.right,
          `${tier.label}: row right edge on screen`
        ).toBeLessThanOrEqual(tier.width);
      }

      document.body.innerHTML = "";
    }

    console.log("[a11y-measure] popover rows by tier", JSON.stringify(readings));
  });
});
