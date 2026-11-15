import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import { LOOPComponent } from "#lib/features/create/generate/shared/domain/models/generate-models.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import LOOPExpandedOverlay from "./LOOPExpandedOverlay.svelte";

type RhythmValue = {
  rotationInterval: 2 | 4;
  inversionInterval: 2 | 4;
  inversionMode: "expand" | "overlay";
  reflectionAxis: ReflectionAxis;
};

const HALVED_RHYTHM: RhythmValue = {
  rotationInterval: 2,
  inversionInterval: 2,
  inversionMode: "expand",
  reflectionAxis: "north-south",
};

function renderOverlay({
  selectedComponents = new Set<LOOPComponent>(),
  currentType = LOOPType.ROTATED,
  sequenceLength = 8,
  rhythm = HALVED_RHYTHM,
  fits,
}: {
  selectedComponents?: Set<LOOPComponent>;
  currentType?: LOOPType;
  sequenceLength?: number;
  rhythm?: RhythmValue;
  /** Gives the overlay a host that can fit a pick to the length. */
  fits?: boolean;
} = {}) {
  const handlers = {
    onChange: vi.fn(),
    onClose: vi.fn(),
    onRhythmChange: vi.fn(),
    onPickNeedsFit: vi.fn(() => fits ?? false),
  };

  render(LOOPExpandedOverlay, {
    currentType,
    selectedComponents,
    rhythm,
    sequenceLength,
    layout: "list",
    ...handlers,
    onPickNeedsFit: fits === undefined ? undefined : handlers.onPickNeedsFit,
  });

  return handlers;
}

