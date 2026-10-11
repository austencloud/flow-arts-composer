import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  normalizePropPatch,
  type PropPairFields,
} from "./prop-pair-rule";
import { withPickVersion, type PickVersionFields } from "./prop-version-rule";

const v2Staff: PickVersionFields = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  propType: PropType.STAFF,
  catDogMode: false,
  propArtwork: "model",
};
const v2Mixed: PickVersionFields = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.FAN,
  propType: PropType.STAFF,
  catDogMode: true,
  propArtwork: "model",
};

/** The path every real write takes: normalize the pair, then settle the version. */
function write(current: PickVersionFields, patch: PickVersionFields) {
  return withPickVersion(current, normalizePropPatch(current, patch));
}

describe("withPickVersion", () => {
  it("resets to Version 1 when a different prop is picked", () => {
    expect(write(v2Staff, { propType: PropType.CLUB })).toMatchObject({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propArtwork: "pictograph",
    });
  });

  it("resets when only one hand brings in a new prop that has a Version 2", () => {
    expect(write(v2Staff, { rightPropType: PropType.CLUB })).toMatchObject({
      catDogMode: true,
      propArtwork: "pictograph",
    });
    expect(write(v2Mixed, { leftPropType: PropType.CLUB })).toMatchObject({
      propArtwork: "pictograph",
    });
  });

  it("keeps the version when the new prop has no Version 2 to show", () => {
    // Fan has no Version 2; Double Staff V2 in the other hand is untouched.
    const withFan = write(v2Staff, { rightPropType: PropType.FAN });
    expect(withFan).toMatchObject({
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
    expect(withFan).not.toHaveProperty("propArtwork");
    // The same holds when both hands change to a prop with one version.
    expect(write(v2Staff, { propType: PropType.FAN })).not.toHaveProperty(
      "propArtwork"
    );
  });

  it("keeps the version a patch names for itself", () => {
    expect(
      write(v2Staff, { propType: PropType.CLUB, propArtwork: "model" })
    ).toMatchObject({ propType: PropType.CLUB, propArtwork: "model" });
    expect(
      write(v2Staff, { propType: PropType.CLUB, propArtwork: "pictograph" })
    ).toMatchObject({ propArtwork: "pictograph" });
  });

  it("keeps the version when the current prop is picked again", () => {
    expect(write(v2Staff, { propType: PropType.STAFF })).not.toHaveProperty(
      "propArtwork"
    );
    expect(
      write(v2Mixed, {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.FAN,
      })
    ).not.toHaveProperty("propArtwork");
  });

  it("keeps the version when Cat Dog turns off and the right hand mirrors the left", () => {
    expect(write(v2Mixed, { catDogMode: false })).toEqual({
      catDogMode: false,
      rightPropType: PropType.STAFF,
      propType: PropType.STAFF,
    });
  });

  it("keeps the version when the hands swap", () => {
    expect(
      write(v2Mixed, {
        leftPropType: PropType.FAN,
        rightPropType: PropType.STAFF,
      })
    ).not.toHaveProperty("propArtwork");
  });

  it("resets when Cat Dog turns on with a different right prop remembered", () => {
    // The right hand is restored first, while Cat Dog is still off.
    expect(write(v2Staff, { rightPropType: PropType.CLUB })).toMatchObject({
      catDogMode: true,
      propArtwork: "pictograph",
    });
    // A stored right hand that Cat Dog was not using comes into the hands.
    const hidden: PickVersionFields = {
      ...v2Mixed,
      rightPropType: PropType.CLUB,
      catDogMode: false,
    };
    expect(write(hidden, { catDogMode: true })).toMatchObject({
      catDogMode: true,
      propArtwork: "pictograph",
    });
    // A remembered prop with no Version 2 brings nothing to reset.
    expect(
      write({ ...v2Mixed, catDogMode: false }, { catDogMode: true })
    ).not.toHaveProperty("propArtwork");
  });

  it("keeps the version when Cat Dog turns on with the same prop in both hands", () => {
    expect(write(v2Staff, { catDogMode: true })).not.toHaveProperty(
      "propArtwork"
    );
  });

  it("has nothing to reset while the version is already Version 1", () => {
    const v1 = { ...v2Staff, propArtwork: "pictograph" as const };
    expect(write(v1, { propType: PropType.CLUB })).not.toHaveProperty(
      "propArtwork"
    );
    const unset: PickVersionFields = { ...v2Staff, propArtwork: undefined };
    expect(write(unset, { propType: PropType.CLUB })).not.toHaveProperty(
      "propArtwork"
    );
  });

  it("leaves a patch with no prop keys as the same object", () => {
    const patch = { darkMode: true };
    expect(
      withPickVersion(v2Staff, patch as unknown as PropPairFields)
    ).toBe(patch);
  });

  it("treats an undefined version in the patch as not named", () => {
    expect(
      write(v2Staff, { propType: PropType.CLUB, propArtwork: undefined })
    ).toMatchObject({ propArtwork: "pictograph" });
  });

  it("reads a legacy propType-only store as holding that prop", () => {
    const legacy: PickVersionFields = {
      propType: PropType.CLUB,
      propArtwork: "model",
    };
    expect(
      withPickVersion(legacy, { leftPropType: PropType.CLUB })
    ).not.toHaveProperty("propArtwork");
    expect(
      withPickVersion(legacy, { leftPropType: PropType.STAFF })
    ).toMatchObject({ propArtwork: "pictograph" });
  });

  it("keeps the version across a size change, which is the same prop", () => {
    expect(write(v2Staff, { propType: PropType.BIGSTAFF })).not.toHaveProperty(
      "propArtwork"
    );
    const v2Triad: PickVersionFields = {
      ...v2Staff,
      leftPropType: PropType.TRIAD,
      rightPropType: PropType.TRIAD,
      propType: PropType.TRIAD,
    };
    const big = write(v2Triad, { propType: PropType.BIGTRIAD });
    expect(big).toMatchObject({ propType: PropType.BIGTRIAD });
    expect(big).not.toHaveProperty("propArtwork");
    // And back down again from the big size.
    const v2BigTriad: PickVersionFields = {
      ...v2Triad,
      leftPropType: PropType.BIGTRIAD,
      rightPropType: PropType.BIGTRIAD,
      propType: PropType.BIGTRIAD,
    };
    expect(write(v2BigTriad, { propType: PropType.TRIAD })).not.toHaveProperty(
      "propArtwork"
    );
  });

  it("still resets when a size change goes with a different prop", () => {
    expect(write(v2Staff, { propType: PropType.BIGCLUB })).toMatchObject({
      propArtwork: "pictograph",
    });
  });

  it("resets for a different prop with a Version 2 beside a prop kept in hand", () => {
    expect(write(v2Mixed, { rightPropType: PropType.CLUB })).toMatchObject({
      propArtwork: "pictograph",
    });
  });
});
