import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  findScenePropFamily,
  isScenePhysicalProp,
  SCENE_PROP_TYPES,
} from "$lib/shared/3d/domain/scene-prop-catalog";

describe("hoop family in the 3D studio", () => {
  it("offers Mini Hoop and Triangle under one Hoop tile", () => {
    const hoop = findScenePropFamily(PropType.TRIANGLE);
    expect(hoop).toBeDefined();
    expect(hoop!.representative).toBe(PropType.MINIHOOP);
    expect(hoop!.controlLabel).toBe("Hoop build");
    expect(hoop!.variants.map((v) => v.id)).toEqual([
      PropType.MINIHOOP,
      PropType.TRIANGLE,
    ]);
    expect(isScenePhysicalProp(PropType.TRIANGLE)).toBe(true);
    expect(new Set(SCENE_PROP_TYPES).size).toBe(SCENE_PROP_TYPES.length);
  });
});
