// @vitest-environment jsdom
/**
 * Fuse's canvas keeps its own display choices and shares how the props move.
 * Getting either half wrong is silent: a Fuse toggle that leaked would change
 * the viewer, and a motion change that did not route would leave the panel
 * saying one thing while the props do another.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "tka-fuse-display";

async function load() {
  vi.resetModules();
  const { getAnimationVisibilityManager } =
    await import("#lib/shared/animation-engine/state/animation-visibility-state.svelte.js");
  const { getFuseDisplay } =
    await import("#lib/features/fuse/state/fuse-display.js");
  return {
    shared: getAnimationVisibilityManager(),
    display: getFuseDisplay(),
    getFuseDisplay,
  };
}

describe("getFuseDisplay", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens with the element on and the step number off", async () => {
    const { display, getFuseDisplay } = await load();
    expect(display.getVisibility("elementalGlyph")).toBe(true);
    expect(display.getVisibility("tkaGlyph")).toBe(true);
    expect(display.getVisibility("stepNumbers")).toBe(false);
    expect(getFuseDisplay()).toBe(display);
  });

  it("remembers a choice and leaves the viewer's alone", async () => {
    const { display, shared } = await load();
    const viewerSteps = shared.getVisibility("stepNumbers");
    const viewerGrid = shared.getGridMode();

    display.setVisibility("stepNumbers", true);
    display.setVisibility("elementalGlyph", false);
    display.setGridMode("none");

    expect(shared.getVisibility("stepNumbers")).toBe(viewerSteps);
    expect(shared.getGridMode()).toBe(viewerGrid);

    const { display: reloaded } = await load();
    expect(reloaded.getVisibility("stepNumbers")).toBe(true);
    expect(reloaded.getVisibility("elementalGlyph")).toBe(false);
    expect(reloaded.getGridMode()).toBe("none");
  });

  it("ignores stored values it cannot use", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gridMode: "hexagon", tkaGlyph: "yes", mandala: false })
    );
    const { display } = await load();
    expect(display.getGridMode()).toBe("8point");
    expect(display.getVisibility("tkaGlyph")).toBe(true);
    expect(display.getVisibility("mandala")).toBe(false);
  });

  it("shares how the props move, and repaints for it", async () => {
    const { display, shared } = await load();
    const repaint = vi.fn();
    display.registerObserver(repaint);

    shared.setPathShape("linear");
    expect(display.getPathPolicy().pathShape).toBe("linear");
    expect(repaint).toHaveBeenCalled();

    display.setPathShape("concave");
    expect(shared.getPathPolicy().pathShape).toBe("concave");
  });
});
