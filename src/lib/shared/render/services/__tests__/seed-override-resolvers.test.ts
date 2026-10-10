import { describe, it, expect, beforeEach } from "vitest";
import { seedOverrideResolvers } from "../seed-override-resolvers";
import {
  getSpecialOverrideResolver, getGlobalAdjustmentResolver, getPropGeometryResolver,
  setSpecialOverrideResolver, setGlobalAdjustmentResolver, setPropGeometryResolver,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/override-resolvers.js";
import { setDefaultOverrideResolver } from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";

describe("seedOverrideResolvers", () => {
  beforeEach(() => {
    setSpecialOverrideResolver(null); setGlobalAdjustmentResolver(null);
    setPropGeometryResolver(null); setDefaultOverrideResolver(null);
  });

  it("registers all four resolvers from an empty bundle", () => {
    seedOverrideResolvers({ default: [], special: [], global: [], propGeometry: [] });
    expect(getSpecialOverrideResolver()).not.toBeNull();
    expect(getGlobalAdjustmentResolver()).not.toBeNull();
    expect(getPropGeometryResolver()).not.toBeNull();
  });

  it("a seeded global adjustment resolves through the registered resolver", () => {
    seedOverrideResolvers({
      default: [], special: [], propGeometry: [],
      global: [{ placementFrame: "canonical", oriKey: "from_layer1", letter: "A", turnsTuple: "(0, 0)", arrowKey: "blue", propType: "fan", otherPropType: "fan", adjustmentX: 5, adjustmentY: 6 } as never],
    });
    const r = getGlobalAdjustmentResolver()!(
      { placementFrame: "canonical", oriKey: "from_layer1", letter: "A", turnsTuple: "(0, 0)", arrowKey: "blue", propType: "fan", otherPropType: "fan" } as never,
      "fan", "fan",
    );
    expect(r!.adjustment.x).toBe(5);
  });
});
