import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import PropOrientationControl from "./PropOrientationControl.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";
import { getLocale, setLocale } from "#lib/shared/i18n/i18n.svelte.js";

describe("PropOrientationControl", () => {
  it("switches accessible names to German while preserving orientation values", async () => {
    const originalLocale = getLocale();
    const onOrientationChange = vi.fn();
    try {
      render(PropOrientationControl, {
        hand: "left",
        orientation: "in",
        onOrientationChange,
      });

      await setLocale("de");
      await expect
        .element(
          page.getByRole("radiogroup", { name: "Startausrichtung Links" })
        )
        .toBeVisible();
      await page
        .getByRole("radio", { name: "Ausrichtung links auf nach außen setzen" })
        .click();
      expect(onOrientationChange).toHaveBeenCalledExactlyOnceWith("out");
    } finally {
      await setLocale(originalLocale);
    }
  });

  it("shows the current orientation as the selected option", async () => {
    render(PropOrientationControl, {
      hand: "left",
      orientation: "in",
      onOrientationChange: vi.fn(),
    });
    await expect
      .element(
        page.getByRole("radio", { name: "Set left orientation to Inward" })
      )
      .toHaveAttribute("aria-checked", "true");
  });

  it("emits exactly the picked orientation", async () => {
    const onOrientationChange = vi.fn();
    render(PropOrientationControl, {
      hand: "left",
      orientation: "in",
      onOrientationChange,
    });

    await page
      .getByRole("radio", { name: "Set left orientation to Outward" })
      .click();

    expect(onOrientationChange).toHaveBeenCalledTimes(1);
    expect(onOrientationChange).toHaveBeenCalledWith("out");
  });

  it("reaches a far orientation in one press, not three", async () => {
    // This is the whole point of the change: Counter used to be three steps
    // around a cycle whose order was not written down anywhere on screen.
    const onOrientationChange = vi.fn();
    render(PropOrientationControl, {
      hand: "right",
      orientation: "in",
      onOrientationChange,
    });

    await page
      .getByRole("radio", { name: "Set right orientation to Counterclockwise" })
      .click();

    expect(onOrientationChange).toHaveBeenCalledTimes(1);
    expect(onOrientationChange).toHaveBeenCalledWith("counter");
  });

  it("removes orientations outside the host's allowed vocabulary", async () => {
    render(PropOrientationControl, {
      hand: "left",
      orientation: "in",
      allowedOrientations: ["in", "out"],
      onOrientationChange: vi.fn(),
    });

    await expect
      .element(
        page.getByRole("radio", { name: "Set left orientation to Inward" })
      )
      .toBeVisible();
    await expect
      .element(
        page.getByRole("radio", { name: "Set left orientation to Outward" })
      )
      .toBeVisible();
    await expect
      .element(
        page.getByRole("radio", { name: "Set left orientation to Clockwise" })
      )
      .not.toBeInTheDocument();
    await expect
      .element(
        page.getByRole("radio", {
          name: "Set left orientation to Counterclockwise",
        })
      )
      .not.toBeInTheDocument();
  });

  it("offers the interradial orientations only when asked to", async () => {
    render(PropOrientationControl, {
      hand: "left",
      orientation: "in",
      showInterradial: true,
      onOrientationChange: vi.fn(),
    });

    await expect
      .element(
        page.getByRole("radio", {
          name: "Set left orientation to Clockwise inward",
        })
      )
      .toBeVisible();
  });

  it("tracks the controlled orientation prop on rerender", async () => {
    const screen = render(PropOrientationControl, {
      hand: "left",
      orientation: "in",
      onOrientationChange: vi.fn(),
    });
    await expect
      .element(
        page.getByRole("radio", { name: "Set left orientation to Inward" })
      )
      .toHaveAttribute("aria-checked", "true");

    await screen.rerender({
      hand: "left",
      orientation: "out",
      onOrientationChange: vi.fn(),
    });
    await expect
      .element(
        page.getByRole("radio", { name: "Set left orientation to Outward" })
      )
      .toHaveAttribute("aria-checked", "true");
  });

  it("has no AAA a11y violations", async () => {
    render(PropOrientationControl, {
      hand: "left",
      orientation: "in",
      onOrientationChange: vi.fn(),
    });
    await expectNoA11yViolations();
  });
});
