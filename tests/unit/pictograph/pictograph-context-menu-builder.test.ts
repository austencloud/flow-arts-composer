// @vitest-environment jsdom

/**
 * The workspace pictograph right-click menu offered one "TnD" toggle, so the
 * prop timing-and-direction glyph could not be reached from a pictograph at
 * all. Hold the Glyphs submenu to two named toggles that drive distinct keys.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { buildPictographContextMenuItems } from "$lib/shared/pictograph/shared/components/context-menu/pictograph-context-menu-builder";
import { VisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
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

describe("pictograph context menu builder", () => {
  let vm: VisibilityStateManager;

  beforeEach(() => {
    localStorage.clear();
    vm = new VisibilityStateManager();
    vm.setGlyphVisibility("tndGlyph", false);
    vm.setGlyphVisibility("elementalGlyph", false);
    vm.setGlyphVisibility("propTndGlyph", false);
  });

  const glyphs = () =>
    submenu(
      buildPictographContextMenuItems({ visibilityManager: vm }),
      "glyphs-submenu"
    )?.children ?? [];

  it("offers the hand and prop TnD glyphs as separate toggles", () => {
    expect(glyphs().map((c) => c.label)).toEqual([
      "TKA",
      "Hand TnD",
      "Prop TnD",
      "Positions",
    ]);
  });

  it("moves the hand TnD mark and its element together", () => {
    glyphs()
      .find((c) => c.id === "toggle-hand-tnd-glyph")
      ?.action?.();

    expect(vm.getRawGlyphVisibility("tndGlyph")).toBe(true);
    expect(vm.getRawGlyphVisibility("elementalGlyph")).toBe(true);
    expect(vm.getRawGlyphVisibility("propTndGlyph")).toBe(false);
  });

  it("toggles the prop TnD glyph on its own", () => {
    glyphs()
      .find((c) => c.id === "toggle-prop-tnd-glyph")
      ?.action?.();

    expect(vm.getRawGlyphVisibility("propTndGlyph")).toBe(true);
    expect(vm.getRawGlyphVisibility("tndGlyph")).toBe(false);
    expect(
      glyphs().find((c) => c.id === "toggle-prop-tnd-glyph")?.checked
    ).toBe(true);
    expect(
      glyphs().find((c) => c.id === "toggle-hand-tnd-glyph")?.checked
    ).toBe(false);
  });
});
