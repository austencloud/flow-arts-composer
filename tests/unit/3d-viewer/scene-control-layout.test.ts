import { describe, expect, it } from "vitest";
import {
  RAIL_SECOND_COLUMN_WIDTH,
  resolveSceneControlLayout,
  sceneInspectorPanelWidth,
  sceneStageFramingAspect,
  sceneStageSubject,
  stageBarShares,
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
    expect(resolveSceneControlLayout(1440, 509, true).presentation).not.toBe(
      "compact"
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

  it("gives performer tools their own column on a mid-size window", () => {
    expect(resolveSceneControlLayout(1280, 900, true)).toEqual({
      presentation: "docked",
      panelWidth: 520,
      reservedWidth: 612,
    });
  });

  it("narrows that column so the performer keeps a stage to stand in", () => {
    // A half-width desktop window: the full column would leave a 331px stage.
    expect(resolveSceneControlLayout(943, 1000, true)).toEqual({
      presentation: "docked",
      panelWidth: 371,
      reservedWidth: 463,
    });
    // An upright tablet: the column stops shrinking at its floor.
    expect(resolveSceneControlLayout(820, 1180, true)).toEqual({
      presentation: "docked",
      panelWidth: 360,
      reservedWidth: 452,
    });
  });

  it("reserves nothing on a mid-size window until a panel opens", () => {
    expect(resolveSceneControlLayout(943, 1000, false).reservedWidth).toBe(0);
  });

  it("keeps short editors floating on a mid-size window", () => {
    expect(resolveSceneControlLayout(1280, 900, true, false)).toEqual({
      presentation: "overlay",
      panelWidth: 520,
      reservedWidth: 0,
    });
  });

  it("floats the panel when its own column would leave no usable stage", () => {
    expect(
      resolveSceneControlLayout(768, 1000, true, true, RAIL_SECOND_COLUMN_WIDTH)
    ).toEqual({
      presentation: "overlay",
      panelWidth: 520,
      reservedWidth: 0,
    });
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

  it("reserves the second rail column when a short window folds the rail", () => {
    const folded = resolveSceneControlLayout(
      2560,
      1440,
      true,
      true,
      RAIL_SECOND_COLUMN_WIDTH
    );
    expect(folded.reservedWidth).toBe(911 + RAIL_SECOND_COLUMN_WIDTH);
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

  it("frames a stage narrowed by a panel no tighter than an upright phone", () => {
    expect(sceneStageFramingAspect(480, 1073)).toBeCloseTo(9 / 16, 5);
    expect(sceneStageFramingAspect(360, 1100)).toBeCloseTo(9 / 16, 5);
  });

  it("frames a roomy stage by its real shape", () => {
    expect(sceneStageFramingAspect(941, 1073)).toBeCloseTo(941 / 1073, 5);
    expect(sceneStageFramingAspect(1728, 1080)).toBeCloseTo(1.6, 5);
  });

  it("falls back to a square frame before the stage has a size", () => {
    expect(sceneStageFramingAspect(0, 0)).toBe(1);
    expect(sceneStageFramingAspect(480, Number.NaN)).toBe(1);
  });

  it("frames the bodies while the docked panel is choosing a character", () => {
    expect(sceneStageSubject(true, "performer", "character")).toBe("bodies");
  });

  it("frames the whole cast, props included, everywhere else", () => {
    expect(sceneStageSubject(true, "performer", "prop")).toBe("cast");
    expect(sceneStageSubject(true, "camera", "character")).toBe("cast");
    expect(sceneStageSubject(true, null, "character")).toBe("cast");
    // A phone sheet or a floating panel covers the stage; the view stays put.
    expect(sceneStageSubject(false, "performer", "character")).toBe("cast");
  });

  it("reports the bars over the stage as shares of its height", () => {
    // His window: the performer bar and its hint end 113px down a 1146px
    // stage, and the host keeps 88px clear for the transport.
    const bars = stageBarShares(1146, 113, 88);
    expect(bars.top).toBeCloseTo(113 / 1146, 5);
    expect(bars.bottom).toBeCloseTo(88 / 1146, 5);
  });

  it("never lets the bars squeeze the clear band to nothing", () => {
    const bars = stageBarShares(400, 260, 240);
    expect(bars.top).toBeLessThanOrEqual(0.3);
    expect(bars.bottom).toBeLessThanOrEqual(0.3);
  });

  it("reads an unmeasured stage as having no bars", () => {
    expect(stageBarShares(0, 113, 88)).toEqual({ top: 0, bottom: 0 });
    expect(stageBarShares(1146, Number.NaN, -20)).toEqual({
      top: 0,
      bottom: 0,
    });
  });
});
