import { describe, it, expect, vi } from "vitest";
import { VisibilityStateManager } from "../visibility-state.svelte";

/**
 * Regression guard for the non-radial-points desync bug (2026-07-02).
 *
 * The sequence-viewer download card (ChoreoCard.svelte) used to read
 * `getSettings().visibility.nonRadialPoints ?? true` for the RENDER while the
 * export panel's "Non-radial" toggle read `VisibilityStateManager` (default
 * `false`). With the setting never toggled (undefined), the render defaulted ON
 * and the button showed OFF — points appeared that the toggle claimed were off.
 *
 * The fix routes BOTH the render and the toggle through this manager. These
 * tests lock the contract both consumers now depend on: the default is `false`,
 * and a change notifies the `all` / `non_radial` observers the card listens on.
 */
describe("VisibilityStateManager — hand colour key", () => {
  it("defaults the start-placement hand key ON so it is baked in until toggled", () => {
    const vm = new VisibilityStateManager();
    expect(vm.getRawGlyphVisibility("handColorKey")).toBe(true);
    expect(vm.getState().handColorKey).toBe(true);
  });

  it("toggles through setGlyphVisibility and notifies glyph observers", () => {
    const vm = new VisibilityStateManager();
    const glyphObserver = vi.fn();
    vm.registerObserver(glyphObserver, ["glyph"]);
    vm.setGlyphVisibility("handColorKey", false);
    expect(vm.getRawGlyphVisibility("handColorKey")).toBe(false);
    expect(glyphObserver).toHaveBeenCalledTimes(1);
    expect(vm.toAppSettings().handColorKey).toBe(false);
  });
});

describe("VisibilityStateManager — prop TnD glyph", () => {
  it("defaults the prop timing-and-direction glyph OFF", () => {
    const vm = new VisibilityStateManager();
    expect(vm.getRawGlyphVisibility("propTndGlyph")).toBe(false);
    expect(vm.getState().propTndGlyph).toBe(false);
  });

  it("toggles independently of the hand TnD glyph and persists", () => {
    const vm = new VisibilityStateManager();
    vm.setGlyphVisibility("propTndGlyph", true);
    expect(vm.getRawGlyphVisibility("propTndGlyph")).toBe(true);
    expect(vm.getRawGlyphVisibility("tndGlyph")).toBe(false);
    expect(vm.toAppSettings().propTndGlyph).toBe(true);
    expect(vm.getVisibleGlyphs()).toContain("propTndGlyph");
  });
});

describe("VisibilityStateManager — non-radial points", () => {
  it("defaults non-radial points OFF (matches the export-panel toggle)", () => {
    const vm = new VisibilityStateManager();
    expect(vm.getNonRadialVisibility()).toBe(false);
    expect(vm.getState().nonRadialPoints).toBe(false);
  });

  it("reflects set state both ways", () => {
    const vm = new VisibilityStateManager();
    vm.setNonRadialVisibility(true);
    expect(vm.getNonRadialVisibility()).toBe(true);
    vm.setNonRadialVisibility(false);
    expect(vm.getNonRadialVisibility()).toBe(false);
  });

  it("notifies `all` and `non_radial` observers on change (drives the card re-render)", () => {
    const vm = new VisibilityStateManager();

    const allObserver = vi.fn();
    const nonRadialObserver = vi.fn();
    vm.registerObserver(allObserver, ["all"]);
    vm.registerObserver(nonRadialObserver, ["non_radial"]);

    vm.setNonRadialVisibility(true);

    // ChoreoCard registers under ["glyph", "non_radial", "all"] and re-renders
    // on either — both must fire so the toggle and the cells stay in lockstep.
    expect(allObserver).toHaveBeenCalled();
    expect(nonRadialObserver).toHaveBeenCalled();
  });
});
