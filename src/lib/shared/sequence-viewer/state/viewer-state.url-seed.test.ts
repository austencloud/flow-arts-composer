// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createViewerState } from "./viewer-state.svelte";

const gate = vi.hoisted(() => ({ fits: true }));
vi.mock("#lib/shared/3d/capabilities/viewport-3d-gate.svelte.js", () => ({
  viewportFits3D: () => gate.fits,
}));

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); gate.fits = true; });

describe("createViewerState URL seeding", () => {
  it("initialMode wins over persisted mode", () => {
    localStorage.setItem("tka-viewer-mode", "card");
    const state = createViewerState({ initialMode: "tunnel", persist: false });
    expect(state.viewerMode).toBe("tunnel");
  });

  it("persist:false never writes viewer-mode or split keys", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const state = createViewerState({ initialMode: "split", persist: false });
    state.setViewerMode("card");
    state.setSplitConfig({ leftPane: "animation", rightPane: "card" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("no options preserves today's behavior (loads + persists)", () => {
    const state = createViewerState();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    state.setViewerMode("card");
    expect(setItem).toHaveBeenCalledWith("tka-viewer-mode", "card");
  });

  it("a host's seeded opening view is not saved, but a later choice is", () => {
    const state = createViewerState();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    state.seedViewerMode("tunnel");
    expect(state.viewerMode).toBe("tunnel");
    expect(setItem).not.toHaveBeenCalledWith("tka-viewer-mode", expect.anything());
    state.setViewerMode("card");
    expect(setItem).toHaveBeenCalledWith("tka-viewer-mode", "card");
  });

  it("URL post-studio is honored (explicit-intent carve-out)", () => {
    const state = createViewerState({ initialMode: "post-studio", persist: false });
    expect(state.viewerMode).toBe("post-studio");
  });

  it("opens a shared 3D view without recording, then arms recording explicitly", () => {
    const state = createViewerState({ initialMode: "animation-3d", persist: false });
    expect(state.viewerMode).toBe("animation-3d");
    expect(state.exportContext).toBeNull();

    state.enterExport("animation-export", "animation-3d");
    expect(state.exportContext).toBe("animation-export");
  });

  it("preserves initial 2D and Card export contexts", () => {
    expect(createViewerState({ initialMode: "animation", persist: false }).exportContext).toBe("animation-export");
    expect(createViewerState({ initialMode: "card", persist: false }).exportContext).toBe("image-export");
  });

  it("a cast lands performer-only modes on the tunnel without touching the remembered mode", () => {
    localStorage.setItem("tka-viewer-mode", "card");
    const state = createViewerState({ initialMode: "split" });
    state.setSubject("cast");
    expect(state.viewerMode).toBe("tunnel");
    expect(state.wants3D).toBe(false);
    expect(state.rawViewerMode).toBe("split");

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    state.setViewerMode("post-studio");
    expect(state.viewerMode).toBe("post-studio");
    state.setViewerMode("animation");
    expect(state.viewerMode).toBe("tunnel");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem("tka-viewer-mode")).toBe("card");
  });

  it("keeps a cast's 3D stage, and falls back to its tunnel when 3D does not fit", () => {
    const state = createViewerState({ initialMode: "animation-3d", persist: false });
    state.setSubject("cast");
    expect(state.viewerMode).toBe("animation-3d");
    expect(state.wants3D).toBe(true);
    gate.fits = false;
    const small = createViewerState({ initialMode: "animation-3d", persist: false });
    small.setSubject("cast");
    expect(small.viewerMode).toBe("tunnel");
  });

  it("raw getters keep the 3D preference a small viewport coerces away", () => {
    // The URL session captures the raw pair: a 3D link opened on a folded
    // phone must not be rewritten to 2D in the address bar.
    gate.fits = false;
    const state = createViewerState({
      initialMode: "animation-3d",
      initialSplit: { leftPane: "animation-3d", rightPane: "card" },
      persist: false,
    });
    expect(state.viewerMode).toBe("animation");
    expect(state.splitConfig).toEqual({ leftPane: "animation", rightPane: "card" });
    expect(state.rawViewerMode).toBe("animation-3d");
    expect(state.rawSplitConfig).toEqual({ leftPane: "animation-3d", rightPane: "card" });
    expect(state.wants3D).toBe(true);
  });
});
