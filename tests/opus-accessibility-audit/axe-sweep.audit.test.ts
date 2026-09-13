/**
 * Objective axe sweep over the shared overlay surfaces this audit covers.
 *
 * Runs the project's own helper (`$test-helpers/component-a11y`, WCAG AAA tag
 * set with `color-contrast` and `region` disabled — contrast is measured
 * separately in computed-styles.audit.test.ts with real theme variables) so a
 * violation here is one the repo's existing component suite would also report.
 *
 * Audit evidence, not a production gate.
 */
import "../../src/app.css";

import { render } from "vitest-browser-svelte";
import { describe, it, afterEach, vi } from "vitest";

import { expectNoA11yViolations } from "$test-helpers/component-a11y";
import SubtitleDrawerHarness from "./harnesses/SubtitleDrawerHarness.svelte";
import HeaderOnlyDrawerHarness from "./harnesses/HeaderOnlyDrawerHarness.svelte";
import LengthFilterChip from "$lib/shared/browse/components/filter-chips/LengthFilterChip.svelte";

function settle(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("axe sweep: shared overlay surfaces", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Drawer + DrawerHeader, named by the consumer", async () => {
    render(SubtitleDrawerHarness, { isOpen: true });
    await settle();
    await expectNoA11yViolations();
  });

  it("Drawer + DrawerHeader, the Browse Filters sheet composition", async () => {
    render(HeaderOnlyDrawerHarness, { isOpen: true });
    await settle();
    await expectNoA11yViolations();
  });

  it("filter chip with its popover open", async () => {
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
    await expectNoA11yViolations();
  });
});
