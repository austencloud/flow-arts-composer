/**
 * Touch targets and text contrast measured from real computed styles.
 *
 * These specs load the app's real global stylesheet (`src/app.css`) and apply
 * the app's real theme variables through
 * `applyThemeForBackground(BackgroundType.COSMIC)` — the shipped default
 * background (background-theme-calculator.ts:getSavedBackgroundType falls back
 * to COSMIC). Every number below comes from `getComputedStyle` /
 * `getBoundingClientRect` in a live Chromium page at a 375x667 CSS viewport,
 * not from reading CSS source.
 *
 * Floors applied here:
 *  - pointer target: 44px, the floor named in
 *    docs/architecture/visual-design-canon.md section 6 and carried by
 *    `--min-touch-target` in src/app.css:261.
 *  - text contrast: WCAG 2.1 AA (4.5:1 normal, 3:1 large). The repo aspires to
 *    AAA; AA is used as the *finding* threshold so only real legibility
 *    failures are reported.
 *
 * Caveat recorded honestly: the authenticated app paints animated background
 * art behind these surfaces. Where a measured surface is not opaque, the
 * reading is reported with `sawBackgroundImage` and treated as indicative, not
 * as a verdict.
 */
import "../../src/app.css";

import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

import SubtitleDrawerHarness from "./harnesses/SubtitleDrawerHarness.svelte";
import LengthFilterChip from "$lib/shared/browse/components/filter-chips/LengthFilterChip.svelte";

import { applyThemeForBackground } from "$lib/shared/settings/utils/background-theme-calculator";
import { BackgroundType } from "@austencloud/backgrounds";

import { readTextContrast, targetSize } from "./helpers/computed-a11y";

/**
 * Print the measurement so a run of this suite is itself the evidence record
 * for the audit report, not just a pass/fail bit.
 */
function record(label: string, detail: unknown) {
  console.log(`[a11y-measure] ${label}`, JSON.stringify(detail));
}

const MIN_TOUCH_TARGET = 44;

function settle(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Shared overlay surfaces: measured targets and contrast", () => {
  beforeAll(async () => {
    // The shipped default background, which decides every --theme-* value.
    applyThemeForBackground(BackgroundType.COSMIC);
    await page.viewport(375, 667);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("gives the drawer header's close button a 44px pointer target", async () => {
    render(SubtitleDrawerHarness, { isOpen: true });
    await settle();

    const close = document.querySelector<HTMLButtonElement>(".drawer-close-btn");
    expect(close, "drawer close button rendered").not.toBeNull();

    const { width, height } = targetSize(close!);
    record("DrawerHeader close button", { width, height });
    expect(
      Math.min(width, height),
      `close button measured ${width}x${height}`
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("keeps the drawer header subtitle legible on the sheet surface", async () => {
    render(SubtitleDrawerHarness, { isOpen: true });
    await settle();

    const subtitle = document.querySelector(".drawer-header-subtitle");
    expect(subtitle, "subtitle rendered").not.toBeNull();

    const reading = readTextContrast(subtitle!);
    expect(reading, "subtitle colour is measurable").not.toBeNull();
    record("DrawerHeader subtitle", reading);

    expect(
      reading!.ratio,
      `subtitle ${reading!.foreground} on ${reading!.background} at ${reading!.fontSizePx}px ` +
        `(background-image present: ${reading!.sawBackgroundImage})`
    ).toBeGreaterThanOrEqual(reading!.aaFloor);
  });

  it("gives every filter-chip popover row a 44px pointer target and legible text", async () => {
    render(LengthFilterChip, {
      activeLength: null,
      availableLengths: [4, 8, 16],
      onSelect: vi.fn(),
      getFilteredCount: () => 3,
    });
    await settle();

    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]'
    );
    expect(trigger, "chip trigger rendered").not.toBeNull();
    trigger!.click();
    await settle();

    const options = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".chip-popover-option")
    );
    expect(options.length, "popover rows rendered").toBeGreaterThan(0);

    record(
      "Chip popover rows",
      options.map((option) => ({
        label: option.textContent?.trim(),
        ...targetSize(option),
      }))
    );

    for (const option of options) {
      const { height } = targetSize(option);
      expect(
        height,
        `row "${option.textContent?.trim()}" measured ${height}px tall`
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }

    // The dimmed match count beside each label is the smallest, faintest text
    // in the popover, so it is the one that decides whether the list is
    // readable.
    const count = document.querySelector(".opt-count");
    if (count) {
      const reading = readTextContrast(count);
      expect(reading, "count colour is measurable").not.toBeNull();
      record("Chip popover option count", reading);
      expect(
        reading!.ratio,
        `option count ${reading!.foreground} on ${reading!.background} at ${reading!.fontSizePx}px ` +
          `(background-image present: ${reading!.sawBackgroundImage})`
      ).toBeGreaterThanOrEqual(reading!.aaFloor);
    }

    const label = document.querySelector(".opt-label");
    expect(label, "option label rendered").not.toBeNull();
    const labelReading = readTextContrast(label!);
    record("Chip popover option label", labelReading);
    expect(
      labelReading!.ratio,
      `option label ${labelReading!.foreground} on ${labelReading!.background} at ${labelReading!.fontSizePx}px ` +
        `(background-image present: ${labelReading!.sawBackgroundImage})`
    ).toBeGreaterThanOrEqual(labelReading!.aaFloor);
  });
});
