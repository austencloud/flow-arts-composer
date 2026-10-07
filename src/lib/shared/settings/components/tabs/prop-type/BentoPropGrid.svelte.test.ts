import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
import { normalizePropPatch } from "$lib/shared/settings/domain/prop-pair-rule";
import {
  withPickVersion,
  type PickVersionFields,
} from "$lib/shared/settings/domain/prop-version-rule";
import BentoPropGrid from "./BentoPropGrid.svelte";

const CLUB_PICKER_PROPS = [
  PropType.CLUB,
  PropType.CLASSIC_CLUB,
  PropType.TORCH,
  PropType.BIGCLUB,
  PropType.BIGTORCH,
  PropType.FAN,
  PropType.TRIAD,
  PropType.MINIHOOP,
] as const;

describe("BentoPropGrid style drill-down", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  it("keeps artwork editing out of a metadata-only picker", async () => {
    render(BentoPropGrid, {
      selectedPropType: PropType.CLUB,
      onSelect: vi.fn(),
      allowedProps: CLUB_PICKER_PROPS,
      showAppearance: false,
      showColors: false,
    });
    await page.getByRole("button", { name: "Choose Club style" }).click();
    await expect.element(page.getByRole("button", {
      name: "Select Club prop type", exact: true,
    })).toBeVisible();
    await expect.element(page.getByRole("button", {
      name: "Select Club V2 prop type", exact: true,
    })).not.toBeInTheDocument();
  });

  it("replaces the grid with the family's styles and selects only the chosen one", async () => {
    const onSelect = vi.fn();

    render(BentoPropGrid, {
      selectedPropType: PropType.CLUB,
      onSelect,
      allowedProps: CLUB_PICKER_PROPS,
    });

    const trigger = page.getByRole("button", { name: "Choose Club style" });
    await trigger.click();

    const back = page.getByRole("button", { name: "Back to all props" });
    await expect.element(back).toBeVisible();
    // The styles replace the grid rather than floating over it, so a tap on
    // a style can never land on a prop card behind it.
    await expect
      .element(page.getByRole("button", { name: "Select Fan prop type" }))
      .not.toBeInTheDocument();

    const torchOption = page.getByRole("button", {
      name: "Select Torch V1 prop type",
    });
    await torchOption.click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(PropType.TORCH, "pictograph");

    // Picking stays one level down so styles can be compared; Back returns
    // to the full grid with the family tile closed.
    await expect.element(back).toBeVisible();
    await back.click();
    await expect
      .element(page.getByRole("button", { name: "Select Fan prop type" }))
      .toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("steps back on Escape without selecting anything", async () => {
    const onSelect = vi.fn();

    render(BentoPropGrid, {
      selectedPropType: PropType.CLUB,
      onSelect,
      allowedProps: CLUB_PICKER_PROPS,
    });

    const trigger = page.getByRole("button", { name: "Choose Club style" });
    await trigger.click();
    await expect
      .element(page.getByRole("button", { name: "Back to all props" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(onSelect).not.toHaveBeenCalled();
    await expect.element(trigger).toBeVisible();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("BentoPropGrid style settings", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  const openSection = (name: string) =>
    document.querySelector(`section[aria-label="${name}"]`);

  // Every Triad pick once opened a details page that held nothing but the
  // size toggle. The styles page carries the size, and a pick stays there.
  it("keeps a picked style on its styles page, with its size there", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(BentoPropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect,
      allowedProps: [PropType.TRIAD, PropType.TRIGENG, PropType.BIGTRIAD],
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    const styles = page.getByRole("region", { name: "Triad styles" });
    await expect
      .element(styles.getByRole("button", { name: "Big", exact: true }))
      .toBeVisible();

    await page
      .getByRole("button", { name: "Select Triad V2 prop type", exact: true })
      .click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIAD, "model");
    // Past the page swap a details page would take.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(openSection("Triad details")).toBeNull();
    expect(openSection("Triad styles")).not.toBeNull();

    await styles.getByRole("button", { name: "Big", exact: true }).click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGTRIAD);

    // The tiles follow the size, so a later pick keeps it.
    await rerender({ selectedPropType: PropType.BIGTRIAD });
    const bigModel = page.getByRole("button", {
      name: "Select Big Triad V2 prop type",
      exact: true,
    });
    await expect.element(bigModel).toBeVisible();
    await expect
      .element(styles.getByRole("button", { name: "Big", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await bigModel.click();
    expect(onSelect).toHaveBeenLastCalledWith(PropType.BIGTRIAD, "model");
  });

  // A size twin is the same prop, so the global pick rule keeps the version a
  // Version 2 pick chose. The host here writes the way SettingsState does:
  // pair normalization, then the pick rule.
  it("keeps Version 2 when the size changes under the global pick rule", async () => {
    let held: PickVersionFields = {
      leftPropType: PropType.TRIAD,
      rightPropType: PropType.TRIAD,
      propType: PropType.TRIAD,
      catDogMode: false,
      propArtwork: "pictograph",
    };
    const write = (patch: PickVersionFields) => {
      held = { ...held, ...withPickVersion(held, normalizePropPatch(held, patch)) };
    };
    const { rerender } = render(BentoPropGrid, {
      selectedPropType: PropType.TRIAD,
      onSelect: (prop: PropType) => write({ propType: prop }),
      propLook: held.propArtwork,
      onPropLookChange: (look: PropLook) => write({ propArtwork: look }),
      allowedProps: [PropType.TRIAD, PropType.TRIGENG, PropType.BIGTRIAD],
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await page
      .getByRole("button", { name: "Select Triad V2 prop type", exact: true })
      .click();
    expect(held.propArtwork).toBe("model");

    await rerender({ propLook: "model" });
    const styles = page.getByRole("region", { name: "Triad styles" });
    await styles.getByRole("button", { name: "Big", exact: true }).click();
    expect(held.propType).toBe(PropType.BIGTRIAD);
    expect(held.propArtwork).toBe("model");
  });

  it("keeps a buugeng style's chirality on the same page", async () => {
    const onChange = vi.fn();
    render(BentoPropGrid, {
      selectedPropType: PropType.TRIGENG,
      onSelect: vi.fn(),
      allowedProps: [PropType.TRIAD, PropType.TRIGENG],
      chirality: {
        hands: [
          { hand: "left", flipped: false },
          { hand: "right", flipped: false },
        ],
        onChange,
      },
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    const styles = page.getByRole("region", { name: "Triad styles" });
    await styles.getByRole("radio", { name: /^B/ }).first().click();
    expect(onChange).toHaveBeenCalledWith("left", true);
  });
});

describe("BentoPropGrid colours on a drill", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  const colorsSection = () =>
    document.querySelector<HTMLElement>("section.primary-colors");
  // True while an animation runs on the colours or on a box holding them.
  const fading = (el: HTMLElement | null) =>
    !!el &&
    document.getAnimations().some((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && target.contains(el);
    });

  // The colours once vanished in one frame, then squashed upward, while the
  // tiles below them faded. They belong to the grid's page and leave with it.
  it("fades out with the tiles as one page, without resizing", async () => {
    render(BentoPropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect: vi.fn(),
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
    });

    const colors = colorsSection();
    const tile = document.querySelector<HTMLElement>("[data-prop-tile]");
    if (!colors || !tile) throw new Error("picker did not render");
    // Opening the picker shows them at rest.
    expect(fading(colors)).toBe(false);
    const height = colors.getBoundingClientRect().height;
    const gap =
      tile.getBoundingClientRect().top - colors.getBoundingClientRect().top;

    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    const leaving: { height: number; gap: number; fading: boolean }[] = [];
    await expect
      .poll(() => {
        if (!colors.isConnected) return true;
        const box = colors.getBoundingClientRect();
        leaving.push({
          height: box.height,
          gap: tile.getBoundingClientRect().top - box.top,
          fading: fading(colors),
        });
        return false;
      })
      .toBe(true);

    expect(leaving.some((frame) => frame.fading)).toBe(true);
    for (const frame of leaving) {
      expect(frame.height).toBeCloseTo(height, 0);
      expect(frame.gap).toBeCloseTo(gap, 0);
    }

    await page.getByRole("button", { name: "Back to all props" }).click();
    await expect.poll(() => fading(colorsSection())).toBe(true);
  });
});

describe("BentoPropGrid prop version", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  async function openBuugengDetails(showPropLook?: boolean): Promise<void> {
    render(BentoPropGrid, {
      selectedPropType: PropType.BUUGENG,
      onSelect: vi.fn(),
      allowedProps: [PropType.BUUGENG, PropType.BIGBUUGENG],
      ...(showPropLook === undefined ? {} : { showPropLook }),
    });
    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();
    await expect
      .element(page.getByRole("button", { name: "Big" }))
      .toBeVisible();
  }

  it("offers the Version 1 and 2 choice by default", async () => {
    await openBuugengDetails();
    await expect
      .element(page.getByRole("radio", { name: "Version 1" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("radio", { name: "Version 2" }))
      .toBeVisible();
  });

  it("leaves it out when the host renders in 3D", async () => {
    await openBuugengDetails(false);
    await expect
      .element(page.getByRole("radio", { name: "Version 2" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("radio", { name: "Version 1" }))
      .not.toBeInTheDocument();
  });
});
