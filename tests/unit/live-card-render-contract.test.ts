import { describe, expect, it } from "vitest";
import { resolvePreviewCellRender } from "$lib/shared/sequence-viewer/services/preview-cell-render-contract";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { TRANSITION_REVIEW_SEQUENCE } from "../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";

const data = TRANSITION_REVIEW_SEQUENCE.steps[0]!;
const base = {
  size: 240,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.FAN,
  showLeftMotion: true,
  showRightMotion: true,
};

describe("shared live card / bitmap cell contract", () => {
  it("changes palette and glyphs without invalidating prepared geometry", () => {
    const before = resolvePreviewCellRender(data, false, base);
    const after = resolvePreviewCellRender(data, false, {
      ...base,
      primaryPropColors: { left: "#00ff00", right: "#ff00ff" },
      showTKA: false,
      showGrid: false,
      showPositions: true,
    });
    expect(after.data).toBe(before.data);
    expect(after.prepareOptions).toEqual(before.prepareOptions);
    expect(after.renderOptions.primaryPropColors).toEqual({
      left: "#00ff00",
      right: "#ff00ff",
    });
    expect(after.visibility.showTKA).toBe(false);
    expect(after.renderOptions.showGrid).toBe(false);
  });
  it("uses matching props unless the mixed-prop setting is enabled", () => {
    expect(
      resolvePreviewCellRender(data, false, base).prepareOptions.rightPropType
    ).toBe(PropType.STAFF);
    expect(
      resolvePreviewCellRender(data, false, {
        ...base,
        catDogModeEnabled: true,
      }).prepareOptions.rightPropType
    ).toBe(PropType.FAN);
  });
  it("filters a solo hand without changing the saved sequence", () => {
    const result = resolvePreviewCellRender(data, false, {
      ...base,
      browseViewMode: { subject: "props", granularity: "solo", hand: "right" },
      showTKA: true,
      showTnD: true,
      showPositions: true,
    });
    expect(result.data.motions?.left).toBeUndefined();
    expect(result.data.motions?.right).toBe(data.motions?.right);
    expect(data.motions?.left).toBeDefined();
    expect(result.visibility).toEqual({ showTKA: false, showReversals: false });
    expect(result.renderOptions.showPositions).toBe(false);
  });
  it("prepares hand paths as hands with chirality disabled", () => {
    const result = resolvePreviewCellRender(data, true, {
      ...base,
      handPathMode: true,
      leftBuugengFlipped: true,
      rightBuugengFlipped: true,
    });
    expect(result.prepareOptions).toMatchObject({
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
      handPathMode: true,
      leftBuugengFlipped: false,
      rightBuugengFlipped: false,
      themeMode: "dark",
    });
    expect(result.visibility.showTKA).toBe(false);
  });
  it("passes motion visibility to positioning and suppresses pair glyphs", () => {
    const result = resolvePreviewCellRender(data, true, {
      ...base,
      showRightMotion: false,
      showElemental: true,
      showPositions: true,
    });
    expect(result.prepareOptions.showRightMotion).toBe(false);
    expect(result.renderOptions.showRightMotion).toBe(false);
    expect(result.renderOptions.showElemental).toBe(false);
    expect(result.renderOptions.showPositions).toBe(false);
  });
  it("keeps duration width in composition, independent of prop preparation", () => {
    const before = resolvePreviewCellRender(data, false, base);
    const after = resolvePreviewCellRender(data, false, {
      ...base,
      widthMultiplier: 2,
    });
    expect(after.prepareOptions).toEqual(before.prepareOptions);
    expect(after.renderOptions.widthMultiplier).toBe(2);
  });
});
