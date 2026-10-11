import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initialViewerModeForUrl,
  viewerModeForRenderMode,
  viewerModeOptions,
} from "#lib/shared/sequence-viewer/services/viewer-modes.js";
import {
  loadSplitConfig,
  loadViewerMode,
} from "#lib/shared/sequence-viewer/services/viewer-state-persistence.js";
import { resolveEditingPane } from "#lib/shared/sequence-viewer/services/viewer-orchestrator-model.js";

const VIEWER_MODE_KEY = "tka-viewer-mode";
const SPLIT_CONFIG_KEY = "tka-viewer-split-config";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("sequence viewer Video mode", () => {
  it("uses Videos, not Mandala, in the primary switcher", () => {
    const ids = viewerModeOptions(false, false).map((mode) => mode.id);

    expect(ids).toContain("videos");
    expect(ids).not.toContain("mandala");
  });

  it("migrates stored Mandala views to standard viewer layouts", () => {
    localStorage.setItem(VIEWER_MODE_KEY, "mandala");
    expect(loadViewerMode()).toBe("split");
    expect(localStorage.getItem(VIEWER_MODE_KEY)).toBe("split");

    localStorage.setItem(
      SPLIT_CONFIG_KEY,
      JSON.stringify({ leftPane: "animation", rightPane: "mandala" })
    );
    expect(loadSplitConfig()).toEqual({
      leftPane: "animation",
      rightPane: "card",
    });
  });

  it("keeps Video browsing distinct from the upload inspector", () => {
    expect(resolveEditingPane("videos", null, false)).toBeNull();
    expect(resolveEditingPane("videos", null, true)).toBe("video-upload");
  });

  it("lets an explicit render link outrank a remembered local surface", () => {
    expect(viewerModeForRenderMode("3d")).toBe("animation-3d");
    expect(viewerModeForRenderMode("2d")).toBe("animation");
    expect(viewerModeForRenderMode(null)).toBeUndefined();
  });

  it("lets a pane param outrank the render-derived mode on the route page", () => {
    // A full-state link captured on the tunnel pane with the 3D renderer warm
    // carries BOTH pane=tunnel and render=3d. The pane (the vw slice's
    // canonical mode owner) must win, or the link reopens on animation-3d
    // instead of the surface the sender was looking at.
    expect(initialViewerModeForUrl(false, "tunnel", "3d")).toBeUndefined();
    // Pane-less ?render= permalinks (minted before pane existed) keep the
    // render-derived mode.
    expect(initialViewerModeForUrl(false, null, "3d")).toBe("animation-3d");
    expect(initialViewerModeForUrl(false, null, "2d")).toBe("animation");
    // A scan boot forces the card regardless of every other param.
    expect(initialViewerModeForUrl(true, "tunnel", "3d")).toBe("card");
    // Nothing in the URL: defer to the device-local remembered surface.
    expect(initialViewerModeForUrl(false, null, null)).toBeUndefined();
  });
});
