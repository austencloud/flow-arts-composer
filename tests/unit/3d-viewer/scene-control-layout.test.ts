import { describe, expect, it } from "vitest";
import {
  resolveSceneControlLayout,
  sceneInspectorPanelWidth,
} from "#lib/shared/3d/domain/scene-control-layout.js";

describe("scene control workspace layout", () => {
  it("uses compact controls on phones and genuinely narrow landscapes", () => {
    expect(resolveSceneControlLayout(375, 667, false).presentation).toBe(
      "compact"
    );
    expect(resolveSceneControlLayout(960, 412, true).presentation).toBe(
      "compact"
    );
  });

  it("does not change a wide desktop into mobile controls when its timeline grows", () => {
    expect(resolveSceneControlLayout(1440, 509, true).presentation).toBe(
      "overlay"
    );
  });

  it("uses the compact editor when a wide workspace is too shallow to expose a touch target", () => {
    expect(resolveSceneControlLayout(1280, 400, true).presentation).toBe(
      "compact"
    );
    expect(resolveSceneControlLayout(2560, 500, true).presentation).toBe(
      "compact"
    );
  });

  it("uses an overlay for intermediate and split-view workspaces", () => {
    expect(resolveSceneControlLayout(820, 1180, true)).toEqual({
      presentation: "overlay",
      panelWidth: 520,
      reservedWidth: 0,
    });
    expect(resolveSceneControlLayout(1280, 900, true).presentation).toBe(
      "overlay"
    );
  });

  it("reserves real canvas width only while a wide dock is open", () => {
    const closed = resolveSceneControlLayout(2560, 1440, false);
    const open = resolveSceneControlLayout(2560, 1440, true);

    expect(closed).toEqual({
      presentation: "docked",
      panelWidth: 819,
      reservedWidth: 0,
    });
    expect(open).toEqual({
      presentation: "docked",
      panelWidth: 819,
      reservedWidth: 911,
    });
  });

  it("keeps shallow inspectors over the canvas on wide workspaces", () => {
    expect(resolveSceneControlLayout(2560, 1440, true, false)).toEqual({
      presentation: "overlay",
      panelWidth: 819,
      reservedWidth: 0,
    });
  });

  it("caps the inspector instead of stretching it across a 4K stage", () => {
    expect(sceneInspectorPanelWidth(1440)).toBe(520);
    expect(sceneInspectorPanelWidth(3840)).toBe(1100);
  });
});
