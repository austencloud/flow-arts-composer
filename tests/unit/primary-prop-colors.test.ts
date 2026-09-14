import { describe, expect, it } from "vitest";
import { normalizeLegacyAppSettings } from "../../src/lib/shared/settings/domain/app-settings";
import { pictographKeyHasher } from "../../src/lib/shared/render/services/pictograph-key-hasher";

describe("primary prop color preferences", () => {
  it("separates palette images while preserving the default cache identity", () => {
    const data = { motions: {} };
    const defaults = pictographKeyHasher.deriveKey(data, {});
    expect(
      pictographKeyHasher.deriveKey(data, { primaryPropColors: null })
    ).toBe(defaults);
    const custom = { left: "#00ff88", right: "#ff8800" };
    expect(
      pictographKeyHasher.deriveKey(data, { primaryPropColors: custom })
    ).not.toBe(defaults);
    expect(
      pictographKeyHasher.deriveKey(data, {
        primaryPropColors: { ...custom, left: "#ffffff" },
      })
    ).not.toBe(
      pictographKeyHasher.deriveKey(data, { primaryPropColors: custom })
    );
  });
  it("normalizes saved colors without changing hand identity or prop types", () => {
    const settings = normalizeLegacyAppSettings({
      leftPropType: "staff",
      rightPropType: "fan",
      primaryPropColors: { left: " #0F8 ", right: "#AB12CD" },
    });
    expect(settings.primaryPropColors).toEqual({
      left: "#00ff88",
      right: "#ab12cd",
    });
    expect(settings.leftPropType).toBe("staff");
    expect(settings.rightPropType).toBe("fan");
  });

  it("preserves automatic theme colors for old settings and reset", () => {
    expect(normalizeLegacyAppSettings({}).primaryPropColors).toBeUndefined();
    expect(
      normalizeLegacyAppSettings({ primaryPropColors: null }).primaryPropColors
    ).toBeNull();
  });

  it("rejects invalid persisted color strings and survives a JSON round trip", () => {
    const settings = normalizeLegacyAppSettings({
      primaryPropColors: { left: 'url("external")', right: "#ff8800" },
    });
    expect(settings.primaryPropColors?.left).toMatch(/^#[0-9a-f]{6}$/i);
    expect(settings.primaryPropColors?.right).toBe("#ff8800");
    expect(
      normalizeLegacyAppSettings(JSON.parse(JSON.stringify(settings)))
    ).toEqual(settings);
  });
});
