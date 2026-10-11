import { describe, expect, it } from "vitest";
import { resolvePreviewCellRender } from "#lib/shared/sequence-viewer/services/preview-cell-render-contract.js";
import { deriveCacheKey } from "#lib/shared/sequence-viewer/services/cell-cache-key-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { resolvePropRenderKey } from "#lib/shared/pictograph/prop/domain/prop-look.js";
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
      showPlacements: true,
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
      showPlacements: true,
    });
    expect(result.data.motions?.left).toBeUndefined();
    expect(result.data.motions?.right).toBe(data.motions?.right);
    expect(data.motions?.left).toBeDefined();
    expect(result.visibility).toEqual({ showTKA: false, showReversals: false });
    expect(result.renderOptions.showPlacements).toBe(false);
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
      showPlacements: true,
    });
    expect(result.prepareOptions.showRightMotion).toBe(false);
    expect(result.renderOptions.showRightMotion).toBe(false);
    expect(result.renderOptions.showElemental).toBe(false);
    expect(result.renderOptions.showPlacements).toBe(false);
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
  it("prepares the Realistic look the canvas beside the card draws", () => {
    const { prepareOptions } = resolvePreviewCellRender(data, false, {
      ...base,
      propLook: "model",
    });
    // The prop loader picks its artwork from this render key.
    expect(
      resolvePropRenderKey(prepareOptions.leftPropType!, prepareOptions)
    ).toBe("staff__model");
    expect(
      resolvePropRenderKey(
        PropType.STAFF,
        resolvePreviewCellRender(data, false, base).prepareOptions
      )
    ).toBe("staff");
  });
  it("keeps hand paths on hand artwork under the Realistic look", () => {
    const result = resolvePreviewCellRender(data, false, {
      ...base,
      handPathMode: true,
      propLook: "model",
    });
    expect(result.prepareOptions.propLook).toBeUndefined();
    expect(
      deriveCacheKey(data, undefined, false, {
        ...base,
        handPathMode: true,
        propLook: "model",
      })
    ).toBe(deriveCacheKey(data, undefined, false, { ...base, handPathMode: true }));
  });
  it("prepares the triangle grip the canvas beside the card draws, in both looks", () => {
    const triangle = { ...base, leftPropType: PropType.TRIANGLE };
    const classic = resolvePreviewCellRender(data, false, {
      ...triangle,
      triangleGrip: "side",
    });
    expect(classic.renderOptions.triangleGrip).toBe("side");
    expect(
      resolvePropRenderKey(PropType.TRIANGLE, classic.prepareOptions)
    ).toBe("triangle__side");
    expect(
      resolvePropRenderKey(
        PropType.TRIANGLE,
        resolvePreviewCellRender(data, false, {
          ...triangle,
          triangleGrip: "side",
          propLook: "model",
        }).prepareOptions
      )
    ).toBe("triangle_side__model");

    const handPath = resolvePreviewCellRender(data, false, {
      ...triangle,
      triangleGrip: "side",
      handPathMode: true,
    });
    expect(handPath.prepareOptions.triangleGrip).toBeUndefined();
    expect(handPath.renderOptions.triangleGrip).toBeUndefined();
  });
  it("never serves a notation blob to a Realistic cell", () => {
    const notation = deriveCacheKey(data, undefined, false, base);
    expect(
      deriveCacheKey(data, undefined, false, { ...base, propLook: "model" })
    ).not.toBe(notation);
    // Notation keys, and so the shared cloud corpus, stay byte-identical.
    expect(
      deriveCacheKey(data, undefined, false, {
        ...base,
        propLook: "pictograph",
      })
    ).toBe(notation);
    const fan = { ...base, leftPropType: PropType.FAN };
    expect(
      deriveCacheKey(data, undefined, false, { ...fan, propLook: "model" })
    ).toBe(deriveCacheKey(data, undefined, false, fan));
  });
});
