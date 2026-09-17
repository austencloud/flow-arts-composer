// @vitest-environment jsdom

/**
 * The canvas right-click menu had a hand-listed set of five effects while the
 * registry carried sixteen: two thirds of the roster was unreachable and
 * nothing read as checked when one of them was active. These tests hold the
 * menu to the registry so it cannot drift again.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { buildCanvasContextMenuItems } from "$lib/shared/animation-engine/components/canvas-context-menu/canvas-context-menu-builder";
import { EFFECTS } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import {
  isMenuItem,
  type ContextMenuEntry,
  type ContextMenuItem,
} from "$lib/shared/components/context-menu/context-menu-types";

function submenu(
  items: ContextMenuEntry[],
  id: string
): ContextMenuItem | undefined {
  return items.find((e): e is ContextMenuItem => isMenuItem(e) && e.id === id);
}

describe("canvas context menu builder", () => {
  let vm: AnimationVisibilityStateManager;
  let ecs: ReturnType<typeof createEffectsConfigState>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vm = new AnimationVisibilityStateManager({ ephemeral: true });
    ecs = createEffectsConfigState(undefined, { persist: false });
  });

  it("offers every registered effect plus None", () => {
    const effects = submenu(
      buildCanvasContextMenuItems({
        visibilityManager: vm,
        effectsConfigState: ecs,
      }),
      "effects-submenu"
    );

    const ids = (effects?.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      "effect-none",
      ...EFFECTS.map((e) => `effect-${e.id}`),
    ]);
  });

  it("checks the active effect anywhere in the roster", () => {
    ecs.setActiveEffect("petals");

    const effects = submenu(
      buildCanvasContextMenuItems({
        visibilityManager: vm,
        effectsConfigState: ecs,
      }),
      "effects-submenu"
    );
    const checked = (effects?.children ?? []).filter((c) => c.checked);

    expect(checked.map((c) => c.id)).toEqual(["effect-petals"]);
  });

  it("exposes the active effect's presets and hides the group when none is active", () => {
    expect(
      submenu(
        buildCanvasContextMenuItems({
          visibilityManager: vm,
          effectsConfigState: ecs,
        }),
        "effect-presets-submenu"
      )
    ).toBeUndefined();

    ecs.setActiveEffect("fire");
    const presets = submenu(
      buildCanvasContextMenuItems({
        visibilityManager: vm,
        effectsConfigState: ecs,
      }),
      "effect-presets-submenu"
    );

    expect(presets?.children?.length ?? 0).toBeGreaterThan(1);
    expect(presets?.children?.[0]?.id).toBe("effect-preset-default");
  });

  it("marks exactly one motion path active and writes the choice to the manager", () => {
    vm.setPathPolicy({ pathShape: "concave", motionAwarePaths: true });

    const paths = submenu(
      buildCanvasContextMenuItems({ visibilityManager: vm }),
      "path-shape-submenu"
    );
    const children = paths?.children ?? [];
    expect(children.filter((c) => c.checked).map((c) => c.id)).toEqual([
      "path-by-motion",
    ]);

    children.find((c) => c.id === "path-arc")?.action?.();

    expect(vm.getPathPolicy()).toEqual({
      pathShape: "arc",
      motionAwarePaths: false,
    });
  });

  it("keeps visibility toggles open and uses step terminology", () => {
    const visibility = submenu(
      buildCanvasContextMenuItems({ visibilityManager: vm }),
      "visibility-submenu"
    );
    const children = visibility?.children ?? [];

    expect(children.every((c) => c.keepOpen)).toBe(true);
    expect(children.map((c) => c.label)).toContain("Step Numbers");
    expect(children.some((c) => /beat/i.test(c.label))).toBe(false);
  });

  it("offers the hand and prop TnD glyphs as separate toggles", () => {
    const entries = () =>
      submenu(
        buildCanvasContextMenuItems({ visibilityManager: vm }),
        "visibility-submenu"
      )?.children ?? [];
    const hand = () => entries().find((c) => c.id === "vis-hand-tnd-glyph");
    const prop = () => entries().find((c) => c.id === "vis-prop-tnd-glyph");

    expect(hand()?.label).toBe("Hand TnD");
    expect(prop()?.label).toBe("Prop TnD");
    expect(entries().some((c) => c.label === "Element")).toBe(false);

    prop()?.action?.();

    expect(vm.getVisibility("propElementalGlyph")).toBe(true);
    expect(vm.getVisibility("elementalGlyph")).toBe(false);
    expect(prop()?.checked).toBe(true);
    expect(hand()?.checked).toBe(false);
  });

  it("toggles both path-line colors from the one Paths entry", () => {
    const paths = () =>
      (
        submenu(
          buildCanvasContextMenuItems({ visibilityManager: vm }),
          "visibility-submenu"
        )?.children ?? []
      ).find((c) => c.id === "vis-path-lines");

    expect(paths()?.checked).toBe(false);
    paths()?.action?.();

    expect(vm.getVisibility("leftPathLines")).toBe(true);
    expect(vm.getVisibility("rightPathLines")).toBe(true);
    expect(paths()?.checked).toBe(true);
  });
});
