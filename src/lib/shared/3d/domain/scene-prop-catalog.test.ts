import { describe, expect, it } from "vitest";

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  findScenePropFamily,
  findScenePropFamilyByRepresentative,
  isScenePhysicalProp,
  SCENE_PROP_FAMILIES,
  SCENE_PROP_REPRESENTATIVES,
  scenePropDrawnLengthCm,
  scenePropFixedLengthCm,
} from "./scene-prop-catalog";

describe("scene prop catalog", () => {
  it("keeps the no-prop sentinel outside the physical catalog", () => {
    expect(isScenePhysicalProp(PropType.HAND)).toBe(false);
  });

  it("includes every Prop Studio representative and family variant", () => {
    for (const prop of SCENE_PROP_REPRESENTATIVES) {
      expect(isScenePhysicalProp(prop)).toBe(true);
    }

    for (const family of SCENE_PROP_FAMILIES) {
      expect(findScenePropFamilyByRepresentative(family.representative)).toBe(
        family
      );
      for (const variant of family.variants) {
        expect(isScenePhysicalProp(variant.id)).toBe(true);
        expect(findScenePropFamily(variant.id)).toBe(family);
      }
    }
  });

  it("reports the length each Double Staff build actually draws", () => {
    // The scene stretches the Fire Staff's model to the length it is asked
    // for, the way it sizes the procedural Staff, and leaves the LED Baton at
    // its authored 86.36 cm. Reporting the Fire Staff at its authored 90 cm
    // while it is drawn at a body's 67 cm fit misreads every grip on screen.
    expect(scenePropDrawnLengthCm(PropType.STAFF, 67)).toBe(67);
    expect(scenePropDrawnLengthCm(PropType.FIRE_DOUBLE_STAFF, 67)).toBe(67);
    expect(scenePropDrawnLengthCm(PropType.CAPSULE_BATON, 67)).toBe(86.36);
    expect(scenePropFixedLengthCm(PropType.FIRE_DOUBLE_STAFF)).toBeNull();
  });
});
