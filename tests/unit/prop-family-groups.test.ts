import { describe, expect, it } from "vitest";

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  getAllVariations,
  getBasePropType,
  getFamilyTileDisplayProp,
  getPropTypeDisplayInfo,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import {
  encodePropForURL,
  parsePropTypeFromURLValue,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
import { PropType as ScenePropType } from "@austencloud/scene-3d";

describe("prop family groups", () => {
  it("groups all Double Staff builds together", () => {
    expect(getPropTypeDisplayInfo(PropType.STAFF).label).toBe("Double Staff");
    expect(getBasePropType(PropType.CAPSULE_BATON)).toBe(PropType.STAFF);
    expect(getBasePropType(PropType.FIRE_DOUBLE_STAFF)).toBe(PropType.STAFF);
    expect(getAllVariations(PropType.STAFF)).toEqual(
      expect.arrayContaining([
        PropType.STAFF,
        PropType.CAPSULE_BATON,
        PropType.FIRE_DOUBLE_STAFF,
      ])
    );
  });

  it("keeps the exact selected build on a family tile", () => {
    expect(
      getFamilyTileDisplayProp(PropType.STAFF, PropType.CAPSULE_BATON)
    ).toBe(PropType.CAPSULE_BATON);
    expect(
      getFamilyTileDisplayProp(PropType.STAFF, PropType.FIRE_DOUBLE_STAFF)
    ).toBe(PropType.FIRE_DOUBLE_STAFF);
    expect(getFamilyTileDisplayProp(PropType.STAFF, PropType.CLUB)).toBe(
      PropType.STAFF
    );
  });

  it.each([
    [PropType.BIGCHICKEN, PropType.CHICKEN],
    [PropType.CLASSIC_CLUB, PropType.CLUB],
    [PropType.TORCH, PropType.CLUB],
    [PropType.UKULELE, PropType.GUITAR],
    [PropType.TRIQUETRA2, PropType.TRIQUETRA],
    [PropType.TRIGENG, PropType.TRIAD],
  ])("maps %s to the %s family", (variant, family) => {
    expect(getBasePropType(variant)).toBe(family);
    expect(getAllVariations(family)).toContain(variant);
  });

  it("offers both 2D club builds and Torch inside the Club family", () => {
    expect(getAllVariations(PropType.CLUB)).toEqual([
      PropType.CLUB,
      PropType.CLASSIC_CLUB,
      PropType.TORCH,
      PropType.BIGCLUB,
      PropType.BIGTORCH,
    ]);
  });

  it("round-trips Classic Club through the durable prop code", () => {
    expect(encodePropForURL(PropType.CLASSIC_CLUB)).toBe("7");
    expect(parsePropTypeFromURLValue("7")).toBe(PropType.CLASSIC_CLUB);
    expect(parsePropTypeFromURLValue("classic_club")).toBe(
      PropType.CLASSIC_CLUB
    );
  });

  it("keeps Classic Club a 2D build of the regular physical 3D club", () => {
    expect(toScenePropType(PropType.CLASSIC_CLUB)).toBe(ScenePropType.CLUB);
  });
});
