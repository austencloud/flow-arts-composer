import { describe, expect, it } from "vitest";
import {
  createCollection,
  createSmartCollectionModel,
} from "$lib/shared/library/domain/models/collection";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { collectionPropSettings } from "$lib/shared/library/domain/collection-prop";

describe("collection prop", () => {
  it("retains the optional prop when creating manual and smart collections", () => {
    expect(
      createCollection("Fans", "owner", { propType: PropType.FAN }).propType
    ).toBe(PropType.FAN);
    expect(
      createSmartCollectionModel(
        "Fans",
        "owner",
        {
          source: "community",
          filters: [],
          sortMethod: "name",
          sortDirection: "asc",
        },
        { propType: PropType.FAN }
      ).propType
    ).toBe(PropType.FAN);
    expect(createCollection("Mixed", "owner").propType).toBeUndefined();
  });

  it("overrides both hands without changing the original preferences", () => {
    const settings = {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.CLUB,
      catDogMode: true,
      darkMode: true,
    };
    expect(collectionPropSettings(settings, PropType.FAN)).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
      darkMode: true,
    });
    expect(settings.rightPropType).toBe(PropType.CLUB);
    expect(collectionPropSettings(settings, null)).toBe(settings);
    expect(collectionPropSettings(settings, undefined)).toBe(settings);
  });
});
