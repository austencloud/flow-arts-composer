import { describe, expect, it } from "vitest";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  resolveViewingProps,
  withSavedProps,
} from "$lib/shared/foundation/services/prop-viewing";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const own = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogMode: false,
};
const mixed = {
  leftPropType: PropType.FAN,
  rightPropType: PropType.BUUGENG,
  catDogMode: true,
};
const original = createSequenceData({ id: "source", name: "Source" });
const saved = withSavedProps(original, mixed);

describe("viewing prop precedence", () => {
  it("defaults to personal props even inside a collection", () => {
    expect(resolveViewingProps(own, saved, PropType.CLUB)).toEqual({
      config: own,
      source: "My props",
    });
  });
  it("uses collection presentation ahead of saved sequence presentation only in As saved", () => {
    expect(
      resolveViewingProps(
        { ...own, propViewingMode: "as-saved" },
        saved,
        PropType.CLUB
      )
    ).toEqual({
      config: {
        leftPropType: PropType.CLUB,
        rightPropType: PropType.CLUB,
        catDogMode: false,
      },
      source: "Collection",
    });
  });
  it("preserves the saved mixed pair", () => {
    expect(
      resolveViewingProps({ ...own, propViewingMode: "as-saved" }, saved)
    ).toEqual({ config: mixed, source: "Saved with sequence" });
  });
  it("falls back honestly to personal props when the recording is absent or invalid", () => {
    for (const sequence of [
      original,
      {
        ...original,
        intendedProp: { leftPropType: "invalid", rightPropType: "invalid" },
      },
    ]) {
      expect(
        resolveViewingProps(
          { ...own, propViewingMode: "as-saved" },
          sequence as typeof original
        )
      ).toEqual({ config: own, source: "My props" });
    }
  });
  it("switching back to My props leaves the stored recording untouched", () => {
    resolveViewingProps(
      { ...own, propViewingMode: "as-saved" },
      saved,
      PropType.CLUB
    );
    expect(
      resolveViewingProps({ ...own, propViewingMode: "my-props" }, saved).config
    ).toEqual(own);
    expect(saved.creatorIntent?.propConfig).toEqual(mixed);
    expect(own.leftPropType).toBe(PropType.STAFF);
  });
});

describe("save presentation boundary", () => {
  it("records an independent choice without changing the source sequence or motion data", () => {
    const copy = withSavedProps(saved, own);
    expect(copy.intendedProp).toEqual(own);
    expect(copy.creatorIntent?.propConfig).toEqual(own);
    expect(copy.steps).toBe(saved.steps);
    expect(saved.intendedProp).toEqual(mixed);
    expect(original.intendedProp).toBeUndefined();
    expect(copy.intendedProp).not.toBe(own);
  });
});
