import { describe, it, expect, beforeEach } from "vitest";
import { Point } from "#lib/shared/pictograph/arrow/orchestration/domain/point.js";
import {
  setSpecialOverrideResolver, getSpecialOverrideResolver,
  setGlobalAdjustmentResolver, getGlobalAdjustmentResolver,
  setPropGeometryResolver, getPropGeometryResolver,
} from "../override-resolvers";

describe("override-resolvers seam", () => {
  beforeEach(() => {
    setSpecialOverrideResolver(null);
    setGlobalAdjustmentResolver(null);
    setPropGeometryResolver(null);
  });

  it("special resolver round-trips getOverride/getFullOverride", () => {
    setSpecialOverrideResolver({
      getOverride: () => new Point(3, 4),
      getFullOverride: () => null,
    });
    expect(getSpecialOverrideResolver()!.getOverride("k")!.x).toBe(3);
  });

  it("global + prop-geometry resolver slots default to null", () => {
    expect(getGlobalAdjustmentResolver()).toBeNull();
    expect(getPropGeometryResolver()).toBeNull();
  });
});
