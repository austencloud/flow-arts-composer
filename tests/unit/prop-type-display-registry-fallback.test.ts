import { describe, expect, it } from "vitest";
import {
  getAllPropTypes,
  getPropTypeDisplayInfo,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * Persisted settings outlive the enum. A profile saved while Fractalgeng existed
 * still carries "fractalgeng" after its 2026-06-30 removal, and prop types reach
 * this function straight from those settings. When the lookup returned undefined,
 * PropNavButton read `.image` off it and took down the entire mobile nav —
 * BottomNavigation, MobileNavigation, MainInterface, the whole tree.
 *
 * The signature promises a PropTypeDisplayInfo, so this guards that the promise
 * is actually kept for input the type system cannot police.
 */
describe("getPropTypeDisplayInfo", () => {
  it("returns real display info for every prop type in the registry", () => {
    for (const propType of getAllPropTypes()) {
      const info = getPropTypeDisplayInfo(propType);
      expect(info, `missing display info for ${propType}`).toBeDefined();
      expect(info.image, `missing image for ${propType}`).toBeTruthy();
      expect(info.label, `missing label for ${propType}`).toBeTruthy();
    }
  });

  it("falls back to Staff for a prop type that no longer exists", () => {
    // The exact value that can still be sitting in a persisted profile.
    const removed = "fractalgeng" as PropType;

    const info = getPropTypeDisplayInfo(removed);

    expect(info).toBeDefined();
    expect(info.image).toBe(getPropTypeDisplayInfo(PropType.STAFF).image);
  });

  it("never returns undefined for junk input, so callers can read .image", () => {
    const junk: PropType[] = [
      "" as PropType,
      "not_a_prop" as PropType,
      "STAFF" as PropType, // wrong case: enum values are lowercase
    ];

    for (const value of junk) {
      // The crash was `Cannot read properties of undefined (reading 'image')`,
      // so reading .image is the assertion that matters.
      expect(() => getPropTypeDisplayInfo(value).image).not.toThrow();
    }
  });
});
