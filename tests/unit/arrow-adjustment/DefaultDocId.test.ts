import { describe, it, expect } from "vitest";
import {
  generateDefaultDocId,
  parseDefaultDocId,
} from "#lib/shared/pictograph/arrow/positioning/default-override/domain/default-arrow-placement.js";

describe("default doc id (prop-aware)", () => {
  it("encodes placementFrame_propType_motionType", () => {
    expect(generateDefaultDocId("canonical", "fan", "pro")).toBe(
      "canonical_fan_pro"
    );
  });

  it("round-trips a 3-part id", () => {
    expect(parseDefaultDocId("canonical_fan_pro")).toEqual({
      placementFrame: "canonical",
      propType: "fan",
      motionType: "pro",
    });
  });

  it("decodes a legacy 2-part id as staff", () => {
    expect(parseDefaultDocId("canonical_pro")).toEqual({
      placementFrame: "canonical",
      propType: "staff",
      motionType: "pro",
    });
  });

  it("round-trips a multi-token prop (underscore in propType)", () => {
    expect(generateDefaultDocId("canonical", "simple_staff", "pro")).toBe(
      "canonical_simple_staff_pro"
    );
    expect(parseDefaultDocId("canonical_simple_staff_pro")).toEqual({
      placementFrame: "canonical",
      propType: "simple_staff",
      motionType: "pro",
    });
    expect(parseDefaultDocId("canonical_staff_v2_dash")).toEqual({
      placementFrame: "canonical",
      propType: "staff_v2",
      motionType: "dash",
    });
  });

  it("rejects malformed ids", () => {
    expect(parseDefaultDocId("canonical")).toBeNull();
  });
});
