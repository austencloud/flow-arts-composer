import { describe, it, expect } from "vitest";
import { assembleExportEngineProps, type ExportFrameContext } from "../export-engine-props";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { TrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";

const left: PropState = { x: 1, y: 2, angle: 10 } as unknown as PropState;
const right: PropState = { x: 3, y: 4, angle: 20 } as unknown as PropState;
const trail = { lineWidth: 8, fadeDurationMs: 500 } as unknown as TrailSettings;

function frame(overrides: Partial<ExportFrameContext> = {}): ExportFrameContext {
  return {
    virtualTime: 0,
    isSeamlesslyLoopable: false,
    backgroundAlpha: 1,
    showNonRadialPoints: true,
    trailSettings: trail,
    leftPropType: "staff",
    rightPropType: "staff",
    previewDarkMode: true,
    ...overrides,
  };
}

function fakePanel(overrides: Record<string, unknown> = {}) {
  return {
    leftPropState: left,
    rightPropState: right,
    currentStep: 5,
    sequenceData: { gridMode: GridMode.DIAMOND, steps: [] } as any,
    sequenceWord: "TEST",
    virtualTime: 1234,
    ...overrides,
  } as any;
}

describe("assembleExportEngineProps", () => {
  it("maps panel prop states + frame context into AnimationEngineProps", () => {
    const props = assembleExportEngineProps(fakePanel(), frame({
      virtualTime: 999,
      isSeamlesslyLoopable: true,
      backgroundAlpha: 1,
      showNonRadialPoints: false,
    }));
    expect(props.leftProp).toBe(left);
    expect(props.rightProp).toBe(right);
    expect(props.currentStep).toBe(5);
    expect(props.virtualTime).toBe(999);
    expect(props.isSeamlesslyLoopable).toBe(true);
    expect(props.backgroundAlpha).toBe(1);
    expect(props.showNonRadialPoints).toBe(false);
    expect(props.gridMode).toBe(GridMode.DIAMOND);
    expect(props.isPlaying).toBe(true);
  });

  it("passes through trail settings (regression: dropped settings broke export trails)", () => {
    const props = assembleExportEngineProps(fakePanel(), frame());
    expect(props.externalTrailSettings).toBe(trail);
  });

  it("passes through prop types (regression: dropped types blanked props in export)", () => {
    const props = assembleExportEngineProps(fakePanel(), frame({ leftPropType: "fan", rightPropType: "club" }));
    expect(props.leftPropType).toBe("fan");
    expect(props.rightPropType).toBe("club");
    expect(props.previewDarkMode).toBe(true);
  });

  it("falls back to DIAMOND grid when sequenceData has none", () => {
    const props = assembleExportEngineProps(
      fakePanel({ sequenceData: { steps: [] } as any }),
      frame(),
    );
    expect(props.gridMode).toBe(GridMode.DIAMOND);
  });

  it("omits letter/stepData (glyph is composited separately)", () => {
    const props = assembleExportEngineProps(fakePanel(), frame());
    expect(props.letter).toBeUndefined();
    expect(props.stepData).toBeUndefined();
  });
});
