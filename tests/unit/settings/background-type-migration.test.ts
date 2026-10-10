import { BackgroundType } from "@austencloud/backgrounds";
import { describe, expect, it } from "vitest";

import {
  normalizeBackgroundType,
  resolvePrideBackgroundType,
  PRIDE_BACKGROUND_TYPE,
} from "#lib/shared/settings/domain/background-type-migration.js";

describe("background type migration", () => {
  // Asserted against the resolved identifier rather than BackgroundType.PRIDE,
  // so this holds on both the bundle that calls the environment Rainbow and the
  // one that calls it Pride. Pinning the enum member asserts which package
  // version is installed, which is not what this migration promises.
  it("migrates the former Rainbow identifier to whichever name the bundle uses", () => {
    expect(normalizeBackgroundType("rainbow")).toBe(PRIDE_BACKGROUND_TYPE);
  });

  it("uses the former Rainbow member while an older dependency bundle is still loaded", () => {
    expect(
      resolvePrideBackgroundType({
        RAINBOW: "rainbow" as BackgroundType,
      })
    ).toBe("rainbow");
  });

  it("preserves current package identifiers", () => {
    for (const backgroundType of Object.values(BackgroundType)) {
      expect(normalizeBackgroundType(backgroundType)).toBe(backgroundType);
    }
  });

  it("rejects unknown persisted identifiers", () => {
    expect(normalizeBackgroundType("not-a-background")).toBeUndefined();
    expect(normalizeBackgroundType(null)).toBeUndefined();
  });
});
