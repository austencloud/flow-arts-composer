import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_RELATIONSHIP,
  HAND_RELATIONSHIPS,
  HAND_RELATIONSHIP_HINTS,
  HAND_RELATIONSHIP_INVERTED_HINT,
  HAND_RELATIONSHIP_LABELS,
  MATCH_HAND_TURNS_HINT,
  MATCH_HAND_TURNS_LABEL,
  MATCH_HAND_TURNS_LEVEL_HINT,
  describeHandRelationship,
  handRelationshipToEngine,
  isHandRelationship,
  relationshipReflectionAxis,
} from "./hand-relationship";

describe("hand relationship vocabulary", () => {
  it("defaults to free and recognizes only its own values", () => {
    expect(DEFAULT_HAND_RELATIONSHIP).toBe("free");
    expect(HAND_RELATIONSHIPS).toEqual([
      "free",
      "mirrored",
      "flipped",
      "unison",
      "opposite",
    ]);
    expect(isHandRelationship("mirrored")).toBe(true);
    expect(isHandRelationship("sideways")).toBe(false);
    expect(isHandRelationship(undefined)).toBe(false);
  });

  it("maps every relationship to an engine map and free to nothing", () => {
    expect(handRelationshipToEngine("free", true)).toBeUndefined();
    expect(handRelationshipToEngine("mirrored", false)).toEqual({
      map: "reflect-north-south",
      inverted: false,
    });
    expect(handRelationshipToEngine("flipped", true)).toEqual({
      map: "reflect-east-west",
      inverted: true,
    });
    expect(handRelationshipToEngine("unison", false)).toEqual({
      map: "identity",
      inverted: false,
    });
    expect(handRelationshipToEngine("opposite", false)).toEqual({
      map: "rotate-180",
      inverted: false,
    });
  });

  it("names the axis a reflection relationship keeps", () => {
    expect(relationshipReflectionAxis("mirrored")).toBe("north-south");
    expect(relationshipReflectionAxis("flipped")).toBe("east-west");
    expect(relationshipReflectionAxis("unison")).toBeNull();
    expect(relationshipReflectionAxis("opposite")).toBeNull();
    expect(relationshipReflectionAxis("free")).toBeNull();
  });

  it("describes the row value", () => {
    expect(describeHandRelationship("free", true)).toBe("Free");
    expect(describeHandRelationship("mirrored", false)).toBe("Mirrored");
    expect(describeHandRelationship("mirrored", true)).toBe(
      "Mirrored, inverted"
    );
    expect(describeHandRelationship("free", false, true)).toBe(
      "Free, matched turns"
    );
    expect(describeHandRelationship("mirrored", true, true)).toBe(
      "Mirrored, inverted, matched turns"
    );
  });

  it("never says hybrid and never uses an em dash", () => {
    const copy = [
      ...Object.values(HAND_RELATIONSHIP_LABELS),
      ...Object.values(HAND_RELATIONSHIP_HINTS),
      HAND_RELATIONSHIP_INVERTED_HINT,
      MATCH_HAND_TURNS_LABEL,
      MATCH_HAND_TURNS_HINT,
      MATCH_HAND_TURNS_LEVEL_HINT,
    ].join(" ");
    expect(copy.toLowerCase()).not.toContain("hybrid");
    expect(copy).not.toContain("—");
  });
});
