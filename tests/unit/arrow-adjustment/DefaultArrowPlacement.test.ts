import { describe, it, expect } from "vitest";
import {
  generateDefaultDocId,
  parseDefaultDocId,
  flattenPlacements,
  unflattenValue,
  DefaultArrowPlacementDocSchema,
} from "#lib/shared/pictograph/arrow/positioning/default-override/domain/default-arrow-placement.js";

describe("DefaultArrowPlacement domain", () => {
  it("generates a doc id from placementFrame + propType + motionType", () => {
    expect(generateDefaultDocId("canonical", "staff", "pro")).toBe(
      "canonical_staff_pro"
    );
    expect(generateDefaultDocId("canonical", "fan", "static")).toBe(
      "canonical_fan_static"
    );
  });

  it("round-trips a doc id", () => {
    expect(parseDefaultDocId("canonical_fan_pro")).toEqual({
      placementFrame: "canonical",
      propType: "fan",
      motionType: "pro",
    });
    // Legacy 2-part ids predate the prop dimension → staff.
    expect(parseDefaultDocId("canonical_pro")).toEqual({
      placementFrame: "canonical",
      propType: "staff",
      motionType: "pro",
    });
    expect(parseDefaultDocId("canonical_static")).toEqual({
      placementFrame: "canonical",
      propType: "staff",
      motionType: "static",
    });
  });

  it("returns null for a malformed doc id", () => {
    expect(parseDefaultDocId("canonical")).toBeNull();
  });

  it("flattens a placements map into a doc body and reads a single value back", () => {
    const placements = {
      pro_to_layer1_alpha: {
        "1.5": [-35, 145] as [number, number],
        "2": [-10, -35] as [number, number],
      },
    };
    const body = flattenPlacements(
      "canonical",
      "staff",
      "pro",
      placements,
      "seed"
    );
    expect(body.placementFrame).toBe("canonical");
    expect(body.propType).toBe("staff");
    expect(body.motionType).toBe("pro");
    expect(body.placements.pro_to_layer1_alpha["1.5"]).toEqual([-35, 145]);
    expect(
      unflattenValue(body.placements, "pro_to_layer1_alpha", "1.5")
    ).toEqual([-35, 145]);
    expect(
      unflattenValue(body.placements, "pro_to_layer1_alpha", "9")
    ).toBeNull();
    expect(unflattenValue(body.placements, "missing_key", "1.5")).toBeNull();
  });

  it("parses a valid doc body and rejects a malformed one", () => {
    const ok = DefaultArrowPlacementDocSchema.safeParse({
      id: "canonical_pro",
      placementFrame: "canonical",
      motionType: "pro",
      placements: { k: { "1": [1, 2] } },
      updatedBy: "seed",
    });
    expect(ok.success).toBe(true);
    const bad = DefaultArrowPlacementDocSchema.safeParse({
      id: "canonical_pro",
      placementFrame: "canonical",
    });
    expect(bad.success).toBe(false);
  });
});
