import { listingChanged, pinChangeFor } from "./syncMapPinVisibility";

describe("listingChanged", () => {
  it("fires when either flag turns on or both turn off", () => {
    expect(listingChanged({}, { isHidden: true })).toBe(true);
    expect(listingChanged({}, { isDisabled: true })).toBe(true);
    expect(listingChanged({ isHidden: true }, { isHidden: false })).toBe(true);
    expect(listingChanged(undefined, { isDisabled: true })).toBe(true);
  });

  it("stays quiet when listing does not change", () => {
    expect(listingChanged({}, { bio: "new" } as never)).toBe(false);
    expect(
      listingChanged({ isHidden: true }, { isHidden: true, isDisabled: true })
    ).toBe(false);
    // Still disabled after unhiding: still unlisted.
    expect(
      listingChanged(
        { isHidden: true, isDisabled: true },
        { isHidden: false, isDisabled: true }
      )
    ).toBe(false);
    expect(listingChanged({ isHidden: true }, undefined)).toBe(false);
  });
});

describe("pinChangeFor", () => {
  it("makes a public pin private and marks it when the person is unlisted", () => {
    expect(pinChangeFor({ isHidden: true }, { visibility: "public" })).toEqual({
      visibility: "private",
      hiddenByFlag: true,
    });
    expect(pinChangeFor({ isDisabled: true }, { visibility: "public" })).toEqual({
      visibility: "private",
      hiddenByFlag: true,
    });
  });

  it("leaves a pin the person made private alone, both ways", () => {
    expect(pinChangeFor({ isHidden: true }, { visibility: "private" })).toBeNull();
    expect(pinChangeFor({}, { visibility: "private" })).toBeNull();
  });

  it("restores only a pin it hid, once both flags are off", () => {
    expect(
      pinChangeFor({ isHidden: false }, { visibility: "private", hiddenByFlag: true })
    ).toEqual({ visibility: "public", hiddenByFlag: "delete" });
    expect(
      pinChangeFor(
        { isHidden: false, isDisabled: true },
        { visibility: "private", hiddenByFlag: true }
      )
    ).toBeNull();
  });

  it("does nothing without a pin", () => {
    expect(pinChangeFor({ isHidden: true }, null)).toBeNull();
  });
});
