/**
 * Ephemeral visibility-manager isolation.
 *
 * The landing page's Infinite Spinner drives the REAL AnimationPanel against
 * an ephemeral AnimationVisibilityStateManager (scoped via
 * animation-visibility-context). The whole design rests on one invariant:
 * writes to an ephemeral instance must never leak into global state. If the
 * `ephemeral` flag handling regresses, every landing-page visitor silently
 * rewrites their persisted app settings (effort, display toggles, dark mode)
 * without anyone noticing — the textbook silent bug.
 *
 * Also pins the buildPillSpecs membership contract that AnimationPanel's
 * host-optional Export pill relies on: omitted keys must NOT produce pills.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AnimationVisibilityStateManager } from "../../../src/lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { buildPillSpecs } from "../../../src/lib/shared/animation-panel/pill-nav/pill-types";

const STORAGE_KEY = "animation-visibility-settings";

describe("AnimationVisibilityStateManager (ephemeral)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("never writes to localStorage", () => {
    const vm = new AnimationVisibilityStateManager({ ephemeral: true });

    vm.setEffortPreset("bounce");
    vm.setVisibility("tkaGlyph", false);
    vm.setGridMode("none");
    vm.setBpm(120);
    vm.setPathShape("linear");
    vm.setDarkMode(false);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not toggle the global .dark class", () => {
    const vm = new AnimationVisibilityStateManager({ ephemeral: true });

    vm.setDarkMode(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    document.documentElement.classList.add("dark");
    vm.setDarkMode(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("starts from defaults even when persisted settings exist", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ effortPreset: "punch", gridMode: "none" })
    );

    const vm = new AnimationVisibilityStateManager({ ephemeral: true });

    expect(vm.getEffortPreset()).toBe("linear");
    expect(vm.getGridMode()).toBe("8point");
    expect(vm.getVisibility("elementalGlyph")).toBe(false);
    expect(vm.getVisibility("propElementalGlyph")).toBe(false);
  });

  it("keeps the elemental glyph toggle isolated and observable", () => {
    const globalVm = new AnimationVisibilityStateManager();
    const ephemeralVm = new AnimationVisibilityStateManager({
      ephemeral: true,
    });
    let notified = 0;
    ephemeralVm.registerObserver(() => notified++);

    ephemeralVm.setVisibility("elementalGlyph", true);

    expect(ephemeralVm.getVisibility("elementalGlyph")).toBe(true);
    expect(globalVm.getVisibility("elementalGlyph")).toBe(false);
    expect(notified).toBe(1);
  });

  it("migrates older persisted settings with the elemental glyph off", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gridMode: "8point", props: true })
    );

    const vm = new AnimationVisibilityStateManager();

    expect(vm.getVisibility("elementalGlyph")).toBe(false);
    expect(vm.getVisibility("propElementalGlyph")).toBe(false);
    vm.setVisibility("elementalGlyph", true);
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").elementalGlyph
    ).toBe(true);
  });

  it("keeps ephemeral and persistent instances fully independent", () => {
    const globalVm = new AnimationVisibilityStateManager();
    const ephemeralVm = new AnimationVisibilityStateManager({
      ephemeral: true,
    });

    ephemeralVm.setEffortPreset("elastic");
    expect(globalVm.getEffortPreset()).toBe("linear");

    globalVm.setEffortPreset("press");
    expect(ephemeralVm.getEffortPreset()).toBe("elastic");

    // The persistent instance saved its write; the ephemeral one contributed nothing
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.effortPreset).toBe("press");
  });

  it("notifies its own observers, not the other instance's", () => {
    const globalVm = new AnimationVisibilityStateManager();
    const ephemeralVm = new AnimationVisibilityStateManager({
      ephemeral: true,
    });

    let globalNotified = 0;
    let ephemeralNotified = 0;
    globalVm.registerObserver(() => globalNotified++);
    ephemeralVm.registerObserver(() => ephemeralNotified++);

    ephemeralVm.setEffortPreset("dab");

    expect(ephemeralNotified).toBe(1);
    expect(globalNotified).toBe(0);
  });
});

describe("buildPillSpecs membership (host-optional Export pill)", () => {
  const ORDER = [
    "effects",
    "props",
    "effort",
    "playback",
    "display",
    "export",
  ] as const;

  it("omitted keys produce no pill — a host without export gets no Export pill", () => {
    const specs = buildPillSpecs(
      {
        effects: {
          icon: "fa-wand-magic-sparkles",
          label: "Effects",
          summary: "",
        },
        effort: { label: "Effort", summary: "" },
        playback: { icon: "fa-play", label: "Playback", summary: "" },
        display: { icon: "fa-eye", label: "Display", summary: "" },
      },
      ORDER
    );

    expect(specs.map((p) => p.id)).toEqual([
      "effects",
      "effort",
      "playback",
      "display",
    ]);
  });

  it("included export key produces the pill in host order", () => {
    const specs = buildPillSpecs(
      {
        effects: {
          icon: "fa-wand-magic-sparkles",
          label: "Effects",
          summary: "",
        },
        export: { icon: "fa-sliders", label: "Export", summary: "" },
      },
      ORDER
    );

    expect(specs.map((p) => p.id)).toEqual(["effects", "export"]);
  });
});