describe("LOOPExpandedOverlay live single selection", () => {
  beforeEach(async () => {
    await page.viewport(900, 900);
  });

  it("keeps the choices in place while Single settings write through live", async () => {
    const handlers = renderOverlay();

    await page
      .getByRole("button", {
        name: /Rotated - Halved or quartered placement rotation - not selected/,
      })
      .click();

    expect(handlers.onChange).toHaveBeenCalledTimes(1);
    expect(handlers.onChange).toHaveBeenLastCalledWith(LOOPType.ROTATED);
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".apply-button")).toBeNull();
    expect(document.body.textContent).toContain("Swapped");
    expect(
      document.querySelector('[aria-label="Back to all LOOP types"]')
    ).toBeNull();

    const rotatedButton = document.querySelector<HTMLButtonElement>(
      `[data-component="${LOOPComponent.ROTATED}"] .loop-component-button`
    );
    expect(rotatedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(
      document.querySelectorAll(".compact-chooser .loop-component-shell")
    ).toHaveLength(5);

    await page
      .getByRole("radiogroup", { name: "Rotation period" })
      .getByRole("radio", { name: "Quartered" })
      .click();

    expect(handlers.onRhythmChange).toHaveBeenLastCalledWith({
      rotationInterval: 4,
    });
    expect(handlers.onChange).toHaveBeenCalledTimes(2);
    expect(handlers.onChange).toHaveBeenLastCalledWith(LOOPType.ROTATED);
  });

  it("keeps every choice available next to its settings on a phone", async () => {
    await page.viewport(375, 667);
    const handlers = renderOverlay();

    await page
      .getByRole("button", {
        name: /Rotated - Halved or quartered placement rotation - not selected/,
      })
      .click();

    expect(handlers.onChange).toHaveBeenLastCalledWith(LOOPType.ROTATED);
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(
      document.querySelector('[aria-label="Back to all LOOP types"]')
    ).toBeNull();
    expect(
      document.querySelector(`[data-component="${LOOPComponent.SWAPPED}"]`)
    ).not.toBeNull();
    await expect
      .element(page.getByRole("radiogroup", { name: "Rotation period" }))
      .toBeVisible();
    const rotatedButton = document.querySelector<HTMLButtonElement>(
      `[data-component="${LOOPComponent.ROTATED}"] .loop-component-button`
    );
    expect(rotatedButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps an invalid single choice visible until a live setting makes it valid", async () => {
    const handlers = renderOverlay({
      selectedComponents: new Set([LOOPComponent.SWAPPED]),
      currentType: LOOPType.SWAPPED,
      sequenceLength: 6,
      rhythm: { ...HALVED_RHYTHM, rotationInterval: 4 },
    });

    await page
      .getByRole("button", {
        name: /Rotated - Halved or quartered placement rotation - not selected/,
      })
      .click();

    expect(handlers.onChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "6 beats can't split into 4 equal parts"
    );
    expect(document.querySelector(".apply-button")).toBeNull();

    await page
      .getByRole("radiogroup", { name: "Rotation period" })
      .getByRole("radio", { name: "Halved" })
      .click();

    expect(handlers.onRhythmChange).toHaveBeenLastCalledWith({
      rotationInterval: 2,
    });
    expect(handlers.onChange).toHaveBeenLastCalledWith(LOOPType.ROTATED);
  });

  // Austen 2026-11-14: "when I click quartered and then I click the X button
  // it saves it as halved because it thinks I just cancelled out what I
  // said." At 14 steps Quartered can't split evenly, so the pick was shown
  // but never written, and X dropped it.
  it("hands a Quartered pick the length can't split to the host, so X keeps it", async () => {
    const handlers = renderOverlay({
      selectedComponents: new Set([LOOPComponent.ROTATED]),
      sequenceLength: 14,
      fits: true,
    });

    await page
      .getByRole("radiogroup", { name: "Rotation period" })
      .getByRole("radio", { name: "Quartered" })
      .click();

    expect(handlers.onPickNeedsFit).toHaveBeenCalledTimes(1);
    expect(handlers.onPickNeedsFit).toHaveBeenLastCalledWith({
      loopType: LOOPType.ROTATED,
      rhythm: { rotationInterval: 4 },
    });
    // The fitted write replaces the plain one, so the host's length-blind
    // reconcile never sees Quartered at 14 and turns it back to Halved.
    expect(handlers.onRhythmChange).not.toHaveBeenCalled();
    expect(handlers.onChange).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Close LOOP selection" }).click();
    expect(handlers.onPickNeedsFit).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("applies and closes a component the length can't hold when the host fits it", async () => {
    const handlers = renderOverlay({ sequenceLength: 7, fits: true });

    await page
      .getByRole("button", {
        name: /Swapped - Left and right hands swap roles - not selected/,
      })
      .click();

    expect(handlers.onPickNeedsFit).toHaveBeenLastCalledWith({
      loopType: LOOPType.SWAPPED,
    });
    expect(handlers.onChange).not.toHaveBeenCalled();
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a pick shown but unsaved when the host can't fit it", async () => {
    const handlers = renderOverlay({
      selectedComponents: new Set([LOOPComponent.ROTATED]),
      sequenceLength: 14,
      fits: false,
    });

    await page
      .getByRole("radiogroup", { name: "Rotation period" })
      .getByRole("radio", { name: "Quartered" })
      .click();

    expect(handlers.onPickNeedsFit).toHaveBeenCalledTimes(1);
    expect(handlers.onRhythmChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "14 beats can't split into 4 equal parts"
    );
  });

  it("applies and closes a Single LOOP that has no settings", async () => {
    const handlers = renderOverlay();

    await page
      .getByRole("button", {
        name: /Swapped - Left and right hands swap roles - not selected/,
      })
      .click();

    expect(handlers.onChange).toHaveBeenLastCalledWith(LOOPType.SWAPPED);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('[aria-label="Back to all LOOP types"]')
    ).toBeNull();
  });

  it("keeps Combo transactional", async () => {
    const handlers = renderOverlay({
      selectedComponents: new Set([LOOPComponent.ROTATED]),
    });

    await page.getByRole("button", { name: "Combo" }).click();
    await page
      .getByRole("button", {
        name: /Swapped - Left and right hands swap roles - not selected/,
      })
      .click();

    expect(handlers.onChange).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "Apply 2-Component Combo" }).click();

    expect(handlers.onChange).toHaveBeenLastCalledWith(
      LOOPType.ROTATED_SWAPPED
    );
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("LOOPExpandedOverlay opening", () => {
  beforeEach(async () => {
    await page.viewport(900, 900);
  });

  it("does not measure its settings switches while it mounts", async () => {
    // The panel mounts inside the tap that opens the card. A settings switch
    // measures its choices only when its list is rebuilt, and a rebuild there
    // forces a full page layout before the card can start moving.
    const measure = vi.spyOn(Element.prototype, "getBoundingClientRect");
    try {
      renderOverlay({
        selectedComponents: new Set([LOOPComponent.ROTATED]),
        rhythm: { ...HALVED_RHYTHM },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(document.querySelector(".segment")).not.toBeNull();
      const switchMeasures = measure.mock.contexts.filter(
        (element) => element instanceof Element && element.matches(".segment")
      );
      expect(switchMeasures).toHaveLength(0);
    } finally {
      measure.mockRestore();
    }
  });
});
