import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import { resolvePreviewCellRender } from "$lib/shared/sequence-viewer/services/preview-cell-render-contract";
import { deriveCacheKey } from "$lib/shared/sequence-viewer/services/cell-cache-key-deriver";
import { deriveBaseLayerKey } from "$lib/shared/render/services/layer-key-deriver";
import { buildCellLayerOptions } from "$lib/shared/render/services/card-front-assembler";

const fire: FanAppearance = {
  build: "fire",
  frameColor: "black",
  cover: "bare",
};
const lotus: FanAppearance = { ...fire, build: "lotus" };
const data = { motions: {} };
const base = {
  size: 240,
  leftPropType: PropType.FAN,
  rightPropType: PropType.BIGFAN,
  catDogModeEnabled: true,
};

describe("fan appearance through preview and export caches", () => {
  it("keeps the chosen build through live, bitmap and export preparation", () => {
    const resolved = resolvePreviewCellRender(data, true, {
      ...base,
      fanAppearance: lotus,
    });
    expect(resolved.prepareOptions.fanAppearance).toEqual(lotus);
    expect(resolved.renderOptions.fanAppearance).toEqual(lotus);
    expect(
      buildCellLayerOptions(240, { fanAppearance: lotus }).options.fanAppearance
    ).toEqual(lotus);
  });

  it("separates builds and covers in persistent cell and in-memory layer caches", () => {
    const appearances = [fire, lotus, { ...fire, cover: "covered" as const }];
    const cells = appearances.map((fanAppearance) =>
      deriveCacheKey(data, undefined, true, { ...base, fanAppearance })
    );
    const layers = appearances.map((fanAppearance) =>
      deriveBaseLayerKey(
        data,
        resolvePreviewCellRender(data, true, { ...base, fanAppearance })
          .renderOptions
      )
    );
    expect(new Set(cells).size).toBe(3);
    expect(new Set(layers).size).toBe(3);
  });

  it("does not fragment staff or hand-path cell caches when fan preferences change", () => {
    for (const options of [
      { ...base, leftPropType: PropType.STAFF, rightPropType: PropType.STAFF },
      { ...base, handPathMode: true },
    ]) {
      expect(
        deriveCacheKey(data, undefined, true, {
          ...options,
          fanAppearance: fire,
        })
      ).toBe(
        deriveCacheKey(data, undefined, true, {
          ...options,
          fanAppearance: lotus,
        })
      );
    }
    expect(
      resolvePreviewCellRender(data, true, {
        ...base,
        handPathMode: true,
        fanAppearance: lotus,
      }).prepareOptions.fanAppearance
    ).toBeUndefined();
  });

  it("leaves canonical notation cache identity intact when appearance is omitted", () => {
    expect(deriveCacheKey(data, undefined, true, base)).toBe(
      deriveCacheKey(data, undefined, true, {
        ...base,
        fanAppearance: undefined,
      })
    );
  });
});
