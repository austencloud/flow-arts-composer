import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type {
  TurnLevel,
  TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";
import OptionPickerControlsPopover from "./OptionPickerControlsPopover.svelte";

function renderControls({
  level = 2,
  leftTurns = 1,
  rightTurns = 0,
}: {
  level?: TurnLevel;
  leftTurns?: TurnValue;
  rightTurns?: TurnValue;
} = {}) {
  const handlers = {
    onToggleContinuous: vi.fn(),
    onLevelChange: vi.fn(),
    onLeftChange: vi.fn(),
    onRightChange: vi.fn(),
    onLeftRotationChange: vi.fn(),
    onRightRotationChange: vi.fn(),
  };

  render(OptionPickerControlsPopover, {
    showFilter: true,
    showTurnControls: true,
    isContinuousOnly: false,
    level,
    leftTurns,
    rightTurns,
    leftRotation: RotationDirection.CLOCKWISE,
    rightRotation: RotationDirection.COUNTER_CLOCKWISE,
    ...handlers,
  });

  return handlers;
}

describe("OptionPickerControlsPopover", () => {
  beforeEach(async () => {
    await page.viewport(327, 708);
    document.body.style.margin = "0";
    document.body.style.paddingTop = "390px";
  });

  it("keeps every setting reachable from a compact corner button", async () => {
    const handlers = renderControls();
    const trigger = page.getByRole("button", {
      name: /Option settings\. Showing all\. Level 2/,
    });
    const triggerBounds = trigger.element().getBoundingClientRect();
    expect(triggerBounds.width).toBeGreaterThanOrEqual(44);
    expect(triggerBounds.width).toBeLessThanOrEqual(48);
    expect(triggerBounds.height).toBeGreaterThanOrEqual(44);
    expect(triggerBounds.height).toBeLessThanOrEqual(48);
    expect(trigger.element().querySelector(".trigger-summary")).toBeNull();

    await trigger.click();

    const panel = page.getByRole("dialog", { name: "Option settings" });
    await expect.element(panel).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const bounds = panel.element().getBoundingClientRect();
    const overlay = page.getByTestId("option-settings-overlay");
    await expect.element(overlay).toBeVisible();
    const overlayBounds = overlay.element().getBoundingClientRect();
    expect(overlayBounds.left).toBe(0);
    expect(overlayBounds.top).toBe(0);
    expect(overlayBounds.width).toBe(window.innerWidth);
    expect(overlayBounds.height).toBe(window.innerHeight);
    expect(getComputedStyle(overlay.element()).backgroundImage).toContain(
      "linear-gradient"
    );
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
    expect(bounds.width).toBeGreaterThanOrEqual(280);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(bounds.bottom).toBeLessThanOrEqual(triggerBounds.top);

    await page.getByRole("button", { name: "Continuous" }).click();
    expect(handlers.onToggleContinuous).toHaveBeenCalledWith(true);

    await page.getByRole("button", { name: /Level 3:/ }).click();
    expect(handlers.onLevelChange).toHaveBeenCalledWith(3);

    await page
      .getByRole("group", { name: "Left turns" })
      .getByRole("button", { name: "2" })
      .click();
    expect(handlers.onLeftChange).toHaveBeenCalledWith(2);

    await page
      .getByRole("button", {
        name: "Toggle blue dash/static spin (currently CW)",
      })
      .click();
    expect(handlers.onLeftRotationChange).toHaveBeenCalledWith(
      RotationDirection.COUNTER_CLOCKWISE
    );

    await overlay.click({
      position: { x: 4, y: window.innerHeight - 4 },
    });
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    { level: 2 as const, leftTurns: 1 as const, rightTurns: 0 as const },
    { level: 3 as const, leftTurns: 0.5 as const, rightTurns: 1.5 as const },
  ])(
    "fits the complete Level $level controls above the corner button on a 327px phone without scrolling",
    async ({ level, leftTurns, rightTurns }) => {
      renderControls({ level, leftTurns, rightTurns });
      const trigger = page.getByRole("button", {
        name: /Option settings\. Showing all/,
      });
      await trigger.click();

      const panel = page.getByRole("dialog", { name: "Option settings" });
      await expect.element(panel).toBeVisible();

      // Let the turns row finish its entrance before measuring final geometry.
      await new Promise((resolve) => setTimeout(resolve, 350));

      const element = panel.element();
      const bounds = element.getBoundingClientRect();
      const triggerBounds = trigger.element().getBoundingClientRect();
      expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight);
      expect(bounds.height).toBeLessThanOrEqual(window.innerHeight / 2);
      expect(bounds.bottom).toBeLessThanOrEqual(triggerBounds.top);

      const expectedTurnButtons = level === 2 ? 4 : 8;
      const leftTurnButtons = page
        .getByRole("group", { name: "Left turns" })
        .element()
        .querySelectorAll(".turn-seg button");
      const rightTurnButtons = page
        .getByRole("group", { name: "Right turns" })
        .element()
        .querySelectorAll(".turn-seg button");
      expect(leftTurnButtons).toHaveLength(expectedTurnButtons);
      expect(rightTurnButtons).toHaveLength(expectedTurnButtons);
    }
  );

  it("has no AAA accessibility violations while the controls are open", async () => {
    renderControls();
    await page
      .getByRole("button", { name: /Option settings\. Showing all/ })
      .click();
    await expectNoA11yViolations();
  });
});
