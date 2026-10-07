import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import { LOOPComponent } from "$lib/features/create/generate/shared/domain/models/generate-models";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
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
}: {
  selectedComponents?: Set<LOOPComponent>;
  currentType?: LOOPType;
  sequenceLength?: number;
  rhythm?: RhythmValue;
} = {}) {
  const handlers = {
    onChange: vi.fn(),
    onClose: vi.fn(),
    onRhythmChange: vi.fn(),
  };

  render(LOOPExpandedOverlay, {
    currentType,
    selectedComponents,
    rhythm,
    sequenceLength,
    layout: "list",
    ...handlers,
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
