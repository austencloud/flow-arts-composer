/**
 * Focus-containment regression test for the motion-visibility popover.
 *
 * The popover declared `role="dialog"` but was not modal in any sense a
 * keyboard or screen-reader user could feel: no `aria-modal`, focus stayed
 * on the trigger, Tab left the panel, and the transparent backdrop was a
 * `role="button"` with no visible affordance. The fix moves focus into the
 * panel through the shared FocusTrap (siblings stay interactive: this is
 * anchored chrome, not a takeover), wraps Tab inside it, returns focus to the
 * trigger on close, and hides the pointer-only backdrop from assistive tech.
 *
 * PrimaryPropColorSettings is stubbed: its picker opens a BaseModal of its
 * own and is orthogonal to the panel chrome under test.
 */
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, it, expect, vi, afterEach } from "vitest";
import MotionVisibilityToggleHarness from "./MotionVisibilityToggle.test-harness.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

vi.mock(
  "#lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte",
  async () => {
    const mod = await import("./__test-stubs__/ColorSettingsStub.svelte");
    return { default: mod.default };
  }
);

// A real key press through the browser, not a synthetic keydown: the trap
// must beat native sequential focus navigation, so that is what is tested.
async function pressTab(shift = false): Promise<void> {
  await userEvent.tab({ shift });
}

async function openPopover(): Promise<HTMLElement> {
  await page.getByRole("button", { name: "Motion visibility" }).click();
  const dialog = page.getByRole("dialog", { name: "Motion visibility" });
  await expect.element(dialog).toBeVisible();
  return dialog.element() as HTMLElement;
}

describe("MotionVisibilityToggle popover (focus containment)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens as a modal dialog that takes focus", async () => {
    render(MotionVisibilityToggleHarness);
    const dialog = await openPopover();

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    await expect.element(page.elementLocator(dialog)).toHaveFocus();
  });

  it("hides the pointer-only backdrop from assistive tech", async () => {
    render(MotionVisibilityToggleHarness);
    await openPopover();

    const backdrop = document.querySelector<HTMLElement>(
      ".motion-vis-backdrop"
    );
    expect(backdrop).not.toBeNull();
    expect(backdrop!.getAttribute("aria-hidden")).toBe("true");
    expect(backdrop!.hasAttribute("role")).toBe(false);
    expect(backdrop!.hasAttribute("tabindex")).toBe(false);
  });

  it("wraps Tab inside the panel instead of reaching the page", async () => {
    render(MotionVisibilityToggleHarness);
    const dialog = await openPopover();
    // Only what Tab visits: the stub ends in a hidden tabindex="-1" input,
    // which the trap must ignore or it lets Tab out past the last button.
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button"));
    expect(controls.length).toBeGreaterThanOrEqual(3);
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;

    last.focus();
    await pressTab();
    expect(document.activeElement).toBe(first);

    await pressTab(true);
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to the trigger when Escape closes it", async () => {
    render(MotionVisibilityToggleHarness);
    const trigger = page
      .getByRole("button", { name: "Motion visibility" })
      .element() as HTMLElement;
    const dialog = await openPopover();
    await expect.element(page.elementLocator(dialog)).toHaveFocus();

    await userEvent.keyboard("{Escape}");

    await expect
      .poll(() => document.querySelector(".motion-vis-popover"))
      .toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger);
  });

  for (const [width, height] of [
    [375, 667],
    [1440, 900],
  ] as const) {
    it(`has no AAA a11y violations while open at ${width}x${height}`, async () => {
      await page.viewport(width, height);
      render(MotionVisibilityToggleHarness);
      await openPopover();
      await expectNoA11yViolations();
    });
  }
});
