import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  healPropPair,
  isPropPairKey,
  normalizePropPatch,
  type PropPairFields,
} from "./prop-pair-rule";

const plain = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogMode: false,
};
const mixed = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.FAN,
  catDogMode: true,
};

describe("normalizePropPatch", () => {
  it("returns an unrelated patch as the same object", () => {
    const patch = { darkMode: true };
    // PropPairFields is an all-optional interface, so an object literal with
    // no overlapping keys fails TypeScript's weak-type check on the generic
    // constraint. Cast at this call site rather than loosening the module.
    expect(normalizePropPatch(plain, patch as unknown as PropPairFields)).toBe(
      patch
    );
  });

  it("turns cat dog on when one hand makes the hands differ", () => {
    expect(normalizePropPatch(plain, { rightPropType: PropType.FAN })).toEqual({
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("turns cat dog on for a left-only pick too", () => {
    expect(normalizePropPatch(plain, { leftPropType: PropType.CLUB })).toEqual({
      leftPropType: PropType.CLUB,
      catDogMode: true,
      propType: PropType.CLUB,
    });
  });

  it("leaves the flag alone when both hands are set equal", () => {
    expect(
      normalizePropPatch(mixed, {
        leftPropType: PropType.CLUB,
        rightPropType: PropType.CLUB,
      })
    ).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propType: PropType.CLUB,
    });
  });

  it("folds the right hand to the left when cat dog turns off", () => {
    expect(normalizePropPatch(mixed, { catDogMode: false })).toEqual({
      catDogMode: false,
      rightPropType: PropType.STAFF,
      propType: PropType.STAFF,
    });
  });

  it("folds to the patched left hand when cat dog turns off with hands", () => {
    expect(
      normalizePropPatch(mixed, {
        catDogMode: false,
        leftPropType: PropType.FAN,
        rightPropType: PropType.CLUB,
      })
    ).toEqual({
      catDogMode: false,
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
    });
  });

  it("keeps an equal pair when cat dog turns on", () => {
    expect(normalizePropPatch(plain, { catDogMode: true })).toEqual({
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("makes both hands follow a legacy propType-only patch", () => {
    expect(normalizePropPatch(mixed, { propType: PropType.CLUB })).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      propType: PropType.CLUB,
    });
  });

  it("keeps cat dog on for a single-hand patch that makes the hands equal", () => {
    // Equal hands with cat dog on is valid, so a patch that only narrows the
    // gap must not turn the flag off; it simply leaves catDogMode untouched.
    expect(
      normalizePropPatch(mixed, { rightPropType: PropType.STAFF })
    ).toEqual({
      rightPropType: PropType.STAFF,
      propType: PropType.STAFF,
    });
  });

  it("is idempotent", () => {
    const once = normalizePropPatch(mixed, { catDogMode: false });
    expect(normalizePropPatch(mixed, once)).toEqual(once);
  });

  it("drops an explicit undefined pair key instead of writing over the stored hand", () => {
    const result = normalizePropPatch(mixed, {
      leftPropType: undefined,
      rightPropType: PropType.CLUB,
    });
    expect("leftPropType" in result).toBe(false);
  });

  it("drops undefined pair keys when no pair key carries a value", () => {
    const result = normalizePropPatch(mixed, {
      leftPropType: undefined,
      catDogMode: undefined,
    });
    expect(result).toEqual({});
    expect("leftPropType" in result).toBe(false);
    expect("catDogMode" in result).toBe(false);
  });
});

describe("healPropPair", () => {
  it("turns a stale false flag on when the stored hands differ", () => {
    expect(
      healPropPair({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.FAN,
        catDogMode: false,
      })
    ).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      propType: PropType.STAFF,
      catDogMode: true,
    });
  });

  it("keeps an equal pair with cat dog on", () => {
    expect(healPropPair({ ...plain, catDogMode: true })).toEqual({
      ...plain,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("fills hands from a legacy propType-only profile", () => {
    expect(healPropPair({ propType: PropType.FAN })).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
      catDogMode: false,
    });
  });

  it("makes propType follow the left hand", () => {
    expect(healPropPair({ ...plain, propType: PropType.CLUB }).propType).toBe(
      PropType.STAFF
    );
  });

  it("heals a lone left hand to itself instead of a staff default", () => {
    expect(healPropPair({ leftPropType: PropType.FAN })).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      propType: PropType.FAN,
      catDogMode: false,
    });
  });
});

describe("isPropPairKey", () => {
  it("names exactly the four pair fields", () => {
    expect(
      ["leftPropType", "rightPropType", "propType", "catDogMode", "darkMode"].map(
        isPropPairKey
      )
    ).toEqual([true, true, true, true, false]);
  });
});
